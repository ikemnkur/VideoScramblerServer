#!/usr/bin/env python3
"""
Hybrid Image Steganography - Robust data hiding with redundancy
Embeds data as noise-like patterns that can survive re-encoding.
Extraction requires the original image for comparison.
"""

import numpy as np
from PIL import Image
import argparse
import struct
import sys
import os


class ImageHybridSteganography:
    def __init__(self):
        """Initialize hybrid steganography with redundancy settings"""
        self.redundancy = 9  # Each bit stored 9 times for error correction
        self.amplitude = 5   # Noise amplitude (+/- 5 intensity levels for better resilience)
        self.block_size = 8  # Size of each encoding block
        
    def embed_data(self, original_image_path, output_image_path, data):
        """
        Embed data into image using redundant noise-like patterns.
        The data is embedded multiple times throughout the image.
        
        Args:
            original_image_path: Path to original image
            output_image_path: Path to save modified image
            data: String data to embed (max 255 characters)
        """
        # Load original image
        img = Image.open(original_image_path)
        img_array = np.array(img, dtype=np.int32)
        
        print(f"Image size: {img.size} ({img.mode})")
        print(f"Image shape: {img_array.shape}")
        
        # Handle different image modes
        if len(img_array.shape) == 2:  # Grayscale
            height, width = img_array.shape
            channels = 1
            img_array = img_array.reshape(height, width, 1)
        elif len(img_array.shape) == 3:  # Color
            height, width, channels = img_array.shape
        else:
            raise ValueError(f"Unsupported image shape: {img_array.shape}")
        
        # Prepare data: 1-byte length + data
        data_bytes = data.encode('utf-8')
        data_length = len(data_bytes)
        
        if data_length > 255:
            raise ValueError("Data too long! Maximum 255 characters.")
        
        # Pack: 1-byte length + data
        full_data = struct.pack('B', data_length) + data_bytes
        
        # Convert to bits
        bits = []
        for byte in full_data:
            for i in range(7, -1, -1):
                bits.append((byte >> i) & 1)
        
        total_bits = len(bits)
        print(f"Data: {data_length} chars = {total_bits} bits")
        
        # Calculate space needed for one complete encoding
        # Each bit needs redundancy copies in the block
        pixels_per_bit = self.redundancy  # Each bit repeated in multiple pixels
        total_pixels_needed = total_bits * pixels_per_bit
        
        # Calculate total available pixels
        total_pixels = height * width
        
        # Determine how many complete copies we can fit
        # We'll distribute copies evenly throughout the image
        num_copies = total_pixels // (total_pixels_needed * 2)  # Use half the image capacity
        num_copies = max(3, num_copies)  # At least 3 copies for redundancy
        
        print(f"Embedding {num_copies} complete copies of the data")
        print(f"Using {total_pixels_needed * num_copies} / {total_pixels} pixels")
        
        if total_pixels_needed > total_pixels:
            raise ValueError(
                f"Image too small! Need {total_pixels_needed} pixels, "
                f"have {total_pixels}"
            )
        
        # Create modified image array
        modified_array = img_array.copy()
        
        # Calculate stride between copies
        pixels_per_copy = total_pixels_needed
        stride = total_pixels // num_copies
        
        # Embed multiple copies throughout the image
        for copy_num in range(num_copies):
            start_pixel = copy_num * stride
            pixel_idx = start_pixel
            
            # Embed all bits for this copy
            for bit in bits:
                # Embed this bit with redundancy
                for redundant_copy in range(self.redundancy):
                    if pixel_idx >= total_pixels:
                        break
                    
                    # Convert linear pixel index to 2D coordinates
                    y = pixel_idx // width
                    x = pixel_idx % width
                    
                    # Choose a channel to modify (cycle through channels)
                    channel = (pixel_idx + redundant_copy) % channels
                    
                    # Embed the bit by adding or subtracting amplitude
                    if bit == 1:
                        modified_array[y, x, channel] += self.amplitude
                    else:
                        modified_array[y, x, channel] -= self.amplitude
                    
                    pixel_idx += 1
        
        # Clip to valid range (0-255)
        modified_array = np.clip(modified_array, 0, 255).astype(np.uint8)
        
        # Remove single channel dimension if grayscale
        if channels == 1:
            modified_array = modified_array.reshape(height, width)
        
        # Save modified image
        modified_img = Image.fromarray(modified_array, mode=img.mode)
        modified_img.save(output_image_path)
        
        print(f"✅ Embedded {data_length} characters into image")
        print(f"   Saved to: {output_image_path}")
        return True
    
    def extract_data(self, original_image_path, modified_image_path):
        """
        Extract data by comparing original and modified images.
        Uses redundancy and majority voting to recover data even after re-encoding.
        
        Args:
            original_image_path: Path to original image
            modified_image_path: Path to modified/re-encoded image
        
        Returns:
            Extracted string data or None if extraction fails
        """
        # Load both images
        original_img = Image.open(original_image_path)
        modified_img = Image.open(modified_image_path)
        
        # Convert to arrays
        original_array = np.array(original_img, dtype=np.int32)
        modified_array = np.array(modified_img, dtype=np.int32)
        
        print(f"Original image: {original_img.size} ({original_img.mode})")
        print(f"Modified image: {modified_img.size} ({modified_img.mode})")
        
        # Handle different image modes
        if len(original_array.shape) == 2:  # Grayscale
            height, width = original_array.shape
            channels = 1
            original_array = original_array.reshape(height, width, 1)
            modified_array = modified_array.reshape(height, width, 1)
        elif len(original_array.shape) == 3:  # Color
            height, width, channels = original_array.shape
        else:
            raise ValueError(f"Unsupported image shape: {original_array.shape}")
        
        if original_array.shape != modified_array.shape:
            raise ValueError("Original and modified images have different dimensions!")
        
        # Calculate difference (this reveals the embedded noise)
        diff = modified_array - original_array
        
        # Flatten the difference array for easier linear access
        diff_flat = diff.reshape(-1, channels)
        total_pixels = len(diff_flat)
        
        print(f"\nTotal pixels: {total_pixels}")
        print(f"Non-zero differences: {np.count_nonzero(diff)}")
        print(f"Difference range: [{diff.min()}, {diff.max()}]")
        
        # Try to extract data from multiple positions
        # This helps recover data even if some copies are corrupted
        extracted_results = []
        
        # Try different starting positions (multiple copies)
        max_attempts = 10
        pixels_per_bit = self.redundancy
        
        # Estimate stride based on image size
        estimated_data_bits = (1 + 255) * 8  # Max possible: 1 length byte + 255 data bytes
        estimated_pixels_needed = estimated_data_bits * pixels_per_bit
        estimated_stride = total_pixels // 5  # Assume at least 5 copies
        
        for attempt in range(max_attempts):
            start_pixel = attempt * estimated_stride
            if start_pixel >= total_pixels:
                break
            
            result = self._extract_single_encoding(diff_flat, start_pixel, channels)
            
            if result and result['valid']:
                extracted_results.append(result)
                print(f"✅ Found valid encoding at position {start_pixel}: '{result['text']}'")
        
        if not extracted_results:
            print(f"❌ No valid encodings found!")
            return None
        
        # Use majority voting among all extracted results
        if len(extracted_results) == 1:
            final_result = extracted_results[0]['text']
        else:
            # Find the most common result
            from collections import Counter
            texts = [r['text'] for r in extracted_results]
            text_counts = Counter(texts)
            final_result = text_counts.most_common(1)[0][0]
            print(f"\nMajority vote: {text_counts}")
        
        print(f"\n{'='*70}")
        print(f"✅ EXTRACTION SUCCESSFUL")
        print(f"{'='*70}")
        print(f"\nExtracted text ({len(final_result)} characters):")
        print(f"┌{'─'*68}┐")
        print(f"│ {final_result:<66} │")
        print(f"└{'─'*68}┘\n")
        
        return final_result
    
    def _extract_single_encoding(self, diff_flat, start_pixel, channels):
        """
        Extract a single encoding starting at the given pixel position.
        
        Args:
            diff_flat: Flattened difference array (pixels, channels)
            start_pixel: Starting pixel index
            channels: Number of color channels
        
        Returns:
            Dict with 'valid' and 'text' keys, or None if extraction fails
        """
        try:
            # Extract length byte (8 bits)
            length_bits = []
            pixel_idx = start_pixel
            
            for bit_idx in range(8):
                # Collect redundant copies for this bit
                votes = []
                
                for copy in range(self.redundancy):
                    if pixel_idx >= len(diff_flat):
                        return None
                    
                    # Get the channel value
                    channel = (pixel_idx + copy) % channels
                    diff_value = diff_flat[pixel_idx, channel]
                    
                    # Vote based on sign of difference (with threshold)
                    if diff_value > 1:  # Threshold to reduce JPEG noise
                        votes.append(1)
                    elif diff_value < -1:
                        votes.append(0)
                    
                    pixel_idx += 1
                
                # Majority vote (require strong consensus for length bits)
                if len(votes) >= self.redundancy // 2:  # Need at least half the votes
                    bit = 1 if sum(votes) > len(votes) / 2 else 0
                    length_bits.append(bit)
                else:
                    return None
            
            # Decode length
            data_length = 0
            for bit in length_bits:
                data_length = (data_length << 1) | bit
            
            if data_length <= 0 or data_length > 255:
                return None
            
            # Extract data bits
            total_data_bits = data_length * 8
            data_bits = []
            
            for bit_idx in range(total_data_bits):
                # Collect redundant copies for this bit
                votes = []
                
                for copy in range(self.redundancy):
                    if pixel_idx >= len(diff_flat):
                        break
                    
                    # Get the channel value
                    channel = (pixel_idx + copy) % channels
                    diff_value = diff_flat[pixel_idx, channel]
                    
                    # Vote based on sign of difference (with threshold)
                    if diff_value > 1:  # Threshold to reduce JPEG noise
                        votes.append(1)
                    elif diff_value < -1:
                        votes.append(0)
                    
                    pixel_idx += 1
                
                # Majority vote (more lenient for data bits)
                if len(votes) >= 3:  # Need at least 3 votes
                    bit = 1 if sum(votes) > len(votes) / 2 else 0
                    data_bits.append(bit)
                else:
                    break
            
            if len(data_bits) < total_data_bits:
                return None
            
            # Convert bits to bytes
            data_bytes = bytearray()
            for i in range(0, len(data_bits), 8):
                if i + 8 <= len(data_bits):
                    byte_val = 0
                    for j in range(8):
                        byte_val = (byte_val << 1) | data_bits[i + j]
                    data_bytes.append(byte_val)
            
            # Decode as UTF-8
            decoded_text = data_bytes[:data_length].decode('utf-8', errors='ignore')
            
            # Verify the decoded text is reasonable (printable ASCII/UTF-8)
            if not decoded_text or not all(32 <= ord(c) <= 126 or c in '\n\r\t' for c in decoded_text):
                return None
            
            return {
                'valid': True,
                'text': decoded_text,
                'length': data_length
            }
            
        except Exception as e:
            return None


def main():
    parser = argparse.ArgumentParser(
        description="Hybrid Image Steganography - Robust data hiding with redundancy",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Embed data in image:
  python3 image_hybrid_stegano.py --mode embed --input original.jpg --output hidden.png --data "Secret message here"

  # Extract data from image (requires original):
  python3 image_hybrid_stegano.py --mode extract --original original.jpg --modified hidden.png

  # Test with re-encoding:
  python3 image_hybrid_stegano.py --mode embed --input photo.png --output hidden.png --data "Test123"
  # Re-encode the image (simulating upload/download)
  convert hidden.png -quality 95 reencoded.jpg
  # Extract (should still work):
  python3 image_hybrid_stegano.py --mode extract --original photo.png --modified reencoded.jpg

Features:
  - Redundant embedding (7x) for error correction
  - Subtle noise-like disturbances (±3 intensity)
  - Multiple copies distributed throughout image
  - Majority voting for robust extraction
  - Works even after re-encoding (JPEG, PNG, etc.)
  - Supports up to 255 characters (VARCHAR size)
  - Works with grayscale and color images
        """
    )
    
    parser.add_argument('--mode', choices=['embed', 'extract'], required=True,
                        help='Operation mode: embed or extract data')
    parser.add_argument('--input', type=str,
                        help='Input image file for embedding')
    parser.add_argument('--original', type=str,
                        help='Original image file for extraction')
    parser.add_argument('--output', type=str,
                        help='Output image file after embedding')
    parser.add_argument('--modified', type=str,
                        help='Modified/re-encoded image file for extraction')
    parser.add_argument('--data', type=str,
                        help='Data to embed (max 255 characters)')
    
    args = parser.parse_args()
    
    # Validate arguments based on mode
    if args.mode == 'embed':
        if not args.input or not args.output or not args.data:
            parser.error("--mode embed requires --input, --output, and --data")
        
        if not os.path.exists(args.input):
            print(f"❌ Error: Input file not found: {args.input}")
            sys.exit(1)
        
        stego = ImageHybridSteganography()
        
        try:
            stego.embed_data(args.input, args.output, args.data)
            print(f"\n✅ Success! Data embedded in image.")
        except Exception as e:
            print(f"❌ Error during embedding: {e}")
            import traceback
            traceback.print_exc()
            sys.exit(1)
    
    elif args.mode == 'extract':
        if not args.original or not args.modified:
            parser.error("--mode extract requires --original and --modified")
        
        if not os.path.exists(args.original):
            print(f"❌ Error: Original file not found: {args.original}")
            sys.exit(1)
        
        if not os.path.exists(args.modified):
            print(f"❌ Error: Modified file not found: {args.modified}")
            sys.exit(1)
        
        stego = ImageHybridSteganography()
        
        try:
            result = stego.extract_data(args.original, args.modified)
            
            if result is None:
                print(f"\n❌ Failed to extract data")
                sys.exit(1)
            else:
                print(f"✅ Extraction complete")
        except Exception as e:
            print(f"❌ Error during extraction: {e}")
            import traceback
            traceback.print_exc()
            sys.exit(1)


if __name__ == '__main__':
    main()
