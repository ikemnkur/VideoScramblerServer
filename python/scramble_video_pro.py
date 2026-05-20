#!/usr/bin/env python3
import argparse
import cv2
import json
import math
import os
import secrets
import sys
from dataclasses import dataclass
from typing import Optional, List, Dict, Any

import numpy as np


def mulberry32(seed: int):
    """
    Mulberry32 - Simple seeded pseudo-random number generator
    Deterministic, matches the JS version's 32-bit behavior as closely as possible.
    Returns a function that yields floats in [0, 1).
    """
    a = seed & 0xFFFFFFFF

    def rand() -> float:
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = a

        # t = Math.imul(t ^ t >>> 15, t | 1)
        t ^= (t >> 15)
        t = (t * (t | 1)) & 0xFFFFFFFF

        # u = Math.imul(t ^ t >>> 7, t | 61)
        u = t ^ (t >> 7)
        u = (u * (t | 61)) & 0xFFFFFFFF

        t ^= (t + u) & 0xFFFFFFFF
        t &= 0xFFFFFFFF

        t ^= t >> 14
        t &= 0xFFFFFFFF

        # >>> 0 / 2**32
        return t / 4294967296.0

    return rand

def gen_random_seed() -> int:
    """
    Generate a cryptographically secure random seed (32-bit unsigned).
    """
    return secrets.randbits(32)

def seeded_permutation(size: int, seed: int) -> List[int]:
    """
    Create a Fisher–Yates shuffled permutation array.
    dest index i will take from source srcs[i]
    """
    rand = mulberry32(seed & 0xFFFFFFFF)
    srcs = list(range(size))

    # Fisher–Yates shuffle
    for i in range(size - 1, 0, -1):
        j = math.floor(rand() * (i + 1))
        srcs[i], srcs[j] = srcs[j], srcs[i]

    return srcs

def one_based(a: List[int]) -> List[int]:
    return [x + 1 for x in a]

def zero_based(a: List[int]) -> List[int]:
    return [x - 1 for x in a]

@dataclass
class GridDims:
    n: int  # rows
    m: int  # cols

def auto_grid_for_aspect(w: int, h: int) -> GridDims:
    """
    Choose n (rows), m (cols) in [2..10] minimizing |(w/m)/(h/n) - 1|
    """
    best_n = 2
    best_m = 2
    best_score = float("inf")

    for n in range(2, 11):
        for m in range(2, 11):
            cell_aspect = (w / m) / (h / n)
            score = abs(cell_aspect - 1.0)
            if score < best_score:
                best_score = score
                best_n = n
                best_m = m

    return GridDims(n=best_n, m=best_m)


def get_fourcc_for_output(output_path: str):
    """
    Get appropriate fourcc codec based on output file extension.
    Returns fourcc code and whether it's compatible.
    """
    ext = os.path.splitext(output_path)[1].lower()
    
    if ext == '.webm':
        # WebM requires VP8 or VP9 codec
        return cv2.VideoWriter_fourcc(*"VP80"), True
    elif ext == '.mp4':
        # MP4 works with mp4v, H264, or avc1
        return cv2.VideoWriter_fourcc(*"mp4v"), True
    elif ext == '.avi':
        # AVI works with many codecs
        return cv2.VideoWriter_fourcc(*"XVID"), True
    else:
        # Default fallback
        return cv2.VideoWriter_fourcc(*"VP80"), True

def params_to_json(seed: int, n: int, m: int, perm_dest_to_src_0: List[int]) -> Dict[str, Any]:
    """
    Convert scramble parameters to JSON-like dict for export/saving.
    """
    return {
        "version": 2,
        "seed": int(seed),
        "n": int(n),
        "m": int(m),
        "perm1based": one_based(perm_dest_to_src_0),
        "semantics": "Index = destination cell (1-based), value = source cell index (1-based)",
    }


@dataclass
class ScrambleParams:
    n: int
    m: int
    perm_dest_to_src_0: List[int]

def json_to_params(obj: Dict[str, Any]) -> ScrambleParams:
    """
    Parse and validate JSON parameters for unscrambling.
    """
    n = int(obj.get("n", 0))
    m = int(obj.get("m", 0))

    perm = None
    if isinstance(obj.get("perm1based"), list):
        perm = zero_based(obj["perm1based"])
    elif isinstance(obj.get("perm0based"), list):
        perm = list(obj["perm0based"])

    if not n or not m or perm is None:
        raise ValueError("Invalid params JSON: need n, m, and perm array (perm1based or perm0based)")

    if len(perm) != n * m:
        raise ValueError("Permutation length doesn't match n*m")

    # Validate it's a valid permutation of 0..N-1
    s = set(perm)
    if len(s) != len(perm) or min(perm) != 0 or max(perm) != len(perm) - 1:
        raise ValueError("Permutation must contain each index 0..n*m-1 exactly once")

    return ScrambleParams(n=n, m=m, perm_dest_to_src_0=perm)

def inverse_permutation(arr: List[int]) -> List[int]:
    """
    If arr maps dest -> src, inverse maps src -> dest.
    """
    inv = [0] * len(arr)
    for dest_idx, src_idx in enumerate(arr):
        inv[src_idx] = dest_idx
    return inv


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


def cell_rects(w: int, h: int, n: int, m: int) -> List[Rect]:
    """
    Divide a width x height area into n x m rectangles.
    Uses rounded boundaries to avoid gaps.
    """
    xs = [round(i * w / m) for i in range(m + 1)]
    ys = [round(j * h / n) for j in range(n + 1)]
    rects: List[Rect] = []

    for r in range(n):
        for c in range(m):
            x0, x1 = xs[c], xs[c + 1]
            y0, y1 = ys[r], ys[r + 1]
            rects.append(Rect(x0=x0, y0=y0, x1=x1, y1=y1))

    return rects


def compute_lr_border_cols(n: int, m: int) -> int:
    """
    Compute the minimum number of columns (k_lr) needed on left and right sides
    so that the borders have enough slots for all n*m HPF tiles.
    Left + Right slots = 2 * k_lr * n, need: 2 * k_lr * n >= n*m
    So: k_lr >= m/2
    """
    if n <= 0 or m <= 0:
        return 1
    k_lr = math.ceil(m / 2.0)
    return max(1, k_lr)


def get_lr_border_positions(n: int, m: int, k_lr: int, k_tb: int) -> List[tuple]:
    """
    Enumerate border tile positions (row, col) in the extended
    (n + 2*k_tb) x (m + 2*k_lr) output grid.

    Returns positions for LEFT and RIGHT sides only (top and bottom are empty for watermarks).
    
    Layout:
      - Top strip: k_tb rows (empty for watermarks)
      - Center block: n rows × m cols (LPF image)
      - Left strip: n rows × k_lr cols (HPF tiles)
      - Right strip: n rows × k_lr cols (HPF tiles)
      - Bottom strip: k_tb rows (empty for watermarks)

    Returns list of (row, col) tuples, left side first (top to bottom),
    then right side (top to bottom).
    """
    positions = []

    # Left strip: rows [k_tb..k_tb+n-1], cols [0..k_lr-1]
    # Traverse top to bottom, left to right
    for r in range(k_tb, k_tb + n):
        for c in range(k_lr):
            positions.append((r, c))

    # Right strip: rows [k_tb..k_tb+n-1], cols [k_lr+m..k_lr+m+k_lr-1]
    # Traverse top to bottom, left to right
    for r in range(k_tb, k_tb + n):
        for c in range(k_lr + m, k_lr + m + k_lr):
            positions.append((r, c))

    return positions


def hpf_scramble_frame(frame: np.ndarray, n: int, m: int,
                       perm_dest_to_src_0: List[int], blur_ksize: int,
                       k_lr: int, k_tb: int, border_positions: List[tuple],
                       tile_h: int, tile_w: int) -> np.ndarray:
    """
    Scramble a single frame using LPF/HPF frequency decomposition.

    1. Split frame into low-pass (LPF) and high-pass (HPF) components
    2. Cut HPF into n*m tiles
    3. Create an expanded canvas with LPF in the center
    4. Place HPF tiles on left/right borders in permuted order
    5. Top/bottom strips remain empty (black) for watermarks/attribution
    """
    h, w = frame.shape[:2]
    ch = frame.shape[2] if len(frame.shape) > 2 else 1
    has_channels = len(frame.shape) > 2

    rows_out = n + 2 * k_tb
    cols_out = m + 2 * k_lr
    out_h = rows_out * tile_h
    out_w = cols_out * tile_w

    # 1. Decompose: LPF via Gaussian blur, HPF = original - LPF
    lpf = cv2.GaussianBlur(frame, (blur_ksize, blur_ksize), 0)
    hpf = frame.astype(np.int16) - lpf.astype(np.int16)
    # Shift HPF into [0, 255] range for storage (add 128)
    hpf_shifted = np.clip(hpf + 128, 0, 255).astype(np.uint8)

    # 2. Cut HPF into n*m tiles
    N = n * m
    hpf_tiles = []
    for r in range(n):
        for c_idx in range(m):
            y0, y1 = r * tile_h, (r + 1) * tile_h
            x0, x1 = c_idx * tile_w, (c_idx + 1) * tile_w
            tile = hpf_shifted[y0:y1, x0:x1].copy()
            hpf_tiles.append(tile)

    # 3. Create output canvas (zeros = black corners)
    if has_channels:
        out = np.zeros((out_h, out_w, ch), dtype=np.uint8)
    else:
        out = np.zeros((out_h, out_w), dtype=np.uint8)

    # 4. Place LPF in center (crop to exact tile-aligned size)
    center_y = k_tb * tile_h
    center_x = k_lr * tile_w
    lpf_h = n * tile_h
    lpf_w = m * tile_w
    if has_channels:
        out[center_y:center_y + lpf_h, center_x:center_x + lpf_w, :] = lpf[:lpf_h, :lpf_w]
    else:
        out[center_y:center_y + lpf_h, center_x:center_x + lpf_w] = lpf[:lpf_h, :lpf_w]

    # 5. Place HPF tiles on border according to scramble permutation
    for dest_idx in range(min(N, len(border_positions))):
        src_idx = perm_dest_to_src_0[dest_idx]
        br, bc = border_positions[dest_idx]
        y0 = br * tile_h
        x0 = bc * tile_w
        if has_channels:
            out[y0:y0 + tile_h, x0:x0 + tile_w, :] = hpf_tiles[src_idx]
        else:
            out[y0:y0 + tile_h, x0:x0 + tile_w] = hpf_tiles[src_idx]

    return out


def hpf_unscramble_frame(frame: np.ndarray, n: int, m: int,
                          perm_dest_to_src_0: List[int],
                          k_lr: int, k_tb: int, border_positions: List[tuple],
                          tile_h: int, tile_w: int,
                          orig_h: int, orig_w: int) -> np.ndarray:
    """
    Unscramble an HPF-scrambled frame back to the original.

    1. Extract LPF from the center region
    2. Extract and un-permute HPF tiles from the left/right borders
    3. Reassemble HPF image from tiles
    4. Reconstruct: original = LPF + (HPF_shifted - 128)
    """
    ch = frame.shape[2] if len(frame.shape) > 2 else 1
    has_channels = len(frame.shape) > 2
    N = n * m

    # 1. Extract LPF from center
    center_y = k_tb * tile_h
    center_x = k_lr * tile_w
    lpf_h = n * tile_h
    lpf_w = m * tile_w
    lpf = frame[center_y:center_y + lpf_h, center_x:center_x + lpf_w].copy()

    # 2. Extract HPF tiles from border and place back in original order
    # perm[dest_idx] = src_idx means border position dest_idx holds original tile src_idx
    hpf_tiles = [None] * N
    for dest_idx in range(min(N, len(border_positions))):
        src_idx = perm_dest_to_src_0[dest_idx]
        br, bc = border_positions[dest_idx]
        y0 = br * tile_h
        x0 = bc * tile_w
        tile = frame[y0:y0 + tile_h, x0:x0 + tile_w].copy()
        hpf_tiles[src_idx] = tile  # place back in original position

    # 3. Reassemble HPF image from tiles in original order
    if has_channels:
        hpf_shifted = np.full((lpf_h, lpf_w, ch), 128, dtype=np.uint8)
    else:
        hpf_shifted = np.full((lpf_h, lpf_w), 128, dtype=np.uint8)

    for idx in range(N):
        if hpf_tiles[idx] is not None:
            r = idx // m
            c_idx = idx % m
            y0 = r * tile_h
            x0 = c_idx * tile_w
            if has_channels:
                hpf_shifted[y0:y0 + tile_h, x0:x0 + tile_w, :] = hpf_tiles[idx]
            else:
                hpf_shifted[y0:y0 + tile_h, x0:x0 + tile_w] = hpf_tiles[idx]

    # 4. Reconstruct: original = LPF + (HPF_shifted - 128)
    hpf_raw = hpf_shifted.astype(np.int16) - 128
    reconstructed = np.clip(lpf.astype(np.int16) + hpf_raw, 0, 255).astype(np.uint8)

    # 5. Handle potential size mismatch with original dimensions
    rh, rw = reconstructed.shape[:2]
    if rh == orig_h and rw == orig_w:
        return reconstructed

    if has_channels:
        result = np.zeros((orig_h, orig_w, ch), dtype=np.uint8)
    else:
        result = np.zeros((orig_h, orig_w), dtype=np.uint8)

    copy_h = min(rh, orig_h)
    copy_w = min(rw, orig_w)
    if has_channels:
        result[:copy_h, :copy_w, :] = reconstructed[:copy_h, :copy_w, :]
    else:
        result[:copy_h, :copy_w] = reconstructed[:copy_h, :copy_w]

    return result


def hpf_params_to_json(seed: int, n: int, m: int, perm_dest_to_src_0: List[int],
                       blur_ksize: int, k_lr: int, k_tb: int, tile_h: int, tile_w: int,
                       orig_h: int, orig_w: int) -> Dict[str, Any]:
    """
    Convert HPF scramble parameters to JSON for saving/restoring.
    """
    return {
        "version": 5,
        "algorithm": "hpf",
        "seed": int(seed),
        "n": int(n),
        "m": int(m),
        "perm1based": one_based(perm_dest_to_src_0),
        "blur_ksize": int(blur_ksize),
        "border_cols_lr": int(k_lr),
        "watermark_rows_tb": int(k_tb),
        "tile_h": int(tile_h),
        "tile_w": int(tile_w),
        "orig_height": int(orig_h),
        "orig_width": int(orig_w),
        "semantics": "HPF tiles scrambled on left/right borders, LPF in center, top/bottom empty for watermarks. Index=dest border position (1-based), value=source HPF tile (1-based)",
    }


# === paste all helper functions from above here ===
# mulberry32, gen_random_seed, seeded_permutation, one_based, zero_based,
# auto_grid_for_aspect, params_to_json, json_to_params, inverse_permutation,
# Rect, cell_rects


# ── Watermark marker helpers (mirrors watermark-encoder-v2.html) ─────────────

def wm_to_binary(num: int, bits: int = 16) -> List[int]:
    """Convert integer to MSB-first binary list (matches JS toBinaryArray)."""
    return [(num >> i) & 1 for i in range(bits - 1, -1, -1)]


def wm_get_positions(
    frame_idx: int,
    frames_per_pos: int,
    count: int,
    width: int,
    height: int,
    marker_w: int,
    marker_h: int,
    mode: str,
    margin_min_pct: float,
    margin_max_pct: float,
) -> List[tuple]:
    """
    Compute up to `count` non-overlapping (x, y) marker positions for frame_idx.
    Mirrors getMarkerPositions() in watermark-encoder-v2.html.
    """
    epoch = frame_idx // max(1, frames_per_pos)
    seed  = (epoch * 99991 + count * 31337 + 7) & 0xFFFFFFFF
    rng   = mulberry32(seed)

    positions: List[tuple] = []
    attempts   = 0
    max_tries  = 200

    while len(positions) < count and attempts < max_tries:
        attempts += 1
        x, y = 0.0, 0.0

        if mode == "random":
            margin = round(min(width, height) * 0.05)
            x = margin + rng() * (width  - 2 * margin - marker_w)
            y = margin + rng() * (height - 2 * margin - marker_h)

        elif mode == "corners":
            corner    = int(rng() * 4)
            pad       = round(min(width, height) * 0.05)
            jitter_x  = rng() * min(width  * 0.12, 40)
            jitter_y  = rng() * min(height * 0.12, 40)
            if   corner == 0: x, y = pad + jitter_x,                       pad + jitter_y
            elif corner == 1: x, y = width  - pad - marker_w - jitter_x,   pad + jitter_y
            elif corner == 2: x, y = pad + jitter_x,                       height - pad - marker_h - jitter_y
            else:             x, y = width  - pad - marker_w - jitter_x,   height - pad - marker_h - jitter_y

        elif mode == "edges":
            edge = int(rng() * 4)
            pad  = round(min(width, height) * 0.03)
            if edge == 0:    # top
                x = pad + rng() * (width - 2 * pad - marker_w)
                y = pad + rng() * height * 0.12
            elif edge == 1:  # bottom
                x = pad + rng() * (width - 2 * pad - marker_w)
                y = height - marker_h - pad - rng() * height * 0.12
            elif edge == 2:  # left
                x = pad + rng() * width * 0.12
                y = pad + rng() * (height - 2 * pad - marker_h)
            else:            # right
                x = width - marker_w - pad - rng() * width * 0.12
                y = pad + rng() * (height - 2 * pad - marker_h)

        elif mode == "center":
            zone_w = width  * 0.5
            zone_h = height * 0.5
            x = (width  - zone_w) / 2 + rng() * (zone_w - marker_w)
            y = (height - zone_h) / 2 + rng() * (zone_h - marker_h)

        else:  # custom
            min_m = margin_min_pct / 100.0
            max_m = margin_max_pct / 100.0
            band  = int(rng() * 4)
            if band == 0:
                x = width  * min_m + rng() * (width  * (1 - 2 * min_m) - marker_w)
                y = height * min_m + rng() * (height * (max_m - min_m))
            elif band == 1:
                x = width  * min_m + rng() * (width  * (1 - 2 * min_m) - marker_w)
                y = height * (1 - max_m) + rng() * (height * (max_m - min_m) - marker_h)
            elif band == 2:
                x = width  * min_m + rng() * (width  * (max_m - min_m))
                y = height * min_m + rng() * (height * (1 - 2 * min_m) - marker_h)
            else:
                x = width  * (1 - max_m) + rng() * (width  * (max_m - min_m) - marker_w)
                y = height * min_m + rng() * (height * (1 - 2 * min_m) - marker_h)

        ix = int(max(0, min(width  - marker_w,  x)))
        iy = int(max(0, min(height - marker_h, y)))

        # AABB overlap check (4-px padding)
        overlap = any(
            ix < px + marker_w + 4 and ix + marker_w + 4 > px and
            iy < py + marker_h + 4 and iy + marker_h + 4 > py
            for px, py in positions
        )
        if not overlap:
            positions.append((ix, iy))

    return positions


_WM_FINDER = [
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
]

_WM_BIT_MAP: Optional[Dict[str, int]] = None


def _wm_bit_map() -> Dict[str, int]:
    global _WM_BIT_MAP
    if _WM_BIT_MAP is None:
        bmap: Dict[str, int] = {}
        idx = 0
        for row in range(5):
            for col in range(5):
                if not (1 <= row <= 3 and 1 <= col <= 3):
                    bmap[f"{row}-{col}"] = idx
                    idx += 1
        _WM_BIT_MAP = bmap
    return _WM_BIT_MAP


def draw_wm_marker(
    frame: np.ndarray,
    x: int,
    y: int,
    binary_data: List[int],
    alpha: float,
    scale: float,
) -> None:
    """
    Blend a 5×5 binary-grid watermark marker onto `frame` (in-place, BGR).
    Mirrors drawMarker() in watermark-encoder-v2.html.
    """
    cell = max(1, int(8 * scale))
    size = cell * 5
    bit_map = _wm_bit_map()
    frame_h, frame_w = frame.shape[:2]

    # Build marker patch
    marker = np.zeros((size, size, 3), dtype=np.uint8)
    for row in range(5):
        for col in range(5):
            is_finder = 1 <= row <= 3 and 1 <= col <= 3
            if is_finder:
                val   = _WM_FINDER[row - 1][col - 1]
                color = (0, 0, 0) if val else (255, 255, 255)
            else:
                bit_idx = bit_map[f"{row}-{col}"]
                bit     = binary_data[bit_idx] if bit_idx < len(binary_data) else 0
                color   = (255, 255, 255) if bit else (0, 0, 0)
            r0, c0 = row * cell, col * cell
            marker[r0:r0 + cell, c0:c0 + cell] = color

    # Gray border
    cv2.rectangle(marker, (0, 0), (size - 1, size - 1), (128, 128, 128), 1)

    # Clip to frame bounds
    x1 = min(x + size, frame_w)
    y1 = min(y + size, frame_h)
    mw, mh = x1 - x, y1 - y
    if mw <= 0 or mh <= 0:
        return

    # Alpha-blend
    roi     = frame[y:y1, x:x1].astype(np.float32)
    patch   = marker[:mh, :mw].astype(np.float32)
    blended = roi * (1.0 - alpha) + patch * alpha
    frame[y:y1, x:x1] = blended.astype(np.uint8)


def apply_watermark(
    frame: np.ndarray,
    frame_idx: int,
    wm_id: int,
    wm_alpha: float,
    wm_scale: float,
    wm_count: int,
    wm_duration: int,
    wm_placement: str,
    wm_min_margin: float,
    wm_max_margin: float,
) -> np.ndarray:
    """
    Overlay watermark markers on a copy of `frame`.
    All parameters mirror the controls in watermark-encoder-v2.html.
    """
    out    = frame.copy()
    binary = wm_to_binary(wm_id, 16)
    cell   = max(1, int(8 * wm_scale))
    mw     = cell * 5
    mh     = cell * 5
    h, w   = out.shape[:2]

    positions = wm_get_positions(
        frame_idx, wm_duration, wm_count,
        w, h, mw, mh,
        wm_placement, wm_min_margin, wm_max_margin,
    )
    for (px, py) in positions:
        draw_wm_marker(out, px, py, binary, wm_alpha, wm_scale)

    return out

# ── end watermark helpers ─────────────────────────────────────────────────────


def scramble_frame(frame: np.ndarray,
                   n: int,
                   m: int,
                   perm_dest_to_src_0: list[int],
                   src_rects: list[Rect],
                   dest_rects: list[Rect]) -> np.ndarray:
    """
    Scramble a single frame according to the permutation.
    perm_dest_to_src_0: index = dest tile, value = source tile.
    """
    h, w, c = frame.shape
    out = np.zeros_like(frame)

    N = n * m
    if len(perm_dest_to_src_0) != N:
        raise ValueError("Permutation length does not equal n*m")

    for dest_idx in range(N):
        src_idx = perm_dest_to_src_0[dest_idx]
        sR = src_rects[src_idx]
        dR = dest_rects[dest_idx]

        # slice ranges
        sy0, sy1 = sR.y0, sR.y1
        sx0, sx1 = sR.x0, sR.x1
        dy0, dy1 = dR.y0, dR.y1
        dx0, dx1 = dR.x0, dR.x1

        # Apply mirroring based on XOR of src and dest permutation indices.
        # Using XOR gives more varied distribution than src alone, and is symmetric
        # so unscramble_frame (which calls this with inv_perm) automatically
        # re-applies the same flip, undoing it correctly.
        # 0: no mirror, 1: horizontal, 2: vertical, 3: both
        mirror_mode = (src_idx ^ dest_idx) % 4
        src_region = frame[sy0:sy1, sx0:sx1, :]

        if mirror_mode == 1:
            src_region = src_region[:, ::-1, :]
        elif mirror_mode == 2:
            src_region = src_region[::-1, :, :]
        elif mirror_mode == 3:
            src_region = src_region[::-1, ::-1, :]

        # Copy region (height, width, channels)
        out[dy0:dy1, dx0:dx1, :] = src_region

    return out


def unscramble_frame(frame: np.ndarray,
                     n: int,
                     m: int,
                     perm_dest_to_src_0: list[int],
                     src_rects: list[Rect],
                     dest_rects: list[Rect]) -> np.ndarray:
    """
    Unscramble a single frame by using the inverse permutation.
    If perm maps dest -> src, then inv maps src -> dest.
    """
    inv_perm = inverse_permutation(perm_dest_to_src_0)
    # Now inv_perm[index = dest] = src ? No: arr[dest] = src -> inv[src] = dest
    # For unscramble, we want dest cell to get pixels from original (scrambled) frame's corresponding cell.
    # Reusing the scramble_frame function with inv_perm achieves that.
    return scramble_frame(frame, n, m, inv_perm, src_rects, dest_rects)


def process_video(input_path: str,
                  output_path: str,
                  seed: Optional[int] = None,
                  rows: Optional[int] = None,
                  cols: Optional[int] = None,
                  mode: str = "scramble",
                  algorithm: str = "spatial",
                  max_hue_shift: int = 128,
                  blur_ksize: int = 15,
                  watermark_rows: int = 1,
                  # ── watermark marker options ──
                  wm_id: Optional[int] = None,
                  wm_alpha: float = 0.15,
                  wm_scale: float = 1.0,
                  wm_count: int = 1,
                  wm_duration: int = 30,
                  wm_placement: str = "random",
                  wm_min_margin: float = 5.0,
                  wm_max_margin: float = 30.0) -> str:
    """
    Process a video: scramble or unscramble according to mode and algorithm.

    Args:
        algorithm: "spatial" for position scrambling, "color" for hue shifting,
                   "hpf" for high-pass frequency decomposition scrambling
        max_hue_shift: Maximum hue shift amount (0-128) for color scrambling
        blur_ksize: Gaussian blur kernel size (odd integer) for HPF algorithm
        watermark_rows: Number of empty tile rows on top and bottom for watermarks (HPF only)
        wm_id: 16-bit tracking ID (0-65535) to embed as a visible marker; None = no marker
        wm_alpha: Marker opacity (0.01 – 0.50)
        wm_scale: Marker size multiplier (0.5 – 4.0)
        wm_count: Number of simultaneous markers per frame (1 – 8)
        wm_duration: Frames each marker position is held before moving (1 – 300)
        wm_placement: Placement zone — "random", "corners", "edges", "center", "custom"
        wm_min_margin: Min edge margin % for custom placement (0 – 45)
        wm_max_margin: Max edge margin % for custom placement (5 – 50)

    Returns path to params JSON (for scramble mode).
    """

    if not os.path.isfile(input_path):
        raise FileNotFoundError(f"Input video not found: {input_path}")

    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {input_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    if width <= 0 or height <= 0:
        cap.release()
        raise RuntimeError("Invalid video dimensions")

    # If rows/cols missing, choose them based on aspect ratio
    if rows is None or cols is None:
        dims = auto_grid_for_aspect(width, height)
        if rows is None:
            rows = dims.n
        if cols is None:
            cols = dims.m

    n, m = rows, cols
    N = n * m

    # seed management
    if seed is None:
        seed = gen_random_seed()

    # Prepare algorithm-specific data
    if algorithm == "spatial":
        if mode == "scramble":
            perm_dest_to_src_0 = seeded_permutation(N, seed)
        elif mode == "unscramble":
            perm_dest_to_src_0 = seeded_permutation(N, seed)
        else:
            raise ValueError("mode must be 'scramble' or 'unscramble'")
        
        # Precompute rectangles for spatial scrambling
        src_rects = cell_rects(width, height, n, m)
        dest_rects = cell_rects(width, height, n, m)
        
    elif algorithm == "color":
        # Generate hue shifts for color scrambling
        hue_shifts = generate_hue_shifts(n, m, seed, max_hue_shift)
        
        # Precompute rectangles for color scrambling
        rects = cell_rects(width, height, n, m)

    elif algorithm == "hpf":
        # HPF frequency decomposition scrambling
        # Ensure blur_ksize is odd
        if blur_ksize % 2 == 0:
            blur_ksize += 1

        # Ensure watermark_rows is positive
        watermark_rows = max(1, watermark_rows)

        perm_dest_to_src_0 = seeded_permutation(N, seed)

        # Compute tile dimensions and border layout
        # k_lr = left/right columns for HPF tiles
        # k_tb = top/bottom rows for watermarks (empty)
        hpf_k_lr = compute_lr_border_cols(n, m)
        hpf_k_tb = watermark_rows
        hpf_border_positions = get_lr_border_positions(n, m, hpf_k_lr, hpf_k_tb)
        hpf_rows_out = n + 2 * hpf_k_tb
        hpf_cols_out = m + 2 * hpf_k_lr

        if mode == "scramble":
            hpf_tile_h = height // n
            hpf_tile_w = width // m
            hpf_out_width = hpf_cols_out * hpf_tile_w
            hpf_out_height = hpf_rows_out * hpf_tile_h
            hpf_orig_h = height
            hpf_orig_w = width
            print(f"HPF scramble: {n}x{m} grid, blur_ksize={blur_ksize}")
            print(f"  Border: {hpf_k_lr} cols (L/R for HPF), {hpf_k_tb} rows (T/B for watermarks)")
            print(f"  Tile: {hpf_tile_w}x{hpf_tile_h}")
            print(f"  Input:  {width}x{height}")
            print(f"  Output: {hpf_out_width}x{hpf_out_height} "
                  f"(~{(hpf_out_width * hpf_out_height) / (width * height):.2f}x area)")
        else:  # unscramble
            # Input is the scrambled (larger) video
            hpf_tile_h = height // hpf_rows_out
            hpf_tile_w = width // hpf_cols_out
            hpf_orig_h = n * hpf_tile_h
            hpf_orig_w = m * hpf_tile_w
            hpf_out_width = hpf_orig_w
            hpf_out_height = hpf_orig_h
            print(f"HPF unscramble: {n}x{m} grid")
            print(f"  Border: {hpf_k_lr} cols (L/R), {hpf_k_tb} rows (T/B)")
            print(f"  Tile: {hpf_tile_w}x{hpf_tile_h}")
            print(f"  Input (scrambled):  {width}x{height}")
            print(f"  Output (restored):  {hpf_out_width}x{hpf_out_height}")

    else:
        raise ValueError("algorithm must be 'spatial', 'color', or 'hpf'")

    # Determine output dimensions
    if algorithm == "hpf":
        out_width = hpf_out_width
        out_height = hpf_out_height
    else:
        out_width = width
        out_height = height

    # Prepare writer with appropriate codec for output format
    fourcc, _ = get_fourcc_for_output(output_path)
    out = cv2.VideoWriter(output_path, fourcc, float(fps), (out_width, out_height))
    if not out.isOpened():
        cap.release()
        raise RuntimeError(f"Could not open output video for writing: {output_path}")

    frame_idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break

        if frame is None:
            break

        # Process frame based on algorithm
        if algorithm == "spatial":
            if mode == "scramble":
                processed = scramble_frame(frame, n, m, perm_dest_to_src_0, src_rects, dest_rects)
            else:
                processed = unscramble_frame(frame, n, m, perm_dest_to_src_0, src_rects, dest_rects)
        elif algorithm == "color":
            if mode == "scramble":
                processed = color_scramble_frame(frame, n, m, hue_shifts, rects)
            else:
                processed = color_unscramble_frame(frame, n, m, hue_shifts, rects)
        elif algorithm == "hpf":
            if mode == "scramble":
                processed = hpf_scramble_frame(frame, n, m, perm_dest_to_src_0,
                                              blur_ksize, hpf_k_lr, hpf_k_tb,
                                              hpf_border_positions,
                                              hpf_tile_h, hpf_tile_w)
            else:
                processed = hpf_unscramble_frame(frame, n, m, perm_dest_to_src_0,
                                                 hpf_k_lr, hpf_k_tb, hpf_border_positions,
                                                 hpf_tile_h, hpf_tile_w,
                                                 hpf_orig_h, hpf_orig_w)

        # Apply watermark marker overlay (if requested)
        if wm_id is not None:
            processed = apply_watermark(
                processed, frame_idx,
                wm_id, wm_alpha, wm_scale,
                wm_count, wm_duration, wm_placement,
                wm_min_margin, wm_max_margin,
            )

        out.write(processed)
        frame_idx += 1
        if frame_idx % 100 == 0:
            print(f"  processed {frame_idx} frames…")

    cap.release()
    out.release()
    print(f"✓ {frame_idx} frames processed → {output_path}")

    # Save params JSON (only for scramble mode)
    params_path = ""
    if mode == "scramble":
        if algorithm == "spatial":
            params = params_to_json(seed, n, m, perm_dest_to_src_0)
        elif algorithm == "color":
            params = color_params_to_json(seed, n, m, hue_shifts, max_hue_shift)
        elif algorithm == "hpf":
            params = hpf_params_to_json(seed, n, m, perm_dest_to_src_0,
                                       blur_ksize, hpf_k_lr, hpf_k_tb,
                                       hpf_tile_h, hpf_tile_w,
                                       hpf_orig_h, hpf_orig_w)

        base, ext = os.path.splitext(output_path)
        params_path = base + ".params.json"
        with open(params_path, "w", encoding="utf-8") as f:
            json.dump(params, f, indent=2)

    return params_path


def process_video_by_percentage(input_path: str,
                  output_path: str,
                  seed: Optional[int] = None,
                  rows: Optional[int] = None,
                  cols: Optional[int] = None,
                  mode: str = "scramble",
                  percentage: Optional[int] = 100) -> str:
    """
    Process a video: scramble or unscramble according to mode.
    Only scrambles a certain percentage of tiles based on the percentage parameter.
    Returns path to params JSON (for scramble mode).
    """

    if not os.path.isfile(input_path):
        raise FileNotFoundError(f"Input video not found: {input_path}")

    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {input_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    if width <= 0 or height <= 0:
        cap.release()
        raise RuntimeError("Invalid video dimensions")

    # If rows/cols missing, choose them based on aspect ratio
    if rows is None or cols is None:
        dims = auto_grid_for_aspect(width, height)
        if rows is None:
            rows = dims.n
        if cols is None:
            cols = dims.m

    n, m = rows, cols
    N = n * m

    # Validate percentage
    if percentage is None:
        percentage = 100
    percentage = max(0, min(100, percentage))  # Clamp between 0 and 100

    # seed management
    if seed is None:
        seed = gen_random_seed()

    # Calculate how many tiles to scramble based on percentage
    tiles_to_scramble = max(1, int(N * percentage / 100.0))
    
    print(f"Scrambling {tiles_to_scramble} out of {N} tiles ({percentage}%)")

    if mode == "scramble":
        # Use the seed to select which tiles to scramble
        rand = mulberry32(seed & 0xFFFFFFFF)
        
        # Create a list of all tile indices and shuffle it to randomly select which to scramble
        tile_indices = list(range(N))
        for i in range(N - 1, 0, -1):
            j = math.floor(rand() * (i + 1))
            tile_indices[i], tile_indices[j] = tile_indices[j], tile_indices[i]
        
        # Select the first 'tiles_to_scramble' indices to be scrambled
        scrambled_indices = sorted(tile_indices[:tiles_to_scramble])
        
        print(f"Tiles to scramble (0-indexed): {scrambled_indices}")
        
        # Generate a permutation ONLY for the scrambled tiles
        # Use a different seed offset to get a different permutation
        scrambled_perm = seeded_permutation(len(scrambled_indices), seed + 1)
        
        # Create the full permutation: identity for most, scrambled for selected tiles
        partial_perm = list(range(N))  # Start with identity permutation
        
        # Apply the scrambled permutation to only the selected tiles
        # scrambled_indices[i] should map to scrambled_indices[scrambled_perm[i]]
        for i, src_idx in enumerate(scrambled_indices):
            dest_tile = scrambled_indices[scrambled_perm[i]]
            partial_perm[src_idx] = dest_tile
        
        perm_dest_to_src_0 = partial_perm
        
        # Verify it's a valid permutation
        perm_set = set(partial_perm)
        if len(perm_set) != N:
            print(f"WARNING: Invalid permutation! Expected {N} unique values, got {len(perm_set)}")
            print(f"Permutation: {partial_perm}")
            duplicates = [x for x in range(N) if partial_perm.count(x) > 1]
            missing = [x for x in range(N) if x not in perm_set]
            print(f"Duplicate values: {duplicates}")
            print(f"Missing values: {missing}")
        else:
            print(f"✓ Valid permutation generated")
        
    elif mode == "unscramble":
        # For unscramble, we need to reverse the same partial scramble
        # Use the EXACT same logic as scramble to generate the same permutation
        rand = mulberry32(seed & 0xFFFFFFFF)
        tile_indices = list(range(N))
        for i in range(N - 1, 0, -1):
            j = math.floor(rand() * (i + 1))
            tile_indices[i], tile_indices[j] = tile_indices[j], tile_indices[i]
        
        scrambled_indices = sorted(tile_indices[:tiles_to_scramble])
        print(f"Tiles to unscramble (0-indexed): {scrambled_indices}")
        
        # Generate the SAME permutation for scrambled tiles
        scrambled_perm = seeded_permutation(len(scrambled_indices), seed + 1)
        
        # Create the same partial permutation as scrambling
        partial_perm = list(range(N))
        for i, src_idx in enumerate(scrambled_indices):
            dest_tile = scrambled_indices[scrambled_perm[i]]
            partial_perm[src_idx] = dest_tile
        
        perm_dest_to_src_0 = partial_perm
        print(f"✓ Valid permutation generated for unscrambling")
    else:
        raise ValueError("mode must be 'scramble' or 'unscramble'")

    # Precompute rectangles for video frames (src and dest shapes are same)
    src_rects = cell_rects(width, height, n, m)
    dest_rects = cell_rects(width, height, n, m)

    # Prepare video writer with appropriate codec for output format
    fourcc, _ = get_fourcc_for_output(output_path)
    out = cv2.VideoWriter(output_path, fourcc, float(fps), (width, height))
    if not out.isOpened():
        cap.release()
        raise RuntimeError(f"Could not open output video for writing: {output_path}")

    # Process all frames
    frame_idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break

        if frame is None:
            break

        # Apply the same partial scramble/unscramble to each frame
        if mode == "scramble":
            processed = scramble_frame(frame, n, m, perm_dest_to_src_0, src_rects, dest_rects)
        else:
            processed = unscramble_frame(frame, n, m, perm_dest_to_src_0, src_rects, dest_rects)

        out.write(processed)
        frame_idx += 1

        # Print progress every 30 frames
        if frame_idx % 30 == 0:
            print(f"Processed {frame_idx} frames...")

    cap.release()
    out.release()

    print(f"✓ Processed {frame_idx} frames total")

    # Save params JSON (only for scramble mode)
    params_path = ""
    if mode == "scramble":
        params = params_to_json(seed, n, m, perm_dest_to_src_0)
        # Add percentage info to params
        params["percentage"] = percentage
        params["tiles_scrambled"] = tiles_to_scramble
        params["total_tiles"] = N
        
        base, ext = os.path.splitext(output_path)
        params_path = base + ".params.json"
        with open(params_path, "w", encoding="utf-8") as f:
            json.dump(params, f, indent=2)

    return params_path


def generate_hue_shifts(n: int, m: int, seed: int, max_shift: int = 128) -> List[int]:
    """
    Generate random hue shifts for each cell in the grid.
    Returns a list of hue shift values (0 to max_shift) for each cell.
    """
    rand = mulberry32(seed & 0xFFFFFFFF)
    N = n * m
    shifts = []
    
    for _ in range(N):
        # Generate random shift from 0 to max_shift
        shift = int(rand() * (max_shift + 1))
        shifts.append(shift)
    
    return shifts


def apply_hue_shift_to_region(region: np.ndarray, hue_shift: int) -> np.ndarray:
    """
    Apply hue shift to a specific region of the frame.
    region: BGR image region
    hue_shift: amount to shift hue (0-179 for OpenCV HSV)
    """
    if hue_shift == 0:
        return region.copy()
    
    # Convert BGR to HSV
    hsv = cv2.cvtColor(region, cv2.COLOR_BGR2HSV)
    
    # Shift the hue channel
    # OpenCV hue range is 0-179, so we need to map our 0-128 range appropriately
    hue_shift_cv = int((hue_shift / 128.0) * 179)
    
    # Apply hue shift with wrapping
    hsv[:, :, 0] = (hsv[:, :, 0].astype(np.int32) + hue_shift_cv) % 180
    
    # Convert back to BGR
    result = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)
    return result


def color_scramble_frame(frame: np.ndarray,
                        n: int,
                        m: int,
                        hue_shifts: List[int],
                        cell_rects: List[Rect]) -> np.ndarray:
    """
    Apply color scrambling (hue shifts) to each cell in the frame.
    """
    h, w, c = frame.shape
    out = frame.copy()
    
    N = n * m
    if len(hue_shifts) != N or len(cell_rects) != N:
        raise ValueError("Hue shifts and cell rects must match grid size")
    
    for cell_idx in range(N):
        rect = cell_rects[cell_idx]
        hue_shift = hue_shifts[cell_idx]
        
        # Extract the cell region
        region = frame[rect.y0:rect.y1, rect.x0:rect.x1, :]
        
        # Apply hue shift
        shifted_region = apply_hue_shift_to_region(region, hue_shift)
        
        # Place back in output frame
        out[rect.y0:rect.y1, rect.x0:rect.x1, :] = shifted_region
    
    return out


def color_unscramble_frame(frame: np.ndarray,
                          n: int,
                          m: int,
                          hue_shifts: List[int],
                          cell_rects: List[Rect]) -> np.ndarray:
    """
    Reverse color scrambling by applying negative hue shifts.
    """
    # Create inverse hue shifts
    inverse_shifts = [-shift for shift in hue_shifts]
    return color_scramble_frame(frame, n, m, inverse_shifts, cell_rects)


def color_params_to_json(seed: int, n: int, m: int, hue_shifts: List[int], max_shift: int) -> Dict[str, Any]:
    """
    Convert color scramble parameters to JSON for export/saving.
    """
    return {
        "version": 3,
        "algorithm": "color_scramble",
        "seed": int(seed),
        "n": int(n),
        "m": int(m),
        "max_shift": int(max_shift),
        "hue_shifts": hue_shifts,
        "semantics": "Hue shifts applied to each grid cell (0-based indexing)",
    }

def main():
    parser = argparse.ArgumentParser(description="Scramble/unscramble a video using grid permutation or color shifting.")
    parser.add_argument("--input", "-i", required=True, help="Input video path")
    parser.add_argument("--output", "-o", required=True, help="Output video path")
    parser.add_argument("--seed", type=int, help="Random seed (32-bit). If omitted, one is generated.")
    parser.add_argument("--rows", type=int, help="Grid rows (n). If omitted, auto-chosen from aspect ratio.")
    parser.add_argument("--cols", type=int, help="Grid cols (m). If omitted, auto-chosen from aspect ratio.")
    parser.add_argument("--mode", choices=["scramble", "unscramble"], default="scramble",
                        help="Operation mode (default: scramble)")
    parser.add_argument("--algorithm", choices=["spatial", "color", "hpf"], default="spatial",
                        help="Scrambling algorithm: 'spatial' for position swapping, 'color' for hue shifting, 'hpf' for high-pass frequency decomposition (default: spatial)")
    parser.add_argument("--max-hue-shift", type=int, default=128, 
                        help="Maximum hue shift amount for color algorithm (0-128, default: 128)")
    parser.add_argument("--blur-ksize", type=int, default=15,
                        help="Gaussian blur kernel size (odd integer) for HPF algorithm. Larger = more blur in LPF, more detail in HPF tiles (default: 15)")
    parser.add_argument("--watermark-rows", type=int, default=1,
                        help="Number of empty tile rows on top and bottom for watermarks/attribution (HPF algorithm only, default: 1)")
    parser.add_argument("--percentage", type=int,
                        help="Percentage of tiles to scramble (0-100). Only for spatial algorithm.")

    # ── watermark marker args ──────────────────────────────────────────────────
    parser.add_argument("--wm-id", type=int, default=None,
                        help="Watermark tracking ID to embed (0-65535, 16-bit). Omit to skip watermark.")
    parser.add_argument("--wm-alpha", type=float, default=0.15,
                        help="Watermark marker opacity (0.01-0.50, default: 0.15)")
    parser.add_argument("--wm-scale", type=float, default=1.0,
                        help="Watermark marker size scale multiplier (0.5-4.0, default: 1.0)")
    parser.add_argument("--wm-numbers", type=int, default=1,
                        help="Number of simultaneous watermark markers per frame (1-8, default: 1)")
    parser.add_argument("--wm-duration", type=int, default=30,
                        help="Frames each marker position is held before moving (1-300, default: 30)")
    parser.add_argument("--wm-placement", type=str, default="random",
                        choices=["random", "corners", "edges", "center", "custom"],
                        help="Marker placement zone (default: random)")
    parser.add_argument("--wm-min-margin", type=float, default=5.0,
                        help="Min edge margin %% for custom placement (0-45, default: 5)")
    parser.add_argument("--wm-max-margin", type=float, default=30.0,
                        help="Max edge margin %% for custom placement (5-50, default: 30)")

    args = parser.parse_args()

    # Validate max-hue-shift range
    if args.max_hue_shift < 0 or args.max_hue_shift > 128:
        print("Error: --max-hue-shift must be between 0 and 128", file=sys.stderr)
        sys.exit(1)

    # Validate blur kernel size
    if args.blur_ksize < 1:
        print("Error: --blur-ksize must be a positive odd integer", file=sys.stderr)
        sys.exit(1)
    if args.blur_ksize % 2 == 0:
        args.blur_ksize += 1
        print(f"Note: --blur-ksize adjusted to {args.blur_ksize} (must be odd)")

    try:
        # check if percentage is provided and valid
        if args.percentage is not None and args.percentage <= 100 and args.percentage >= 0:
            params_path = process_video_by_percentage(
                input_path=args.input,
                output_path=args.output,
                seed=args.seed,
                rows=args.rows,
                cols=args.cols,
                mode=args.mode,
                algorithm=args.algorithm,
                percentage=args.percentage,
            )
        else:
            # if percentage is not provided or equal to 100%, use normal processing
            params_path = process_video(
                input_path=args.input,
                output_path=args.output,
                seed=args.seed,
                rows=args.rows,
                cols=args.cols,
                mode=args.mode,
                algorithm=args.algorithm,
                max_hue_shift=args.max_hue_shift,
                blur_ksize=args.blur_ksize,
                watermark_rows=args.watermark_rows,
                wm_id=args.wm_id,
                wm_alpha=args.wm_alpha,
                wm_scale=args.wm_scale,
                wm_count=args.wm_numbers,
                wm_duration=args.wm_duration,
                wm_placement=args.wm_placement,
                wm_min_margin=args.wm_min_margin,
                wm_max_margin=args.wm_max_margin,
            )
        print(f"Done. Output video: {args.output}")
        if args.mode == "scramble" and params_path:
            print(f"Scramble params saved to: {params_path}")
            print(f"Algorithm used: {args.algorithm}")
            if args.algorithm == "color":
                print(f"Max hue shift: {args.max_hue_shift}")
            elif args.algorithm == "hpf":
                print(f"Blur kernel size: {args.blur_ksize}")
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
