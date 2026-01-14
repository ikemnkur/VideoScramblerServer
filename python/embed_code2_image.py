#!/usr/bin/env python3
import cv2
import numpy as np
import os
import sys
import argparse
from typing import Tuple, List


def text_to_bytes(text: str) -> List[int]:
    """Convert text into a list of byte values (0–255)."""
    return [b for b in text.encode("utf-8")]


def draw_bit_grid_on_image(
    image: np.ndarray,
    data_bytes: List[int],
    grid_rows: int = 10,
    grid_cols: int = 8,
    cell_size: int = 3,
    cell_gap: int = 2,
    offset: Tuple[int, int] = (20, 20),
    dot_color: Tuple[int, int, int] = (150, 150, 150),
) -> np.ndarray:
    """
    Draw an N x M grid of small square dots on the image.
    Each row encodes one byte, each column is one bit (MSB→LSB).
    - data_bytes: list of bytes to embed
    - grid_cols should be 8 for an 8-bit byte
    """
    out = image.copy()
    h, w, _ = out.shape
    ox, oy = offset

    needed_width = ox + grid_cols * (cell_size + cell_gap)
    needed_height = oy + grid_rows * (cell_size + cell_gap)

    if needed_width > w or needed_height > h:
        print("Warning: grid does not fit in image; may be clipped", file=sys.stderr)

    # Embed as many bytes as we can fit in the grid
    bytes_to_embed = min(len(data_bytes), grid_rows)

    for row in range(bytes_to_embed):
        byte_val = data_bytes[row]

        for col in range(grid_cols):
            # Bit position: col 0 is MSB (bit 7), col 7 is LSB (bit 0)
            bit_idx = grid_cols - 1 - col  # for 8 cols: col0 -> bit7, col7 -> bit0
            bit = (byte_val >> bit_idx) & 1

            # Compute top-left corner of the cell
            x = ox + col * (cell_size + cell_gap)
            y = oy + row * (cell_size + cell_gap)

            # Make sure we don't draw outside the image bounds
            if x + cell_size <= w and y + cell_size <= h:
                if bit == 1:
                    # Draw a filled square dot
                    cv2.rectangle(
                        out,
                        (x, y),
                        (x + cell_size - 1, y + cell_size - 1),
                        color=dot_color,
                        thickness=-1,
                    )
                # If bit == 0 -> leave it blank

    return out


def embed_code_in_image(
    input_path: str,
    output_path: str,
    secret_text: str,
    grid_rows: int = 10,
    grid_cols: int = 8,
    cell_size: int = 3,
    cell_gap: int = 2,
    offset: Tuple[int, int] = (20, 20),
    dot_color: Tuple[int, int, int] = (150, 150, 150),
):
    """
    Read input image and embed secret text as a dot grid in a corner.
    """
    if not os.path.isfile(input_path):
        raise FileNotFoundError(f"Input image not found: {input_path}")

    # Read the image
    image = cv2.imread(input_path)
    if image is None:
        raise RuntimeError(f"Could not read image: {input_path}")

    height, width, channels = image.shape
    if width <= 0 or height <= 0:
        raise RuntimeError("Invalid image dimensions")

    # Convert secret text to bytes
    data_bytes = text_to_bytes(secret_text)
    total_bytes = len(data_bytes)

    print(f"Embedding code into image...")
    print(f"Resolution: {width}x{height}")
    print(f"Total characters in message: {total_bytes}")
    print(f"Grid capacity: {grid_rows} bytes per image")

    if total_bytes > grid_rows:
        print(f"Warning: Message ({total_bytes} bytes) is longer than grid capacity ({grid_rows} bytes)")
        print("Only the first portion will be embedded.")

    # Embed the code into the image
    coded_image = draw_bit_grid_on_image(
        image,
        data_bytes,
        grid_rows=grid_rows,
        grid_cols=grid_cols,
        cell_size=cell_size,
        cell_gap=cell_gap,
        offset=offset,
        dot_color=dot_color,
    )

    # Write the output image
    success = cv2.imwrite(output_path, coded_image)
    if not success:
        raise RuntimeError(f"Could not write output image: {output_path}")

    bytes_embedded = min(total_bytes, grid_rows)
    print("Done.")
    print(f"Output image: {output_path}")
    print(f"Bytes embedded: {bytes_embedded}/{total_bytes}")


def main():
    parser = argparse.ArgumentParser(description="Embed a hidden message into an image via a dot grid.")
    parser.add_argument("--input", "-i", required=True, help="Input image file")
    parser.add_argument("--output", "-o", required=True, help="Output image file")
    parser.add_argument("--message", "-m", required=True, help="Secret message to embed")
    parser.add_argument("--rows", type=int, default=10, help="Grid rows (max characters that can be embedded)")
    parser.add_argument("--cols", type=int, default=8, help="Grid cols (bits per char; usually 8)")
    parser.add_argument("--cell-size", type=int, default=3, help="Dot size in pixels")
    parser.add_argument("--cell-gap", type=int, default=2, help="Gap between cells in pixels")
    parser.add_argument("--offset-x", type=int, default=20, help="Grid offset X in pixels")
    parser.add_argument("--offset-y", type=int, default=20, help="Grid offset Y in pixels")
    parser.add_argument("--dot-color", type=str, default="150,150,150", 
                        help="Dot color as R,G,B (e.g., '255,255,255' for white)")

    args = parser.parse_args()

    # Parse dot color
    try:
        color_parts = [int(x.strip()) for x in args.dot_color.split(',')]
        if len(color_parts) != 3 or any(c < 0 or c > 255 for c in color_parts):
            raise ValueError("Invalid color format")
        dot_color = tuple(color_parts)
    except ValueError:
        print("Error: --dot-color must be in format 'R,G,B' with values 0-255", file=sys.stderr)
        sys.exit(1)

    try:
        embed_code_in_image(
            input_path=args.input,
            output_path=args.output,
            secret_text=args.message,
            grid_rows=args.rows,
            grid_cols=args.cols,
            cell_size=args.cell_size,
            cell_gap=args.cell_gap,
            offset=(args.offset_x, args.offset_y),
            dot_color=dot_color,
        )
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()