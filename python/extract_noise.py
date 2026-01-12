#!/usr/bin/env python3
"""
Extract the noise/difference between original and modified audio files.
This creates a new audio file containing only the embedded data (noise).
"""

import numpy as np
import wave
import argparse
import sys
import os
import subprocess
import tempfile

def convert_to_wav(input_path):
    """
    Convert audio file to WAV format using FFmpeg if it's not already WAV.
    Returns (wav_path, was_converted) tuple.
    """
    if input_path.lower().endswith('.wav'):
        return (input_path, False)
    
    print(f"🔄 Converting {os.path.basename(input_path)} to WAV format...")
    
    # Create temporary WAV file
    temp_wav = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
    temp_wav_path = temp_wav.name
    temp_wav.close()
    
    # Convert using FFmpeg
    cmd = [
        'ffmpeg', '-i', input_path,
        '-ar', '44100',  # 44.1kHz sample rate
        '-ac', '1',      # mono
        '-sample_fmt', 's16',  # 16-bit signed integer
        '-y',            # overwrite output
        temp_wav_path
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode != 0:
        os.unlink(temp_wav_path)
        raise RuntimeError(f"FFmpeg conversion failed: {result.stderr}")
    
    print(f"✅ Converted to WAV: {temp_wav_path}")
    return (temp_wav_path, True)

def extract_noise(original_path, modified_path, output_path):
    """
    Extract noise by subtracting original from modified audio.
    Creates a new audio file with only the difference (embedded data).
    """
    print(f"\n{'='*70}")
    print(f"EXTRACTING NOISE FROM AUDIO FILES")
    print(f"{'='*70}\n")
    
    # Convert audio files to WAV if needed
    original_wav, orig_converted = convert_to_wav(original_path)
    modified_wav, mod_converted = convert_to_wav(modified_path)
    temp_files = []
    if orig_converted:
        temp_files.append(original_wav)
    if mod_converted:
        temp_files.append(modified_wav)
    
    try:
        # Read original audio
        print(f"Reading original: {original_path}")
        with wave.open(original_wav, 'rb') as wav:
            params_orig = wav.getparams()
            frames_orig = wav.readframes(params_orig.nframes)
            original_data = np.frombuffer(frames_orig, dtype=np.int16).astype(np.int32)
        
        print(f"  Channels: {params_orig.nchannels}")
        print(f"  Sample rate: {params_orig.framerate} Hz")
        print(f"  Samples: {len(original_data)}")
        
        # Read modified audio
        print(f"\nReading modified: {modified_path}")
        with wave.open(modified_wav, 'rb') as wav:
            params_mod = wav.getparams()
            frames_mod = wav.readframes(params_mod.nframes)
            modified_data = np.frombuffer(frames_mod, dtype=np.int16).astype(np.int32)
        
        print(f"  Channels: {params_mod.nchannels}")
        print(f"  Sample rate: {params_mod.framerate} Hz")
        print(f"  Samples: {len(modified_data)}")
        
        # Verify compatibility
        if len(original_data) != len(modified_data):
            print(f"\n⚠️  WARNING: Audio files have different lengths!")
            print(f"  Original: {len(original_data)} samples")
            print(f"  Modified: {len(modified_data)} samples")
            print(f"  Truncating to shorter length...")
            min_len = min(len(original_data), len(modified_data))
            original_data = original_data[:min_len]
            modified_data = modified_data[:min_len]
        
        if params_orig.framerate != params_mod.framerate:
            print(f"\n⚠️  WARNING: Different sample rates!")
            print(f"  Original: {params_orig.framerate} Hz")
            print(f"  Modified: {params_mod.framerate} Hz")
        
        # Calculate difference (this is the embedded noise/data)
        print(f"\nCalculating difference...")
        diff = modified_data - original_data
        
        # Statistics
        non_zero = np.count_nonzero(diff)
        max_diff = np.max(np.abs(diff))
        mean_diff = np.mean(np.abs(diff[diff != 0])) if non_zero > 0 else 0
        
        print(f"\n{'='*70}")
        print(f"NOISE STATISTICS")
        print(f"{'='*70}")
        print(f"  Total samples: {len(diff)}")
        print(f"  Modified samples: {non_zero} ({non_zero/len(diff)*100:.2f}%)")
        print(f"  Unchanged samples: {len(diff) - non_zero}")
        print(f"  Max difference: ±{max_diff}")
        print(f"  Mean difference: {mean_diff:.2f}")
        
        # Show distribution of differences
        print(f"\n  Difference distribution:")
        unique, counts = np.unique(diff, return_counts=True)
        for val, count in sorted(zip(unique, counts), key=lambda x: -x[1])[:10]:
            if val != 0:
                print(f"    {val:+4d}: {count:8d} samples ({count/len(diff)*100:.2f}%)")
        
        # Amplify the noise for audibility (optional)
        # Scale up by 100x so it's actually audible
        amplified_diff = np.clip(diff * 100, -32768, 32767).astype(np.int16)
        
        # Save noise as audio file
        print(f"\nSaving noise to: {output_path}")
        with wave.open(output_path, 'wb') as wav:
            wav.setparams(params_orig)
            wav.writeframes(amplified_diff.tobytes())
        
        # Also save raw (non-amplified) noise
        raw_output_path = output_path.replace('.wav', '_raw.wav')
        print(f"Saving raw noise to: {raw_output_path}")
        raw_diff = np.clip(diff, -32768, 32767).astype(np.int16)
        with wave.open(raw_output_path, 'wb') as wav:
            wav.setparams(params_orig)
            wav.writeframes(raw_diff.tobytes())
        
        # Show positions of first 20 non-zero differences
        print(f"\n{'='*70}")
        print(f"FIRST 20 MODIFIED POSITIONS")
        print(f"{'='*70}")
        
        non_zero_indices = np.where(diff != 0)[0]
        for i, idx in enumerate(non_zero_indices[:20]):
            print(f"  Position {idx:8d}: {diff[idx]:+4d}")
        
        if len(non_zero_indices) > 20:
            print(f"  ... and {len(non_zero_indices) - 20} more")
        
        print(f"\n{'='*70}")
        print(f"✅ SUCCESS!")
        print(f"{'='*70}")
        print(f"  Amplified noise (100x): {output_path}")
        print(f"  Raw noise (1x):         {raw_output_path}")
        print(f"\nYou can listen to the amplified noise to hear the embedded data.")
        print(f"The raw noise file shows the actual amplitude of changes.\n")
        
        return True
        
    finally:
        # Clean up temporary converted files
        for temp_file in temp_files:
            try:
                os.unlink(temp_file)
                print(f"🗑️  Cleaned up temporary file: {temp_file}")
            except:
                pass


def main():
    parser = argparse.ArgumentParser(
        description="Extract noise/difference between original and modified audio files",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Example:
  python3 extract_noise.py --original original.wav --modified hidden.wav --output noise.wav
        """
    )
    
    parser.add_argument(
        "--original",
        required=True,
        help="Path to the original audio file (WAV format)"
    )
    
    parser.add_argument(
        "--modified",
        required=True,
        help="Path to the modified audio file with embedded data (WAV format)"
    )
    
    parser.add_argument(
        "--output",
        default="noise.wav",
        help="Path for output noise file (default: noise.wav)"
    )
    
    args = parser.parse_args()
    
    # Check if files exist
    if not os.path.isfile(args.original):
        print(f"Error: Original file not found: {args.original}", file=sys.stderr)
        sys.exit(1)
    
    if not os.path.isfile(args.modified):
        print(f"Error: Modified file not found: {args.modified}", file=sys.stderr)
        sys.exit(1)
    
    try:
        success = extract_noise(args.original, args.modified, args.output)
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
