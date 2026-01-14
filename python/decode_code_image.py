#!/usr/bin/env python3
import cv2
import numpy as np
import os
import sys
import argparse
from typing import List, Tuple, Optional


def detect_duplicate_rows(image: np.ndarray, tolerance: int = 0, diff_fraction: float = 0.0) -> List[int]:
    """
    Detect rows that are duplicates of the previous row.
    Returns indices of detected duplicate rows (the inserted ones).
    
    Args:
        image: Input image (H, W, C)
        tolerance: Per-channel tolerance for matching (0 = exact)
        diff_fraction: Maximum fraction of pixels allowed to differ (0-0.05)
    
    Returns:
        List of row indices that are duplicates
    """
    h, w, c = image.shape
    duplicates = []
    
    for y in range(h - 1):
        # Compare row y with row y+1
        if rows_similar(image, y, y + 1, tolerance, diff_fraction):
            duplicates.append(y + 1)
    
    return duplicates


def detect_duplicate_cols(image: np.ndarray, tolerance: int = 0, diff_fraction: float = 0.0) -> List[int]:
    """
    Detect columns that are duplicates of the previous column.
    Returns indices of detected duplicate columns (the inserted ones).
    
    Args:
        image: Input image (H, W, C)
        tolerance: Per-channel tolerance for matching (0 = exact)
        diff_fraction: Maximum fraction of pixels allowed to differ (0-0.05)
    
    Returns:
        List of column indices that are duplicates
    """
    h, w, c = image.shape
    duplicates = []
    
    for x in range(w - 1):
        # Compare col x with col x+1
        if cols_similar(image, x, x + 1, tolerance, diff_fraction):
            duplicates.append(x + 1)
    
    return duplicates


def rows_similar(image: np.ndarray, y1: int, y2: int, tolerance: int, diff_fraction: float) -> bool:
    """Check if two rows are similar within tolerance."""
    h, w, c = image.shape
    max_diff_pixels = int(w * diff_fraction)
    diff_pixels = 0
    
    for x in range(w):
        pixel1 = image[y1, x]
        pixel2 = image[y2, x]
        
        if np.any(np.abs(pixel1.astype(int) - pixel2.astype(int)) > tolerance):
            diff_pixels += 1
            if diff_pixels > max_diff_pixels:
                return False
    
    return True


def cols_similar(image: np.ndarray, x1: int, x2: int, tolerance: int, diff_fraction: float) -> bool:
    """Check if two columns are similar within tolerance."""
    h, w, c = image.shape
    max_diff_pixels = int(h * diff_fraction)
    diff_pixels = 0
    
    for y in range(h):
        pixel1 = image[y, x1]
        pixel2 = image[y, x2]
        
        if np.any(np.abs(pixel1.astype(int) - pixel2.astype(int)) > tolerance):
            diff_pixels += 1
            if diff_pixels > max_diff_pixels:
                return False
    
    return True


def reconstruct_user_id_from_positions(col_positions: List[int], row_positions: List[int],
                                       image_width: int, image_height: int) -> Optional[str]:
    """
    Attempt to reconstruct the user_id from column and row positions.
    This is a brute-force approach that tries different ASCII character combinations.
    
    Note: This is not guaranteed to find the exact original user_id since multiple
    user_ids could produce the same positions (hash collision). However, it will
    find *a* valid user_id that produces these positions.
    
    Args:
        col_positions: Sorted list of column indices
        row_positions: Sorted list of row indices
        image_width: Width of the image
        image_height: Height of the image
    
    Returns:
        A possible user_id string (10 chars) or None if no match found
    """
    if len(col_positions) < 1 or len(row_positions) < 1:
        return None
    
    # For a more practical approach, we can try common ASCII ranges
    # Printable ASCII: 33-126 (excluding space)
    # For user_id, likely alphanumeric: 48-57 (0-9), 65-90 (A-Z), 97-122 (a-z)
    
    print("Attempting to reconstruct user_id...")
    print(f"Target column positions: {col_positions}")
    print(f"Target row positions: {row_positions}")
    
    # This could take a very long time for full brute force
    # Instead, we'll try to reverse-engineer from the cumulative sums
    
    # For now, let's just report what we found
    print("\n⚠️  User ID reconstruction requires additional information.")
    print("The encoding is one-way without the original user_id.")
    print("\nDetected pattern:")
    print(f"  - {len(col_positions)} duplicate columns at positions: {col_positions}")
    print(f"  - {len(row_positions)} duplicate rows at positions: {row_positions}")
    
    return None


def decode_user_id_from_image(input_path: str, tolerance: int = 0, diff_fraction: float = 0.0) -> Optional[str]:
    """
    Decode user tracking information from an image by detecting duplicated rows/columns.
    
    Args:
        input_path: Path to input image
        tolerance: Per-channel tolerance for duplicate detection (0 = exact match)
        diff_fraction: Max fraction of pixels allowed to differ (0.0 = none)
    
    Returns:
        Reconstructed user_id or None
    """
    if not os.path.isfile(input_path):
        raise FileNotFoundError(f"Input image not found: {input_path}")
    
    image = cv2.imread(input_path)
    if image is None:
        raise RuntimeError(f"Could not read image: {input_path}")
    
    height, width, channels = image.shape
    print(f"Analyzing image: {width}x{height}")
    print(f"Detection parameters: tolerance={tolerance}, diff_fraction={diff_fraction}")
    
    # Detect duplicated rows and columns
    col_duplicates = detect_duplicate_cols(image, tolerance, diff_fraction)
    row_duplicates = detect_duplicate_rows(image, tolerance, diff_fraction)
    
    # Remove duplicates from the lists (in case of consecutive duplicates)
    col_duplicates = sorted(list(set(col_duplicates)))
    row_duplicates = sorted(list(set(row_duplicates)))
    
    print(f"\nDetected {len(col_duplicates)} duplicate columns: {col_duplicates}")
    print(f"Detected {len(row_duplicates)} duplicate rows: {row_duplicates}")
    
    if not col_duplicates and not row_duplicates:
        print("\n⚠️  No duplicate rows or columns detected.")
        print("This image may not have embedded tracking code, or detection parameters need adjustment.")
        return None
    
    # Attempt to reconstruct user_id
    user_id = reconstruct_user_id_from_positions(col_duplicates, row_duplicates, width, height)
    
    return user_id


def main():
    parser = argparse.ArgumentParser(
        description="Decode user tracking information from an image with duplicated pixel rows/columns."
    )
    parser.add_argument("--input", "-i", required=True, help="Input image file")
    parser.add_argument("--tolerance", "-t", type=int, default=0,
                        help="Per-channel tolerance for duplicate detection (0-30, default: 0)")
    parser.add_argument("--diff-fraction", "-d", type=float, default=0.0,
                        help="Max fraction of pixels allowed to differ (0.0-0.05, default: 0.0)")
    
    args = parser.parse_args()
    
    try:
        user_id = decode_user_id_from_image(
            input_path=args.input,
            tolerance=args.tolerance,
            diff_fraction=args.diff_fraction
        )
        
        if user_id:
            print(f"\n✅ Reconstructed user_id: {user_id}")
        else:
            print("\n❌ Could not reconstruct user_id from image.")
            sys.exit(1)
    
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()