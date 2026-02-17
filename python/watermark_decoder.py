import argparse
import random

import numpy as np
import pydub
from scipy.signal import butter, filtfilt

# Function to decode watermark from audio

def decode_watermark(
    input_file,
    interval_seconds=5,
    window_seconds=5.5,
    base_length=0.1,
    sample_intervals=2,
    seed=None,
    lowpass_hz=100,
    frame_ms=100,
    threshold_factor=1.8,
):
    audio = pydub.AudioSegment.from_file(input_file).set_channels(1)
    frame_rate = audio.frame_rate
    duration = len(audio) / 1000  # duration in seconds

    samples = np.array(audio.get_array_of_samples())
    if audio.sample_width == 2:
        samples = samples.astype(np.float32) / 32768.0
    elif audio.sample_width == 4:
        samples = samples.astype(np.float32) / 2147483648.0
    else:
        samples = samples.astype(np.float32)

    if duration < interval_seconds:
        return None

    total_intervals = int(duration // interval_seconds)
    rng = random.Random(seed)
    selected = rng.sample(range(total_intervals), k=min(sample_intervals, total_intervals))

    decoded_candidates = []
    for idx in selected:
        start_time = idx * interval_seconds
        end_time = min(start_time + window_seconds, duration)
        start_idx = int(start_time * frame_rate)
        end_idx = int(end_time * frame_rate)
        segment = samples[start_idx:end_idx]
        if len(segment) < frame_rate:
            continue

        segment = lowpass_filter(segment, frame_rate, lowpass_hz)
        digits = decode_segment_digits(
            segment,
            frame_rate,
            base_length,
            frame_ms,
            threshold_factor,
        )
        if digits is not None:
            decoded_candidates.append(digits)

    if not decoded_candidates:
        return None

    return majority_vote(decoded_candidates)


def lowpass_filter(samples, frame_rate, cutoff_hz):
    if cutoff_hz <= 0 or cutoff_hz >= frame_rate / 2:
        return samples
    b, a = butter(6, cutoff_hz / (frame_rate / 2), btype="low")
    return filtfilt(b, a, samples)


def decode_segment_digits(segment, frame_rate, base_length, frame_ms, threshold_factor):
    digits = []
    for freq in [30, 40, 50, 60]:
        duration = estimate_tone_duration(
            segment,
            frame_rate,
            freq,
            frame_ms,
            threshold_factor,
        )
        digit = duration_to_digit(duration, base_length)
        if digit is None:
            return None
        digits.append(digit)
    return digits


def estimate_tone_duration(segment, frame_rate, target_freq, frame_ms, threshold_factor):
    frame_size = int(frame_rate * frame_ms / 1000)
    if frame_size <= 0:
        return 0.0

    amplitudes = []
    for start in range(0, len(segment) - frame_size + 1, frame_size):
        frame = segment[start : start + frame_size]
        amplitudes.append(goertzel_power(frame, frame_rate, target_freq))

    if not amplitudes:
        return 0.0

    amplitudes = np.array(amplitudes, dtype=np.float32)
    baseline = np.median(amplitudes)
    threshold = baseline * threshold_factor
    mask = amplitudes > threshold

    longest = 0
    current = 0
    for value in mask:
        if value:
            current += 1
            longest = max(longest, current)
        else:
            current = 0

    return longest * (frame_ms / 1000.0)


def goertzel_power(frame, frame_rate, target_freq):
    k = int(0.5 + (len(frame) * target_freq) / frame_rate)
    omega = (2.0 * np.pi * k) / len(frame)
    coeff = 2.0 * np.cos(omega)
    s_prev = 0.0
    s_prev2 = 0.0
    for sample in frame:
        s = sample + coeff * s_prev - s_prev2
        s_prev2 = s_prev
        s_prev = s
    power = s_prev2**2 + s_prev**2 - coeff * s_prev * s_prev2
    return power


def duration_to_digit(duration, base_length):
    if duration <= 0:
        return None
    digit = int(round(duration / base_length)) - 1
    if digit < 0 or digit > 9:
        return None
    return digit


def majority_vote(candidates):
    candidates = np.array(candidates)
    result = []
    for i in range(candidates.shape[1]):
        values, counts = np.unique(candidates[:, i], return_counts=True)
        result.append(int(values[np.argmax(counts)]))
    return result

def parse_args():
    parser = argparse.ArgumentParser(description="Decode a numeric watermark from an audio file.")
    parser.add_argument("input", help="Path to watermarked audio file.")
    parser.add_argument(
        "--interval",
        type=int,
        default=5,
        help="Interval in seconds between watermark inserts (default: 5).",
    )
    parser.add_argument(
        "--window",
        type=float,
        default=5.5,
        help="Window length in seconds for each analyzed interval (default: 5.5).",
    )
    parser.add_argument(
        "--base-length",
        type=float,
        default=0.1,
        help="Base length in seconds per digit step (default: 0.1).",
    )
    parser.add_argument(
        "--samples",
        type=int,
        default=2,
        help="Number of random intervals to sample (default: 2).",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="Random seed for interval selection (default: None).",
    )
    parser.add_argument(
        "--lowpass",
        type=float,
        default=100,
        help="Low-pass filter cutoff in Hz (default: 100).",
    )
    parser.add_argument(
        "--frame-ms",
        type=int,
        default=100,
        help="Frame size in milliseconds for analysis (default: 100).",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=1.8,
        help="Threshold factor above median power (default: 1.8).",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    decoded = decode_watermark(
        args.input,
        interval_seconds=args.interval,
        window_seconds=args.window,
        base_length=args.base_length,
        sample_intervals=args.samples,
        seed=args.seed,
        lowpass_hz=args.lowpass,
        frame_ms=args.frame_ms,
        threshold_factor=args.threshold,
    )
    print(decoded)


if __name__ == "__main__":
    main()