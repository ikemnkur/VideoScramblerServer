#!/usr/bin/env python3
import cv2
import numpy as np
import os
import sys
import argparse
from typing import Tuple, List


def text_to_bytes(text: str) -> List[int]:
    """Convert text into a list of byte values (0–255)."""
    return [b for b in text.encode("utf-8")]  # you can switch to 'latin-1' if you want 1:1 mapping


def get_char_for_position(byte_list: List[int], idx: int) -> int:
    """Return byte at idx or None-like marker (-1) if past end."""
    if idx < 0 or idx >= len(byte_list):
        return -1
    return byte_list[idx]


def draw_bit_grid_on_frame(
    frame: np.ndarray,
    bytes_for_frame: List[int],
    grid_rows: int = 10,
    grid_cols: int = 8,
    cell_size: int = 3,
    cell_gap: int = 2,
    offset: Tuple[int, int] = (20, 20),
    dot_color: Tuple[int, int, int] = (150, 150, 150),
) -> np.ndarray:
    """
    Draw an N x M grid of small square dots on the frame.
    Each row encodes one byte, each column is one bit (MSB→LSB).
    - bytes_for_frame length <= grid_rows
    - grid_cols should be 8 for an 8-bit byte
    """
    out = frame.copy()
    h, w, _ = out.shape
    ox, oy = offset

    needed_width = ox + grid_cols * (cell_size + cell_gap)
    needed_height = oy + grid_rows * (cell_size + cell_gap)

    if needed_width > w or needed_height > h:
        # Not enough space in the frame; you could also raise an error instead
        print("Warning: grid does not fit in frame; skipping draw", file=sys.stderr)
        return out

    for row in range(grid_rows):
        if row >= len(bytes_for_frame):
            break

        byte_val = bytes_for_frame[row]
        if byte_val < 0:
            # no data => leave empty row
            continue

        for col in range(grid_cols):
            # Bit position: col 0 is MSB (bit 7), col 7 is LSB (bit 0)
            bit_idx = grid_cols - 1 - col  # for 8 cols: col0 -> bit7, col7 -> bit0
            bit = (byte_val >> bit_idx) & 1

            # Compute top-left corner of the cell
            x = ox + col * (cell_size + cell_gap)
            y = oy + row * (cell_size + cell_gap)

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


def embed_code_frames(
    input_path: str,
    output_path: str,
    secret_text: str,
    grid_rows: int = 10,
    grid_cols: int = 8,
    cell_size: int = 10,
    cell_gap: int = 2,
    frame_interval: int = 30,
):
    """
    Read input video, insert an extra frame every `frame_interval` frames,
    where the extra frame contains a code grid encoding part of secret_text.
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

    # Prepare output writer
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    if not out.isOpened():
        cap.release()
        raise RuntimeError(f"Could not create output video: {output_path}")

    # Convert secret text to bytes
    data_bytes = text_to_bytes(secret_text)
    total_bytes = len(data_bytes)

    # How many characters (bytes) per embedded frame?
    chars_per_frame = grid_rows  # 1 char per row

    # Global index into data_bytes
    char_idx = 0

    frame_index = 0

    print(f"Embedding code into video...")
    print(f"Resolution: {width}x{height}, FPS: {fps:.2f}")
    print(f"Total chars in message: {total_bytes}, chars per embedded frame: {chars_per_frame}")

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        # Always write the original frame
        out.write(frame)
        frame_index += 1

        # Decide if we should insert a code frame after this one
        if frame_interval > 0 and (frame_index % frame_interval == 0):
            # Build bytes_for_this_frame (length <= grid_rows)
            bytes_this_frame: List[int] = []
            for row in range(grid_rows):
                if char_idx < total_bytes:
                    bytes_this_frame.append(data_bytes[char_idx])
                    char_idx += 1
                else:
                    # No more data: mark empty row
                    bytes_this_frame.append(-1)

            # If absolutely no data remains and we don't want extra code frames, you can break here.
            # But per your spec, we can keep embedding empty frames or stop; I'll stop when fully done:
            if all(b < 0 for b in bytes_this_frame):
                # Message finished: we still inserted all data.
                # You could skip inserting extra code frames if you like.
                continue

            # Create a code frame (copy of last real frame or black)
            code_frame = frame.copy()  # you can also use np.zeros_like(frame) for pure black

            # zero out frame from (20, 20) with size (grid_cols * cell_size, grid_rows * cell_size)
            code_frame[15:20 + grid_rows * cell_size * 2, 15:20 + grid_cols * cell_size * 2] = 0

            code_frame = draw_bit_grid_on_frame(
                code_frame,
                bytes_this_frame,
                grid_rows=grid_rows,
                grid_cols=grid_cols,
                cell_size=cell_size,
                cell_gap=cell_gap,
                offset=(20, 20),
                dot_color=(150, 150, 150),
            )

            # Write the inserted frame
            out.write(code_frame)

    cap.release()
    out.release()

    print("Done.")
    print(f"Output video: {output_path}")
    print(f"Total bytes embedded: {min(total_bytes, chars_per_frame * (frame_index // frame_interval))}")


def main():
    parser = argparse.ArgumentParser(description="Embed a hidden code into a video via extra frames with dot grids.")
    parser.add_argument("--input", "-i", required=True, help="Input video file")
    parser.add_argument("--output", "-o", required=True, help="Output video file")
    parser.add_argument("--message", "-m", required=True, help="Secret message to embed")
    parser.add_argument("--interval", "-n", type=int, default=30,
                        help="Insert one extra frame every N frames (e.g., 30 for ~1/sec at 30 FPS)")
    parser.add_argument("--rows", type=int, default=10, help="Grid rows (characters per frame)")
    parser.add_argument("--cols", type=int, default=8, help="Grid cols (bits per char; usually 8)")
    parser.add_argument("--cell-size", type=int, default=3, help="Dot size in pixels")
    parser.add_argument("--cell-gap", type=int, default=2, help="Gap between cells in pixels")

    args = parser.parse_args()

    try:
        embed_code_frames(
            input_path=args.input,
            output_path=args.output,
            secret_text=args.message,
            grid_rows=args.rows,
            grid_cols=args.cols,
            cell_size=args.cell_size,
            cell_gap=args.cell_gap,
            frame_interval=args.interval,
        )
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
