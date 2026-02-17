import numpy as np
from scipy.io import wavfile
from scipy.signal import sine_wave
import librosa
import soundfile as sf

def encode_watermark(audio_file, number, output_file):
    """
    Watermark an audio file with a number (0-9999) using frequency tones.
    
    Args:
        audio_file: Input audio file path
        number: Number to encode (0-9999)
        output_file: Output audio file path
    """
    # Load audio
    y, sr = librosa.load(audio_file, sr=None)
    
    # Convert number to 4-digit string (pad with zeros)
    digits = str(number).zfill(4)
    
    # Frequency-to-digit mapping
    frequencies = {0: 30, 1: 40, 2: 50, 3: 60}  # Hz
    durations = {0: 0.1, 1: 0.3, 2: 0.5, 3: 0.7}  # seconds
    
    # Create watermark signal
    watermark = np.array([])
    
    # Process every 5 seconds
    segment_length = int(5 * sr)
    num_segments = int(np.ceil(len(y) / segment_length))
    
    watermarked = y.copy()
    
    for seg_idx in range(num_segments):
        # Get digit for this segment (cycle through 4 digits)
        digit = int(digits[seg_idx % 4])
        
        # Generate tone for this digit
        freq = frequencies[digit]
        duration = durations[digit]
        samples = int(duration * sr)
        t = np.linspace(0, duration, samples)
        tone = 0.1 * np.sin(2 * np.pi * freq * t)
        
        # Add tone at segment position
        start_idx = seg_idx * segment_length
        end_idx = min(start_idx + samples, len(watermarked))
        tone_end = end_idx - start_idx
        
        watermarked[start_idx:end_idx] += tone[:tone_end]
    
    # Normalize to prevent clipping
    max_val = np.max(np.abs(watermarked))
    if max_val > 1.0:
        watermarked = watermarked / max_val
    
    # Save output
    sf.write(output_file, watermarked, sr)
    print(f"Watermarked audio saved to {output_file}")

# Usage
if __name__ == "__main__":
    encode_watermark("input_audio.wav", 1357, "output_watermarked.wav")