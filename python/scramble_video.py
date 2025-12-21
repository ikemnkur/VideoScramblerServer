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
        return cv2.VideoWriter_fourcc(*"mp4v"), True

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

        # Copy region (height, width, channels)
        out[dy0:dy1, dx0:dx1, :] = frame[sy0:sy1, sx0:sx1, :]

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
                  max_hue_shift: int = 128) -> str:
    """
    Process a video: scramble or unscramble according to mode and algorithm.
    
    Args:
        algorithm: "spatial" for position scrambling, "color" for hue shifting
        max_hue_shift: Maximum hue shift amount (0-128) for color scrambling
    
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
        
    else:
        raise ValueError("algorithm must be 'spatial' or 'color'")

    # Prepare writer with appropriate codec for output format
    fourcc, _ = get_fourcc_for_output(output_path)
    out = cv2.VideoWriter(output_path, fourcc, float(fps), (width, height))
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

        out.write(processed)
        frame_idx += 1

    cap.release()
    out.release()

    # Save params JSON (only for scramble mode)
    params_path = ""
    if mode == "scramble":
        if algorithm == "spatial":
            params = params_to_json(seed, n, m, perm_dest_to_src_0)
        elif algorithm == "color":
            params = color_params_to_json(seed, n, m, hue_shifts, max_hue_shift)
            
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
    parser.add_argument("--algorithm", choices=["spatial", "color"], default="spatial",
                        help="Scrambling algorithm: 'spatial' for position swapping, 'color' for hue shifting (default: spatial)")
    parser.add_argument("--max-hue-shift", type=int, default=128, 
                        help="Maximum hue shift amount for color algorithm (0-128, default: 128)")
    parser.add_argument("--percentage", type=int,
                        help="Percentage of tiles to scramble (0-100). Only for spatial algorithm.")
    args = parser.parse_args()

    # Validate max-hue-shift range
    if args.max_hue_shift < 0 or args.max_hue_shift > 128:
        print("Error: --max-hue-shift must be between 0 and 128", file=sys.stderr)
        sys.exit(1)

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
            # if percentage is not provided or eqaul to 100%, use normal processing
            params_path = process_video(
                input_path=args.input,
                output_path=args.output,
                seed=args.seed,
                rows=args.rows,
                cols=args.cols,
                mode=args.mode,
                algorithm=args.algorithm,
                max_hue_shift=args.max_hue_shift,
            )
        print(f"Done. Output video: {args.output}")
        if args.mode == "scramble" and params_path:
            print(f"Scramble params saved to: {params_path}")
            print(f"Algorithm used: {args.algorithm}")
            if args.algorithm == "color":
                print(f"Max hue shift: {args.max_hue_shift}")
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
