#!/usr/bin/env python3
"""
Embed secret data into video by duplicating frame sections from previous frame.
Each section can be either duplicated (bit=0) or left to change naturally (bit=1).
Detection uses frame-to-frame subtraction: duplicated sections cancel out (black),
while non-duplicated sections show differences (visible content).

Features:
- Reed-Solomon error correction
- Brightness modulation for non-duplicated sections to enhance detection
"""
import cv2
import numpy as np
import os
import sys
import argparse
from typing import List, Tuple

try:
    from reedsolo import RSCodec
    HAS_REEDSOLO = True
except ImportError:
    HAS_REEDSOLO = False
    print("Warning: reedsolo not installed. Error correction disabled.", file=sys.stderr)
    print("Install with: pip install reedsolo", file=sys.stderr)


def text_to_bits(text: str, ecc_symbols: int = 0) -> List[int]:
    """
    Convert text to a list of individual bits with optional error correction.
    
    Args:
        text: Text to encode
        ecc_symbols: Number of Reed-Solomon error correction symbols (0 = disabled)
    
    Returns:
        List of bits
    """
    byte_list = list(text.encode("utf-8"))
    
    # Apply Reed-Solomon error correction if available and requested
    if ecc_symbols > 0 and HAS_REEDSOLO:
        rs = RSCodec(ecc_symbols)
        byte_list = list(rs.encode(bytearray(byte_list)))
        print(f"Applied Reed-Solomon ECC: {len(text.encode('utf-8'))} bytes -> {len(byte_list)} bytes")
    
    # Convert to bits
    bits = []
    for byte in byte_list:
        for i in range(7, -1, -1):  # MSB to LSB
            bits.append((byte >> i) & 1)
    return bits


def encode_frame_from_previous(
    current_frame: np.ndarray,
    previous_frame: np.ndarray,
    bits_to_encode: List[int],
    h_divisions: int,
    v_divisions: int,
    brightness_shift: int = 0
) -> np.ndarray:
    """
    Encode bits by selectively duplicating sections from previous frame.
    - bit = 0: duplicate the section from previous frame
    - bit = 1: keep the current frame's section with optional brightness shift
    
    Args:
        current_frame: The current frame to modify
        previous_frame: The previous frame to copy sections from
        bits_to_encode: List of bits (0 or 1) for each section
        h_divisions: Horizontal divisions
        v_divisions: Vertical divisions
        brightness_shift: Brightness adjustment for non-duplicated sections (bit=1)
                         Positive values increase brightness, negative decrease
    
    Returns:
        Modified frame with some sections duplicated from previous frame
    """
    out = current_frame.copy()
    h, w = out.shape[:2]
    section_h = h // v_divisions
    section_w = w // h_divisions
    
    total_sections = h_divisions * v_divisions
    
    for idx in range(min(total_sections, len(bits_to_encode))):
        bit = bits_to_encode[idx]
        
        row = idx // h_divisions
        col = idx % h_divisions
        
        y1 = row * section_h
        y2 = (row + 1) * section_h if row < v_divisions - 1 else h
        x1 = col * section_w
        x2 = (col + 1) * section_w if col < h_divisions - 1 else w
        
        if bit == 0:  # Duplicate from previous frame
            # Copy this section from previous frame
            out[y1:y2, x1:x2] = previous_frame[y1:y2, x1:x2].copy()
        else:  # bit == 1: Keep natural change but add brightness shift
            if brightness_shift != 0:
                section = out[y1:y2, x1:x2].astype(np.int16)
                section = np.clip(section + brightness_shift, 0, 255).astype(np.uint8)
                out[y1:y2, x1:x2] = section
    
    return out


def embed_code_frames_duplicate(
    input_path: str,
    output_path: str,
    secret_text: str,
    h_divisions: int = 2,
    v_divisions: int = 2,
    frame_interval: int = 1,
    ecc_symbols: int = 0,
    brightness_shift: int = 15,
):
    """
    Embed data by duplicating sections from previous frame.
    Each section represents one bit: duplicate (0) or keep natural change (1).
    
    Args:
        input_path: Input video file
        output_path: Output video file
        secret_text: Message to embed
        h_divisions: Horizontal divisions (must be power of 2)
        v_divisions: Vertical divisions (must be power of 2)
        frame_interval: Encode every N frames (1 = every frame, 2 = every other frame)
        ecc_symbols: Reed-Solomon error correction symbols (0 = disabled)
        brightness_shift: Brightness adjustment for non-duplicated sections
    """
    if not os.path.isfile(input_path):
        raise FileNotFoundError(f"Input video not found: {input_path}")
    
    # Validate divisions are powers of 2
    if not (h_divisions & (h_divisions - 1)) == 0 or h_divisions < 1:
        raise ValueError(f"h_divisions must be a power of 2, got {h_divisions}")
    if not (v_divisions & (v_divisions - 1)) == 0 or v_divisions < 1:
        raise ValueError(f"v_divisions must be a power of 2, got {v_divisions}")
    
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
    
    # Convert text to bits with optional error correction
    data_bits = text_to_bits(secret_text, ecc_symbols=ecc_symbols)
    total_bits = len(data_bits)
    
    # Calculate how many bits we can encode per frame
    total_sections = h_divisions * v_divisions
    bits_per_frame = total_sections  # Each section encodes 1 bit
    
    bit_idx = 0
    frame_index = 0
    previous_frame = None
    
    print(f"Embedding code into video using frame-to-frame section duplication...")
    print(f"Resolution: {width}x{height}, FPS: {fps:.2f}")
    print(f"Grid: {h_divisions}x{v_divisions} = {total_sections} sections")
    print(f"Bits per encoded frame: {bits_per_frame}")
    print(f"Total bits in message: {total_bits}")
    print(f"Frame interval: {frame_interval} (encode every {frame_interval} frame(s))")
    if ecc_symbols > 0:
        print(f"Error correction: Reed-Solomon with {ecc_symbols} symbols")
    if brightness_shift != 0:
        print(f"Brightness shift for non-duplicated sections: {brightness_shift:+d}")
    
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        
        # Need at least 2 frames to start encoding
        if previous_frame is not None and frame_index > 0:
            # Check if we should encode data in this frame
            if (frame_index % frame_interval == 0) and bit_idx < total_bits:
                # Get next chunk of bits to encode
                bits_for_this_frame = []
                for i in range(bits_per_frame):
                    if bit_idx < total_bits:
                        bits_for_this_frame.append(data_bits[bit_idx])
                        bit_idx += 1
                    else:
                        # Pad with 1s if we run out of data (no duplication)
                        bits_for_this_frame.append(1)
                
                # Encode by selectively duplicating sections from previous frame
                frame = encode_frame_from_previous(
                    frame,
                    previous_frame,
                    bits_for_this_frame,
                    h_divisions,
                    v_divisions,
                    brightness_shift
                )
                
                if bit_idx % (bits_per_frame * 10) < bits_per_frame:
                    print(f"  Encoded {bit_idx}/{total_bits} bits...")
        
        out.write(frame)
        previous_frame = frame.copy()
        frame_index += 1
    
    cap.release()
    out.release()
    
    print("Done.")
    print(f"Output video: {output_path}")
    print(f"Total bits embedded: {min(total_bits, bit_idx)}")
    print(f"Total bytes embedded: {min(total_bits, bit_idx) // 8}")


def main():
    parser = argparse.ArgumentParser(
        description="Embed secret data into video by duplicating frame sections from previous frame."
    )
    parser.add_argument("--input", "-i", required=True, help="Input video file")
    parser.add_argument("--output", "-o", required=True, help="Output video file")
    parser.add_argument("--message", "-m", required=True, help="Secret message to embed")
    parser.add_argument("--interval", "-n", type=int, default=1,
                        help="Encode every N frames (1=every frame, 2=every other frame)")
    parser.add_argument("--h-divisions", type=int, default=4,
                        help="Horizontal divisions (must be power of 2: 2, 4, 8, 16)")
    parser.add_argument("--v-divisions", type=int, default=4,
                        help="Vertical divisions (must be power of 2: 2, 4, 8, 16)")
    parser.add_argument("--ecc", type=int, default=10,
                        help="Reed-Solomon error correction symbols (0=disabled, 10=recommended)")
    parser.add_argument("--brightness-shift", type=int, default=15,
                        help="Brightness adjustment for non-duplicated sections (0=disabled, 15=recommended)")
    
    args = parser.parse_args()
    
    try:
        embed_code_frames_duplicate(
            input_path=args.input,
            output_path=args.output,
            secret_text=args.message,
            h_divisions=args.h_divisions,
            v_divisions=args.v_divisions,
            frame_interval=args.interval,
            ecc_symbols=args.ecc,
            brightness_shift=args.brightness_shift,
        )
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
