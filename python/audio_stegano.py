import numpy as np
import wave
import hashlib
import struct
import argparse
import sys
import os
import tempfile
import subprocess

def convert_to_wav(input_path):
    """
    Convert any audio format to WAV using ffmpeg.
    Returns the path to the converted WAV file (temporary file).
    If already WAV, returns the original path.
    """
    # Check if already a WAV file
    if input_path.lower().endswith('.wav'):
        return input_path, False  # Return original path, not converted
    
    print(f"🔄 Converting {os.path.basename(input_path)} to WAV format...")
    
    # Create temporary WAV file
    temp_wav = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
    temp_wav_path = temp_wav.name
    temp_wav.close()
    
    try:
        # Use ffmpeg to convert to WAV
        # -ar 44100: Sample rate 44.1kHz
        # -ac 1: Mono (1 channel) - steganography works better with mono
        # -sample_fmt s16: 16-bit signed integer samples
        cmd = [
            'ffmpeg',
            '-i', input_path,
            '-ar', '44100',
            '-ac', '1',
            '-sample_fmt', 's16',
            '-y',  # Overwrite output file
            temp_wav_path
        ]
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60
        )
        
        if result.returncode != 0:
            # Clean up temp file
            try:
                os.unlink(temp_wav_path)
            except:
                pass
            raise RuntimeError(f"FFmpeg conversion failed: {result.stderr}")
        
        print(f"✅ Converted to WAV: {temp_wav_path}")
        return temp_wav_path, True  # Return temp path, was converted
        
    except FileNotFoundError:
        try:
            os.unlink(temp_wav_path)
        except:
            pass
        raise RuntimeError(
            "FFmpeg not found. Please install ffmpeg:\n"
            "  Ubuntu/Debian: sudo apt-get install ffmpeg\n"
            "  macOS: brew install ffmpeg"
        )
    except subprocess.TimeoutExpired:
        try:
            os.unlink(temp_wav_path)
        except:
            pass
        raise RuntimeError("Audio conversion timed out (>60 seconds)")

class AudioSteganography:
    def __init__(self, seed=42):
        """
        Initialize block-based audio steganography with correlation detection.
        
        Uses:
        - Block-based encoding (20-50ms windows)
        - PN sequence spreading for each bit
        - Sync preamble for alignment detection
        - Small amplitude modulation (±0.5-1%) for robustness
        - Correlation-based extraction with redundancy
        """
        self.seed = seed
        np.random.seed(seed)
        
        # Block parameters
        self.block_duration_ms = 30  # 30ms blocks (sweet spot between 20-50ms)
        self.sample_rate = 44100
        self.block_size = int(self.sample_rate * self.block_duration_ms / 1000)
        
        # Encoding parameters
        self.modulation_strength = 0.02  # ±2% volume change (subtle but recoverable)
        self.blocks_per_bit = 2  # Spread each bit across 2 blocks for redundancy
        self.redundancy = 3  # Repeat entire message 3 times
        
        # Sync preamble: alternating pattern for alignment detection
        # Pattern: 1,0,1,0,1,0,1,0 (8 bits)
        self.sync_pattern = [1, 0, 1, 0, 1, 0, 1, 0]
        self.sync_length = len(self.sync_pattern)
        
        # Generate PN sequence for spreading (pseudo-random sequence for correlation)
        self.pn_sequence = self._generate_pn_sequence(self.block_size)
    
    def _generate_pn_sequence(self, length):
        """Generate a pseudo-random bipolar sequence (-1, +1) for spreading"""
        rng = np.random.RandomState(self.seed)
        return rng.choice([-1, 1], size=length)
    
    def _get_block_size_and_pn(self, sample_rate):
        """
        Get block size and PN sequence for the given sample rate.
        Regenerates PN if sample rate differs from default.
        """
        block_size = int(sample_rate * self.block_duration_ms / 1000)
        
        # Always regenerate with deterministic seed
        pn_sequence = self._generate_pn_sequence(block_size)
        
        return block_size, pn_sequence
    
    def _modulate_block(self, block, bit_value, pn_sequence):
        """
        Modulate a block to encode a bit using PN sequence spreading.
        
        Args:
            block: Audio block (numpy array, float64)
            bit_value: 0 or 1
            pn_sequence: PN sequence to use for modulation
        
        Returns:
            Modulated block (float64)
        """
        # Convert bit to bipolar: 0 -> -1, 1 -> +1
        bipolar_bit = 1 if bit_value == 1 else -1
        
        # Apply PN sequence modulation
        # For bit=1: boost volume slightly with PN pattern
        # For bit=0: reduce volume slightly with PN pattern
        modulation = bipolar_bit * self.modulation_strength * pn_sequence[:len(block)]
        
        # Apply modulation: modified = original * (1 + modulation)
        modulated = block * (1.0 + modulation)
        
        return modulated
    
    def _compute_block_correlation(self, original_block, modified_block, pn_sequence):
        """
        Compute correlation between original and modified blocks to extract bit.
        
        We embedded: modified = original * (1 + bipolar_bit * strength * PN)
        So: diff = modified - original = original * bipolar_bit * strength * PN
        
        To extract: correlate (diff / original) with PN
        This gives us: bipolar_bit * strength (positive or negative)
        
        Args:
            original_block: Original audio block
            modified_block: Modified audio block
            pn_sequence: PN sequence used for modulation
        
        Returns:
            Extracted bit (0 or 1) and confidence score
        """
        # Compute the difference (watermark signal)
        diff = modified_block.astype(np.float64) - original_block.astype(np.float64)
        original = original_block.astype(np.float64)
        
        # Compute normalized difference: (modified - original) / original
        # To avoid division by zero, add small epsilon
        epsilon = 1e-6
        normalized_diff = diff / (np.abs(original) + epsilon)
        
        # Correlate with PN sequence to detect the embedded bit
        pn = pn_sequence[:len(normalized_diff)]
        correlation = np.mean(normalized_diff * pn)
        
        # Positive correlation -> bit 1 (bipolar = +1)
        # Negative correlation -> bit 0 (bipolar = -1)
        bit = 1 if correlation > 0 else 0
        confidence = abs(correlation)
        
        return bit, confidence
    
    def embed_data(self, original_audio_path, output_audio_path, data):
        """
        Embed data into audio file using block-based modulation with PN spreading.
        
        Process:
        1. Add sync preamble for alignment
        2. Encode data with length prefix
        3. Spread each bit across multiple blocks
        4. Repeat entire message for redundancy
        5. Apply small volume modulation (±0.8%)
        """
        # Convert input audio to WAV if needed
        wav_path, was_converted = convert_to_wav(original_audio_path)
        temp_files = [wav_path] if was_converted else []
        
        try:
            # Read original audio
            with wave.open(wav_path, 'rb') as wav:
                params = wav.getparams()
                frames = wav.readframes(params.nframes)
                audio_data = np.frombuffer(frames, dtype=np.int16).astype(np.float64)
                sample_rate = params.framerate
            
            if sample_rate != self.sample_rate:
                print(f"Warning: Audio sample rate is {sample_rate} Hz, expected {self.sample_rate} Hz")
            
            # Get correct block size and PN sequence for this sample rate
            block_size, pn_sequence = self._get_block_size_and_pn(sample_rate)
            
            print(f"Audio samples: {len(audio_data)}")
            print(f"Sample rate: {sample_rate} Hz")
            print(f"Block size: {block_size} samples ({self.block_duration_ms}ms)")
            
            # Prepare data: length prefix (1 byte) + data
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
            
            # Create encoding: sync + data repeated multiple times
            encoding = []
            
            for copy_idx in range(self.redundancy):
                # Add sync preamble
                encoding.extend(self.sync_pattern)
                # Add data bits
                encoding.extend(bits)
            
            print(f"\nDebug - First 20 encoding bits: {encoding[:20]}")
            print(f"Debug - Expected: sync repeated {self.redundancy} times + data...")
            
            total_encoding_bits = len(encoding)
            blocks_needed = total_encoding_bits * self.blocks_per_bit
            samples_needed = blocks_needed * block_size
            
            print(f"\nEncoding details:")
            print(f"  Data: {data_length} chars = {total_bits} bits")
            print(f"  Sync pattern: {self.sync_length} bits")
            print(f"  Per copy: {self.sync_length + total_bits} bits")
            print(f"  Redundancy: {self.redundancy} copies")
            print(f"  Total bits: {total_encoding_bits}")
            print(f"  Blocks per bit: {self.blocks_per_bit}")
            print(f"  Total blocks: {blocks_needed}")
            print(f"  Samples needed: {samples_needed}")
            print(f"  Audio samples: {len(audio_data)}")
            
            if samples_needed > len(audio_data):
                raise ValueError(
                    f"Audio too short! Need {samples_needed} samples ({samples_needed/sample_rate:.1f}s), "
                    f"have {len(audio_data)} samples ({len(audio_data)/sample_rate:.1f}s)"
                )
            
            # Create modulated audio
            modulated_audio = audio_data.copy()
            
            # Encode each bit across multiple blocks
            block_idx = 0
            for bit_position, bit in enumerate(encoding):
                for redundant_idx in range(self.blocks_per_bit):
                    start_sample = block_idx * block_size
                    end_sample = start_sample + block_size
                    
                    if end_sample > len(audio_data):
                        break
                    
                    # Get block
                    block = audio_data[start_sample:end_sample].copy()
                    
                    # Modulate block with bit
                    modulated_block = self._modulate_block(block, bit, pn_sequence)
                    
                    # Debug first few blocks
                    if block_idx < 10:
                        print(f"  Block {block_idx}: encoding bit_pos={bit_position}, bit={bit}, redundant_copy={redundant_idx}")
                    
                    # Write back to audio
                    modulated_audio[start_sample:end_sample] = modulated_block
                    
                    block_idx += 1
            
            # Convert back to int16
            modulated_audio = np.clip(modulated_audio, -32768, 32767).astype(np.int16)
            
            # Write modified audio
            with wave.open(output_audio_path, 'wb') as wav:
                wav.setparams(params)
                wav.writeframes(modulated_audio.tobytes())
            
            print(f"\n✅ Embedded {data_length} characters into {blocks_needed} blocks")
            print(f"   Modulation: ±{self.modulation_strength*100:.1f}% volume")
            print(f"   Coverage: {samples_needed/len(audio_data)*100:.1f}% of audio")
            return True
            
        finally:
            # Clean up temporary converted files
            for temp_file in temp_files:
                try:
                    os.unlink(temp_file)
                    print(f"🗑️  Cleaned up temporary file: {temp_file}")
                except:
                    pass
    
    def extract_data(self, original_audio_path, modified_audio_path):
        """
        Extract data by comparing original and modified audio using block correlation.
        
        Process:
        1. Divide both audio files into blocks
        2. Compute correlation for each block pair
        3. Find sync pattern to locate message starts
        4. Extract bits using majority voting across redundant copies
        5. Decode message with error checking
        """
        # Convert both audio files to WAV if needed
        original_wav, orig_converted = convert_to_wav(original_audio_path)
        modified_wav, mod_converted = convert_to_wav(modified_audio_path)
        temp_files = []
        if orig_converted:
            temp_files.append(original_wav)
        if mod_converted:
            temp_files.append(modified_wav)
        
        try:
            # Read both audio files
            with wave.open(original_wav, 'rb') as wav:
                original_data = np.frombuffer(
                    wav.readframes(wav.getnframes()), dtype=np.int16
                ).astype(np.float64)
                sample_rate = wav.getparams().framerate
            
            with wave.open(modified_wav, 'rb') as wav:
                modified_data = np.frombuffer(
                    wav.readframes(wav.getnframes()), dtype=np.int16
                ).astype(np.float64)
            
            # Handle length mismatch
            min_length = min(len(original_data), len(modified_data))
            if len(original_data) != len(modified_data):
                print(f"Warning: Audio lengths differ. Using first {min_length} samples.")
                original_data = original_data[:min_length]
                modified_data = modified_data[:min_length]
            
            if sample_rate != self.sample_rate:
                print(f"Warning: Audio sample rate is {sample_rate} Hz, expected {self.sample_rate} Hz")
            
            # Get correct block size and PN sequence for this sample rate
            block_size, pn_sequence = self._get_block_size_and_pn(sample_rate)
            
            print(f"\n{'='*70}")
            print(f"Audio samples: {len(original_data)}")
            print(f"Sample rate: {sample_rate} Hz")
            print(f"Block size: {block_size} samples ({self.block_duration_ms}ms)")
            print(f"PN sequence first 10: {pn_sequence[:10]}")
            print(f"{'='*70}\n")
            
            # Extract bits from all blocks
            num_blocks = len(original_data) // block_size
            extracted_bits = []
            confidences = []
            
            print(f"Extracting from {num_blocks} blocks...")
            
            for block_idx in range(num_blocks):
                start_sample = block_idx * block_size
                end_sample = start_sample + block_size
                
                if end_sample > len(original_data):
                    break
                
                original_block = original_data[start_sample:end_sample]
                modified_block = modified_data[start_sample:end_sample]
                
                bit, confidence = self._compute_block_correlation(original_block, modified_block, pn_sequence)
                extracted_bits.append(bit)
                confidences.append(confidence)
            
            print(f"Extracted {len(extracted_bits)} bits from blocks")
            
            # Debug: Check first few bits BEFORE grouping
            print(f"\nDebug - First 16 raw bits: {extracted_bits[:16]}")
            print(f"Debug - Expected sync (repeated {self.blocks_per_bit}x): {self.sync_pattern * self.blocks_per_bit}")
            
            # Group bits by blocks_per_bit and use majority voting
            grouped_bits = []
            for i in range(0, len(extracted_bits), self.blocks_per_bit):
                group = extracted_bits[i:i+self.blocks_per_bit]
                group_conf = confidences[i:i+self.blocks_per_bit]
                
                if len(group) < self.blocks_per_bit:
                    break
                
                # Weighted majority vote (weight by confidence)
                weighted_sum = sum(b * c for b, c in zip(group, group_conf))
                total_confidence = sum(group_conf)
                
                if total_confidence > 0:
                    bit = 1 if weighted_sum > total_confidence / 2 else 0
                else:
                    bit = 1 if sum(group) > len(group) / 2 else 0
                
                grouped_bits.append(bit)
            
            print(f"Grouped into {len(grouped_bits)} message bits")
            
            # Find sync patterns to locate message copies
            sync_positions = self._find_sync_patterns(grouped_bits)
            
            if not sync_positions:
                print("❌ No sync patterns found!")
                return None
            
            print(f"Found {len(sync_positions)} sync patterns at positions: {sync_positions[:10]}...")
            
            # Extract and vote on data from multiple copies
            all_messages = []
            
            for sync_pos in sync_positions[:20]:  # Check first 20 sync positions
                # Skip sync pattern
                data_start = sync_pos + self.sync_length
                
                # Extract length byte (8 bits)
                if data_start + 8 > len(grouped_bits):
                    continue
                
                length_bits = grouped_bits[data_start:data_start+8]
                data_length = 0
                for bit in length_bits:
                    data_length = (data_length << 1) | bit
                
                if data_length <= 0 or data_length > 255:
                    continue
                
                print(f"  Sync at {sync_pos}: length={data_length}")
                
                # Extract data bits
                data_bits_start = data_start + 8
                data_bits_needed = data_length * 8
                data_bits_end = data_bits_start + data_bits_needed
                
                if data_bits_end > len(grouped_bits):
                    print(f"    Not enough bits: need {data_bits_end}, have {len(grouped_bits)}")
                    continue
                
                data_bits = grouped_bits[data_bits_start:data_bits_end]
                
                # Convert bits to bytes
                data_bytes = bytearray()
                for i in range(0, len(data_bits), 8):
                    if i + 8 <= len(data_bits):
                        byte_val = 0
                        for j in range(8):
                            byte_val = (byte_val << 1) | data_bits[i + j]
                        data_bytes.append(byte_val)
                
                try:
                    decoded_text = data_bytes[:data_length].decode('utf-8')
                    all_messages.append(decoded_text)
                    print(f"    ✓ Decoded: '{decoded_text}'")
                except Exception as e:
                    print(f"    ✗ Decode error: {e}")
                    continue
            
            if not all_messages:
                print("❌ No valid messages decoded!")
                return None
            
            # Use majority voting on messages
            from collections import Counter
            message_counts = Counter(all_messages)
            best_message, count = message_counts.most_common(1)[0]
            
            print(f"\n{'='*70}")
            print(f"✅ EXTRACTION SUCCESSFUL")
            print(f"{'='*70}")
            print(f"Found {len(all_messages)} message copies, {count} agreeing")
            print(f"\nExtracted text ({len(best_message)} characters):")
            print(f"┌{'─'*68}┐")
            print(f"│ {best_message:<66} │")
            print(f"└{'─'*68}┘\n")
            
            return best_message
            
        finally:
            # Clean up temporary converted files
            for temp_file in temp_files:
                try:
                    os.unlink(temp_file)
                    print(f"🗑️  Cleaned up temporary file: {temp_file}")
                except:
                    pass
    
    def _find_sync_patterns(self, bits):
        """Find positions where sync pattern occurs in the bit stream"""
        sync_positions = []
        sync_len = len(self.sync_pattern)
        
        for i in range(len(bits) - sync_len + 1):
            # Check if sync pattern matches exactly
            matches = sum(1 for j in range(sync_len) if bits[i+j] == self.sync_pattern[j])
            
            # Require exact match or at most 1 bit error
            if matches >= sync_len - 1:
                sync_positions.append(i)
        
        return sync_positions


def main():
    parser = argparse.ArgumentParser(
        description="Audio Steganography - Block-based robust watermarking with correlation detection",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Hide data in audio file:
  python3 audio_stegano.py --mode embed --original original.wav --output hidden.wav --data "Secret message"

  # Extract data from audio file:
  python3 audio_stegano.py --mode extract --original original.wav --modified hidden.wav

  # Hide data from a text file:
  python3 audio_stegano.py --mode embed --original original.wav --output hidden.wav --data-file secret.txt
  
  # Use custom seed for PN sequence:
  python3 audio_stegano.py --mode embed --original original.wav --output hidden.wav --data "Test" --seed 12345

Features:
  - Block-based encoding (30ms windows) for recompression robustness
  - PN sequence spreading with correlation detection
  - Sync preamble for alignment after resampling
  - Small modulation (±0.8%) for imperceptibility
  - 5x redundancy with majority voting
  - Hybrid reference comparison for maximum data recovery
        """
    )
    
    parser.add_argument(
        "--mode",
        choices=["embed", "extract"],
        required=True,
        help="Operation mode: 'embed' to hide data, 'extract' to retrieve data"
    )
    
    parser.add_argument(
        "--original",
        required=True,
        help="Path to the original audio file (any format supported by ffmpeg)"
    )
    
    parser.add_argument(
        "--output",
        help="Path for output audio file (required for embed mode)"
    )
    
    parser.add_argument(
        "--modified",
        help="Path to the modified/watermarked audio file (required for extract mode)"
    )
    
    parser.add_argument(
        "--data",
        help="Data/message to hide (for embed mode, max 255 characters)"
    )
    
    parser.add_argument(
        "--data-file",
        help="Path to text file containing data to hide (alternative to --data)"
    )
    
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Seed value for PN sequence generation (default: 42). Must match for embed/extract!"
    )
    
    parser.add_argument(
        "--output-file",
        help="Save extracted data to file (for extract mode)"
    )
    
    args = parser.parse_args()
    
    # Validate arguments based on mode
    if args.mode == "embed":
        if not args.output:
            print("Error: --output is required for embed mode", file=sys.stderr)
            sys.exit(1)
        
        if not args.data and not args.data_file:
            print("Error: Either --data or --data-file is required for embed mode", file=sys.stderr)
            sys.exit(1)
        
        if args.data and args.data_file:
            print("Error: Use either --data or --data-file, not both", file=sys.stderr)
            sys.exit(1)
    
    elif args.mode == "extract":
        if not args.modified:
            print("Error: --modified is required for extract mode", file=sys.stderr)
            sys.exit(1)
    
    # Check if original file exists
    if not os.path.isfile(args.original):
        print(f"Error: Original audio file not found: {args.original}", file=sys.stderr)
        sys.exit(1)
    
    # Initialize steganography with seed
    print(f"Initializing with seed: {args.seed}")
    steg = AudioSteganography(seed=args.seed)
    
    try:
        if args.mode == "embed":
            # Get data to embed
            if args.data_file:
                if not os.path.isfile(args.data_file):
                    print(f"Error: Data file not found: {args.data_file}", file=sys.stderr)
                    sys.exit(1)
                with open(args.data_file, 'r', encoding='utf-8') as f:
                    data = f.read()
                print(f"Loaded data from file: {args.data_file} ({len(data)} characters)")
            else:
                data = args.data
            
            # Embed data
            print(f"\n{'='*70}")
            print(f"EMBEDDING DATA")
            print(f"{'='*70}")
            print(f"Original: {args.original}")
            print(f"Output: {args.output}")
            print(f"Data length: {len(data)} characters")
            
            steg.embed_data(args.original, args.output, data)
            
            print(f"\n✅ Success! Data embedded into: {args.output}")
        
        elif args.mode == "extract":
            # Check if modified file exists
            if not os.path.isfile(args.modified):
                print(f"Error: Modified audio file not found: {args.modified}", file=sys.stderr)
                sys.exit(1)
            
            # Extract data
            print(f"\n{'='*70}")
            print(f"EXTRACTING DATA")
            print(f"{'='*70}")
            print(f"Original: {args.original}")
            print(f"Modified: {args.modified}")
            
            extracted_data = steg.extract_data(args.original, args.modified)
            
            if extracted_data is None:
                print(f"\n❌ Failed to extract data")
                sys.exit(1)
            
            print(f"✅ Success! Extracted {len(extracted_data)} characters")
            
            # Save to file or print to console
            if args.output_file:
                with open(args.output_file, 'w', encoding='utf-8') as f:
                    f.write(extracted_data)
                print(f"Extracted data saved to: {args.output_file}")
            else:
                print("\n" + "="*70)
                print("EXTRACTED DATA:")
                print("="*70)
                print(extracted_data)
                print("="*70)
    
    except Exception as e:
        print(f"\n❌ Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


# Example usage
if __name__ == "__main__":
    # Check if run with arguments
    if len(sys.argv) > 1:
        main()
    else:
        # Run example if no arguments provided
        print("No arguments provided. Running example...")
        print("="*70)
        
        # Example usage
        steg = AudioSteganography(seed=42)
        
        # Check if example files exist
        if not os.path.isfile("original.wav"):
            print("Error: Example file 'original.wav' not found.")
            print("\nUsage:")
            print("  python3 audio_stegano.py --help")
            sys.exit(1)
        
        # Embed
        secret_message = "Block-based robust watermark!"
        print(f"Embedding: '{secret_message}'")
        steg.embed_data("original.wav", "modified.wav", secret_message)
        print("✅ Data embedded into 'modified.wav'")
        
        # Extract
        print("\nExtracting data...")
        extracted = steg.extract_data("original.wav", "modified.wav")
        if extracted:
            print(f"✅ Extracted: '{extracted}'")
        else:
            print("❌ Extraction failed")
        print("="*70)