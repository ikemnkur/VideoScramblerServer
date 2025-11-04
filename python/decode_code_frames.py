#!/usr/bin/env python3
import cv2
import numpy as np
import os
import sys
import argparse
from typing import List, Tuple


def sample_cell_brightness(
    frame: np.ndarray,
    x: int,
    y: int,
    cell_size: int
) -> float:
    """
    Return the average brightness of the cell region (BGR -> gray).
    """
    h, w, _ = frame.shape
    x1 = min(x + cell_size, w)
    y1 = min(y + cell_size, h)

    patch = frame[y:y1, x:x1]
    if patch.size == 0:
        return 0.0

    # convert to gray
    gray = cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY)
    return float(gray.mean())


def decode_frame_to_bytes(
    frame: np.ndarray,
    grid_rows: int = 10,
    grid_cols: int = 8,
    cell_size: int = 3,
    cell_gap: int = 2,
    offset: Tuple[int, int] = (20, 20),
    brightness_threshold: float = 80.0,
) -> List[int]:
    """
    Decode one "code frame" into up to grid_rows bytes.
    Each row = 1 byte; each column = 1 bit (MSB -> LSB).
    We decide bit = 1 if cell brightness > threshold, else 0.
    """
    h, w, _ = frame.shape
    ox, oy = offset

    needed_width = ox + grid_cols * (cell_size + cell_gap)
    needed_height = oy + grid_rows * (cell_size + cell_gap)

    if needed_width > w or needed_height > h:
        print("Warning: grid does not fit in frame; skipping frame", file=sys.stderr)
        return []

    decoded_bytes: List[int] = []

    for row in range(grid_rows):
        byte_val = 0
        for col in range(grid_cols):
            # Bit position: col 0 = MSB (bit 7), col 7 = LSB (bit 0)
            bit_idx = grid_cols - 1 - col

            x = ox + col * (cell_size + cell_gap)
            y = oy + row * (cell_size + cell_gap)

            brightness = sample_cell_brightness(frame, x, y, cell_size)
            bit = 1 if brightness > brightness_threshold else 0

            byte_val |= (bit << bit_idx)

        decoded_bytes.append(byte_val)

    return decoded_bytes


def decode_code_from_video(
    input_path: str,
    frame_interval: int = 30,
    grid_rows: int = 10,
    grid_cols: int = 8,
    cell_size: int = 3,
    cell_gap: int = 2,
    offset: Tuple[int, int] = (20, 20),
    brightness_threshold: float = 80.0,
    max_chars: int = 10_000,
) -> bytes:
    """
    Decode a hidden message from a video that has extra 'code frames'
    inserted every `frame_interval` original frames.

    Encoding pattern (from earlier script):
      - For each original frame (count = frame_index):
          write original
          frame_index++
          if frame_index % frame_interval == 0:
              write code_frame

    That means in the *output* video, every (frame_interval + 1)th frame
    is a code frame (1-based indexing: 31, 62, 93, ... for interval=30).

    Here, we read the output video and treat frames where
      (output_index + 1) % (frame_interval + 1) == 0
    as code frames.
    """
    if not os.path.isfile(input_path):
        raise FileNotFoundError(f"Video not found: {input_path}")

    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {input_path}")

    decoded_bytes: List[int] = []

    frame_idx = 0  # 0-based index of *all* frames in output video

    print(f"Decoding from video: {input_path}")

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        # Check if this frame is one of the inserted code frames.
        # For interval=30, code frames at (idx+1) % 31 == 0: 30, 61, 92, ...
        if (frame_idx + 1) % (frame_interval + 1) == 0:
            # Decode the frame into a list of bytes (one per row)
            frame_bytes = decode_frame_to_bytes(
                frame,
                grid_rows=grid_rows,
                grid_cols=grid_cols,
                cell_size=cell_size,
                cell_gap=cell_gap,
                offset=offset,
                brightness_threshold=brightness_threshold,
            )

            decoded_bytes.extend(frame_bytes)

            if len(decoded_bytes) >= max_chars:
                break

        frame_idx += 1

    cap.release()

    # Optionally trim trailing zeros (if encoder used empty rows as 0x00)
    # Here we just leave them; you can strip them later.
    return bytes(decoded_bytes[:max_chars])


def bytes_to_pretty_string(data: bytes) -> str:
    """
    Try to decode as UTF-8; if that fails, fall back to a safe repr.
    """
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
    parser = argparse.ArgumentParser(description="Decode grid-based hidden code from a video.")
    parser.add_argument("--input", "-i", required=True, help="Input video file with embedded code frames")
    parser.add_argument("--interval", "-n", type=int, default=30,
                        help="Inserted frame interval from encoder (e.g., 30 => 1 extra frame after 30 originals)")
    parser.add_argument("--rows", type=int, default=10, help="Grid rows (characters per frame)")
    parser.add_argument("--cols", type=int, default=8, help="Grid columns (bits per character; usually 8)")
    parser.add_argument("--cell-size", type=int, default=3, help="Cell (dot) size in pixels")
    parser.add_argument("--cell-gap", type=int, default=2, help="Gap between cells in pixels")
    parser.add_argument("--offset-x", type=int, default=20, help="Grid offset X in pixels")
    parser.add_argument("--offset-y", type=int, default=20, help="Grid offset Y in pixels")
    parser.add_argument("--threshold", type=float, default=80.0,
                        help="Brightness threshold for detecting a '1' bit")
    parser.add_argument("--max-chars", type=int, default=10000,
                        help="Maximum number of decoded bytes to collect")

    args = parser.parse_args()

    try:
        decoded = decode_code_from_video(
            input_path=args.input,
            frame_interval=args.interval,
            grid_rows=args.rows,
            grid_cols=args.cols,
            cell_size=args.cell_size,
            cell_gap=args.cell_gap,
            offset=(args.offset_x, args.offset_y),
            brightness_threshold=args.threshold,
            max_chars=args.max_chars,
        )

        print("\n=== RAW BYTES (first 128) ===")
        print(" ".join(f"{b:02X}" for b in decoded[:128]))

        print("\n=== AS TEXT (UTF-8, best-effort) ===")
        print(bytes_to_pretty_string(decoded))

    except Exception as e:
        print(f"Error during decoding: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
