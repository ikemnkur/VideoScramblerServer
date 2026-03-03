import numpy as np
import math

def goertzel_magnitude_squared(samples, sample_rate, target_frequency):
    """
    Calculates the magnitude squared of a specific frequency in a signal using the Goertzel algorithm.

    Args:
        samples (list or np.array): The input signal samples (time domain).
        sample_rate (int): The sampling rate of the signal (Hz).
        target_frequency (float): The frequency to detect (Hz).

    Returns:
        float: The magnitude squared (power) of the target frequency component.
    """
    N = len(samples)
    if N == 0:
        return 0
    
    # Calculate the frequency index 'k' for the target frequency
    k = int(0.5 + (N * target_frequency / sample_rate))
    
    # Calculate the normalized frequency
    normalized_frequency = 2.0 * math.pi * k / N
    
    # Calculate the coefficient for the second-order filter
    coeff = 2.0 * math.cos(normalized_frequency)
    
    # Initialize the state variables
    s_prev = 0.0
    s_prev2 = 0.0
    
    # Run the recursive filter
    for sample in samples:
        s = sample + coeff * s_prev - s_prev2
        s_prev2 = s_prev
        s_prev = s
        
    # Post-processing to get the magnitude squared
    # The magnitude squared is calculated as:
    # magnitude_squared = s_prev^2 + s_prev2^2 - coeff * s_prev * s_prev2
    magnitude_squared = s_prev**2 + s_prev2**2 - coeff * s_prev * s_prev2
    
    # You can also return the magnitude (amplitude) by taking the square root
    # magnitude = math.sqrt(magnitude_squared)
    
    return magnitude_squared

# --- Example Usage ---
sample_rate = 8000 # Typical rate for DTMF
N = 400            # Block size (determines frequency resolution)
frequencies_to_check = [697, 770, 852, 941, 1209, 1336, 1477, 1633] # DTMF tones
target_frequency = 1209

# Generate a test signal containing the target frequency
t = np.arange(N) / sample_rate
test_signal = np.sin(2 * np.pi * target_frequency * t) + 0.5 * np.sin(2 * np.pi * 500 * t) # target freq + noise

# Calculate the power of the target frequency
power = goertzel_magnitude_squared(test_signal, sample_rate, target_frequency)

print(f"Power at {target_frequency} Hz: {power}")

# Check power at an unrelated frequency
power_noise = goertzel_magnitude_squared(test_signal, sample_rate, 500)
print(f"Power at 500 Hz: {power_noise}")
