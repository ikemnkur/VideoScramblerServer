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
    def __init__(self, seed=None):
        """Initialize with optional seed (no longer used in linear approach)"""
        self.redundancy = 5  # Each bit stored 5 times
        self.spacing = 10     # Zero-padding samples between each bit
        self.amplitude = 35   # Fixed amplitude for embedding
    
    def embed_data(self, original_audio_path, output_audio_path, data):
        """
        Embed data into audio file using linear redundancy with spacing.
        Repeats the entire message at regular intervals throughout the audio.
        """
        # Convert input audio to WAV if needed
        wav_path, was_converted = convert_to_wav(original_audio_path)
        temp_files = [wav_path] if was_converted else []
        
        try:
            # Read original audio
            with wave.open(wav_path, 'rb') as wav:
                params = wav.getparams()
                frames = wav.readframes(params.nframes)
                audio_data = np.frombuffer(frames, dtype=np.int16)
                sample_rate = params.framerate
            
            print(f"Audio samples: {len(audio_data)}")
            print(f"Sample rate: {sample_rate} Hz")
            
            # Prepare data: length prefix (4 bytes) + data
            data_bytes = data.encode('utf-8')
            data_length = len(data_bytes)
            
            if data_length > 255:
                raise ValueError("Data too long! Maximum 255 characters.")
            
            # Pack: 4-byte length + data
            full_data = struct.pack('>I', data_length) + data_bytes
            
            # Convert to bits
            bits = []
            for byte in full_data:
                for i in range(7, -1, -1):
                    bits.append((byte >> i) & 1)
            
            total_bits = len(bits)
            
            # Calculate space needed for one complete encoding
            samples_per_bit = 1 + self.spacing  # 1 sample for data + spacing
            samples_per_encoding = total_bits * samples_per_bit * self.redundancy
            
            # Determine repeat interval (1, 2, or 3 seconds)
            for interval_seconds in [1, 2, 3]:
                interval_samples = sample_rate * interval_seconds
                if samples_per_encoding <= interval_samples:
                    break
            else:
                # If even 3 seconds isn't enough, use the minimum needed
                interval_seconds = (samples_per_encoding / sample_rate) + 0.5
                interval_samples = int(interval_seconds * sample_rate)
            
            # Calculate how many complete copies we can fit
            num_copies = len(audio_data) // interval_samples
            
            print(f"Data: {data_length} chars = {total_bits} bits")
            print(f"With {self.redundancy}x redundancy and {self.spacing} spacing:")
            print(f"  {samples_per_encoding} samples per encoding")
            print(f"  Repeat interval: {interval_seconds} second(s) ({interval_samples} samples)")
            print(f"  Number of complete copies: {num_copies}")
            print(f"  Total coverage: {num_copies * interval_samples} / {len(audio_data)} samples")
            
            if samples_per_encoding > len(audio_data):
                raise ValueError(
                    f"Audio too short! Need {samples_per_encoding} samples, "
                    f"have {len(audio_data)}"
                )
            
            # Create modified audio
            modified_audio = audio_data.copy().astype(np.int32)
            
            # Embed the message multiple times throughout the audio
            for copy_num in range(num_copies):
                base_position = copy_num * interval_samples
                position = base_position
                
                # Embed all bits for this copy
                for bit in bits:
                    for redundant_copy in range(self.redundancy):
                        # Embed the bit
                        if bit == 1:
                            modified_audio[position] += self.amplitude
                        else:
                            modified_audio[position] -= self.amplitude
                        
                        position += 1
                        
                        # Add spacing (zero-padding)
                        position += self.spacing
            
            # Clip to valid int16 range
            modified_audio = np.clip(modified_audio, -32768, 32767).astype(np.int16)
            
            # Write modified audio
            with wave.open(output_audio_path, 'wb') as wav:
                wav.setparams(params)
                wav.writeframes(modified_audio.tobytes())
            
            print(f"✅ Embedded {data_length} characters into audio ({num_copies} copies)")
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
        Extract data by comparing original and modified audio files.
        Tries to find valid encodings at regular intervals (every 1-3 seconds).
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
                ).astype(np.int32)
                sample_rate = wav.getparams().framerate
            
            with wave.open(modified_wav, 'rb') as wav:
                modified_data = np.frombuffer(
                    wav.readframes(wav.getnframes()), dtype=np.int16
                ).astype(np.int32)
            
            if len(original_data) != len(modified_data):
                if len(original_data) < len(modified_data):
                    print(f"Warning: Original audio has {len(original_data)} samples, "
                          f"but modified audio has {len(modified_data)} samples. "
                          f"Truncating modified audio to match original.")
                    modified_data = modified_data[:len(original_data)]
                else:
                    print(f"Warning: Original audio has {len(original_data)} samples, "
                          f"but modified audio has {len(modified_data)} samples. "
                          f"Truncating original audio to match modified.")
                    original_data = original_data[:len(modified_data)]
                # raise ValueError("Original and modified audio files have different lengths!")
            
            # Calculate difference (this reveals the embedded data)
            diff = modified_data - original_data
            
            print(f"\n{'='*70}")
            print(f"Audio samples: {len(original_data)}")
            print(f"Sample rate: {sample_rate} Hz")
            print(f"Non-zero differences: {np.count_nonzero(diff)}")
            print(f"{'='*70}\n")
            
            # Try to extract from different starting positions (1, 2, or 3 second intervals)
            samples_per_bit = 1 + self.spacing
            
            # First, try to detect the interval by finding the repeat pattern
            # Look for encodings at 1s, 2s, and 3s intervals
            found_encodings = []
            
            for interval_seconds in [1, 2, 3]:
                interval_samples = sample_rate * interval_seconds
                
                # Try extracting from the first position
                result = self._extract_single_encoding(diff, 0, samples_per_bit)
                
                if result and result['valid']:
                    # Check if there's a repeat at the expected interval
                    if interval_samples < len(diff):
                        result2 = self._extract_single_encoding(diff, interval_samples, samples_per_bit)
                        if result2 and result2['valid'] and result2['text'] == result['text']:
                            print(f"✅ Found valid encoding with {interval_seconds}s interval")
                            found_encodings.append({
                                'interval': interval_seconds,
                                'result': result
                            })
                            break
            
            if not found_encodings:
                # Fallback: just try position 0
                print(f"Trying to extract from position 0...")
                result = self._extract_single_encoding(diff, 0, samples_per_bit)
                if result and result['valid']:
                    found_encodings.append({
                        'interval': None,
                        'result': result
                    })
            
            if not found_encodings:
                print(f"❌ No valid encodings found!")
                return None
            
            # Use the first valid encoding found
            encoding = found_encodings[0]
            result = encoding['result']
            
            print(f"\n{'='*70}")
            print(f"✅ EXTRACTION SUCCESSFUL")
            print(f"{'='*70}")
            print(f"\nExtracted text ({len(result['text'])} characters):")
            print(f"┌{'─'*68}┐")
            print(f"│ {result['text']:<66} │")
            print(f"└{'─'*68}┘\n")
            
            return result['text']
            
        finally:
            # Clean up temporary converted files
            for temp_file in temp_files:
                try:
                    os.unlink(temp_file)
                    print(f"🗑️  Cleaned up temporary file: {temp_file}")
                except:
                    pass
    
    def _extract_single_encoding(self, diff, start_position, samples_per_bit):
        """Extract a single encoding starting at the given position"""
        try:
            # Extract length prefix (32 bits)
            length_bits = []
            for bit_idx in range(32):
                # Collect redundant copies for this bit
                votes = []
                position = start_position + (bit_idx * samples_per_bit * self.redundancy)
                
                for copy in range(self.redundancy):
                    pos = position + (copy * samples_per_bit)
                    
                    if pos >= len(diff):
                        return None
                    
                    # Vote based on sign of difference
                    if diff[pos] > 0:
                        votes.append(1)
                    elif diff[pos] < 0:
                        votes.append(0)
                
                # Majority vote
                if len(votes) > 0:
                    bit = 1 if sum(votes) > len(votes) / 2 else 0
                    length_bits.append(bit)
                else:
                    return None
            
            # Decode length
            length_bytes = []
            for i in range(0, 32, 8):
                byte_val = 0
                for j in range(8):
                    byte_val = (byte_val << 1) | length_bits[i + j]
                length_bytes.append(byte_val)
            
            data_length = struct.unpack('>I', bytes(length_bytes))[0]
            
            if data_length <= 0 or data_length > 255:
                return None
            
            # Extract data bits (after the 32-bit length prefix)
            total_data_bits = data_length * 8
            
            data_bits = []
            for bit_idx in range(total_data_bits):
                # Collect redundant copies for this bit
                votes = []
                # Offset by the length prefix (32 bits worth of samples)
                position = start_position + ((32 + bit_idx) * samples_per_bit * self.redundancy)
                
                for copy in range(self.redundancy):
                    pos = position + (copy * samples_per_bit)
                    
                    if pos >= len(diff):
                        break
                    
                    # Vote based on sign of difference
                    if diff[pos] > 0:
                        votes.append(1)
                    elif diff[pos] < 0:
                        votes.append(0)
                
                # Majority vote
                if len(votes) > 0:
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
            decoded_text = data_bytes[:data_length].decode('utf-8')
            
            return {
                'valid': True,
                'text': decoded_text,
                'length': data_length
            }
            
        except Exception as e:
            return None


def main():
    parser = argparse.ArgumentParser(
        description="Audio Steganography - Hide and extract data from audio files using LSB with noise-like disturbances",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Hide data in audio file:
  python3 audio_stegano.py --mode embed --original original.wav --output hidden.wav --data "Secret message"

  # Extract data from audio file:
  python3 audio_stegano.py --mode extract --original original.wav --modified hidden.wav

  # Hide data from a text file:
  python3 audio_stegano.py --mode embed --original original.wav --output hidden.wav --data-file secret.txt
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
        help="Path to the original audio file (WAV format)"
    )
    
    parser.add_argument(
        "--output",
        help="Path for output audio file (required for embed mode)"
    )
    
    parser.add_argument(
        "--modified",
        help="Path to the modified audio file (required for extract mode)"
    )
    
    parser.add_argument(
        "--data",
        help="Data/message to hide (for embed mode)"
    )
    
    parser.add_argument(
        "--data-file",
        help="Path to text file containing data to hide (alternative to --data)"
    )
    
    parser.add_argument(
        "--seed",
        help="(Optional) Seed value - no longer used in linear approach, kept for backward compatibility"
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
    
    # Initialize steganography (no seed needed)
    steg = AudioSteganography()
    
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
            print(f"Embedding data into audio...")
            print(f"Original: {args.original}")
            print(f"Output: {args.output}")
            print(f"Data length: {len(data)} characters")
            
            steg.embed_data(args.original, args.output, data)
            
            print(f"✅ Success! Data embedded into: {args.output}")
        
        elif args.mode == "extract":
            # Check if modified file exists
            if not os.path.isfile(args.modified):
                print(f"Error: Modified audio file not found: {args.modified}", file=sys.stderr)
                sys.exit(1)
            
            # Extract data
            print(f"Extracting data from audio...")
            print(f"Original: {args.original}")
            print(f"Modified: {args.modified}")
            
            extracted_data = steg.extract_data(args.original, args.modified)
            
            print(f"✅ Success! Extracted {len(extracted_data)} characters")
            
            # Save to file or print to console
            if args.output_file:
                with open(args.output_file, 'w', encoding='utf-8') as f:
                    f.write(extracted_data)
                print(f"Extracted data saved to: {args.output_file}")
            else:
                print("\n" + "="*60)
                print("EXTRACTED DATA:")
                print("="*60)
                print(extracted_data)
                print("="*60)
    
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
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
        print("="*60)
        
        # Example usage
        steg = AudioSteganography()
        
        # Check if example files exist
        if not os.path.isfile("original.wav"):
            print("Error: Example file 'original.wav' not found.")
            print("\nUsage:")
            print("  python3 audio_stegano.py --help")
            sys.exit(1)
        
        # Embed
        secret_message = "This is hidden data that appears as noise!"
        print(f"Embedding: '{secret_message}'")
        steg.embed_data("original.wav", "modified.wav", secret_message)
        print("✅ Data embedded into 'modified.wav'")
        
        # Extract
        print("\nExtracting data...")
        extracted = steg.extract_data("original.wav", "modified.wav")
        print(f"✅ Extracted: '{extracted}'")
        print("="*60)