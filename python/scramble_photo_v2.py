#!/usr/bin/env python3
"""
scramble_photo_v2.py — Clean photo scrambler / unscrambler.

Fixes over v1:
  - Completely separated scramble and unscramble code paths (no shared mutable logic)
  - Vectorised noise via numpy (no per-pixel Python loops)
  - noise_seed saved in params JSON so unscramble always uses matching offsets
  - Correct dest→src permutation semantics for partial (percentage) scrambles
  - Watermark applied ONLY during unscramble (never during scramble)
  - Safe CLI arg parsing: "undefined" / "null" / "None" strings coerced to 0 / None
  - Same --mode scramble / unscramble CLI interface as v1 (backward-compatible)
"""

import argparse
import json
import math
import os
import secrets
import subprocess
import sys
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple, Any

import cv2
import numpy as np

# ── paths ─────────────────────────────────────────────────────────────────────
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
PYTHON_CMD = os.path.join(BASE_DIR, "venv", "bin", "python3")


# ── PRNG (matches JS mulberry32) ──────────────────────────────────────────────

def mulberry32(seed: int):
    """Mulberry32 seeded PRNG – deterministic, matches the JS version."""
    a = seed & 0xFFFFFFFF

    def rand() -> float:
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = a
        t ^= t >> 15
        t  = (t * (t | 1)) & 0xFFFFFFFF
        u  = t ^ (t >> 7)
        u  = (u * (t | 61)) & 0xFFFFFFFF
        t ^= (t + u) & 0xFFFFFFFF
        t &= 0xFFFFFFFF
        t ^= t >> 14
        t &= 0xFFFFFFFF
        return t / 4294967296.0

    return rand


def gen_random_seed() -> int:
    """Return a cryptographically-secure 32-bit unsigned seed."""
    return secrets.randbits(32)


# ── permutation helpers ───────────────────────────────────────────────────────

def seeded_permutation(size: int, seed: int) -> List[int]:
    """
    Fisher-Yates shuffle → permutation of 0..size-1.
    Convention: result[dest] = src
    """
    rand = mulberry32(seed & 0xFFFFFFFF)
    arr  = list(range(size))
    for i in range(size - 1, 0, -1):
        j = math.floor(rand() * (i + 1))
        arr[i], arr[j] = arr[j], arr[i]
    return arr


def inverse_permutation(perm: List[int]) -> List[int]:
    """If perm[dest]=src, return inv where inv[src]=dest."""
    inv = [0] * len(perm)
    for dest, src in enumerate(perm):
        inv[src] = dest
    return inv


def one_based(a: List[int]) -> List[int]:
    return [x + 1 for x in a]


def zero_based(a: List[int]) -> List[int]:
    return [x - 1 for x in a]


# ── grid helpers ──────────────────────────────────────────────────────────────

@dataclass
class GridDims:
    n: int   # rows
    m: int   # cols


@dataclass
class Rect:
    x0: int
    y0: int
    x1: int
    y1: int

    @property
    def w(self) -> int:
        return self.x1 - self.x0

    @property
    def h(self) -> int:
        return self.y1 - self.y0


def auto_grid_for_aspect(w: int, h: int) -> GridDims:
    """Choose n × m in [2..10] that makes cells closest to square."""
    best_n, best_m, best_score = 2, 2, float("inf")
    for n in range(2, 11):
        for m in range(2, 11):
            score = abs((w / m) / (h / n) - 1.0)
            if score < best_score:
                best_score, best_n, best_m = score, n, m
    return GridDims(n=best_n, m=best_m)


def cell_rects(w: int, h: int, n: int, m: int) -> List[Rect]:
    """Divide w×h into n×m cells using rounded boundaries (no gaps/overlaps)."""
    xs = [round(i * w / m) for i in range(m + 1)]
    ys = [round(j * h / n) for j in range(n + 1)]
    rects: List[Rect] = []
    for r in range(n):
        for c in range(m):
            rects.append(Rect(x0=xs[c], y0=ys[r], x1=xs[c + 1], y1=ys[r + 1]))
    return rects


# ── noise (whole-image, no tiling) ──────────────────────────────────────────

def build_image_noise(h: int, w: int, seed: int, intensity: int) -> np.ndarray:
    """
    Generate per-pixel noise for the full image as (H, W, 3) int16 in
    [-intensity, +intensity].  No tiling — each pixel gets a unique value.

    The noise is always generated for the SCRAMBLED image coordinate space:
      - During scramble: call after _apply_perm, using result.shape
      - During unscramble: call before _apply_perm, using input.shape
    This guarantees perfect cancellation regardless of any per-tile resizing.
    """
    rng = np.random.default_rng(int(seed) & 0xFFFFFFFFFFFFFFFF)
    return rng.integers(-intensity, intensity + 1, (h, w, 3), dtype=np.int16)


def add_noise(image: np.ndarray, noise: np.ndarray) -> np.ndarray:
    """
    Add per-pixel noise to image (mod-256 per channel).
    noise must be (H, W, 3) int16 matching image dimensions.
    Call this AFTER scrambling.
    """
    out = image.copy().astype(np.int16)
    out[..., :3] = (out[..., :3] + noise) % 256
    return out.astype(np.uint8)


def remove_noise(image: np.ndarray, noise: np.ndarray) -> np.ndarray:
    """
    Remove per-pixel noise from image (mod-256 per channel).
    noise must be the SAME (H, W, 3) int16 array used in add_noise.
    Call this BEFORE unscrambling.
    """
    out = image.copy().astype(np.int16)
    out[..., :3] = (out[..., :3] - noise) % 256
    return out.astype(np.uint8)


# ── tile rearrangement ────────────────────────────────────────────────────────

def _apply_perm(
    src_image: np.ndarray,
    n: int, m: int,
    perm_dest_to_src: List[int],
    rects: List[Rect],
) -> np.ndarray:
    """
    Core tile rearrangement.

    For each dest tile, copies pixels from perm_dest_to_src[dest] source tile.
    Applies a self-inverse per-tile mirror (based on XOR of indices) so that
    calling this function with the inverse permutation exactly undoes the flip.
    """
    out = np.zeros_like(src_image)

    for dest_idx, src_idx in enumerate(perm_dest_to_src):
        sR = rects[src_idx]
        dR = rects[dest_idx]

        region = src_image[sR.y0:sR.y1, sR.x0:sR.x1].copy()

        # Self-inverse mirror: XOR is commutative so applying the same mode
        # twice returns to the original content.
        mirror = (src_idx ^ dest_idx) % 4
        if   mirror == 1: region = region[:,    ::-1, :]
        elif mirror == 2: region = region[::-1, :,    :]
        elif mirror == 3: region = region[::-1, ::-1, :]

        # Resize only when rounding makes tiles differ by a pixel
        if region.shape[0] != dR.h or region.shape[1] != dR.w:
            region = cv2.resize(region, (dR.w, dR.h), interpolation=cv2.INTER_LINEAR)

        out[dR.y0:dR.y1, dR.x0:dR.x1] = region

    return out


# ── partial-scramble permutation builder ─────────────────────────────────────

def _build_partial_perm(N: int, percentage: int, seed: int) -> List[int]:
    """
    Return a full dest→src permutation where only `percentage`% of tiles are
    shuffled among themselves; the rest are identity (stay in place).

    The returned permutation follows the dest→src convention:
        result[dest] = src  (same as seeded_permutation)
    """
    percentage = max(0, min(100, percentage))

    if percentage <= 0:
        return list(range(N))
    if percentage >= 100:
        return seeded_permutation(N, seed)

    k = max(1, int(N * percentage / 100.0))

    # Deterministically choose which k tiles participate
    rand    = mulberry32(seed & 0xFFFFFFFF)
    indices = list(range(N))
    for i in range(N - 1, 0, -1):
        j = math.floor(rand() * (i + 1))
        indices[i], indices[j] = indices[j], indices[i]
    chosen = sorted(indices[:k])          # keep sorted for reproducibility

    # Generate a sub-permutation for those k tiles (also dest→src)
    sub_perm = seeded_permutation(k, seed + 1)

    # Build full permutation:
    #   full[chosen[sub_dest]] = chosen[sub_src]   (dest→src convention)
    full = list(range(N))                  # identity for untouched tiles
    for sub_dest, sub_src in enumerate(sub_perm):
        full[chosen[sub_dest]] = chosen[sub_src]

    assert sorted(full) == list(range(N)), "BUG: partial perm is not a valid bijection"
    return full


# ── params JSON ───────────────────────────────────────────────────────────────

def _params_to_dict(
    seed: int, n: int, m: int,
    perm: List[int],
    noise_intensity: int = 0,
    noise_seed: int = 0,
    percentage: int = 100,
) -> Dict[str, Any]:
    d: Dict[str, Any] = {
        "version":    3,
        "seed":       int(seed),
        "n":          int(n),
        "m":          int(m),
        "perm1based": one_based(perm),
        "semantics":  "perm1based[dest-1] = src (1-based); dest tile is filled from src tile",
        "percentage": int(percentage),
    }
    if noise_intensity > 0:
        d["noise_intensity"] = int(noise_intensity)
        d["noise_seed"]      = int(noise_seed)
    return d


def _load_params(path: str) -> Tuple[int, int, List[int], int, int, int]:
    """
    Load scramble params from JSON.
    Returns (n, m, perm_dest_to_src, noise_intensity, noise_tile_size, noise_seed).
    """
    with open(path, encoding="utf-8") as f:
        obj = json.load(f)

    n = int(obj.get("n", 0))
    m = int(obj.get("m", 0))

    if "perm1based" in obj:
        perm = zero_based(obj["perm1based"])
    elif "perm0based" in obj:
        perm = list(obj["perm0based"])
    else:
        raise ValueError("Params JSON must contain 'perm1based' or 'perm0based'")

    if n <= 0 or m <= 0:
        raise ValueError("Invalid n/m in params JSON")
    if len(perm) != n * m:
        raise ValueError(f"Permutation length {len(perm)} ≠ n×m = {n*m}")
    s = set(perm)
    if len(s) != len(perm) or min(perm) != 0 or max(perm) != len(perm) - 1:
        raise ValueError("Permutation is not a valid bijection over 0..n*m-1")

    noise_intensity = int(obj.get("noise_intensity", 0))
    noise_tile_size = int(obj.get("noise_tile_size", 0))
    seed            = int(obj.get("seed", 0))
    # noise_seed stored explicitly in v3; fall back to seed+999 for older params
    noise_seed      = int(obj.get("noise_seed", seed + 999))

    return n, m, perm, noise_intensity, noise_tile_size, noise_seed


# ── watermark helpers (only called during unscramble) ────────────────────────

def _wm_to_binary(num: int, bits: int = 16) -> List[int]:
    return [(num >> i) & 1 for i in range(bits - 1, -1, -1)]


_WM_FINDER = [[1, 1, 1], [1, 0, 1], [1, 1, 1]]


def _wm_bit_map() -> Dict[str, int]:
    bmap: Dict[str, int] = {}
    idx = 0
    for row in range(5):
        for col in range(5):
            if not (1 <= row <= 3 and 1 <= col <= 3):
                bmap[f"{row}-{col}"] = idx
                idx += 1
    return bmap


_BIT_MAP_CACHE: Optional[Dict[str, int]] = None


def _get_bit_map() -> Dict[str, int]:
    global _BIT_MAP_CACHE
    if _BIT_MAP_CACHE is None:
        _BIT_MAP_CACHE = _wm_bit_map()
    return _BIT_MAP_CACHE


def _wm_positions(
    frame_idx: int, frames_per_pos: int, count: int,
    width: int, height: int, marker_w: int, marker_h: int,
    mode: str, margin_min_pct: float, margin_max_pct: float,
) -> List[Tuple[int, int]]:
    epoch = frame_idx // max(1, frames_per_pos)
    seed  = (epoch * 99991 + count * 31337 + 7) & 0xFFFFFFFF
    rng   = mulberry32(seed)

    positions: List[Tuple[int, int]] = []
    attempts = 0
    while len(positions) < count and attempts < 200:
        attempts += 1
        x, y = 0.0, 0.0

        if mode == "random":
            pad = round(min(width, height) * 0.05)
            x   = pad + rng() * (width  - 2 * pad - marker_w)
            y   = pad + rng() * (height - 2 * pad - marker_h)
        elif mode == "corners":
            corner = int(rng() * 4)
            pad    = round(min(width, height) * 0.05)
            jx     = rng() * min(width  * 0.12, 40)
            jy     = rng() * min(height * 0.12, 40)
            if   corner == 0: x, y = pad + jx,                       pad + jy
            elif corner == 1: x, y = width  - pad - marker_w - jx,   pad + jy
            elif corner == 2: x, y = pad + jx,                       height - pad - marker_h - jy
            else:             x, y = width  - pad - marker_w - jx,   height - pad - marker_h - jy
        elif mode == "edges":
            edge = int(rng() * 4)
            pad  = round(min(width, height) * 0.03)
            if   edge == 0: x = pad + rng()*(width -2*pad-marker_w);  y = pad + rng()*height*0.12
            elif edge == 1: x = pad + rng()*(width -2*pad-marker_w);  y = height-marker_h-pad-rng()*height*0.12
            elif edge == 2: x = pad + rng()*width*0.12;               y = pad + rng()*(height-2*pad-marker_h)
            else:           x = width-marker_w-pad-rng()*width*0.12;  y = pad + rng()*(height-2*pad-marker_h)
        elif mode == "center":
            zw = width  * 0.5; zh = height * 0.5
            x  = (width  - zw) / 2 + rng() * (zw - marker_w)
            y  = (height - zh) / 2 + rng() * (zh - marker_h)
        else:  # custom
            mn, mx = margin_min_pct / 100.0, margin_max_pct / 100.0
            band   = int(rng() * 4)
            if   band == 0: x = width*mn+rng()*(width*(1-2*mn)-marker_w);    y = height*mn+rng()*(height*(mx-mn))
            elif band == 1: x = width*mn+rng()*(width*(1-2*mn)-marker_w);    y = height*(1-mx)+rng()*(height*(mx-mn)-marker_h)
            elif band == 2: x = width*mn+rng()*(width*(mx-mn));              y = height*mn+rng()*(height*(1-2*mn)-marker_h)
            else:           x = width*(1-mx)+rng()*(width*(mx-mn)-marker_w); y = height*mn+rng()*(height*(1-2*mn)-marker_h)

        ix = int(max(0, min(width  - marker_w,  x)))
        iy = int(max(0, min(height - marker_h,  y)))
        overlap = any(
            ix < px + marker_w + 4 and ix + marker_w + 4 > px and
            iy < py + marker_h + 4 and iy + marker_h + 4 > py
            for px, py in positions
        )
        if not overlap:
            positions.append((ix, iy))

    return positions


def _draw_marker(
    frame: np.ndarray, x: int, y: int,
    binary_data: List[int], alpha: float, scale: float,
) -> None:
    """Blend a 5×5 binary-grid watermark marker onto frame in-place (BGR)."""
    cell    = max(1, int(8 * scale))
    size    = cell * 5
    bit_map = _get_bit_map()
    fh, fw  = frame.shape[:2]
    marker  = np.zeros((size, size, 3), dtype=np.uint8)

    for row in range(5):
        for col in range(5):
            is_finder = 1 <= row <= 3 and 1 <= col <= 3
            if is_finder:
                val   = _WM_FINDER[row - 1][col - 1]
                color = (0, 0, 0) if val else (255, 255, 255)
            else:
                bi    = bit_map[f"{row}-{col}"]
                color = (255, 255, 255) if (binary_data[bi] if bi < len(binary_data) else 0) else (0, 0, 0)
            marker[row*cell:(row+1)*cell, col*cell:(col+1)*cell] = color

    cv2.rectangle(marker, (0, 0), (size - 1, size - 1), (128, 128, 128), 1)
    x1, y1 = min(x + size, fw), min(y + size, fh)
    mw, mh = x1 - x, y1 - y
    if mw <= 0 or mh <= 0:
        return

    roi     = frame[y:y1, x:x1].astype(np.float32)
    blended = roi * (1 - alpha) + marker[:mh, :mw].astype(np.float32) * alpha
    frame[y:y1, x:x1] = blended.astype(np.uint8)


def _apply_watermark(
    image: np.ndarray,
    wm_id: int,
    alpha: float, scale: float, count: int,
    duration: int, placement: str,
    min_margin: float, max_margin: float,
) -> np.ndarray:
    """
    Overlay watermark markers on a copy of the image.
    Intended to be called ONLY during unscramble.
    """
    out    = image.copy()
    binary = _wm_to_binary(wm_id, 16)
    cell   = max(1, int(8 * scale))
    mw, mh = cell * 5, cell * 5
    h, w   = out.shape[:2]

    for (px, py) in _wm_positions(
        0, duration, count, w, h, mw, mh, placement, min_margin, max_margin
    ):
        _draw_marker(out, px, py, binary, alpha, scale)

    return out


# ── steganographic user-tracking ──────────────────────────────────────────────

def _embed_tracking_code(image_path: str, user_id: int) -> None:
    """Embed a 10-digit user tracking code via steganography (only on unscramble)."""
    embed_script = os.path.join(BASE_DIR, "embed_code_image.py")
    cmd = [
        PYTHON_CMD, embed_script,
        "--input",   image_path,
        "--output",  image_path,
        "--user-id", str(user_id),
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True)
        print(f"  + Tracking code embedded (user_id={user_id})")
    except subprocess.CalledProcessError as e:
        print(f"  ! Warning: tracking embed failed: {e.stderr}", file=sys.stderr)


# ── safe CLI int parser ───────────────────────────────────────────────────────

def _safe_int(value: str, default: int = 0) -> int:
    """
    Convert a CLI string to int, tolerating 'undefined', 'null', 'None', ''.
    Falls back to `default` for any non-numeric input.
    """
    if value is None:
        return default
    s = str(value).strip().lower()
    if s in ("", "undefined", "null", "none", "nan"):
        return default
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return default


# ═════════════════════════════════════════════════════════════════════════════
#  PUBLIC API
# ═════════════════════════════════════════════════════════════════════════════

def scramble_photo(
    input_path: str,
    output_path: str,
    *,
    seed: Optional[int]      = None,
    rows: Optional[int]      = None,
    cols: Optional[int]      = None,
    percentage: int          = 100,
    noise_intensity: int     = 0,
    noise_tile_size: Optional[int] = None,
) -> str:
    """
    Scramble a photo and save the params JSON alongside the output.

    Parameters
    ----------
    input_path      : source image file path
    output_path     : destination image file path
    seed            : 32-bit PRNG seed (generated if None)
    rows / cols     : grid dimensions (auto-chosen from aspect ratio if None)
    percentage      : percentage of tiles to scramble (0-100, default 100)
    noise_intensity : pixel noise intensity (0 = none, max ≈ 128)
    noise_tile_size : noise tile side length in pixels (auto-scaled if None)

    Returns
    -------
    Path to the saved .params.json file.
    """
    if not os.path.isfile(input_path):
        raise FileNotFoundError(f"Input not found: {input_path}")

    image = cv2.imread(input_path)
    if image is None:
        raise RuntimeError(f"Cannot read image: {input_path}")

    h, w = image.shape[:2]
    if w <= 0 or h <= 0:
        raise RuntimeError("Invalid image dimensions")

    # ── seed ──────────────────────────────────────────────────────────────────
    if seed is None:
        seed = gen_random_seed()

    # ── grid ──────────────────────────────────────────────────────────────────
    if rows is None or cols is None:
        dims = auto_grid_for_aspect(w, h)
        rows = rows or dims.n
        cols = cols or dims.m
    n, m = int(rows), int(cols)

    # ── scramble FIRST ────────────────────────────────────────────────────────
    perm   = _build_partial_perm(n * m, percentage, seed)
    rects  = cell_rects(w, h, n, m)
    result = _apply_perm(image, n, m, perm, rects)
    print(f"  + Scrambled ({n}×{m} grid, {percentage}% tiles, seed={seed})")

    # ── add noise AFTER scrambling (in scrambled-image coordinate space) ──────
    noise_seed_used = 0
    if noise_intensity > 0:
        noise_seed_used = (seed + 999) & 0xFFFFFFFF
        sh, sw  = result.shape[:2]
        noise_arr = build_image_noise(sh, sw, noise_seed_used, noise_intensity)
        result    = add_noise(result, noise_arr)
        print(f"  + Noise added to scrambled image (intensity={noise_intensity})")

    # ── save output ───────────────────────────────────────────────────────────
    cv2.imwrite(output_path, result)

    # ── save params ───────────────────────────────────────────────────────────
    params = _params_to_dict(
        seed, n, m, perm,
        noise_intensity = noise_intensity,
        noise_seed      = noise_seed_used,
        percentage      = percentage,
    )
    base, _     = os.path.splitext(output_path)
    params_path = base + ".params.json"
    with open(params_path, "w", encoding="utf-8") as f:
        json.dump(params, f, indent=2)

    print(f"  ✓ Scrambled  → {output_path}")
    print(f"  ✓ Params     → {params_path}")
    return params_path


def unscramble_photo(
    input_path:  str,
    output_path: str,
    *,
    # params may be supplied via JSON file OR via explicit seed/rows/cols/percentage
    params_path:     Optional[str] = None,
    seed:            Optional[int] = None,
    rows:            Optional[int] = None,
    cols:            Optional[int] = None,
    percentage:      int           = 100,
    noise_intensity: int           = 0,
    # watermark — ONLY applied here (never during scramble)
    user_id:         Optional[int] = None,
    wm_id:           Optional[int] = None,
    wm_alpha:        float         = 0.15,
    wm_scale:        float         = 1.0,
    wm_count:        int           = 1,
    wm_duration:     int           = 30,
    wm_placement:    str           = "random",
    wm_min_margin:   float         = 5.0,
    wm_max_margin:   float         = 30.0,
) -> None:
    """
    Unscramble a photo.

    Params can be provided either via a .params.json file (preferred) or by
    supplying the same seed / rows / cols / percentage used during scramble.
    The watermark is applied AFTER unscrambling and noise removal so it appears
    on the clean recovered image.

    Parameters
    ----------
    input_path      : scrambled image file path
    output_path     : recovered image file path
    params_path     : path to .params.json created by scramble_photo() [optional]
    seed            : 32-bit seed used during scramble   [used if no params_path]
    rows / cols     : grid dimensions used during scramble
    percentage      : percentage used during scramble
    noise_intensity : noise intensity used during scramble (overridden by params_path)
    user_id         : optional 10-digit id for steganographic tracking
    wm_*            : watermark display options
    """
    if not os.path.isfile(input_path):
        raise FileNotFoundError(f"Input not found: {input_path}")

    image = cv2.imread(input_path)
    if image is None:
        raise RuntimeError(f"Cannot read image: {input_path}")

    h, w = image.shape[:2]
    if w <= 0 or h <= 0:
        raise RuntimeError("Invalid image dimensions")

    # ── resolve params ────────────────────────────────────────────────────────
    if params_path and os.path.isfile(params_path):
        # Load everything from the params JSON (most reliable)
        n, m, perm, noise_intensity, _tile_size, noise_seed = _load_params(params_path)
        print(f"  + Params loaded from {params_path}")
    else:
        # Regenerate permutation from seed (backward-compat with old server calls)
        if seed is None:
            raise ValueError("Either params_path or seed must be provided for unscramble")
        if rows is None or cols is None:
            dims = auto_grid_for_aspect(w, h)
            rows = rows or dims.n
            cols = cols or dims.m
        n, m       = int(rows), int(cols)
        perm       = _build_partial_perm(n * m, percentage, seed)
        noise_seed = (seed + 999) & 0xFFFFFFFF
        print(f"  + Params regenerated from seed={seed}")

    # ── remove noise BEFORE unscrambling (same coordinate space as add_noise) ─
    if noise_intensity > 0:
        noise_arr = build_image_noise(h, w, noise_seed, noise_intensity)
        image     = remove_noise(image, noise_arr)
        print(f"  + Noise removed from scrambled image (intensity={noise_intensity})")
    else:
        print(f"  - Noise removal skipped (intensity={noise_intensity})")

    # ── unscramble: apply inverse permutation ─────────────────────────────────
    inv_perm = inverse_permutation(perm)
    rects    = cell_rects(w, h, n, m)
    result   = _apply_perm(image, n, m, inv_perm, rects)
    print(f"  + Unscrambled ({n}×{m} grid)")

    # ── watermark (ONLY here, on the clean unscrambled image) ─────────────────
    if wm_id is not None:
        result = _apply_watermark(
            result, wm_id,
            alpha=wm_alpha, scale=wm_scale, count=wm_count,
            duration=wm_duration, placement=wm_placement,
            min_margin=wm_min_margin, max_margin=wm_max_margin,
        )
        print(f"  + Watermark applied (ID={wm_id}, alpha={wm_alpha}, "
              f"scale={wm_scale}, placement={wm_placement})")

    # ── save output ───────────────────────────────────────────────────────────
    cv2.imwrite(output_path, result)

    # ── steganographic tracking code ──────────────────────────────────────────
    if user_id and len(str(user_id)) == 10:
        _embed_tracking_code(output_path, user_id)
    else:
        print("  - Tracking code skipped (no valid 10-digit user_id)")

    print(f"  ✓ Unscrambled → {output_path}")


# ═════════════════════════════════════════════════════════════════════════════
#  CLI  (backward-compatible: --mode scramble | unscramble)
# ═════════════════════════════════════════════════════════════════════════════

def main() -> None:
    p = argparse.ArgumentParser(
        description="scramble_photo_v2 — photo scrambler/unscrambler"
    )
    p.add_argument("--input",  "-i", required=True)
    p.add_argument("--output", "-o", required=True)
    p.add_argument("--mode",   choices=["scramble", "unscramble"], default="scramble")
    p.add_argument("--seed",   type=int,  default=None)
    p.add_argument("--rows",   type=int,  default=None)
    p.add_argument("--cols",   type=int,  default=None)
    p.add_argument("--percentage",     default="100")
    # noise
    p.add_argument("--noise_intensity", default="0")
    p.add_argument("--noise_seed",      default="0")   # accepted but ignored (derived from --seed)
    p.add_argument("--noise_mode",      default="add_mod256_tile")  # accepted for compat
    p.add_argument("--noise_tile_size", type=int, default=None)
    # params JSON path for unscramble (optional; falls back to seed-based regen)
    p.add_argument("--params-path", default=None,
                   help="Path to .params.json produced during scramble (recommended for unscramble)")
    # watermark (unscramble only)
    p.add_argument("--wm-id",          type=int,   default=None)
    p.add_argument("--wm-alpha",       type=float, default=0.15)
    p.add_argument("--wm-scale",       type=float, default=1.0)
    p.add_argument("--wm-numbers",     type=int,   default=1)
    p.add_argument("--wm-duration",    type=int,   default=30)
    p.add_argument("--wm-placement",   default="random",
                   choices=["random", "corners", "edges", "center", "custom"])
    p.add_argument("--wm-min-margin",  type=float, default=5.0)
    p.add_argument("--wm-max-margin",  type=float, default=30.0)
    # user tracking (unscramble only)
    p.add_argument("--user-id",        type=int,   default=None)

    args = p.parse_args()

    # Safe-parse args that the Node.js server might send as "undefined"/"null"
    percentage      = _safe_int(args.percentage,      default=100)
    noise_intensity = _safe_int(args.noise_intensity, default=0)

    try:
        if args.mode == "scramble":
            params_out = scramble_photo(
                input_path      = args.input,
                output_path     = args.output,
                seed            = args.seed,
                rows            = args.rows,
                cols            = args.cols,
                percentage      = percentage,
                noise_intensity = noise_intensity,
                noise_tile_size = args.noise_tile_size,
            )
            print(f"Done. Output: {args.output}")
            if params_out:
                print(f"Params: {params_out}")

        else:  # unscramble
            unscramble_photo(
                input_path      = args.input,
                output_path     = args.output,
                params_path     = args.params_path,
                seed            = args.seed,
                rows            = args.rows,
                cols            = args.cols,
                percentage      = percentage,
                noise_intensity = noise_intensity,
                user_id         = args.user_id,
                wm_id           = args.wm_id,
                wm_alpha        = args.wm_alpha,
                wm_scale        = args.wm_scale,
                wm_count        = args.wm_numbers,
                wm_duration     = args.wm_duration,
                wm_placement    = args.wm_placement,
                wm_min_margin   = args.wm_min_margin,
                wm_max_margin   = args.wm_max_margin,
            )
            print(f"Done. Output: {args.output}")

    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
