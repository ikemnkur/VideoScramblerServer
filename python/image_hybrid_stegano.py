#!/usr/bin/env python3
"""
Simplified Hybrid Image Steganography
Embeds data as uniform 25% intensity spatial noise.
Extraction requires the original image for comparison.
"""

import argparse
import hashlib
import numpy as np
from PIL import Image
import json
import sys

# Reed-Solomon for error correction
try:
    from reedsolo import RSCodec
    HAS_REEDSOLO = True
except ImportError:
    HAS_REEDSOLO = False
    print("Warning: reedsolo not available. Install with: pip install reedsolo")

class ImageHybridStegano:
    def __init__(self, seed="default_seed", noise_intensity=64, redundancy=5):
        """
        Initialize steganography with spatial domain noise embedding.
        
        Args:
            seed: Seed for reproducible noise pattern generation
            noise_intensity: Fixed noise value (default 64 = 25% of 255)
            redundancy: Number of redundant copies of the data (default 5)
        """
        self.seed = seed
        self.noise_intensity = noise_intensity  # Fixed at 64 for 25% visibility
        self.redundancy = redundancy
        
    def _generate_noise_pattern(self, shape, min_positions=None):
        """
        Generate a deterministic noise pattern based on seed.
        
        Args:
            shape: Image shape (height, width, channels)
            min_positions: Minimum number of positions needed
            
        Returns:
            List of (y, x, channel) positions
        """
        height, width, channels = shape
        total_pixels = height * width * channels
        
        # Create deterministic random generator
        seed_int = int(hashlib.sha256(self.seed.encode()).hexdigest(), 16) % (2**32)
        rng = np.random.RandomState(seed_int)
        
        # Generate shuffled indices for all pixel positions
        positions = []
        for y in range(height):
            for x in range(width):
                for c in range(channels):
                    positions.append((y, x, c))
        
        # Shuffle deterministically
        rng.shuffle(positions)
        
        return positions
    
    def embed(self, image_path, data, output_path):
        """
        Embed data into an image using spatial domain noise (25% intensity).
        
        Args:
            image_path: Path to the original image
            data: String data to embed (max 255 characters)
            output_path: Path to save the modified image (will be PNG)
            
        Returns:
            Dictionary with embedding information
        """
        # Load image
        img = Image.open(image_path).convert('RGB')
        img_array = np.array(img, dtype=np.float32)
        
        # Convert data to bytes and add error correction
        data_bytes = data.encode('utf-8')
        if len(data_bytes) > 255:
            raise ValueError("Data too long. Maximum 255 bytes.")
        
        # Add error correction if available
        if HAS_REEDSOLO:
            rs = RSCodec(30)  # 30 bytes of error correction
            data_bytes = rs.encode(data_bytes)
        
        # Convert to bit array
        bit_array = np.unpackbits(np.frombuffer(data_bytes, dtype=np.uint8))
        
        # Generate noise pattern positions
        noise_pattern = self._generate_noise_pattern(img_array.shape, len(bit_array))
        
        # Use fixed spacing for redundant copies (to match extraction)
        bits_per_copy = 2400  # Same as extraction
        
        # Embed data redundantly with fixed 64-value noise (25% intensity)
        modified_array = img_array.copy()
        for rep in range(self.redundancy):
            offset = rep * bits_per_copy
            for i, bit in enumerate(bit_array):
                idx = offset + i
                if idx < len(noise_pattern):
                    y, x, c = noise_pattern[idx]
                    # Embed bit as uniform noise: +64 for 1, -64 for 0
                    noise_value = self.noise_intensity if bit else -self.noise_intensity
                    modified_array[y, x, c] += noise_value
        
        # Clip values to valid range
        modified_array = np.clip(modified_array, 0, 255).astype(np.uint8)
        
        # Force PNG output to preserve data
        if not output_path.lower().endswith('.png'):
            output_path = output_path.rsplit('.', 1)[0] + '.png'
            print(f"Note: Output changed to PNG format: {output_path}")
        
        modified_img = Image.fromarray(modified_array)
        modified_img.save(output_path, format='PNG')
        
        return {
            "success": True,
            "data_length": len(data),
            "encoded_bytes": len(data_bytes),
            "bit_count": len(bit_array),
            "redundancy": self.redundancy,
            "noise_intensity": self.noise_intensity,
            "noise_percentage": f"{self.noise_intensity/255*100:.1f}%",
            "image_shape": list(img_array.shape),
            "output_format": "PNG",
            "output_path": output_path
        }
    
    def extract(self, original_path, modified_path):
        """
        Extract data from a modified image using the original as reference.
        
        Args:
            original_path: Path to the original image
            modified_path: Path to the modified image
            
        Returns:
            Extracted string data or None if extraction fails
        """
        # Load images
        original_img = Image.open(original_path).convert('RGB')
        modified_img = Image.open(modified_path).convert('RGB')
        
        original_array = np.array(original_img, dtype=np.float32)
        modified_array = np.array(modified_img, dtype=np.float32)
        
        # Calculate difference (the noise we added)
        diff = modified_array - original_array
        
        # Generate the same noise pattern
        noise_pattern = self._generate_noise_pattern(original_array.shape, None)
        
        # Extract bits from each redundant copy
        # We need to extract enough bits to account for max data + error correction
        # Max: 255 bytes data + 30 bytes RS = 285 bytes = 2280 bits, round to 2400
        bits_per_copy = 2400
        
        all_bits = []
        for rep in range(self.redundancy):
            bits = []
            offset = rep * bits_per_copy
            
            for i in range(bits_per_copy):
                idx = offset + i
                if idx >= len(noise_pattern):
                    break
                    
                y, x, c = noise_pattern[idx]
                noise_val = diff[y, x, c]
                
                # Decode bit: positive noise = 1, negative = 0
                # Use 0 as threshold since we add +64 or -64
                bit = 1 if noise_val > 0 else 0
                bits.append(bit)
            
            if bits:
                all_bits.append(bits)
        
        if not all_bits:
            print("Error: No bits extracted")
            return None
        
        # Use majority voting across redundant copies
        max_len = max(len(bits) for bits in all_bits)
        consensus_bits = []
        
        for i in range(max_len):
            votes = [bits[i] for bits in all_bits if i < len(bits)]
            if votes:
                # Majority vote
                consensus_bits.append(1 if sum(votes) > len(votes) / 2 else 0)
        
        # Convert bits back to bytes
        bit_array = np.array(consensus_bits[:len(consensus_bits) - len(consensus_bits) % 8], dtype=np.uint8)
        byte_array = np.packbits(bit_array)
        
        # Try to decode with error correction
        if HAS_REEDSOLO:
            try:
                rs = RSCodec(30)
                corrected_bytes = rs.decode(bytes(byte_array))
                data = corrected_bytes[0].decode('utf-8', errors='ignore').strip('\x00')
                return data
            except Exception as e:
                print(f"Error correction failed: {e}, trying fallback...")
        
        # Fallback: try direct decode
        try:
            data = byte_array.tobytes().decode('utf-8', errors='ignore')
            # Clean up: keep only printable characters and stop at first unusual pattern
            cleaned = []
            for c in data:
                if c.isprintable() or c in '\n\r\t':
                    cleaned.append(c)
                elif c == '\x00':
                    break  # Stop at null byte
                else:
                    # Stop at first non-printable non-whitespace
                    break
            return ''.join(cleaned).rstrip()
        except Exception as e:
            print(f"Direct decode failed: {e}")
            return None


def main():
    parser = argparse.ArgumentParser(
        description='Hybrid Image Steganography with 25% spatial noise'
    )
    parser.add_argument('--mode', choices=['embed', 'extract'], required=True,
                        help='Operation mode')
    parser.add_argument('--original', required=True,
                        help='Path to original image')
    parser.add_argument('--modified',
                        help='Path to modified/output image')
    parser.add_argument('--data',
                        help='Data to embed (embed mode)')
    parser.add_argument('--seed', default='default_seed',
                        help='Seed for noise pattern generation')
    parser.add_argument('--intensity', type=int, default=64,
                        help='Noise intensity (default: 64 = 25%% of 255)')
    parser.add_argument('--redundancy', type=int, default=5,
                        help='Number of redundant copies (default: 5)')
    parser.add_argument('--json', action='store_true',
                        help='Output results as JSON')
    
    args = parser.parse_args()
    
    # Create steganography instance
    stegano = ImageHybridStegano(
        seed=args.seed,
        noise_intensity=args.intensity,
        redundancy=args.redundancy
    )
    
    if args.mode == 'embed':
        if not args.data:
            print("Error: --data required for embed mode")
            sys.exit(1)
        if not args.modified:
            print("Error: --modified required for embed mode")
            sys.exit(1)
        
        try:
            result = stegano.embed(args.original, args.data, args.modified)
            
            if args.json:
                print(json.dumps(result, indent=2))
            else:
                print(f"✓ Successfully embedded {result['data_length']} characters")
                print(f"  Encoded bytes: {result['encoded_bytes']}")
                print(f"  Noise intensity: {result['noise_intensity']} ({result['noise_percentage']})")
                print(f"  Redundancy: {result['redundancy']} copies")
                print(f"  Output: {result['output_path']}")
        
        except Exception as e:
            print(f"Error during embedding: {e}")
            sys.exit(1)
    
    elif args.mode == 'extract':
        if not args.modified:
            print("Error: --modified required for extract mode")
            sys.exit(1)
        
        try:
            data = stegano.extract(args.original, args.modified)
            
            if data:
                if args.json:
                    print(json.dumps({"success": True, "data": data}, indent=2))
                else:
                    print(f"✓ Extracted data: {data}")
            else:
                if args.json:
                    print(json.dumps({"success": False, "error": "Extraction failed"}, indent=2))
                else:
                    print("✗ Failed to extract data")
                sys.exit(1)
        
        except Exception as e:
            print(f"Error during extraction: {e}")
            sys.exit(1)


if __name__ == '__main__':
    main()
