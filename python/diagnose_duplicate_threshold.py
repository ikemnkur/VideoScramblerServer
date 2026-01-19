#!/usr/bin/env python3
"""
Diagnostic tool to analyze section differences and help determine optimal threshold.
"""
import cv2
import numpy as np
import sys
import argparse


def compute_section_difference(
    current_frame: np.ndarray,
    previous_frame: np.ndarray,
    row: int,
    col: int,
    h_divisions: int,
    v_divisions: int
) -> float:
    """Compute the average absolute difference between a section in two consecutive frames."""
    h, w = current_frame.shape[:2]
    section_h = h // v_divisions
    section_w = w // h_divisions
    
    y1 = row * section_h
    y2 = (row + 1) * section_h if row < v_divisions - 1 else h
    x1 = col * section_w
    x2 = (col + 1) * section_w if col < h_divisions - 1 else w
    
    curr_section = current_frame[y1:y2, x1:x2]
    prev_section = previous_frame[y1:y2, x1:x2]
    
    diff = cv2.absdiff(curr_section, prev_section)
    
    if len(diff.shape) == 3:
        diff_gray = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY)
    else:
        diff_gray = diff
    
    return float(diff_gray.mean())


def main():
    parser = argparse.ArgumentParser(
        description="Analyze section differences to determine optimal threshold."
    )
    parser.add_argument("--input", "-i", required=True, help="Input video file")
    parser.add_argument("--h-divisions", type=int, default=4, help="Horizontal divisions")
    parser.add_argument("--v-divisions", type=int, default=4, help="Vertical divisions")
    parser.add_argument("--max-frames", type=int, default=20, help="Number of frames to analyze")
    
    args = parser.parse_args()
    
    cap = cv2.VideoCapture(args.input)
    if not cap.isOpened():
        print(f"Error: Could not open video: {args.input}")
        sys.exit(1)
    
    total_sections = args.h_divisions * args.v_divisions
    frame_idx = 0
    previous_frame = None
    
    all_differences = []
    
    print(f"Analyzing video: {args.input}")
    print(f"Grid: {args.h_divisions}x{args.v_divisions} = {total_sections} sections\n")
    
    while frame_idx < args.max_frames:
        ok, frame = cap.read()
        if not ok:
            break
        
        if previous_frame is not None:
            print(f"Frame {frame_idx} differences:")
            frame_diffs = []
            
            for idx in range(total_sections):
                row = idx // args.h_divisions
                col = idx % args.h_divisions
                
                diff = compute_section_difference(
                    frame, previous_frame,
                    row, col,
                    args.h_divisions,
                    args.v_divisions
                )
                
                frame_diffs.append(diff)
                all_differences.append(diff)
            
            # Show grid of differences
            for row in range(args.v_divisions):
                row_str = "  "
                for col in range(args.h_divisions):
                    idx = row * args.h_divisions + col
                    row_str += f"{frame_diffs[idx]:6.2f} "
                print(row_str)
            print()
        
        previous_frame = frame.copy()
        frame_idx += 1
    
    cap.release()
    
    # Statistics
    if all_differences:
        all_differences = np.array(all_differences)
        print("=== STATISTICS ===")
        print(f"Total differences analyzed: {len(all_differences)}")
        print(f"Min: {all_differences.min():.2f}")
        print(f"Max: {all_differences.max():.2f}")
        print(f"Mean: {all_differences.mean():.2f}")
        print(f"Median: {np.median(all_differences):.2f}")
        print(f"Std Dev: {all_differences.std():.2f}")
        print(f"\nPercentiles:")
        for p in [10, 25, 50, 75, 90, 95, 99]:
            print(f"  {p}th: {np.percentile(all_differences, p):.2f}")
        
        # Suggest threshold
        # We want a threshold that separates duplicates (low diff) from changes (high diff)
        # A good heuristic is around the 25th-50th percentile
        suggested = np.percentile(all_differences, 33)
        print(f"\nSuggested threshold (33rd percentile): {suggested:.2f}")


if __name__ == "__main__":
    main()
