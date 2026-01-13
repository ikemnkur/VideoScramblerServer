import numpy as np
import wave
import hashlib
import struct
import zlib
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




# ============================================================
# Robust (lossy-tolerant) single-track steganography:
## STFT spread-spectrum watermarking (blind extraction)
# ============================================================

def _to_float32_pcm(x_int16: np.ndarray) -> np.ndarray:
    return (x_int16.astype(np.float32) / 32768.0)

def _from_float32_pcm(x: np.ndarray) -> np.ndarray:
    x = np.clip(x, -1.0, 1.0)
    return (x * 32767.0).astype(np.int16)

def stft_np(x: np.ndarray, n_fft: int = 2048, hop: int = 512, window: str = "hann"):
    """
    Minimal STFT (numpy-only) returning complex matrix [freq_bins, frames].
    """
    if window == "hann":
        win = np.hanning(n_fft).astype(np.float32)
    else:
        raise ValueError("Only hann window is supported currently.")

    # Pad so we can reconstruct cleanly
    pad = n_fft
    x_pad = np.pad(x.astype(np.float32), (pad, pad), mode="reflect")
    n_frames = 1 + (len(x_pad) - n_fft) // hop
    frames = np.lib.stride_tricks.as_strided(
        x_pad,
        shape=(n_frames, n_fft),
        strides=(x_pad.strides[0] * hop, x_pad.strides[0]),
        writeable=False
    )
    frames_win = frames * win[None, :]
    X = np.fft.rfft(frames_win, n=n_fft, axis=1)
    return X.T, win, pad

def istft_np(X: np.ndarray, win: np.ndarray, hop: int = 512, length: int | None = None, pad: int = 0):
    """
    Inverse STFT for stft_np output. X shape [freq_bins, frames].
    """
    n_fft = (win.shape[0])
    n_frames = X.shape[1]
    y_len = n_fft + hop * (n_frames - 1)
    y = np.zeros(y_len, dtype=np.float32)
    wsum = np.zeros(y_len, dtype=np.float32)

    frames = np.fft.irfft(X.T, n=n_fft, axis=1).astype(np.float32)
    for i in range(n_frames):
        start = i * hop
        y[start:start+n_fft] += frames[i] * win
        wsum[start:start+n_fft] += (win * win)

    # Normalize overlap-add
    nz = wsum > 1e-8
    y[nz] /= wsum[nz]

    # Remove padding applied in stft_np
    if pad > 0:
        y = y[pad:-pad]

    if length is not None:
        if len(y) < length:
            y = np.pad(y, (0, length - len(y)), mode="constant")
        else:
            y = y[:length]
    return y

class STFTSpreadSpectrumStegano:
    """
    Robust steganography via spread-spectrum modulation in the STFT domain.
    - Blind extraction (no original required), keyed by a secret string.
    - Designed to be more tolerant to lossy compression and small noise than sample-level methods.
    """

    # 16-bit preamble for sync (good autocorrelation; short for speed)
    PREAMBLE_BITS = [1,1,1,0, 1,0,0,1,  1,0,1,1, 0,0,1,0]  # 16 bits

    def __init__(
        self,
        key: str,
        n_fft: int = 2048,
        hop: int = 512,
        frames_per_bit: int = 4,
        alpha: float = 0.012,   # ~1.2% multiplicative perturbation in selected bins
        fmin_hz: float = 1000.0,
        fmax_hz: float = 4000.0,
        repeat: int = 3,        # repetition code for each payload bit
        start_offset_s: float = 0.50
    ):
        self.key = key
        self.n_fft = int(n_fft)
        self.hop = int(hop)
        self.frames_per_bit = int(frames_per_bit)
        self.alpha = float(alpha)
        self.fmin_hz = float(fmin_hz)
        self.fmax_hz = float(fmax_hz)
        self.repeat = int(repeat)
        self.start_offset_s = float(start_offset_s)

        if self.repeat < 1:
            raise ValueError("repeat must be >= 1")
        if self.frames_per_bit < 1:
            raise ValueError("frames_per_bit must be >= 1")

    def _pn_pattern(self, n_bins: int) -> np.ndarray:
        """
        Keyed +/-1 PN sequence for bins.
        """
        seed = int.from_bytes(hashlib.sha256(self.key.encode("utf-8")).digest()[:8], "big", signed=False) & 0xFFFFFFFF
        rng = np.random.RandomState(seed)
        pn = rng.choice([-1.0, 1.0], size=n_bins).astype(np.float32)
        return pn

    @staticmethod
    def _bytes_to_bits(b: bytes) -> list[int]:
        bits = []
        for byte in b:
            for i in range(7, -1, -1):
                bits.append((byte >> i) & 1)
        return bits

    @staticmethod
    def _bits_to_bytes(bits: list[int]) -> bytes:
        if len(bits) % 8 != 0:
            raise ValueError("bits length must be multiple of 8")
        out = bytearray()
        for i in range(0, len(bits), 8):
            byte = 0
            for j in range(8):
                byte = (byte << 1) | (bits[i+j] & 1)
            out.append(byte)
        return bytes(out)

    @staticmethod
    def _majority_vote(bits: list[int], repeat: int) -> list[int]:
        if repeat == 1:
            return bits
        if len(bits) % repeat != 0:
            # drop tail
            bits = bits[: len(bits) - (len(bits) % repeat)]
        out = []
        for i in range(0, len(bits), repeat):
            chunk = bits[i:i+repeat]
            out.append(1 if sum(chunk) >= (repeat/2) else 0)
        return out

    def _build_payload_bits(self, message: str) -> list[int]:
        data = message.encode("utf-8")
        if len(data) > 4095:
            raise ValueError("Message too long for this script (max 4095 bytes).")
        length16 = struct.pack(">H", len(data))
        crc32 = struct.pack(">I", zlib.crc32(data) & 0xFFFFFFFF)
        blob = length16 + crc32 + data
        bits = self._bytes_to_bits(blob)

        # repetition code
        if self.repeat > 1:
            bits = [b for bit in bits for b in ([bit] * self.repeat)]
        return bits

    def _parse_payload_bits(self, bits: list[int]) -> str | None:
        # undo repetition
        bits = self._majority_vote(bits, self.repeat)
        if len(bits) < (16+32):
            return None
        header_bits = bits[:48]  # 16 length + 32 crc
        header = self._bits_to_bytes(header_bits)
        msg_len = struct.unpack(">H", header[:2])[0]
        crc = struct.unpack(">I", header[2:6])[0]
        needed_bits = (48 + msg_len*8)
        if len(bits) < needed_bits:
            return None
        msg_bits = bits[48:48+msg_len*8]
        data = self._bits_to_bytes(msg_bits)
        if (zlib.crc32(data) & 0xFFFFFFFF) != crc:
            return None
        try:
            return data.decode("utf-8")
        except UnicodeDecodeError:
            return None

    def _select_bins(self, sample_rate: int) -> np.ndarray:
        freqs = np.fft.rfftfreq(self.n_fft, d=1.0/sample_rate)
        mask = (freqs >= self.fmin_hz) & (freqs <= self.fmax_hz)
        idx = np.where(mask)[0]
        if len(idx) < 32:
            raise ValueError("Selected frequency band is too narrow; choose wider fmin/fmax or larger n_fft.")
        return idx

    def embed(self, input_audio_path: str, output_audio_path: str, message: str, channel: int = 0):
        """
        Embed message into a single channel of the audio (default: channel 0).
        """
        wav_path, converted = convert_to_wav(input_audio_path)
        temp_files = [wav_path] if converted else []
        try:
            with wave.open(wav_path, "rb") as w:
                params = w.getparams()
                sr = params.framerate
                n_channels = params.nchannels
                frames = w.readframes(w.getnframes())
                audio_i16 = np.frombuffer(frames, dtype=np.int16)

            audio_i16 = audio_i16.reshape(-1, n_channels)
            x = _to_float32_pcm(audio_i16[:, channel])

            X, win, pad = stft_np(x, n_fft=self.n_fft, hop=self.hop)
            bins = self._select_bins(sr)
            pn = self._pn_pattern(len(bins))

            payload_bits = self._build_payload_bits(message)
            bits = self.PREAMBLE_BITS + payload_bits

            start_frame = int((self.start_offset_s * sr) / self.hop)
            frames_needed = len(bits) * self.frames_per_bit
            if start_frame + frames_needed >= X.shape[1]:
                dur_s = (X.shape[1] * self.hop) / sr
                need_s = ((start_frame + frames_needed) * self.hop) / sr
                raise ValueError(
                    f"Audio too short for payload. Duration={dur_s:.2f}s, need≈{need_s:.2f}s. "
                    "Shorten message or lower frames_per_bit / repeat."
                )

            # Modulate magnitudes in selected bins
            for bi, bit in enumerate(bits):
                s = 1.0 if bit == 1 else -1.0
                f0 = start_frame + bi * self.frames_per_bit
                f1 = f0 + self.frames_per_bit
                # Apply multiplicative perturbation with PN
                # Keep phase unchanged; only magnitude slightly biased
                mag = np.abs(X[bins, f0:f1])
                ph = np.angle(X[bins, f0:f1])
                mag2 = mag * (1.0 + (self.alpha * s * pn[:, None]))
                X[bins, f0:f1] = mag2 * np.exp(1j * ph)

            y = istft_np(X, win, hop=self.hop, length=len(x), pad=pad)

            # Put back into audio
            out = audio_i16.astype(np.int32)
            out[:, channel] = _from_float32_pcm(y).astype(np.int32)
            out = np.clip(out, -32768, 32767).astype(np.int16)

            with wave.open(output_audio_path, "wb") as w:
                w.setparams(params)
                w.writeframes(out.tobytes())

            print(f"✅ Embedded {len(message.encode('utf-8'))} bytes using stft_ss into: {output_audio_path}")

        finally:
            for t in temp_files:
                try:
                    os.remove(t)
                except Exception:
                    pass

    def extract(self, audio_path: str, channel: int = 0, max_search_seconds: float = 30.0) -> str | None:
        """
        Blind extraction from a single audio file.
        Searches for the preamble in the first `max_search_seconds`.
        """
        wav_path, converted = convert_to_wav(audio_path)
        temp_files = [wav_path] if converted else []
        try:
            with wave.open(wav_path, "rb") as w:
                params = w.getparams()
                sr = params.framerate
                n_channels = params.nchannels
                frames = w.readframes(w.getnframes())
                audio_i16 = np.frombuffer(frames, dtype=np.int16)

            audio_i16 = audio_i16.reshape(-1, n_channels)
            x = _to_float32_pcm(audio_i16[:, channel])

            X, win, pad = stft_np(x, n_fft=self.n_fft, hop=self.hop)
            bins = self._select_bins(sr)
            pn = self._pn_pattern(len(bins))

            # helper to decode one bit at a given bit index (frame start)
            def decode_bit_at(frame_start: int) -> float:
                f0 = frame_start
                f1 = f0 + self.frames_per_bit
                if f1 > X.shape[1]:
                    return 0.0
                # Use log-magnitude for better codec robustness
                mag = np.abs(X[bins, f0:f1]) + 1e-9
                feat = np.log(mag)
                # correlation with PN across bins, sum across frames
                score = float(np.sum((pn[:, None] * feat)))
                return score

            # Search window in frames
            max_frames = int((max_search_seconds * sr) / self.hop)
            max_frames = min(max_frames, X.shape[1] - (len(self.PREAMBLE_BITS) * self.frames_per_bit) - 1)
            if max_frames <= 1:
                return None

            # Precompute bit scores for candidate starts in steps of frames_per_bit/2 for robustness
            step = max(1, self.frames_per_bit // 2)

            best = None  # (matches, start_frame)
            for start_frame in range(0, max_frames, step):
                # decode preamble bits
                scores = []
                for i in range(len(self.PREAMBLE_BITS)):
                    scores.append(decode_bit_at(start_frame + i * self.frames_per_bit))
                # Convert to bits by sign
                cand = [1 if s >= 0 else 0 for s in scores]
                matches = sum(1 for a, b in zip(cand, self.PREAMBLE_BITS) if a == b)
                if best is None or matches > best[0]:
                    best = (matches, start_frame)

                # early exit if strong match
                if matches >= len(self.PREAMBLE_BITS) - 1:
                    best = (matches, start_frame)
                    break

            if best is None or best[0] < int(0.80 * len(self.PREAMBLE_BITS)):
                print("❌ stft_ss: preamble not found (try increasing alpha/frames_per_bit, or search window).")
                return None

            _, start_frame = best
            payload_start = start_frame + len(self.PREAMBLE_BITS) * self.frames_per_bit

            # Decode header first to know how many bits to read.
            # But header bits are repetition-coded; read enough for 48 * repeat bits
            hdr_bits_needed = 48 * self.repeat
            hdr_scores = []
            for i in range(hdr_bits_needed):
                bit_i_frame = payload_start + i * self.frames_per_bit
                hdr_scores.append(decode_bit_at(bit_i_frame))
            hdr_bits = [1 if s >= 0 else 0 for s in hdr_scores]

            # Try to parse header; if fail, try flipping threshold (rare)
            tmp = self._majority_vote(hdr_bits, self.repeat)
            if len(tmp) < 48:
                return None
            header = self._bits_to_bytes(tmp[:48])
            msg_len = struct.unpack(">H", header[:2])[0]

            total_payload_bits = (48 + msg_len*8) * self.repeat
            payload_scores = []
            for i in range(total_payload_bits):
                bit_i_frame = payload_start + i * self.frames_per_bit
                if bit_i_frame + self.frames_per_bit > X.shape[1]:
                    break
                payload_scores.append(decode_bit_at(bit_i_frame))
            payload_bits = [1 if s >= 0 else 0 for s in payload_scores]

            msg = self._parse_payload_bits(payload_bits)
            if msg is None:
                print("❌ stft_ss: failed CRC/parse (try increasing alpha/frames_per_bit/repeat).")
                return None

            print("✅ stft_ss: extracted message successfully.")
            return msg

        finally:
            for t in temp_files:
                try:
                    os.remove(t)
                except Exception:
                    pass



def main():
    parser = argparse.ArgumentParser(
        description=("Audio Steganography - choose a scheme:\\n  - diff_linear: legacy sample-difference method (NOT robust to recompression)\\n  - stft_ss: STFT spread-spectrum (more tolerant to lossy compression / small noise)\\n"),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:

  # (Recommended) Robust, blind extraction (no original needed):
  python3 audio_stegano.py --scheme stft_ss --mode embed \
    --original input.wav --output watermarked.wav \
    --key "my secret key" --data "Hello"

  python3 audio_stegano.py --scheme stft_ss --mode extract \
    --modified watermarked.wav --key "my secret key"

  # Legacy (requires original + modified; fragile under recompression):
  python3 audio_stegano.py --scheme diff_linear --mode embed \
    --original original.wav --output hidden.wav --data "Secret message"

  python3 audio_stegano.py --scheme diff_linear --mode extract \
    --original original.wav --modified hidden.wav
        """
    )

    parser.add_argument("--scheme", choices=["diff_linear", "stft_ss"], default="diff_linear",
                        help="Steganography scheme to use (default: diff_linear). Use stft_ss for robustness.")

    parser.add_argument("--mode", choices=["embed", "extract"], required=True,
                        help="Operation mode: embed or extract")

    # Common I/O
    parser.add_argument("--original", help="Input/original audio file (required for embed; also required for diff_linear extract)")
    parser.add_argument("--modified", help="Modified/audio-to-extract-from file (required for extract)")
    parser.add_argument("--output", help="Output audio file (required for embed)")
    parser.add_argument("--output-file", help="Save extracted data to a file (extract mode)")

    # Payload
    parser.add_argument("--data", help="Text data to hide (embed mode)")
    parser.add_argument("--data-file", help="Path to text file containing data to hide (alternative to --data)")

    # Legacy options (diff_linear)
    parser.add_argument("--strength", type=int, default=100,
                        help="(diff_linear) Strength of the noise embedding (default: 100)")
    parser.add_argument("--spacing", type=int, default=4,
                        help="(diff_linear) Spacing between embedded samples (default: 4)")
    parser.add_argument("--redundancy", type=int, default=3,
                        help="(diff_linear) Redundancy factor (default: 3)")

    # Robust options (stft_ss)
    parser.add_argument("--key", help="(stft_ss) Secret key used to embed/extract (required for stft_ss)")
    parser.add_argument("--alpha", type=float, default=0.012,
                        help="(stft_ss) Modulation strength (default: 0.012 ~ 1.2%%)")
    parser.add_argument("--n-fft", type=int, default=2048, dest="n_fft",
                        help="(stft_ss) STFT FFT size (default: 2048)")
    parser.add_argument("--hop", type=int, default=512,
                        help="(stft_ss) STFT hop size (default: 512)")
    parser.add_argument("--frames-per-bit", type=int, default=4, dest="frames_per_bit",
                        help="(stft_ss) STFT frames per bit (default: 4)")
    parser.add_argument("--repeat", type=int, default=3,
                        help="(stft_ss) Bit repetition factor for FEC (default: 3)")
    parser.add_argument("--fmin", type=float, default=1000.0,
                        help="(stft_ss) Min frequency band in Hz (default: 1000)")
    parser.add_argument("--fmax", type=float, default=4000.0,
                        help="(stft_ss) Max frequency band in Hz (default: 4000)")
    parser.add_argument("--channel", type=int, default=0,
                        help="(stft_ss) Channel index to watermark/extract (default: 0)")
    parser.add_argument("--search-seconds", type=float, default=30.0, dest="search_seconds",
                        help="(stft_ss) Seconds to search for preamble during extraction (default: 30)")

    # Back-compat / unused
    parser.add_argument("--seed", help="(Deprecated) Kept for backward compatibility; not used.")

    args = parser.parse_args()

    # Basic validation
    if args.mode == "embed":
        if not args.original:
            print("Error: --original is required for embed mode", file=sys.stderr)
            sys.exit(1)
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

    # Load payload if needed
    payload = None
    if args.mode == "embed":
        if args.data_file:
            if not os.path.isfile(args.data_file):
                print(f"Error: Data file not found: {args.data_file}", file=sys.stderr)
                sys.exit(1)
            with open(args.data_file, "r", encoding="utf-8") as f:
                payload = f.read()
        else:
            payload = args.data

    # Check file paths that must exist
    if args.mode == "embed" and not os.path.isfile(args.original):
        print(f"Error: Input audio file not found: {args.original}", file=sys.stderr)
        sys.exit(1)

    if args.mode == "extract" and not os.path.isfile(args.modified):
        print(f"Error: Audio file not found: {args.modified}", file=sys.stderr)
        sys.exit(1)

    try:
        if args.scheme == "diff_linear":
            steg = AudioStegano(strength=args.strength, spacing=args.spacing, redundancy=args.redundancy)

            if args.mode == "embed":
                steg.embed_data(args.original, args.output, payload)
                print(f"✅ Wrote: {args.output}")

            else:
                if not args.original:
                    print("Error: --original is required for diff_linear extract mode", file=sys.stderr)
                    sys.exit(1)
                if not os.path.isfile(args.original):
                    print(f"Error: Original audio file not found: {args.original}", file=sys.stderr)
                    sys.exit(1)
                extracted = steg.extract_data(args.original, args.modified)
                if extracted is None:
                    sys.exit(2)
                print(extracted)
                if args.output_file:
                    with open(args.output_file, "w", encoding="utf-8") as f:
                        f.write(extracted)
                    print(f"✅ Saved extracted data to: {args.output_file}")

        else:  # stft_ss
            if not args.key:
                print("Error: --key is required for stft_ss", file=sys.stderr)
                sys.exit(1)

            ss = STFTSpreadSpectrumStegano(
                key=args.key,
                n_fft=args.n_fft,
                hop=args.hop,
                frames_per_bit=args.frames_per_bit,
                alpha=args.alpha,
                fmin_hz=args.fmin,
                fmax_hz=args.fmax,
                repeat=args.repeat
            )

            if args.mode == "embed":
                ss.embed(args.original, args.output, payload, channel=args.channel)
                print(f"✅ Wrote: {args.output}")
            else:
                extracted = ss.extract(args.modified, channel=args.channel, max_search_seconds=args.search_seconds)
                if extracted is None:
                    sys.exit(2)
                print(extracted)
                if args.output_file:
                    with open(args.output_file, "w", encoding="utf-8") as f:
                        f.write(extracted)
                    print(f"✅ Saved extracted data to: {args.output_file}")

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
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