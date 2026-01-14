import numpy as np
import wave
import struct
import argparse
import os
import tempfile
import subprocess
import zlib


def convert_to_wav(input_path):
    """Convert any audio format to WAV using ffmpeg. Returns (wav_path, was_converted)."""
    if input_path.lower().endswith('.wav'):
        return input_path, False

    temp_wav = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
    temp_wav_path = temp_wav.name
    temp_wav.close()

    cmd = [
        'ffmpeg', '-i', input_path,
        '-ar', '44100',
        '-ac', '1',
        '-sample_fmt', 's16',
        '-y',
        temp_wav_path
    ]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    except FileNotFoundError:
        try:
            os.unlink(temp_wav_path)
        except Exception:
            pass
        raise RuntimeError(
            "FFmpeg not found. Install it (e.g., sudo apt-get install ffmpeg)."
        )
    except subprocess.TimeoutExpired:
        try:
            os.unlink(temp_wav_path)
        except Exception:
            pass
        raise RuntimeError("FFmpeg conversion timed out (>120s).")

    if r.returncode != 0:
        try:
            os.unlink(temp_wav_path)
        except Exception:
            pass
        raise RuntimeError(f"FFmpeg conversion failed: {r.stderr}")

    return temp_wav_path, True


def read_wav_mono_i16(path):
    """Read WAV as mono int16 numpy array + params."""
    with wave.open(path, 'rb') as w:
        params = w.getparams()
        frames = w.readframes(params.nframes)
        data = np.frombuffer(frames, dtype=np.int16)
        if params.nchannels > 1:
            data = data.reshape(-1, params.nchannels).mean(axis=1).astype(np.int16)
        return data, params


def write_wav_from_i16(path, data_i16, params, force_mono=True):
    """Write mono int16 WAV. If source params are multi-channel, writes mono by default."""
    if force_mono:
        out_params = (1, params.sampwidth, params.framerate, len(data_i16), params.comptype, params.compname)
    else:
        out_params = params

    with wave.open(path, 'wb') as w:
        w.setparams(out_params)
        w.writeframes(data_i16.astype(np.int16).tobytes())


def stft(x, n_fft=2048, hop=512):
    """Simple STFT. Returns complex matrix [frames, freq_bins]."""
    x = x.astype(np.float32)
    win = np.hanning(n_fft).astype(np.float32)
    n = len(x)
    if n < n_fft:
        pad = n_fft - n
        x = np.pad(x, (0, pad))
        n = len(x)
    frames = 1 + (n - n_fft) // hop
    X = np.empty((frames, n_fft // 2 + 1), dtype=np.complex64)
    for i in range(frames):
        start = i * hop
        seg = x[start:start + n_fft]
        seg = seg * win
        X[i] = np.fft.rfft(seg)
    return X


def istft(X, n_fft=2048, hop=512, length=None):
    """Simple ISTFT (overlap-add)."""
    win = np.hanning(n_fft).astype(np.float32)
    frames = X.shape[0]
    out_len = n_fft + (frames - 1) * hop
    y = np.zeros(out_len, dtype=np.float32)
    wsum = np.zeros(out_len, dtype=np.float32)

    for i in range(frames):
        start = i * hop
        seg = np.fft.irfft(X[i], n=n_fft).astype(np.float32)
        y[start:start + n_fft] += seg * win
        wsum[start:start + n_fft] += win * win

    nz = wsum > 1e-8
    y[nz] /= wsum[nz]
    if length is not None:
        y = y[:length]
    return y


def energy_envelope(x, win=2048, hop=512):
    """Short-time energy envelope."""
    x = x.astype(np.float32)
    n = len(x)
    if n < win:
        x = np.pad(x, (0, win - n))
        n = len(x)
    frames = 1 + (n - win) // hop
    env = np.empty(frames, dtype=np.float32)
    w = np.hanning(win).astype(np.float32)
    for i in range(frames):
        s = i * hop
        seg = x[s:s + win] * w
        env[i] = np.sqrt(np.mean(seg * seg) + 1e-12)
    # normalize
    env = (env - env.mean()) / (env.std() + 1e-8)
    return env


def best_lag(a, b, max_lag_frames=400):
    """Find best lag (in frames) aligning b to a via cross-correlation."""
    # search lags in [-max, +max]
    best = (0, -1e9)
    for lag in range(-max_lag_frames, max_lag_frames + 1):
        if lag < 0:
            aa = a[-lag:]
            bb = b[:len(aa)]
        elif lag > 0:
            aa = a[:-lag]
            bb = b[lag:lag + len(aa)]
        else:
            aa = a
            bb = b[:len(a)]
        if len(aa) < 16:
            continue
        score = float(np.dot(aa, bb) / (len(aa) + 1e-9))
        if score > best[1]:
            best = (lag, score)
    return best[0]


def bytes_to_bits(b: bytes):
    out = []
    for byte in b:
        for i in range(7, -1, -1):
            out.append((byte >> i) & 1)
    return np.array(out, dtype=np.int8)


def bits_to_bytes(bits: np.ndarray):
    bits = bits.astype(np.int8)
    n = (len(bits) // 8) * 8
    bits = bits[:n]
    out = bytearray()
    for i in range(0, n, 8):
        v = 0
        for j in range(8):
            v = (v << 1) | int(bits[i + j])
        out.append(v)
    return bytes(out)


class HybridSTFTDiff:
    """Reference-based (hybrid) embedding/extraction using STFT magnitude differences.

    - Embed modifies STFT magnitudes in a frequency band using a deterministic bin set.
    - Extract compares original vs modified in the same STFT domain and votes bits.
    - No key required (optional key changes the bin selection only).
    """

    def __init__(
        self,
        n_fft=2048,
        hop=512,
        f_lo=1800,
        f_hi=5200,
        bins_per_bit=24,
        frames_per_bit=4,
        repeat=3,
        alpha=0.018,
        key: str | None = None,
    ):
        self.n_fft = int(n_fft)
        self.hop = int(hop)
        self.f_lo = float(f_lo)
        self.f_hi = float(f_hi)
        self.bins_per_bit = int(bins_per_bit)
        self.frames_per_bit = int(frames_per_bit)
        self.repeat = int(repeat)
        self.alpha = float(alpha)
        self.key = key or ""

    def _select_bins(self, sr):
        freqs = np.fft.rfftfreq(self.n_fft, d=1.0 / sr)
        idx = np.where((freqs >= self.f_lo) & (freqs <= self.f_hi))[0]
        if len(idx) < self.bins_per_bit:
            raise ValueError(
                f"Not enough bins in band [{self.f_lo},{self.f_hi}] Hz for n_fft={self.n_fft}."
            )

        # deterministic pseudo-random selection without external deps
        seed = zlib.crc32((f"{sr}|{self.n_fft}|{self.f_lo}|{self.f_hi}|{self.key}").encode('utf-8')) & 0xFFFFFFFF
        rng = np.random.default_rng(seed)
        chosen = rng.choice(idx, size=self.bins_per_bit, replace=False)
        chosen.sort()
        return chosen

    def _pack_payload(self, text: str) -> bytes:
        data = text.encode('utf-8')
        if len(data) > 2048:
            raise ValueError("Data too long (max 2048 bytes).")
        pre = b"HYB1"  # 4-byte marker
        ln = struct.pack(">H", len(data))
        crc = struct.pack(">I", zlib.crc32(data) & 0xFFFFFFFF)
        return pre + ln + crc + data

    def _unpack_payload(self, payload: bytes):
        if len(payload) < 10:
            return None
        if payload[:4] != b"HYB1":
            return None
        ln = struct.unpack(">H", payload[4:6])[0]
        crc = struct.unpack(">I", payload[6:10])[0]
        if 10 + ln > len(payload):
            return None
        data = payload[10:10 + ln]
        if (zlib.crc32(data) & 0xFFFFFFFF) != crc:
            return None
        try:
            return data.decode('utf-8')
        except Exception:
            return None

    def embed(self, original_path, output_path, text: str):
        wav_path, conv = convert_to_wav(original_path)
        temps = [wav_path] if conv else []
        try:
            x_i16, params = read_wav_mono_i16(wav_path)
            sr = params.framerate
            x = x_i16.astype(np.float32)

            payload = self._pack_payload(text)
            bits = bytes_to_bits(payload)

            # repetition for robustness
            bits_rep = np.tile(bits, self.repeat)

            X = stft(x, n_fft=self.n_fft, hop=self.hop)
            mag = np.abs(X).astype(np.float32)
            ph = np.angle(X).astype(np.float32)

            bins = self._select_bins(sr)
            frames = X.shape[0]
            needed_frames = len(bits_rep) * self.frames_per_bit
            if needed_frames + 10 >= frames:
                raise ValueError(
                    f"Audio too short for payload: need ~{needed_frames} frames, have {frames}. "
                    f"Try reducing message length, repeat, frames_per_bit, or increasing hop."
                )

            # embed starting a little after the beginning (avoid intro transients)
            start_frame = 5
            cur = start_frame

            for bit in bits_rep:
                # Over frames_per_bit frames, apply a relative magnitude bias
                fr = slice(cur, cur + self.frames_per_bit)
                base = mag[fr][:, bins]
                # Relative change (codec-friendly): +/- alpha * base
                delta = self.alpha * (base + 1e-6)
                if bit == 1:
                    mag[fr][:, bins] = base + delta
                else:
                    mag[fr][:, bins] = np.maximum(0.0, base - delta)
                cur += self.frames_per_bit

            # reconstruct
            Y = (mag * np.exp(1j * ph)).astype(np.complex64)
            y = istft(Y, n_fft=self.n_fft, hop=self.hop, length=len(x))

            # match original overall level very lightly
            peak = np.max(np.abs(y)) + 1e-9
            if peak > 32700:
                y *= (32700.0 / peak)

            y_i16 = np.clip(np.round(y), -32768, 32767).astype(np.int16)
            write_wav_from_i16(output_path, y_i16, params, force_mono=True)
            return True
        finally:
            for t in temps:
                try:
                    os.unlink(t)
                except Exception:
                    pass

    def extract(self, original_path, modified_path):
        ow, oc = convert_to_wav(original_path)
        mw, mc = convert_to_wav(modified_path)
        temps = []
        if oc:
            temps.append(ow)
        if mc:
            temps.append(mw)
        try:
            xo_i16, op = read_wav_mono_i16(ow)
            xm_i16, mp = read_wav_mono_i16(mw)
            sr = op.framerate
            if mp.framerate != sr:
                raise ValueError("Sample rates differ after conversion; this should not happen.")

            # Trim to same length
            n = min(len(xo_i16), len(xm_i16))
            xo = xo_i16[:n].astype(np.float32)
            xm = xm_i16[:n].astype(np.float32)

            # Coarse alignment by envelope cross-correlation
            env_o = energy_envelope(xo, win=self.n_fft, hop=self.hop)
            env_m = energy_envelope(xm, win=self.n_fft, hop=self.hop)
            m = min(len(env_o), len(env_m))
            env_o = env_o[:m]
            env_m = env_m[:m]
            lag_frames = best_lag(env_o, env_m, max_lag_frames=400)
            lag_samples = lag_frames * self.hop

            if lag_samples < 0:
                xo2 = xo[-lag_samples:]
                xm2 = xm[:len(xo2)]
            elif lag_samples > 0:
                xo2 = xo[:len(xo) - lag_samples]
                xm2 = xm[lag_samples:lag_samples + len(xo2)]
            else:
                xo2 = xo
                xm2 = xm[:len(xo)]

            n2 = min(len(xo2), len(xm2))
            xo2 = xo2[:n2]
            xm2 = xm2[:n2]

            Xo = stft(xo2, n_fft=self.n_fft, hop=self.hop)
            Xm = stft(xm2, n_fft=self.n_fft, hop=self.hop)

            frames = min(Xo.shape[0], Xm.shape[0])
            Xo = Xo[:frames]
            Xm = Xm[:frames]

            mag_o = np.abs(Xo).astype(np.float32)
            mag_m = np.abs(Xm).astype(np.float32)

            bins = self._select_bins(sr)

            # Decode by averaging normalized magnitude differences over bins+frames
            start_frame = 5
            cur = start_frame

            # We don't know message length up front; decode a reasonable max payload
            # 4+2+4+2048 bytes = 2058 bytes max => 16464 bits; with repeat maybe huge.
            # We'll decode up to max_bits bits (before de-repetition).
            max_bytes = 4096
            max_bits = (4 + 2 + 4 + max_bytes) * 8

            bits_rep = []
            for _ in range(max_bits * self.repeat):
                if cur + self.frames_per_bit >= frames:
                    break
                fr = slice(cur, cur + self.frames_per_bit)
                o = mag_o[fr][:, bins]
                m = mag_m[fr][:, bins]
                # normalized diff (robust to global gain changes)
                nd = (m - o) / (o + 1e-6)
                score = float(nd.mean())
                bits_rep.append(1 if score > 0 else 0)
                cur += self.frames_per_bit

            if len(bits_rep) < 80:
                return None

            bits_rep = np.array(bits_rep, dtype=np.int8)

            # De-repetition by majority vote across repeat blocks
            # We embedded as tile(bits, repeat) (concatenated repeats).
            # So vote every k-th bit position across repeats.
            # Let L be unknown; we search for a valid HYB1 payload.

            # Try candidate lengths by scanning for the HYB1 marker after voting.
            # We'll attempt progressively larger payload sizes until CRC passes.
            best_text = None
            for cand_total_bits in range(80, min(len(bits_rep) // self.repeat, max_bits) + 1, 8):
                # vote across repeats for first cand_total_bits
                chunk = bits_rep[:cand_total_bits * self.repeat]
                chunk = chunk.reshape(self.repeat, cand_total_bits)
                voted = (chunk.sum(axis=0) >= (self.repeat / 2)).astype(np.int8)
                payload = bits_to_bytes(voted)
                text = self._unpack_payload(payload)
                if text is not None:
                    best_text = text
                    break

            return best_text
        finally:
            for t in temps:
                try:
                    os.unlink(t)
                except Exception:
                    pass


def main():
    p = argparse.ArgumentParser(
        description="Hybrid (reference-based) audio data embedding/extraction using STFT-difference watermarking",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument('--mode', choices=['embed', 'extract'], required=True)
    p.add_argument('--original', help='Original/reference audio', required=True)
    p.add_argument('--output', help='Output watermarked audio (embed mode only)')
    p.add_argument('--modified', help='Modified/watermarked audio (extract mode only)')
    p.add_argument('--data', help='Text to embed (embed mode only)')
    p.add_argument('--data-file', help='Text file to embed (embed mode only)')

    # STFT/robustness params
    p.add_argument('--n-fft', type=int, default=2048)
    p.add_argument('--hop', type=int, default=512)
    p.add_argument('--f-lo', type=float, default=1800)
    p.add_argument('--f-hi', type=float, default=5200)
    p.add_argument('--bins-per-bit', type=int, default=24)
    p.add_argument('--frames-per-bit', type=int, default=4)
    p.add_argument('--repeat', type=int, default=3)
    p.add_argument('--alpha', type=float, default=0.018)
    p.add_argument('--key', type=str, default='', help='Optional: changes bin selection')

    args = p.parse_args()

    steg = HybridSTFTDiff(
        n_fft=args.n_fft,
        hop=args.hop,
        f_lo=args.f_lo,
        f_hi=args.f_hi,
        bins_per_bit=args.bins_per_bit,
        frames_per_bit=args.frames_per_bit,
        repeat=args.repeat,
        alpha=args.alpha,
        key=args.key,
    )

    if args.mode == 'embed':
        if not args.output:
            raise SystemExit('--output is required in embed mode')
        if args.data_file:
            with open(args.data_file, 'r', encoding='utf-8') as f:
                data = f.read()
        elif args.data is not None:
            data = args.data
        else:
            raise SystemExit('Provide --data or --data-file in embed mode')
        ok = steg.embed(args.original, args.output, data)
        if ok:
            print('✅ Embedded successfully')

    else:
        if not args.modified:
            raise SystemExit('--modified is required in extract mode')
        text = steg.extract(args.original, args.modified)
        if text is None:
            print('❌ Extraction failed (no valid payload found)')
            raise SystemExit(2)
        print('✅ Extracted text:')
        print(text)


if __name__ == '__main__':
    main()
