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

def gcd(a: int, b: int) -> int:
    """
    Calculate greatest common divisor of two integers.
    """
    a = abs(int(a))
    b = abs(int(b))
    while b != 0:
        a, b = b, a % b
    return a

def mod(n: int, m: int) -> int:
    """
    True mathematical modulo for negatives (always positive result).
    """
    return ((n % m) + m) % m

def clamp_int(n, lo: int, hi: int) -> int:
    """
    Clamp a number to [lo, hi] range and round to integer.
    """
    try:
        n = float(n)
    except (ValueError, TypeError):
        n = float(lo)
    return max(lo, min(hi, round(n)))

def generate_noise_tile_offsets(tile_size: int, seed: int, intensity: int) -> np.ndarray:
    """
    Generate random noise offsets for a tile.
    Returns array of shape (tile_size * tile_size, 3) with RGB offsets per pixel.
    Each offset is in range [-intensity, +intensity].
    """
    rand = mulberry32(seed & 0xFFFFFFFF)
    px_count = tile_size * tile_size
    
    # Store offsets per pixel per channel (RGB), int16 is sufficient
    offsets = np.zeros((px_count, 3), dtype=np.int16)
    
    for p in range(px_count):
        # Uniform integer in [-intensity, +intensity]
        offsets[p, 0] = round((rand() * 2 - 1) * intensity)
        offsets[p, 1] = round((rand() * 2 - 1) * intensity)
        offsets[p, 2] = round((rand() * 2 - 1) * intensity)
    
    return offsets

def apply_noise_add_mod256(img: np.ndarray, tile_offsets: np.ndarray, tile_size: int) -> np.ndarray:
    """
    Apply reversible noise to an image by adding offsets modulo 256.
    
    Args:
        img: Input image (H, W, 3) BGR format
        tile_offsets: Noise offsets array (tile_size*tile_size, 3)
        tile_size: Size of the repeating noise tile
    
    Returns:
        Noisy image (H, W, 3)
    """
    h, w = img.shape[:2]
    out = img.copy()
    
    for y in range(h):
        ty = y % tile_size
        for x in range(w):
            tx = x % tile_size
            tile_index = ty * tile_size + tx
            
            # Apply offsets with modulo 256 for reversibility
            # Note: OpenCV uses BGR, JavaScript Canvas uses RGB
            out[y, x, 0] = mod(int(img[y, x, 0]) + int(tile_offsets[tile_index, 0]), 256)  # B
            out[y, x, 1] = mod(int(img[y, x, 1]) + int(tile_offsets[tile_index, 1]), 256)  # G
            out[y, x, 2] = mod(int(img[y, x, 2]) + int(tile_offsets[tile_index, 2]), 256)  # R
    
    return out

def apply_noise_sub_mod256(img: np.ndarray, tile_offsets: np.ndarray, tile_size: int) -> np.ndarray:
    """
    Remove reversible noise from an image by subtracting offsets modulo 256.
    
    Args:
        img: Noisy input image (H, W, 3) BGR format
        tile_offsets: Noise offsets array (tile_size*tile_size, 3)
        tile_size: Size of the repeating noise tile
    
    Returns:
        Denoised image (H, W, 3)
    """
    h, w = img.shape[:2]
    out = img.copy()
    
    for y in range(h):
        ty = y % tile_size
        for x in range(w):
            tx = x % tile_size
            tile_index = ty * tile_size + tx
            
            # Subtract offsets with modulo 256 to reverse the noise
            out[y, x, 0] = mod(int(img[y, x, 0]) - int(tile_offsets[tile_index, 0]), 256)  # B
            out[y, x, 1] = mod(int(img[y, x, 1]) - int(tile_offsets[tile_index, 1]), 256)  # G
            out[y, x, 2] = mod(int(img[y, x, 2]) - int(tile_offsets[tile_index, 2]), 256)  # R
    
    return out

def noise_params_to_json(seed: int, w: int, h: int, tile_size: int, intensity: int) -> Dict[str, Any]:
    """
    Convert noise scramble parameters to JSON-like dict for export/saving.
    """
    return {
        "v": 1,
        "mode": "add_mod256_tile",
        "prng": "mulberry32",
        "w": int(w),
        "h": int(h),
        "tile": int(tile_size),
        "seed": int(seed),
        "intensity": int(intensity),
        "note": "Keep these params with the noisy image to reverse it."
    }

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
                        cell_rects: List[Rect],
                        scrambled_indices: Optional[List[int]] = None) -> np.ndarray:
    """
    Apply color scrambling (hue shifts) to each cell in the frame.
    If scrambled_indices is provided, only shift hue for those specific tiles.
    """
    h, w, c = frame.shape
    out = frame.copy()
    
    N = n * m
    if len(hue_shifts) != N or len(cell_rects) != N:
        raise ValueError("Hue shifts and cell rects must match grid size")
    
    # If no specific indices provided, scramble all tiles
    if scrambled_indices is None:
        scrambled_indices = list(range(N))
    
    for cell_idx in scrambled_indices:
        rect = cell_rects[cell_idx]
        hue_shift = hue_shifts[cell_idx]
        
        # Skip if no hue shift
        if hue_shift == 0:
            continue
        
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
                          cell_rects: List[Rect],
                          scrambled_indices: Optional[List[int]] = None) -> np.ndarray:
    """
    Reverse color scrambling by applying negative hue shifts.
    If scrambled_indices is provided, only unshift hue for those specific tiles.
    """
    # Create inverse hue shifts
    inverse_shifts = [-shift for shift in hue_shifts]
    return color_scramble_frame(frame, n, m, inverse_shifts, cell_rects, scrambled_indices)


def color_params_to_json(seed: int, n: int, m: int, hue_shifts: List[int], max_shift: int, percentage: int = 100, tiles_scrambled: Optional[int] = None, total_tiles: Optional[int] = None) -> Dict[str, Any]:
    """
    Convert color scramble parameters to JSON for export/saving.
    """
    params = {
        "version": 3,
        "algorithm": "color_scramble",
        "seed": int(seed),
        "n": int(n),
        "m": int(m),
        "max_shift": int(max_shift),
        "hue_shifts": hue_shifts,
        "semantics": "Hue shifts applied to each grid cell (0-based indexing)",
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
                  algorithm: str = "noise",
                  max_hue_shift: int = 128,
                  intensity: int = 64,
                  percentage: int = 100) -> str:
    """
    Process a photo: scramble or unscramble according to mode.
    Returns path to params JSON (for scramble mode).
    
    Algorithms:
    - "noise": Reversible pixel noise using modulo 256 addition
    - "color": Hue shifting per tile
    - "spatial": Grid-based position swapping
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

    # seed management
    if seed is None:
        seed = gen_random_seed()

    # Validate and clamp percentage
    percentage = max(0, min(100, percentage))

    # Process based on algorithm
    if algorithm == "noise":
        # Reversible noise algorithm using tileable pattern
        # Use GCD of width and height for tile size (ensures tileability)
        tile_size = gcd(width, height)
        if tile_size <= 0:
            raise ValueError("Invalid tile size computed from image dimensions")
        
        # Clamp intensity to valid range
        intensity = clamp_int(intensity, 0, 127)
        
        print(f"Using noise algorithm with tile_size={tile_size}, intensity={intensity}, seed={seed}")
        
        # Generate tile offsets
        tile_offsets = generate_noise_tile_offsets(tile_size, seed, intensity)
        
        # Apply or remove noise
        if mode == "scramble":
            processed = apply_noise_add_mod256(frame, tile_offsets, tile_size)
            print(f"Applied reversible noise to image")
        elif mode == "unscramble":
            processed = apply_noise_sub_mod256(frame, tile_offsets, tile_size)
            print(f"Removed reversible noise from image")
        else:
            raise ValueError("mode must be 'scramble' or 'unscramble'")
        
        tiles_scrambled = N = width * height // (tile_size * tile_size)
        
    elif algorithm == "color":
        # If rows/cols missing, choose them based on aspect ratio
        if rows is None or cols is None:
            dims = auto_grid_for_aspect(width, height)
            if rows is None:
                rows = dims.n
            if cols is None:
                cols = dims.m

        n, m = rows, cols
        N = n * m
        
        # Generate hue shifts for each tile
        hue_shifts = generate_hue_shifts(n, m, seed, max_hue_shift)
        rects = cell_rects(width, height, n, m)
        
        # Determine which tiles to scramble based on percentage
        scrambled_indices = None
        tiles_scrambled = N
        
        if percentage < 100:
            scrambled_indices = select_tiles_to_scramble(N, seed, percentage)
            tiles_scrambled = len(scrambled_indices)
            
            # Zero out hue shifts for tiles that shouldn't be scrambled
            hue_shifts_partial = hue_shifts.copy()
            for i in range(N):
                if i not in scrambled_indices:
                    hue_shifts_partial[i] = 0
            hue_shifts = hue_shifts_partial
            
            print(f"Scrambling {tiles_scrambled} out of {N} tiles ({percentage}%)")
            print(f"Tiles to scramble (0-indexed): {scrambled_indices}")
        
        # Process the image
        if mode == "scramble":
            processed = color_scramble_frame(frame, n, m, hue_shifts, rects, scrambled_indices)
        elif mode == "unscramble":
            processed = color_unscramble_frame(frame, n, m, hue_shifts, rects, scrambled_indices)
        else:
            raise ValueError("mode must be 'scramble' or 'unscramble'")
            
    else:  # Legacy spatial algorithm
        # If rows/cols missing, choose them based on aspect ratio
        if rows is None or cols is None:
            dims = auto_grid_for_aspect(width, height)
            if rows is None:
                rows = dims.n
            if cols is None:
                cols = dims.m

        n, m = rows, cols
        N = n * m
        
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
        if algorithm == "noise":
            params = noise_params_to_json(seed, width, height, tile_size, intensity)
        elif algorithm == "color":
            params = color_params_to_json(seed, n, m, hue_shifts, max_hue_shift, percentage, tiles_scrambled, N)
        else:
            params = params_to_json(seed, n, m, perm_dest_to_src_0)
            
        base, ext = os.path.splitext(output_path)
        params_path = base + ".params.json"
        with open(params_path, "w", encoding="utf-8") as f:
            json.dump(params, f, indent=2)

    return params_path


def main():
    parser = argparse.ArgumentParser(description="Scramble/unscramble a photo using reversible noise, color/hue shifting, or grid permutation.")
    parser.add_argument("--input", "-i", required=True, help="Input photo path")
    parser.add_argument("--output", "-o", required=True, help="Output photo path")
    parser.add_argument("--seed", type=int, help="Random seed (32-bit). If omitted, one is generated.")
    parser.add_argument("--rows", type=int, help="Grid rows (n). If omitted, auto-chosen from aspect ratio. (Not used for 'noise' algorithm)")
    parser.add_argument("--cols", type=int, help="Grid cols (m). If omitted, auto-chosen from aspect ratio. (Not used for 'noise' algorithm)")
    parser.add_argument("--mode", choices=["scramble", "unscramble"], default="scramble",
                        help="Operation mode (default: scramble). Unscramble assumes same seed/n/m.")
    parser.add_argument("--algorithm", choices=["noise", "color", "spatial"], default="noise",
                        help="Scrambling algorithm: 'noise' for reversible pixel noise (default), 'color' for hue shifting, 'spatial' for position swapping")
    parser.add_argument("--intensity", type=int, default=64,
                        help="Noise intensity for 'noise' algorithm (0-127, default: 64)")
    parser.add_argument("--max-hue-shift", type=int, default=128, 
                        help="Maximum hue shift amount for color algorithm (0-128, default: 128)")
    parser.add_argument("--percentage", type=int, default=100, help="Percentage of tiles to scramble (default: 100). (Not used for 'noise' algorithm)")

    args = parser.parse_args()

    # Validate intensity range
    if args.intensity < 0 or args.intensity > 127:
        print("Error: --intensity must be between 0 and 127", file=sys.stderr)
        sys.exit(1)

    # Validate max-hue-shift range
    if args.max_hue_shift < 0 or args.max_hue_shift > 128:
        print("Error: --max-hue-shift must be between 0 and 128", file=sys.stderr)
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
            intensity=args.intensity,
            max_hue_shift=args.max_hue_shift,
            percentage=args.percentage,
        )
        print(f"Done. Output photo: {args.output}")
        if args.mode == "scramble" and params_path:
            print(f"Scramble params saved to: {params_path}")
            print(f"Algorithm used: {args.algorithm}")
            if args.algorithm == "noise":
                print(f"Noise intensity: {args.intensity}")
            elif args.algorithm == "color":
                print(f"Max hue shift: {args.max_hue_shift}")
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
