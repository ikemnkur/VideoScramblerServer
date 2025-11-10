#!/usr/bin/env python3
import cv2
import numpy as np
import os
import sys
import argparse
from typing import List, Tuple


def sample_cell_brightness(
    image: np.ndarray,
    x: int,
    y: int,
    cell_size: int
) -> float:
    """
    Return the average brightness of the cell region (BGR -> gray).
    """
    h, w, _ = image.shape
    x1 = min(x + cell_size, w)
    y1 = min(y + cell_size, h)

    if x >= w or y >= h or x1 <= x or y1 <= y:
        return 0.0

    patch = image[y:y1, x:x1]
    if patch.size == 0:
        return 0.0

    # Convert to grayscale
    gray = cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY)
    return float(gray.mean())


def decode_image_to_bytes(
    image: np.ndarray,
    grid_rows: int = 10,
    grid_cols: int = 8,
    cell_size: int = 3,
    cell_gap: int = 2,
    offset: Tuple[int, int] = (20, 20),
    brightness_threshold: float = 80.0,
) -> List[int]:
    """
    Decode a dot grid from an image into bytes.
    Each row = 1 byte; each column = 1 bit (MSB -> LSB).
    We decide bit = 1 if cell brightness > threshold, else 0.
    """
    h, w, _ = image.shape
    ox, oy = offset

    needed_width = ox + grid_cols * (cell_size + cell_gap)
    needed_height = oy + grid_rows * (cell_size + cell_gap)

    if needed_width > w or needed_height > h:
        print("Warning: grid does not fit in image; may produce incorrect results", file=sys.stderr)

    decoded_bytes: List[int] = []

    for row in range(grid_rows):
        byte_val = 0
        for col in range(grid_cols):
            # Bit position: col 0 = MSB (bit 7), col 7 = LSB (bit 0)
            bit_idx = grid_cols - 1 - col

            x = ox + col * (cell_size + cell_gap)
            y = oy + row * (cell_size + cell_gap)

            brightness = sample_cell_brightness(image, x, y, cell_size)
            bit = 1 if brightness > brightness_threshold else 0

            byte_val |= (bit << bit_idx)

        decoded_bytes.append(byte_val)

    return decoded_bytes


def decode_code_from_image(
    input_path: str,
    grid_rows: int = 10,
    grid_cols: int = 8,
    cell_size: int = 3,
    cell_gap: int = 2,
    offset: Tuple[int, int] = (20, 20),
    brightness_threshold: float = 80.0,
) -> bytes:
    """
    Decode a hidden message from an image that has a dot grid.
    """
    if not os.path.isfile(input_path):
        raise FileNotFoundError(f"Image not found: {input_path}")

    # Read the image
    image = cv2.imread(input_path)
    if image is None:
        raise RuntimeError(f"Could not read image: {input_path}")

    height, width, channels = image.shape
    if width <= 0 or height <= 0:
        raise RuntimeError("Invalid image dimensions")

    print(f"Decoding from image: {input_path}")
    print(f"Resolution: {width}x{height}")

    # Decode the grid into bytes
    decoded_bytes = decode_image_to_bytes(
        image,
        grid_rows=grid_rows,
        grid_cols=grid_cols,
        cell_size=cell_size,
        cell_gap=cell_gap,
        offset=offset,
        brightness_threshold=brightness_threshold,
    )

    return bytes(decoded_bytes)


def bytes_to_pretty_string(data: bytes) -> str:
    """
    Try to decode as UTF-8; if that fails, fall back to a safe repr.
    Strip trailing null bytes (0x00) which may be padding.
    """
    if not data:
        return ""

    # Strip trailing null bytes
    while data and data[-1] == 0:
        data = data[:-1]

    if not data:
        return ""

    # Try UTF-8 first
    try:
        return data.decode("utf-8", errors="replace")
    except Exception:
        pass

    # Fallback: show hex with some grouping
    return " ".join(f"{b:02X}" for b in data)


def main():
    parser = argparse.ArgumentParser(description="Decode grid-based hidden message from an image.")
    parser.add_argument("--input", "-i", required=True, help="Input image file with embedded dot grid")
    parser.add_argument("--rows", type=int, default=10, help="Grid rows (characters per image)")
    parser.add_argument("--cols", type=int, default=8, help="Grid columns (bits per character; usually 8)")
    parser.add_argument("--cell-size", type=int, default=3, help="Cell (dot) size in pixels")
    parser.add_argument("--cell-gap", type=int, default=2, help="Gap between cells in pixels")
    parser.add_argument("--offset-x", type=int, default=20, help="Grid offset X in pixels")
    parser.add_argument("--offset-y", type=int, default=20, help="Grid offset Y in pixels")
    parser.add_argument("--threshold", type=float, default=80.0,
                        help="Brightness threshold for detecting a '1' bit")

    args = parser.parse_args()

    try:
        decoded = decode_code_from_image(
            input_path=args.input,
            grid_rows=args.rows,
            grid_cols=args.cols,
            cell_size=args.cell_size,
            cell_gap=args.cell_gap,
            offset=(args.offset_x, args.offset_y),
            brightness_threshold=args.threshold,
        )

        print(f"\n=== RAW BYTES (first 64) ===")
        print(" ".join(f"{b:02X}" for b in decoded[:64]))

        print(f"\n=== AS TEXT (UTF-8, best-effort) ===")
        decoded_text = bytes_to_pretty_string(decoded)
        if decoded_text:
            print(f'"{decoded_text}"')
        else:
            print("(No readable text found)")

        print(f"\n=== STATS ===")
        print(f"Total bytes decoded: {len(decoded)}")
        non_zero_bytes = sum(1 for b in decoded if b != 0)
        print(f"Non-zero bytes: {non_zero_bytes}")

    except Exception as e:
        print(f"Error during decoding: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()