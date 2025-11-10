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

def seeded_mirrors(size: int, seed: int) -> List[str]:
    """
    Generate random mirror flip types for each tile.
    Returns a list of mirror types: 'none', 'horizontal', or 'vertical' for each tile.
    """
    rand = mulberry32(seed & 0xFFFFFFFF)
    mirrors = []
    
    for _ in range(size):
        # Generate random mirror type: 0=none, 1=horizontal, 2=vertical
        mirror_type = int(rand() * 3)
        if mirror_type == 0:
            mirrors.append('none')
        elif mirror_type == 1:
            mirrors.append('horizontal')
        else:  # mirror_type == 2
            mirrors.append('vertical')
    
    return mirrors

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


def mirror_tile(tile: np.ndarray, mirror_type: str) -> np.ndarray:
    """
    Mirror flip a tile according to the specified type.
    mirror_type: 'none', 'horizontal', or 'vertical'
    """
    if mirror_type == 'none':
        return tile
    elif mirror_type == 'horizontal':
        # Flip horizontally (left-right)
        return cv2.flip(tile, 1)
    elif mirror_type == 'vertical':
        # Flip vertically (up-down)
        return cv2.flip(tile, 0)
    else:
        raise ValueError(f"Invalid mirror type: {mirror_type}")


def mirror_params_to_json(seed: int, n: int, m: int, mirrors: List[str]) -> Dict[str, Any]:
    """
    Convert mirror parameters to JSON-like dict for export/saving.
    """
    return {
        "version": 4,
        "algorithm": "mirror",
        "seed": int(seed),
        "n": int(n),
        "m": int(m),
        "mirrors": mirrors,
        "semantics": "Mirror flip types applied to each grid cell (0-based indexing): 'none', 'horizontal', or 'vertical'",
    }


# === paste all helper functions from above here ===
# mulberry32, gen_random_seed, seeded_permutation, one_based, zero_based,
# auto_grid_for_aspect, params_to_json, json_to_params, inverse_permutation,
# Rect, cell_rects


def mirror_scramble_frame(frame: np.ndarray,
                         n: int,
                         m: int,
                         mirrors: List[str],
                         rects: List[Rect]) -> np.ndarray:
    """
    Scramble a frame by mirror flipping each tile according to the mirror types.
    """
    h, w, c = frame.shape
    out = frame.copy()

    N = n * m
    if len(mirrors) != N:
        raise ValueError("Mirrors length does not equal n*m")

    for tile_idx in range(N):
        rect = rects[tile_idx]
        mirror_type = mirrors[tile_idx]

        # Extract the tile
        y0, y1 = rect.y0, rect.y1
        x0, x1 = rect.x0, rect.x1
        tile = frame[y0:y1, x0:x1, :]

        # Mirror flip the tile
        mirrored_tile = mirror_tile(tile, mirror_type)

        # Place the mirrored tile back (no dimension changes with mirroring)
        out[y0:y1, x0:x1, :] = mirrored_tile

    return out


def mirror_unscramble_frame(frame: np.ndarray,
                           n: int,
                           m: int,
                           mirrors: List[str],
                           rects: List[Rect]) -> np.ndarray:
    """
    Unscramble a frame by mirror flipping each tile in the reverse direction.
    Since mirroring is its own inverse, we apply the same mirror operation.
    """
    # Mirror operations are self-inverse: flipping twice returns to original
    return mirror_scramble_frame(frame, n, m, mirrors, rects)


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
                  algorithm: str = "mirror") -> str:
    """
    Process a photo: scramble or unscramble according to mode.
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

    # seed management
    if seed is None:
        seed = gen_random_seed()

    # Generate scrambling parameters based on algorithm
    if algorithm == "mirror":
        # Generate mirror flip types for each tile
        mirrors = seeded_mirrors(N, seed)
        rects = cell_rects(width, height, n, m)
        
        # Process the image
        if mode == "scramble":
            processed = mirror_scramble_frame(frame, n, m, mirrors, rects)
        elif mode == "unscramble":
            processed = mirror_unscramble_frame(frame, n, m, mirrors, rects)
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

    # Write the output image
    cv2.imwrite(output_path, processed)

    # Save params JSON (only for scramble mode)
    params_path = ""
    if mode == "scramble":
        if algorithm == "mirror":
            params = mirror_params_to_json(seed, n, m, mirrors)
        else:
            params = params_to_json(seed, n, m, perm_dest_to_src_0)
            
        base, ext = os.path.splitext(output_path)
        params_path = base + ".params.json"
        with open(params_path, "w", encoding="utf-8") as f:
            json.dump(params, f, indent=2)

    return params_path


def main():
    parser = argparse.ArgumentParser(description="Scramble/unscramble a photo using tile mirroring or grid permutation.")
    parser.add_argument("--input", "-i", required=True, help="Input photo path")
    parser.add_argument("--output", "-o", required=True, help="Output photo path")
    parser.add_argument("--seed", type=int, help="Random seed (32-bit). If omitted, one is generated.")
    parser.add_argument("--rows", type=int, help="Grid rows (n). If omitted, auto-chosen from aspect ratio.")
    parser.add_argument("--cols", type=int, help="Grid cols (m). If omitted, auto-chosen from aspect ratio.")
    parser.add_argument("--mode", choices=["scramble", "unscramble"], default="scramble",
                        help="Operation mode (default: scramble). Unscramble assumes same seed/n/m.")
    parser.add_argument("--algorithm", choices=["mirror", "spatial"], default="mirror",
                        help="Scrambling algorithm: 'mirror' for flipping tiles horizontally/vertically, 'spatial' for position swapping (default: mirror)")

    args = parser.parse_args()

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
        )
        print(f"Done. Output photo: {args.output}")
        if args.mode == "scramble" and params_path:
            print(f"Scramble params saved to: {params_path}")
            print(f"Algorithm used: {args.algorithm}")
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
