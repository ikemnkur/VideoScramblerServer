import argparse
import numpy as np
import pydub

# Function to encode watermark into audio

def encode_watermark(
    input_file,
    number,
    output_file,
    interval_seconds=5,
    base_length=0.1,
    buffer_seconds=0.1,
):
    # Open the input audio file
    audio = pydub.AudioSegment.from_file(input_file)
    frame_rate = audio.frame_rate
    duration = len(audio) / 1000  # duration in seconds
    total_samples = int(duration * frame_rate)
    watermark_audio = np.zeros(total_samples, dtype=np.float32)

    # Convert number to a list of digits
    digits = [int(d) for d in str(number).zfill(4)]

    # Generate watermark tones once every interval_seconds
    for i in range(0, int(duration), interval_seconds):
        cursor = float(i)
        interval_end = float(i + interval_seconds)
        for j, freq in enumerate([30, 40, 50, 60]):
            length = (digits[j] + 1) * base_length  # length in seconds
            if cursor + length > interval_end:
                break
            start_idx = int(cursor * frame_rate)
            end_idx = min(start_idx + int(frame_rate * length), total_samples)
            if end_idx <= start_idx:
                continue
            t = np.linspace(0, (end_idx - start_idx) / frame_rate, end_idx - start_idx, False)
            tone = 0.5 * np.sin(2 * np.pi * freq * t)
            watermark_audio[start_idx:end_idx] += tone
            cursor += length + buffer_seconds

    watermark_audio = np.clip(watermark_audio, -1.0, 1.0)
    watermark_audio_int16 = (watermark_audio * 32767).astype(np.int16)

    # Create a new audio segment from the watermark
    watermark_segment = pydub.AudioSegment(
        watermark_audio_int16.tobytes(),
        frame_rate=frame_rate,
        sample_width=2,
        channels=1,
    ).apply_gain(-20)  # ~10% intensity

    # Combine original audio with watermark
    combined = audio.overlay(watermark_segment)

    # Export the combined audio to mp3
    combined.export(output_file, format='mp3')


def parse_args():
    parser = argparse.ArgumentParser(description="Encode a numeric watermark into an audio file.")
    parser.add_argument("input", help="Path to input audio file.")
    parser.add_argument("number", type=int, help="Number to encode (0-9999).")
    parser.add_argument(
        "-o",
        "--output",
        default="watermarked_audio.mp3",
        help="Output MP3 file path (default: watermarked_audio.mp3).",
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=5,
        help="Interval in seconds between watermark inserts (default: 5).",
    )
    parser.add_argument(
        "--base-length",
        type=float,
        default=0.1,
        help="Base length in seconds per digit step (default: 0.1).",
    )
    parser.add_argument(
        "--buffer",
        type=float,
        default=0.1,
        help="Silence between tones in seconds (default: 0.1).",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    if not (0 <= args.number <= 9999):
        raise ValueError("Number must be in range 0-9999.")
    encode_watermark(
        args.input,
        args.number,
        args.output,
        interval_seconds=args.interval,
        base_length=args.base_length,
        buffer_seconds=args.buffer,
    )


if __name__ == "__main__":
    main()