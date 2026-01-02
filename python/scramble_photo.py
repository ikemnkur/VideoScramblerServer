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


# === paste all helper functions from above here ===
# mulberry32, gen_random_seed, seeded_permutation, one_based, zero_based,
# auto_grid_for_aspect, params_to_json, json_to_params, inverse_permutation,
# Rect, cell_rects


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
                  percentage: Optional[int] = 100,
                  noise_intensity: Optional[int] = 0,
                  noise_tile_size: Optional[int] = 16) -> str:
    """
    Process a photo: scramble or unscramble according to mode.
    Returns path to params JSON (for scramble mode).
    
    Args:
        noise_intensity: If > 0, adds tileable noise before scrambling (0 = no noise)
        noise_tile_size: Size of noise tile pattern (default 16x16)
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
        # Use a different seed for noise (seed + 999) to keep it separate from scrambling
        noise_seed = (seed if seed is not None else gen_random_seed()) + 999
        noise_offsets = generate_noise_tile_offsets(noise_tile_size, noise_seed, noise_intensity)
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

    if mode == "scramble":
        perm_dest_to_src_0 = seeded_permutation(N, seed)
    elif mode == "unscramble":
        # For Unscramble you'd normally load perm from JSON, not generate it.
        # But we support deterministic unscramble if we know seed/n/m.
        perm_dest_to_src_0 = seeded_permutation(N, seed)
    else:
        raise ValueError("mode must be 'scramble' or 'unscramble'")

    # Precompute rectangles for the photo (src and dest shapes are same)
    src_rects = cell_rects(width, height, n, m)
    dest_rects = cell_rects(width, height, n, m)

    # Process the single frame
    if mode == "scramble":
        # Apply noise BEFORE scrambling
        if noise_offsets is not None:
            frame = apply_noise_add_mod256(frame, noise_offsets, noise_tile_size)
        
        processed = scramble_frame(frame, n, m, perm_dest_to_src_0, src_rects, dest_rects)
    else:
        # Unscramble first
        processed = unscramble_frame(frame, n, m, perm_dest_to_src_0, src_rects, dest_rects)
        
        # Remove noise AFTER unscrambling
        if noise_offsets is not None:
            processed = apply_noise_sub_mod256(processed, noise_offsets, noise_tile_size)

    # Write the output image
    cv2.imwrite(output_path, processed)

    # Save params JSON (only for scramble mode)
    params_path = ""
    if mode == "scramble":
        params = params_to_json(seed, n, m, perm_dest_to_src_0)
        if noise_intensity > 0:
            params["noise_intensity"] = noise_intensity
            params["noise_tile_size"] = noise_tile_size
        base, ext = os.path.splitext(output_path)
        params_path = base + ".params.json"
        with open(params_path, "w", encoding="utf-8") as f:
            json.dump(params, f, indent=2)

    return params_path

def process_photo_by_percentage(input_path: str,
                  output_path: str,
                  seed: Optional[int] = None,
                  rows: Optional[int] = None,
                  cols: Optional[int] = None,
                  mode: str = "scramble",
                  percentage: Optional[int] = 100,
                  noise_intensity: Optional[int] = 0,
                  noise_tile_size: Optional[int] = 16) -> str:
    """
    Process a photo: scramble or unscramble according to mode.
    Only scrambles a certain percentage of tiles based on the percentage parameter.
    Returns path to params JSON (for scramble mode).
    
    Args:
        noise_intensity: If > 0, adds tileable noise before scrambling (0 = no noise)
        noise_tile_size: Size of noise tile pattern (default 16x16)
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
        # Use a different seed for noise (seed + 999) to keep it separate from scrambling
        noise_seed = (seed if seed is not None else gen_random_seed()) + 999
        noise_offsets = generate_noise_tile_offsets(noise_tile_size, noise_seed, noise_intensity)
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

    # Precompute rectangles for the photo (src and dest shapes are same)
    src_rects = cell_rects(width, height, n, m)
    dest_rects = cell_rects(width, height, n, m)

    # Process the single frame
    if mode == "scramble":
        # Apply noise BEFORE scrambling
        if noise_offsets is not None:
            frame = apply_noise_add_mod256(frame, noise_offsets, noise_tile_size)
        
        processed = scramble_frame(frame, n, m, perm_dest_to_src_0, src_rects, dest_rects)
    else:
        # Unscramble first
        processed = unscramble_frame(frame, n, m, perm_dest_to_src_0, src_rects, dest_rects)
        
        # Remove noise AFTER unscrambling
        if noise_offsets is not None:
            processed = apply_noise_sub_mod256(processed, noise_offsets, noise_tile_size)

    # Write the output image
    cv2.imwrite(output_path, processed)

    # Save params JSON (only for scramble mode)
    params_path = ""
    if mode == "scramble":
        params = params_to_json(seed, n, m, perm_dest_to_src_0)
        # Add percentage info to params
        params["percentage"] = percentage
        params["tiles_scrambled"] = tiles_to_scramble
        params["total_tiles"] = N
        if noise_intensity > 0:
            params["noise_intensity"] = noise_intensity
            params["noise_tile_size"] = noise_tile_size
        
        base, ext = os.path.splitext(output_path)
        params_path = base + ".params.json"
        with open(params_path, "w", encoding="utf-8") as f:
            json.dump(params, f, indent=2)

    return params_path


def main():
    parser = argparse.ArgumentParser(description="Scramble/unscramble a photo using grid permutation.")
    parser.add_argument("--input", "-i", required=True, help="Input photo path")
    parser.add_argument("--output", "-o", required=True, help="Output photo path")
    parser.add_argument("--seed", type=int, help="Random seed (32-bit). If omitted, one is generated.")
    parser.add_argument("--rows", type=int, help="Grid rows (n). If omitted, auto-chosen from aspect ratio.")
    parser.add_argument("--cols", type=int, help="Grid cols (m). If omitted, auto-chosen from aspect ratio.")
    parser.add_argument("--percentage", type=int, default=100, help="Percentage of tiles to scramble (default: 100).")
    parser.add_argument("--mode", choices=["scramble", "unscramble"], default="scramble",
                        help="Operation mode (default: scramble). Unscramble assumes same seed/n/m.")
    parser.add_argument("--noise-intensity", type=int, default=0,
                        help="Noise intensity (0-128). 0 = no noise, 64 = moderate. Adds tileable noise before scrambling.")
    parser.add_argument("--noise-tile-size", type=int, default=16,
                        help="Size of noise tile pattern in pixels (default: 16).")

    args = parser.parse_args()

    try:
        # Use percentage-based processing if percentage is less than 100
        if args.percentage < 100:
            params_path = process_photo_by_percentage(
                input_path=args.input,
                output_path=args.output,
                seed=args.seed,
                rows=args.rows,
                cols=args.cols,
                percentage=args.percentage,
                mode=args.mode,
                noise_intensity=args.noise_intensity,
                noise_tile_size=args.noise_tile_size,
            )
        else:
            # Use the standard photo processing function for 100% scrambling
            params_path = process_photo(
                input_path=args.input,
                output_path=args.output,
                seed=args.seed,
                rows=args.rows,
                cols=args.cols,
                mode=args.mode,
                noise_intensity=args.noise_intensity,
                noise_tile_size=args.noise_tile_size,
            )
        
        print(f"Done. Output photo: {args.output}")
        if args.mode == "scramble" and params_path:
            print(f"Scramble params saved to: {params_path}")
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
