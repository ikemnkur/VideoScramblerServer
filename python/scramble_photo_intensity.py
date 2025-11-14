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

def generate_intensity_shifts(n: int, m: int, seed: int, max_shift: int = 128) -> List[int]:
    """
    Generate random intensity shifts for each cell in the grid.
    Returns a list of intensity shift values (0 to max_shift) for each cell.
    """
    rand = mulberry32(seed & 0xFFFFFFFF)
    N = n * m
    shifts = []
    
    for _ in range(N):
        # Generate random shift from 0 to max_shift
        shift = int(rand() * (max_shift + 1))
        shifts.append(shift)
    
    return shifts

def select_tiles_to_scramble(N: int, seed: int, percentage: int) -> List[int]:
    """
    Select which tiles to scramble based on the percentage.
    Returns a sorted list of tile indices to scramble.
    """
    tiles_to_scramble = max(1, int(N * percentage / 100.0))
    
    # Use the seed to select which tiles to scramble
    rand = mulberry32(seed & 0xFFFFFFFF)
    
    # Create a list of all tile indices and shuffle it
    tile_indices = list(range(N))
    for i in range(N - 1, 0, -1):
        j = math.floor(rand() * (i + 1))
        tile_indices[i], tile_indices[j] = tile_indices[j], tile_indices[i]
    
    # Select and sort the first 'tiles_to_scramble' indices
    return sorted(tile_indices[:tiles_to_scramble])

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


def apply_intensity_shift_to_region(region: np.ndarray, intensity_shift: int) -> np.ndarray:
    """
    Apply intensity shift to a specific region of the frame.
    region: BGR image region
    intensity_shift: amount to shift intensity values (0-128)
    """
    if intensity_shift == 0:
        return region.copy()
    
    # Convert to int32 to handle overflow, then apply shift with modulo wrapping
    region_shifted = (region.astype(np.int32) + intensity_shift) % 256
    
    # Convert back to uint8
    result = region_shifted.astype(np.uint8)
    return result


def intensity_scramble_frame(frame: np.ndarray,
                            n: int,
                            m: int,
                            intensity_shifts: List[int],
                            cell_rects: List[Rect],
                            scrambled_indices: Optional[List[int]] = None) -> np.ndarray:
    """
    Apply intensity scrambling (intensity shifts) to each cell in the frame.
    If scrambled_indices is provided, only shift intensity for those specific tiles.
    """
    h, w, c = frame.shape
    out = frame.copy()
    
    N = n * m
    if len(intensity_shifts) != N or len(cell_rects) != N:
        raise ValueError("Intensity shifts and cell rects must match grid size")
    
    # If no specific indices provided, scramble all tiles
    if scrambled_indices is None:
        scrambled_indices = list(range(N))
    
    for cell_idx in scrambled_indices:
        rect = cell_rects[cell_idx]
        intensity_shift = intensity_shifts[cell_idx]
        
        # Skip if no intensity shift
        if intensity_shift == 0:
            continue
        
        # Extract the cell region
        region = frame[rect.y0:rect.y1, rect.x0:rect.x1, :]
        
        # Apply intensity shift
        shifted_region = apply_intensity_shift_to_region(region, intensity_shift)
        
        # Place back in output frame
        out[rect.y0:rect.y1, rect.x0:rect.x1, :] = shifted_region
    
    return out


def intensity_unscramble_frame(frame: np.ndarray,
                               n: int,
                               m: int,
                               intensity_shifts: List[int],
                               cell_rects: List[Rect],
                               scrambled_indices: Optional[List[int]] = None) -> np.ndarray:
    """
    Reverse intensity scrambling by applying negative intensity shifts with modulo wrapping.
    If scrambled_indices is provided, only unshift intensity for those specific tiles.
    """
    # Create inverse intensity shifts with proper modulo arithmetic
    inverse_shifts = [(-shift) % 256 for shift in intensity_shifts]
    return intensity_scramble_frame(frame, n, m, inverse_shifts, cell_rects, scrambled_indices)


def intensity_params_to_json(seed: int, n: int, m: int, intensity_shifts: List[int], max_shift: int, percentage: int = 100, tiles_scrambled: Optional[int] = None, total_tiles: Optional[int] = None) -> Dict[str, Any]:
    """
    Convert intensity scramble parameters to JSON for export/saving.
    """
    params = {
        "version": 4,
        "algorithm": "intensity_scramble",
        "seed": int(seed),
        "n": int(n),
        "m": int(m),
        "max_shift": int(max_shift),
        "intensity_shifts": intensity_shifts,
        "semantics": "Intensity shifts applied to each grid cell (0-based indexing)",
    }
    
    # Add percentage info if less than 100%
    if percentage < 100:
        params["percentage"] = percentage
        if tiles_scrambled is not None:
            params["tiles_scrambled"] = tiles_scrambled
        if total_tiles is not None:
            params["total_tiles"] = total_tiles
    
    return params


# Legacy functions for compatibility
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
                  algorithm: str = "intensity",
                  max_intensity_shift: int = 128,
                  percentage: int = 100) -> str:
    """
    Process a photo: scramble or unscramble according to mode using intensity shifting.
    Returns path to params JSON (for scramble mode).
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

    # If rows/cols missing, choose them based on aspect ratio
    if rows is None or cols is None:
        dims = auto_grid_for_aspect(width, height)
        if rows is None:
            rows = dims.n
        if cols is None:
            cols = dims.m

    n, m = rows, cols
    N = n * m

    # Validate and clamp percentage
    percentage = max(0, min(100, percentage))

    # seed management
    if seed is None:
        seed = gen_random_seed()

    # Generate scrambling parameters based on algorithm
    if algorithm == "intensity":
        # Generate intensity shifts for each tile
        intensity_shifts = generate_intensity_shifts(n, m, seed, max_intensity_shift)
        rects = cell_rects(width, height, n, m)
        
        # Determine which tiles to scramble based on percentage
        scrambled_indices = None
        tiles_scrambled = N
        
        if percentage < 100:
            scrambled_indices = select_tiles_to_scramble(N, seed, percentage)
            tiles_scrambled = len(scrambled_indices)
            
            # Zero out intensity shifts for tiles that shouldn't be scrambled
            intensity_shifts_partial = intensity_shifts.copy()
            for i in range(N):
                if i not in scrambled_indices:
                    intensity_shifts_partial[i] = 0
            intensity_shifts = intensity_shifts_partial
            
            print(f"Scrambling {tiles_scrambled} out of {N} tiles ({percentage}%)")
            print(f"Tiles to scramble (0-indexed): {scrambled_indices}")
        
        # Process the image
        if mode == "scramble":
            processed = intensity_scramble_frame(frame, n, m, intensity_shifts, rects, scrambled_indices)
        elif mode == "unscramble":
            processed = intensity_unscramble_frame(frame, n, m, intensity_shifts, rects, scrambled_indices)
        else:
            raise ValueError("mode must be 'scramble' or 'unscramble'")
            
    else:  # Legacy spatial algorithm
        if mode == "scramble":
            perm_dest_to_src_0 = seeded_permutation(N, seed)
        elif mode == "unscramble":
            perm_dest_to_src_0 = seeded_permutation(N, seed)
        else:
            raise ValueError("mode must be 'scramble' or 'unscramble'")

        # Precompute rectangles for the photo (src and dest shapes are same)
        src_rects = cell_rects(width, height, n, m)
        dest_rects = cell_rects(width, height, n, m)

        # Process the single frame
        if mode == "scramble":
            processed = scramble_frame(frame, n, m, perm_dest_to_src_0, src_rects, dest_rects)
        else:
            processed = unscramble_frame(frame, n, m, perm_dest_to_src_0, src_rects, dest_rects)
        
        tiles_scrambled = N

    # Write the output image
    cv2.imwrite(output_path, processed)

    # Save params JSON (only for scramble mode)
    params_path = ""
    if mode == "scramble":
        if algorithm == "intensity":
            params = intensity_params_to_json(seed, n, m, intensity_shifts, max_intensity_shift, percentage, tiles_scrambled, N)
        else:
            params = params_to_json(seed, n, m, perm_dest_to_src_0)
            
        base, ext = os.path.splitext(output_path)
        params_path = base + ".params.json"
        with open(params_path, "w", encoding="utf-8") as f:
            json.dump(params, f, indent=2)

    return params_path


def main():
    parser = argparse.ArgumentParser(description="Scramble/unscramble a photo using intensity shifting or grid permutation.")
    parser.add_argument("--input", "-i", required=True, help="Input photo path")
    parser.add_argument("--output", "-o", required=True, help="Output photo path")
    parser.add_argument("--seed", type=int, help="Random seed (32-bit). If omitted, one is generated.")
    parser.add_argument("--rows", type=int, help="Grid rows (n). If omitted, auto-chosen from aspect ratio.")
    parser.add_argument("--cols", type=int, help="Grid cols (m). If omitted, auto-chosen from aspect ratio.")
    parser.add_argument("--mode", choices=["scramble", "unscramble"], default="scramble",
                        help="Operation mode (default: scramble). Unscramble assumes same seed/n/m.")
    parser.add_argument("--algorithm", choices=["intensity", "spatial"], default="intensity",
                        help="Scrambling algorithm: 'intensity' for pixel intensity shifting, 'spatial' for position swapping (default: intensity)")
    parser.add_argument("--max-intensity-shift", type=int, default=128, 
                        help="Maximum intensity shift amount for intensity algorithm (0-128, default: 128)")
    parser.add_argument("--percentage", type=int, default=100, help="Percentage of tiles to scramble (default: 100).")

    args = parser.parse_args()

    # Validate max-intensity-shift range
    if args.max_intensity_shift < 0 or args.max_intensity_shift > 128:
        print("Error: --max-intensity-shift must be between 0 and 128", file=sys.stderr)
        sys.exit(1)

    try:
        # Use the photo processing function
        params_path = process_photo(
            input_path=args.input,
            output_path=args.output,
            seed=args.seed,
            rows=args.rows,
            cols=args.cols,
            mode=args.mode,
            algorithm=args.algorithm,
            max_intensity_shift=args.max_intensity_shift,
            percentage=args.percentage,
        )
        print(f"Done. Output photo: {args.output}")
        if args.mode == "scramble" and params_path:
            print(f"Scramble params saved to: {params_path}")
            print(f"Algorithm used: {args.algorithm}")
            if args.algorithm == "intensity":
                print(f"Max intensity shift: {args.max_intensity_shift}")
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
