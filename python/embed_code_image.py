#!/usr/bin/env python3
import cv2
import numpy as np
import os
import sys
import argparse
from typing import List


def calculate_positions_from_user_id(user_id: str, image_width: int, image_height: int):
    """
    Calculate column and row positions to duplicate based on user_id ASCII values.
    
    Args:
        user_id: 10-character string
        image_width: Width of the image
        image_height: Height of the image
        
    Returns:
        tuple: (col_positions, row_positions) as lists of integers
    """
    if len(user_id) != 10:
        raise ValueError(f"user_id must be exactly 10 characters, got {len(user_id)}")
    
    # Get ASCII values
    ascii_values = [ord(c) for c in user_id]
    
    # First 5 characters for columns
    col_positions = []
    cumulative = 0
    for i in range(5):
        cumulative += ascii_values[i]
        col_positions.append(cumulative % image_width)
    
    # Last 5 characters for rows
    row_positions = []
    cumulative = 0
    for i in range(5, 10):
        cumulative += ascii_values[i]
        row_positions.append(cumulative % image_height)
    
    # Remove duplicates and sort
    col_positions = sorted(list(set(col_positions)))
    row_positions = sorted(list(set(row_positions)))
    
    return col_positions, row_positions


def insert_duplicate_rows(image: np.ndarray, row_indices: List[int]) -> np.ndarray:
    """
    Insert duplicate rows after each specified row index.
    Similar to dupliLineInsert.html logic.
    
    Args:
        image: Input image (H, W, C)
        row_indices: Sorted list of row indices to duplicate (0-based)
        
    Returns:
        Image with duplicated rows
    """
    if not row_indices:
        return image.copy()
    
    h, w, c = image.shape
    new_h = h + len(row_indices)
    out = np.zeros((new_h, w, c), dtype=image.dtype)
    
    src_y = 0
    out_y = 0
    r_ptr = 0
    
    while src_y < h:
        # Copy current source row to output
        out[out_y] = image[src_y]
        
        # If this row should be duplicated, insert another identical row beneath it
        if r_ptr < len(row_indices) and row_indices[r_ptr] == src_y:
            out[out_y + 1] = image[src_y]
            out_y += 2
            r_ptr += 1
        else:
            out_y += 1
        
        src_y += 1
    
    return out


def insert_duplicate_cols(image: np.ndarray, col_indices: List[int]) -> np.ndarray:
    """
    Insert duplicate columns after each specified column index.
    Similar to dupliLineInsert.html logic.
    
    Args:
        image: Input image (H, W, C)
        col_indices: Sorted list of column indices to duplicate (0-based)
        
    Returns:
        Image with duplicated columns
    """
    if not col_indices:
        return image.copy()
    
    h, w, c = image.shape
    new_w = w + len(col_indices)
    out = np.zeros((h, new_w, c), dtype=image.dtype)
    
    for y in range(h):
        src_x = 0
        out_x = 0
        c_ptr = 0
        
        while src_x < w:
            # Copy pixel
            out[y, out_x] = image[y, src_x]
            
            # Duplicate if needed: insert same pixel to the right
            if c_ptr < len(col_indices) and col_indices[c_ptr] == src_x:
                out[y, out_x + 1] = image[y, src_x]
                out_x += 2
                c_ptr += 1
            else:
                out_x += 1
            
            src_x += 1
    
    return out


def embed_code_in_image(
    input_path: str,
    output_path: str,
    user_id: str,
):
    """
    Embed user tracking code into image by duplicating specific rows and columns
    based on ASCII values of the user_id.
    
    Args:
        input_path: Path to input image
        output_path: Path to save output image
        user_id: 10-character user identifier
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

    print(f"Embedding user tracking code into image...")
    print(f"Resolution: {width}x{height}")
    print(f"User ID: {user_id}")

    # Calculate positions from user_id
    col_positions, row_positions = calculate_positions_from_user_id(user_id, width, height)
    
    print(f"Column positions to duplicate: {col_positions}")
    print(f"Row positions to duplicate: {row_positions}")

    # Apply row inserts first (height changes), then column inserts (width changes)
    after_rows = insert_duplicate_rows(image, row_positions)
    after_cols = insert_duplicate_cols(after_rows, col_positions)

    # Write the output image
    success = cv2.imwrite(output_path, after_cols)
    if not success:
        raise RuntimeError(f"Could not write output image: {output_path}")

    new_height, new_width = after_cols.shape[:2]
    print("Done.")
    print(f"Output image: {output_path}")
    print(f"Original size: {width}x{height}")
    print(f"New size: {new_width}x{new_height}")
    print(f"Rows inserted: {len(row_positions)}")
    print(f"Cols inserted: {len(col_positions)}")


def main():
    parser = argparse.ArgumentParser(
        description="Embed user tracking code into an image by duplicating pixel rows/columns."
    )
    parser.add_argument("--input", "-i", required=True, help="Input image file")
    parser.add_argument("--output", "-o", required=True, help="Output image file")
    parser.add_argument("--user-id", "-u", required=True, help="10-character user ID for tracking")

    args = parser.parse_args()

    try:
        embed_code_in_image(
            input_path=args.input,
            output_path=args.output,
            user_id=args.user_id,
        )
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()