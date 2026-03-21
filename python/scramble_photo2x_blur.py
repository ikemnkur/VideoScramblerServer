#!/usr/bin/env python3
import argparse
import subprocess
import cv2
import json
import math
import os
import secrets
import sys
from dataclasses import dataclass
from typing import Optional, List, Dict, Any

import numpy as np


# Configure Python executable path for venv
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PYTHON_CMD = os.path.join(BASE_DIR, 'venv', 'bin', 'python3')


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


# ============================================================================
# Noise Functions (converted from JavaScript)
# ============================================================================

def gcd(a: int, b: int) -> int:
    """Greatest common divisor"""
    a = abs(int(a))
    b = abs(int(b))
    while b != 0:
        t = a % b
        a = b
        b = t
    return a


def mod(n: int, m: int) -> int:
    """True mathematical modulo for negatives"""
    return ((n % m) + m) % m


def clamp_int(n: float, lo: int, hi: int) -> int:
    """Clamp a number to integer range [lo, hi]"""
    if not math.isfinite(n):
        n = lo
    return max(lo, min(hi, round(n)))


def clamp(v: float, min_val: float, max_val: float) -> float:
    """Clamp a value to range [min_val, max_val]"""
    return max(min_val, min(max_val, v))


def generate_noise_tile_offsets(tile_size: int, seed: int, intensity: int) -> np.ndarray:
    """
    Generate tileable noise offsets for image scrambling.
    Returns array of shape (tile_size * tile_size, 3) with integer offsets in [-intensity, +intensity]
    
    Args:
        tile_size: Size of the square tile
        seed: Random seed for deterministic generation
        intensity: Maximum absolute offset value
    
    Returns:
        numpy array of int16 offsets for RGB channels
    """
    rand = mulberry32(seed & 0xFFFFFFFF)
    px_count = tile_size * tile_size
    
    # Store offsets per pixel per channel (RGB)
    offsets = np.zeros(px_count * 3, dtype=np.int16)
    
    for p in range(px_count):
        base = p * 3
        # Uniform integer in [-intensity, +intensity]
        offsets[base + 0] = round((rand() * 2 - 1) * intensity)
        offsets[base + 1] = round((rand() * 2 - 1) * intensity)
        offsets[base + 2] = round((rand() * 2 - 1) * intensity)
    
    return offsets


def apply_noise_add_mod256(frame: np.ndarray, tile_offsets: np.ndarray, tile_size: int) -> np.ndarray:
    """
    Add tileable noise to an image (for scrambling).
    Applies modulo 256 arithmetic to handle overflow.
    
    Args:
        frame: Input image (H, W, C) where C >= 3
        tile_offsets: Noise offsets from generate_noise_tile_offsets
        tile_size: Size of the tile pattern
    
    Returns:
        Image with noise added
    """
    h, w, c = frame.shape
    out = frame.copy()
    
    for y in range(h):
        ty = y % tile_size
        for x in range(w):
            tx = x % tile_size
            tile_index = (ty * tile_size + tx) * 3
            
            # Apply noise with modulo 256 (prevents overflow)
            out[y, x, 0] = mod(int(frame[y, x, 0]) + int(tile_offsets[tile_index + 0]), 256)
            out[y, x, 1] = mod(int(frame[y, x, 1]) + int(tile_offsets[tile_index + 1]), 256)
            out[y, x, 2] = mod(int(frame[y, x, 2]) + int(tile_offsets[tile_index + 2]), 256)
            # Alpha channel (if exists) unchanged
    
    return out


def apply_noise_sub_mod256(frame: np.ndarray, tile_offsets: np.ndarray, tile_size: int) -> np.ndarray:
    """
    Remove tileable noise from an image (for unscrambling).
    Applies modulo 256 arithmetic to handle underflow.
    
    Args:
        frame: Input image (H, W, C) where C >= 3
        tile_offsets: Same noise offsets used in apply_noise_add_mod256
        tile_size: Size of the tile pattern
    
    Returns:
        Image with noise removed
    """
    h, w, c = frame.shape
    out = frame.copy()
    
    for y in range(h):
        ty = y % tile_size
        for x in range(w):
            tx = x % tile_size
            tile_index = (ty * tile_size + tx) * 3
            
            # Subtract noise with modulo 256 (prevents underflow)
            out[y, x, 0] = mod(int(frame[y, x, 0]) - int(tile_offsets[tile_index + 0]), 256)
            out[y, x, 1] = mod(int(frame[y, x, 1]) - int(tile_offsets[tile_index + 1]), 256)
            out[y, x, 2] = mod(int(frame[y, x, 2]) - int(tile_offsets[tile_index + 2]), 256)
            # Alpha channel (if exists) unchanged
    
    return out


# ============================================================================
# End of Noise Functions
# ============================================================================


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

    # 3. Create output canvas (zeros = black top/bottom watermark areas)
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

    # 5. Place HPF tiles on left/right border according to scramble permutation
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


# ─── Watermark Marker Helpers ────────────────────────────────────────────────
_WM_FINDER_P2 = [
    [1,1,1,1,1],
    [1,0,0,0,1],
    [1,0,1,0,1],
    [1,0,0,0,1],
    [1,1,1,1,1],
]
_WM_BIT_MAP_P2 = None

def _wm_bit_map_p2(wm_id: int) -> list:
    bits = [(wm_id >> (15 - i)) & 1 for i in range(16)]
    grid = [row[:] for row in _WM_FINDER_P2]
    data_pos = [(0,1),(0,2),(0,3),(1,0),(2,0),(3,0),(4,0),(4,1),(4,2),(4,3),(3,4),(2,4),(1,4),(0,4),(1,3),(1,1)]
    for idx, (r, c) in enumerate(data_pos):
        grid[r][c] = bits[idx]
    return grid

def wm_to_binary_p2(wm_id: int, wm_count: int) -> list:
    return [_wm_bit_map_p2(wm_id) for _ in range(wm_count)]

def wm_get_positions_p2(frame_w: int, frame_h: int, marker_size: int,
                        count: int, frame_idx: int, duration: int,
                        placement: str, min_margin: float, max_margin: float) -> list:
    def mulb(seed):
        def r():
            nonlocal seed
            seed = (seed + 0x6D2B79F5) & 0xFFFFFFFF
            z = seed
            z = ((z ^ (z >> 15)) * (z | 1)) & 0xFFFFFFFF
            z = (z ^ (z + ((z ^ (z >> 7)) * (z | 61)))) & 0xFFFFFFFF
            return ((z ^ (z >> 14)) & 0xFFFFFFFF) / 0xFFFFFFFF
        return r
    epoch = frame_idx // max(1, duration)
    positions = []
    reserved = []
    for i in range(count):
        seed = (epoch * 99991 + i * 31337 + 7) & 0xFFFFFFFF
        rand = mulb(seed)
        pad = marker_size // 2
        if placement == "corners":
            corners = [(pad, pad), (frame_w - pad - marker_size, pad),
                       (pad, frame_h - pad - marker_size),
                       (frame_w - pad - marker_size, frame_h - pad - marker_size)]
            px, py = corners[i % 4]
        elif placement == "edges":
            edge = i % 4
            if edge == 0:   px, py = int(rand() * (frame_w - marker_size)), pad
            elif edge == 1: px, py = int(rand() * (frame_w - marker_size)), frame_h - pad - marker_size
            elif edge == 2: px, py = pad, int(rand() * (frame_h - marker_size))
            else:           px, py = frame_w - pad - marker_size, int(rand() * (frame_h - marker_size))
        elif placement == "center":
            cx, cy = frame_w // 2, frame_h // 2
            spread = min(frame_w, frame_h) // 4
            px = cx - spread // 2 + int(rand() * spread)
            py = cy - spread // 2 + int(rand() * spread)
        elif placement == "custom":
            min_x = int(frame_w * min_margin / 100)
            max_x = int(frame_w * max_margin / 100)
            min_y = int(frame_h * min_margin / 100)
            max_y = int(frame_h * max_margin / 100)
            px = min_x + int(rand() * max(1, max_x - min_x - marker_size))
            py = min_y + int(rand() * max(1, max_y - min_y - marker_size))
        else:  # random
            margin_x = int(frame_w * 0.05)
            margin_y = int(frame_h * 0.05)
            px = margin_x + int(rand() * (frame_w - 2 * margin_x - marker_size))
            py = margin_y + int(rand() * (frame_h - 2 * margin_y - marker_size))
        px = max(0, min(px, frame_w - marker_size))
        py = max(0, min(py, frame_h - marker_size))
        for _ in range(5):
            overlap = False
            for rx, ry, rs in reserved:
                if abs(px - rx) < rs and abs(py - ry) < rs:
                    overlap = True
                    px = int(rand() * (frame_w - marker_size))
                    py = int(rand() * (frame_h - marker_size))
                    px = max(0, min(px, frame_w - marker_size))
                    py = max(0, min(py, frame_h - marker_size))
                    break
            if not overlap:
                break
        reserved.append((px, py, marker_size))
        positions.append((px, py))
    return positions

def draw_wm_marker_p2(img: np.ndarray, grid: list, x: int, y: int,
                      cell: int, alpha: float) -> np.ndarray:
    out = img.astype(np.float32)
    for r, row in enumerate(grid):
        for c, val in enumerate(row):
            color = 255.0 if val == 1 else 0.0
            y0, y1 = y + r * cell, y + (r + 1) * cell
            x0, x1 = x + c * cell, x + (c + 1) * cell
            y0, y1 = max(0, y0), min(img.shape[0], y1)
            x0, x1 = max(0, x0), min(img.shape[1], x1)
            if y0 >= y1 or x0 >= x1:
                continue
            roi = out[y0:y1, x0:x1]
            patch = np.full_like(roi, color)
            out[y0:y1, x0:x1] = roi * (1 - alpha) + patch * alpha
    return out.astype(np.uint8)

def apply_watermark_p2(frame: np.ndarray, frame_idx: int,
                       wm_id: int, wm_alpha: float, wm_scale: float,
                       wm_count: int, wm_duration: int, wm_placement: str,
                       wm_min_margin: float, wm_max_margin: float) -> np.ndarray:
    global _WM_BIT_MAP_P2
    if _WM_BIT_MAP_P2 is None or _WM_BIT_MAP_P2[0] != wm_id:
        _WM_BIT_MAP_P2 = (wm_id, wm_to_binary_p2(wm_id, wm_count))
    grids = _WM_BIT_MAP_P2[1]
    cell = max(1, int(round(wm_scale * max(frame.shape[0], frame.shape[1]) / 100)))
    marker_size = 5 * cell
    h, w = frame.shape[:2]
    positions = wm_get_positions_p2(w, h, marker_size, wm_count, frame_idx,
                                    wm_duration, wm_placement, wm_min_margin, wm_max_margin)
    out = frame.copy()
    for i, (px, py) in enumerate(positions):
        grid = grids[i % len(grids)]
        out = draw_wm_marker_p2(out, grid, px, py, cell, wm_alpha)
    return out
# ─────────────────────────────────────────────────────────────────────────────


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

        # Extract source region
        src_region = frame[sy0:sy1, sx0:sx1, :]
        
        # Get destination dimensions
        dest_h = dy1 - dy0
        dest_w = dx1 - dx0
        src_h = sy1 - sy0
        src_w = sx1 - sx0
        
        # If dimensions don't match, resize the source region to fit destination
        if src_h != dest_h or src_w != dest_w:
            src_region = cv2.resize(src_region, (dest_w, dest_h), interpolation=cv2.INTER_LINEAR)
        
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

def process_photo(input_path: str,
                  output_path: str,
                  seed: Optional[int] = None,
                  rows: Optional[int] = None,
                  cols: Optional[int] = None,
                  mode: str = "scramble",
                  noise_intensity: Optional[int] = 0,
                  noise_tile_size: Optional[int] = 16,
                  noise_seed: Optional[int] = None,
                  noise_mode: Optional[str] = None,
                  noise_prng: Optional[float] = None,
                  blur_ksize: int = 15,
                  watermark_rows: int = 1,
                  username: Optional[str] = None,
                  user_id: Optional[int] = None,
                  wm_id: Optional[int] = None,
                  wm_alpha: float = 0.15,
                  wm_scale: float = 2.0,
                  wm_count: int = 1,
                  wm_duration: int = 30,
                  wm_placement: str = "random",
                  wm_min_margin: float = 5.0,
                  wm_max_margin: float = 30.0) -> str:
    """
    Process a photo using HPF frequency decomposition: scramble or unscramble.

    Noise (if enabled) is applied as an extra encryption layer:
      - Scramble:   HPF scramble first, then add noise (last step)
      - Unscramble: remove noise first, then HPF unscramble

    Args:
        noise_intensity: If > 0, applies tileable noise overlay (0 = no noise)
        noise_tile_size: Size of noise tile pattern (default 16x16)
        blur_ksize: Gaussian blur kernel size (odd integer) for HPF decomposition
        watermark_rows: Number of empty tile rows on top/bottom for watermarks
    """

    if not os.path.isfile(input_path):
        raise FileNotFoundError(f"Input photo not found: {input_path}")

    # Read the image
    frame = cv2.imread(input_path)
    if frame is None:
        raise RuntimeError(f"Could not read image: {input_path}")

    height, width, channels = frame.shape

    if width <= 0 or height <= 0:
        raise RuntimeError("Invalid photo dimensions")
    
    # Generate noise offsets if noise is enabled
    noise_offsets = None
    if noise_intensity > 0:
        noise_tile_size = noise_tile_size or 16
        # Use a different seed for noise (seed + 999) to keep it separate from scrambling
        _noise_seed = (seed if seed is not None else gen_random_seed()) + 999
        noise_offsets = generate_noise_tile_offsets(noise_tile_size, _noise_seed, noise_intensity)
        print(f"Noise enabled: intensity={noise_intensity}, tile_size={noise_tile_size}")

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

    # HPF frequency decomposition setup
    if blur_ksize % 2 == 0:
        blur_ksize += 1
    watermark_rows = max(1, watermark_rows)

    perm_dest_to_src_0 = seeded_permutation(N, seed)

    hpf_k_lr = compute_lr_border_cols(n, m)
    hpf_k_tb = watermark_rows
    hpf_border_positions = get_lr_border_positions(n, m, hpf_k_lr, hpf_k_tb)
    hpf_rows_out = n + 2 * hpf_k_tb
    hpf_cols_out = m + 2 * hpf_k_lr

    if mode == "scramble":
        hpf_tile_h = height // n
        hpf_tile_w = width // m
        out_width = hpf_cols_out * hpf_tile_w
        out_height = hpf_rows_out * hpf_tile_h
        hpf_orig_h = height
        hpf_orig_w = width
        print(f"HPF scramble: {n}x{m} grid, blur_ksize={blur_ksize}")
        print(f"  Border: {hpf_k_lr} cols (L/R for HPF), {hpf_k_tb} rows (T/B for watermarks)")
        print(f"  Tile: {hpf_tile_w}x{hpf_tile_h}")
        print(f"  Input:  {width}x{height}")
        print(f"  Output: {out_width}x{out_height} "
              f"(~{(out_width * out_height) / (width * height):.2f}x area)")
    elif mode == "unscramble":
        hpf_tile_h = height // hpf_rows_out
        hpf_tile_w = width // hpf_cols_out
        hpf_orig_h = n * hpf_tile_h
        hpf_orig_w = m * hpf_tile_w
        out_width = hpf_orig_w
        out_height = hpf_orig_h
        print(f"HPF unscramble: {n}x{m} grid")
        print(f"  Border: {hpf_k_lr} cols (L/R), {hpf_k_tb} rows (T/B)")
        print(f"  Tile: {hpf_tile_w}x{hpf_tile_h}")
        print(f"  Input (scrambled):  {width}x{height}")
        print(f"  Output (restored):  {out_width}x{out_height}")
    else:
        raise ValueError("mode must be 'scramble' or 'unscramble'")

    # Process the single frame (HPF algorithm)
    if mode == "scramble":
        processed = hpf_scramble_frame(frame, n, m, perm_dest_to_src_0,
                                       blur_ksize, hpf_k_lr, hpf_k_tb,
                                       hpf_border_positions,
                                       hpf_tile_h, hpf_tile_w)
        # Apply noise AFTER scrambling (last encryption step)
        if noise_offsets is not None:
            processed = apply_noise_add_mod256(processed, noise_offsets, noise_tile_size)
    else:
        # Remove noise FIRST (reverse the last encryption step before HPF unscramble)
        if noise_offsets is not None:
            frame = apply_noise_sub_mod256(frame, noise_offsets, noise_tile_size)
        processed = hpf_unscramble_frame(frame, n, m, perm_dest_to_src_0,
                                         hpf_k_lr, hpf_k_tb, hpf_border_positions,
                                         hpf_tile_h, hpf_tile_w,
                                         hpf_orig_h, hpf_orig_w)

    # Apply watermark marker overlay (single-frame: frame_idx=0 gives a fixed position)
    if wm_id is not None:
        processed = apply_watermark_p2(
            processed, 0,
            wm_id, wm_alpha, wm_scale,
            wm_count, wm_duration, wm_placement,
            wm_min_margin, wm_max_margin,
        )
        print(f"  - Watermark marker embedded (ID={wm_id}, alpha={wm_alpha}, scale={wm_scale}, "
              f"count={wm_count}, placement={wm_placement})")

    # Write the output image
    cv2.imwrite(output_path, processed)
    
    # Embed user tracking code after writing the image (only for unscramble mode)
    if mode == "unscramble" and user_id and len(str(user_id)) == 10:
        print(f"  - Embedding user tracking code for user_id: {user_id}")
        embed_script = os.path.join(os.path.dirname(__file__), 'embed_code_image.py')
        cmd = [
            PYTHON_CMD, embed_script,
            '--input', output_path,
            '--output', output_path,
            '--user-id', str(user_id),
        ]
        try:
            subprocess.run(cmd, check=True, capture_output=True, text=True)
            print(f"  - User tracking code embedded successfully")
        except subprocess.CalledProcessError as e:
            print(f"  - Warning: Failed to embed tracking code: {e.stderr}")
    elif mode == "unscramble":
        print(f"  - Skipping user tracking code embedding (user_id not valid or not 10 chars)")

    # Save params JSON (only for scramble mode)
    params_path = ""
    if mode == "scramble":
        params = hpf_params_to_json(seed, n, m, perm_dest_to_src_0,
                                    blur_ksize, hpf_k_lr, hpf_k_tb,
                                    hpf_tile_h, hpf_tile_w,
                                    hpf_orig_h, hpf_orig_w)
        if noise_intensity > 0:
            params["noise_intensity"] = noise_intensity
            params["noise_tile_size"] = noise_tile_size

        base, ext = os.path.splitext(output_path)
        params_path = base + ".params.json"
        with open(params_path, "w", encoding="utf-8") as f:
            json.dump(params, f, indent=2)

    return params_path




def main():
    parser = argparse.ArgumentParser(
        description="Scramble/unscramble a photo using HPF (high-pass frequency) decomposition.")
    parser.add_argument("--input", "-i", required=True, help="Input photo path")
    parser.add_argument("--output", "-o", required=True, help="Output photo path")
    parser.add_argument("--seed", type=int, help="Random seed (32-bit). If omitted, one is generated.")
    parser.add_argument("--rows", type=int, help="Grid rows (n). If omitted, auto-chosen from aspect ratio.")
    parser.add_argument("--cols", type=int, help="Grid cols (m). If omitted, auto-chosen from aspect ratio.")
    parser.add_argument("--mode", choices=["scramble", "unscramble"], default="scramble",
                        help="Operation mode (default: scramble). Unscramble assumes same seed/n/m.")
    parser.add_argument("--noise_intensity", type=int, default=0,
                        help="Noise intensity (0-128). 0 = no noise, 64 = moderate. "
                             "Added AFTER HPF scramble / removed BEFORE HPF unscramble.")
    parser.add_argument("--noise_seed", type=int, default=0,
                        help="Noise seed for generating tileable noise pattern.")
    parser.add_argument("--blur-ksize", type=int, default=15,
                        help="Gaussian blur kernel size (odd integer) for HPF decomposition (default: 15)")
    parser.add_argument("--watermark-rows", type=int, default=1,
                        help="Empty tile rows on top/bottom for watermarks (default: 1)")
    parser.add_argument("--wm-id", type=int, default=None,
                        help="Watermark marker ID (0-65535). If omitted, no watermark is embedded.")
    parser.add_argument("--wm-alpha", type=float, default=0.15,
                        help="Watermark marker opacity (0.01-0.5, default: 0.15)")
    parser.add_argument("--wm-scale", type=float, default=2.0,
                        help="Watermark marker scale as %% of image max dimension per cell (default: 2.0)")
    parser.add_argument("--wm-numbers", type=int, default=1,
                        help="Number of watermark markers to embed (1-8, default: 1)")
    parser.add_argument("--wm-duration", type=int, default=30,
                        help="Frames each marker position is held (default: 30, photos use frame 0)")
    parser.add_argument("--wm-placement", choices=["random","corners","edges","center","custom"],
                        default="random", help="Marker placement strategy (default: random)")
    parser.add_argument("--wm-min-margin", type=float, default=5.0,
                        help="Min edge margin %% for custom placement (default: 5)")
    parser.add_argument("--wm-max-margin", type=float, default=30.0,
                        help="Max edge margin %% for custom placement (default: 30)")

    args = parser.parse_args()

    # Validate blur kernel size
    if args.blur_ksize < 1:
        print("Error: --blur-ksize must be a positive odd integer", file=sys.stderr)
        sys.exit(1)
    if args.blur_ksize % 2 == 0:
        args.blur_ksize += 1
        print(f"Note: --blur-ksize adjusted to {args.blur_ksize} (must be odd)")

    try:
        params_path = process_photo(
            input_path=args.input,
            output_path=args.output,
            seed=args.seed,
            rows=args.rows,
            cols=args.cols,
            mode=args.mode,
            noise_intensity=args.noise_intensity,
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
        print(f"Done. Output photo: {args.output}")
        if args.mode == "scramble" and params_path:
            print(f"Scramble params saved to: {params_path}")
            print(f"Blur kernel size: {args.blur_ksize}")
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
