"""
Audio Watermark Encoder/Decoder Flask Server
Uses scipy for watermark embedding and matched filter detection
"""

import os
import io
import tempfile
import numpy as np
import scipy.signal as signal
import scipy.io.wavfile as wavfile
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app)  # Enable CORS for browser access

# Watermark configuration
SYNC_FREQ_START = 150  # Hz - chirp start frequency
SYNC_FREQ_END = 250    # Hz - chirp end frequency
SYNC_DURATION = 0.1    # seconds
BIT_0_FREQ = 180       # Hz
BIT_1_FREQ = 220       # Hz
BIT_DURATION = 0.05    # seconds per bit
GAP_DURATION = 0.02    # gap between elements
NUM_BITS = 16          # 16-bit tracking ID
WATERMARK_AMPLITUDE = 0.03  # Amplitude of watermark signal (low to be inaudible)
REPEAT_INTERVAL = 10   # Repeat watermark every N seconds

ALLOWED_EXTENSIONS = {'wav', 'mp3', 'webm', 'ogg', 'm4a'}


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def generate_chirp(fs, start_freq, end_freq, duration):
    """Generate a linear chirp signal for matched filtering"""
    t = np.linspace(0, duration, int(fs * duration), endpoint=False)
    chirp = signal.chirp(t, f0=start_freq, f1=end_freq, t1=duration, method='linear')
    return chirp


def generate_tone(fs, freq, duration):
    """Generate a pure tone signal"""
    t = np.linspace(0, duration, int(fs * duration), endpoint=False)
    return np.sin(2 * np.pi * freq * t)


def generate_gap(fs, duration):
    """Generate silence/gap"""
    return np.zeros(int(fs * duration))


def number_to_bits(num, num_bits=16):
    """Convert integer to bit array (MSB first)"""
    bits = []
    for i in range(num_bits - 1, -1, -1):
        bits.append((num >> i) & 1)
    return bits


def generate_watermark_signal(fs, tracking_id):
    """
    Generate the complete watermark signal:
    - Sync chirp (150-250 Hz sweep)
    - Gap
    - 16 bits encoded as tones (180 Hz = 0, 220 Hz = 1)
    """
    parts = []

    # 1. Sync chirp
    chirp = generate_chirp(fs, SYNC_FREQ_START, SYNC_FREQ_END, SYNC_DURATION)
    parts.append(chirp)

    # 2. Gap after chirp
    parts.append(generate_gap(fs, GAP_DURATION))

    # 3. Encode each bit
    bits = number_to_bits(tracking_id, NUM_BITS)
    for bit in bits:
        freq = BIT_1_FREQ if bit == 1 else BIT_0_FREQ
        tone = generate_tone(fs, freq, BIT_DURATION)
        parts.append(tone)
        parts.append(generate_gap(fs, GAP_DURATION))

    # Concatenate all parts
    watermark = np.concatenate(parts)

    return watermark, bits


def embed_watermark(audio_data, fs, tracking_id, amplitude=WATERMARK_AMPLITUDE):
    """
    Embed watermark into audio data.
    Watermark is repeated every REPEAT_INTERVAL seconds.
    """
    # Generate watermark signal
    watermark, bits = generate_watermark_signal(fs, tracking_id)
    watermark = watermark * amplitude

    # Calculate repeat positions
    duration = len(audio_data) / fs
    watermark_len = len(watermark)
    repeat_samples = int(REPEAT_INTERVAL * fs)

    # Create output (copy of input)
    output = audio_data.copy().astype(np.float64)

    # Normalize if needed
    max_val = np.max(np.abs(output))
    if max_val > 1.0:
        output = output / max_val

    # Embed watermarks at regular intervals
    positions = []
    pos = 0
    while pos + watermark_len < len(output):
        # Add watermark signal to audio
        output[pos:pos + watermark_len] += watermark
        positions.append(pos / fs)
        pos += repeat_samples

    # Clip to prevent overflow
    output = np.clip(output, -1.0, 1.0)

    return output, positions, bits


def encode_watermark(audio_path, tracking_id, output_path=None):
    """
    Main encoding function - embeds watermark into audio file
    Returns dict with encoding results
    """
    results = {
        'success': False,
        'info': {}
    }

    try:
        # Load audio file
        fs, data = wavfile.read(audio_path)
        original_dtype = data.dtype

        # Convert to mono if stereo
        is_stereo = len(data.shape) > 1
        if is_stereo:
            # Keep stereo, but we'll embed in both channels
            left = data[:, 0].astype(np.float64)
            right = data[:, 1].astype(np.float64)

            # Normalize
            if original_dtype == np.int16:
                left = left / 32768.0
                right = right / 32768.0
            elif original_dtype == np.int32:
                left = left / 2147483648.0
                right = right / 2147483648.0

            # Embed in both channels
            left_out, positions, bits = embed_watermark(left, fs, tracking_id)
            right_out, _, _ = embed_watermark(right, fs, tracking_id)

            # Convert back to original dtype
            if original_dtype == np.int16:
                left_out = (left_out * 32767).astype(np.int16)
                right_out = (right_out * 32767).astype(np.int16)
            elif original_dtype == np.int32:
                left_out = (left_out * 2147483647).astype(np.int32)

            output_data = np.column_stack((left_out, right_out))
        else:
            # Mono
            mono = data.astype(np.float64)

            # Normalize
            if original_dtype == np.int16:
                mono = mono / 32768.0
            elif original_dtype == np.int32:
                mono = mono / 2147483648.0

            # Embed watermark
            output, positions, bits = embed_watermark(mono, fs, tracking_id)

            # Convert back to original dtype
            if original_dtype == np.int16:
                output_data = (output * 32767).astype(np.int16)
            elif original_dtype == np.int32:
                output_data = (output * 2147483647).astype(np.int32)
            else:
                output_data = output

        # Generate output path if not provided
        if output_path is None:
            base, ext = os.path.splitext(audio_path)
            output_path = f"{base}_watermarked{ext}"

        # Write output file
        wavfile.write(output_path, fs, output_data)

        results['success'] = True
        results['output_path'] = output_path
        results['info'] = {
            'tracking_id': tracking_id,
            'bits': bits,
            'binary': ''.join(str(b) for b in bits),
            'sample_rate': fs,
            'duration': len(data) / fs,
            'watermark_positions': positions,
            'num_watermarks': len(positions),
            'is_stereo': is_stereo
        }

    except Exception as e:
        results['error'] = str(e)
        results['success'] = False

    return results


def detect_sync_chirps(audio_data, fs, threshold=0.3):
    """
    Detect sync chirp positions using matched filter / cross-correlation
    Returns list of sample positions where chirps are detected
    """
    # Generate reference chirp
    ref_chirp = generate_chirp(fs, SYNC_FREQ_START, SYNC_FREQ_END, SYNC_DURATION)

    # Apply bandpass filter to isolate watermark frequencies
    nyq = fs / 2
    low = 100 / nyq
    high = 300 / nyq

    # Ensure filter frequencies are valid
    if high >= 1.0:
        high = 0.99
    if low <= 0:
        low = 0.01

    b, a = signal.butter(4, [low, high], btype='band')
    filtered_audio = signal.filtfilt(b, a, audio_data)

    # Normalize
    filtered_audio = filtered_audio / (np.max(np.abs(filtered_audio)) + 1e-10)
    ref_chirp = ref_chirp / (np.max(np.abs(ref_chirp)) + 1e-10)

    # Cross-correlation (matched filter)
    correlation = signal.correlate(filtered_audio, ref_chirp, mode='valid')
    correlation = np.abs(correlation)
    correlation = correlation / (np.max(correlation) + 1e-10)

    # Find peaks above threshold
    peaks, properties = signal.find_peaks(correlation, height=threshold, distance=int(fs * 0.5))

    return peaks, correlation


def extract_bits_at_position(audio_data, fs, start_sample):
    """
    Extract 16 bits starting from the given position (after sync chirp)
    Uses energy detection at BIT_0_FREQ and BIT_1_FREQ
    """
    bits = []
    samples_per_bit = int(fs * BIT_DURATION)

    # Start after the sync chirp
    bit_start = start_sample + int(fs * SYNC_DURATION)

    for i in range(NUM_BITS):
        start = bit_start + i * samples_per_bit
        end = start + samples_per_bit

        if end > len(audio_data):
            break

        segment = audio_data[start:end]

        # Apply window
        window = np.hanning(len(segment))
        segment = segment * window

        # Generate reference tones for this segment length
        t = np.linspace(0, BIT_DURATION, len(segment), endpoint=False)
        ref_0 = np.sin(2 * np.pi * BIT_0_FREQ * t)
        ref_1 = np.sin(2 * np.pi * BIT_1_FREQ * t)

        # Correlation with each tone
        corr_0 = np.abs(np.correlate(segment, ref_0, mode='valid')[0])
        corr_1 = np.abs(np.correlate(segment, ref_1, mode='valid')[0])

        # Decide bit based on which tone has higher correlation
        bit = 1 if corr_1 > corr_0 else 0
        bits.append(bit)

    return bits


def bits_to_number(bits):
    """Convert bit array to integer"""
    value = 0
    for bit in bits:
        value = (value << 1) | bit
    return value


def detect_watermark(audio_path, debug=False):
    """
    Main detection function - finds watermarks in audio file
    Returns dict with detection results
    """
    results = {
        'success': False,
        'watermarks': [],
        'debug_info': {}
    }

    try:
        # Load audio file
        fs, data = wavfile.read(audio_path)

        # Convert to mono if stereo
        if len(data.shape) > 1:
            data = np.mean(data, axis=1)

        # Normalize to float
        if data.dtype == np.int16:
            data = data.astype(np.float64) / 32768.0
        elif data.dtype == np.int32:
            data = data.astype(np.float64) / 2147483648.0
        elif data.dtype == np.uint8:
            data = (data.astype(np.float64) - 128) / 128.0

        results['debug_info']['sample_rate'] = fs
        results['debug_info']['duration'] = len(data) / fs
        results['debug_info']['samples'] = len(data)

        # Find sync chirps
        chirp_positions, correlation = detect_sync_chirps(data, fs)
        results['debug_info']['chirps_found'] = len(chirp_positions)
        results['debug_info']['chirp_times'] = [float(p / fs) for p in chirp_positions]

        if debug:
            results['debug_info']['correlation_max'] = float(np.max(correlation))
            results['debug_info']['correlation_mean'] = float(np.mean(correlation))

        # Extract bits at each chirp position
        watermarks = []
        for pos in chirp_positions:
            bits = extract_bits_at_position(data, fs, pos)
            if len(bits) == NUM_BITS:
                tracking_id = bits_to_number(bits)
                watermarks.append({
                    'tracking_id': tracking_id,
                    'position_seconds': float(pos / fs),
                    'bits': bits,
                    'confidence': 'high' if len(chirp_positions) > 1 else 'medium'
                })

        # Check for consensus if multiple watermarks found
        if len(watermarks) > 1:
            ids = [w['tracking_id'] for w in watermarks]
            from collections import Counter
            most_common_id, count = Counter(ids).most_common(1)[0]
            results['consensus_id'] = most_common_id
            results['consensus_count'] = count

        results['watermarks'] = watermarks
        results['success'] = len(watermarks) > 0

    except Exception as e:
        results['error'] = str(e)
        results['success'] = False

    return results


@app.route('/encode', methods=['POST'])
def encode_endpoint():
    """
    API endpoint for watermark encoding
    Accepts audio file upload and tracking ID, returns watermarked audio
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']

    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    # Get tracking ID from form data
    tracking_id = request.form.get('tracking_id')
    if tracking_id is None:
        return jsonify({'error': 'No tracking_id provided'}), 400

    try:
        tracking_id = int(tracking_id)
        if tracking_id < 0 or tracking_id > 65535:
            return jsonify({'error': 'tracking_id must be between 0 and 65535'}), 400
    except ValueError:
        return jsonify({'error': 'tracking_id must be a valid integer'}), 400

    if not file.filename.lower().endswith('.wav'):
        return jsonify({'error': 'Only WAV files are supported for encoding'}), 400

    # Save to temp files
    temp_dir = tempfile.mkdtemp()
    filename = secure_filename(file.filename)
    input_path = os.path.join(temp_dir, filename)
    output_path = os.path.join(temp_dir, f"watermarked_{filename}")

    try:
        file.save(input_path)

        # Run encoding
        results = encode_watermark(input_path, tracking_id, output_path)

        if not results['success']:
            return jsonify(results), 500

        # Return the watermarked file
        return send_file(
            output_path,
            mimetype='audio/wav',
            as_attachment=True,
            download_name=f"watermarked_{filename}"
        )

    finally:
        # Cleanup temp files
        if os.path.exists(input_path):
            os.remove(input_path)
        if os.path.exists(output_path):
            os.remove(output_path)
        if os.path.exists(temp_dir):
            os.rmdir(temp_dir)


@app.route('/encode-info', methods=['POST'])
def encode_info_endpoint():
    """
    API endpoint for watermark encoding that returns JSON info instead of file
    Useful for debugging/testing
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']

    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    tracking_id = request.form.get('tracking_id')
    if tracking_id is None:
        return jsonify({'error': 'No tracking_id provided'}), 400

    try:
        tracking_id = int(tracking_id)
        if tracking_id < 0 or tracking_id > 65535:
            return jsonify({'error': 'tracking_id must be between 0 and 65535'}), 400
    except ValueError:
        return jsonify({'error': 'tracking_id must be a valid integer'}), 400

    if not file.filename.lower().endswith('.wav'):
        return jsonify({'error': 'Only WAV files are supported'}), 400

    temp_dir = tempfile.mkdtemp()
    filename = secure_filename(file.filename)
    input_path = os.path.join(temp_dir, filename)
    output_path = os.path.join(temp_dir, f"watermarked_{filename}")

    try:
        file.save(input_path)
        results = encode_watermark(input_path, tracking_id, output_path)
        return jsonify(results)

    finally:
        if os.path.exists(input_path):
            os.remove(input_path)
        if os.path.exists(output_path):
            os.remove(output_path)
        if os.path.exists(temp_dir):
            os.rmdir(temp_dir)


@app.route('/detect', methods=['POST'])
def detect_endpoint():
    """
    API endpoint for watermark detection
    Accepts audio file upload and returns detection results
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']

    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    if not allowed_file(file.filename):
        return jsonify({'error': f'File type not allowed. Allowed: {ALLOWED_EXTENSIONS}'}), 400

    # Save to temp file
    temp_dir = tempfile.mkdtemp()
    filename = secure_filename(file.filename)
    filepath = os.path.join(temp_dir, filename)

    try:
        file.save(filepath)

        # If not WAV, we'd need to convert (for now, require WAV)
        if not filename.lower().endswith('.wav'):
            return jsonify({
                'error': 'Please convert to WAV format first. Non-WAV support coming soon.'
            }), 400

        # Run detection
        debug = request.args.get('debug', 'false').lower() == 'true'
        results = detect_watermark(filepath, debug=debug)

        return jsonify(results)

    finally:
        # Cleanup temp file
        if os.path.exists(filepath):
            os.remove(filepath)
        if os.path.exists(temp_dir):
            os.rmdir(temp_dir)


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'ok', 'service': 'audio-watermark-detector'})


@app.route('/', methods=['GET'])
def index():
    """Simple landing page with API info"""
    return jsonify({
        'service': 'Audio Watermark Encoder/Decoder API',
        'endpoints': {
            'POST /encode': 'Upload WAV file + tracking_id to embed watermark (returns WAV file)',
            'POST /encode-info': 'Same as /encode but returns JSON info instead of file',
            'POST /detect': 'Upload audio file to detect watermarks',
            'GET /health': 'Health check'
        },
        'watermark_config': {
            'sync_chirp': f'{SYNC_FREQ_START}-{SYNC_FREQ_END} Hz',
            'bit_0_freq': f'{BIT_0_FREQ} Hz',
            'bit_1_freq': f'{BIT_1_FREQ} Hz',
            'bit_duration': f'{BIT_DURATION}s',
            'repeat_interval': f'{REPEAT_INTERVAL}s',
            'capacity': '16 bits (0-65535)'
        },
        'supported_formats': list(ALLOWED_EXTENSIONS),
        'note': 'WAV files required for encoding. Detection supports WAV only currently.'
    })


if __name__ == '__main__':
    print("=" * 60)
    print("Audio Watermark Encoder/Decoder Server")
    print("=" * 60)
    print(f"API available at http://localhost:5000")
    print()
    print("Endpoints:")
    print("  POST /encode      - Embed watermark (returns WAV file)")
    print("  POST /encode-info - Embed watermark (returns JSON info)")
    print("  POST /detect      - Detect watermark in audio")
    print("  GET  /health      - Health check")
    print()
    print(f"Watermark config:")
    print(f"  Sync chirp: {SYNC_FREQ_START}-{SYNC_FREQ_END} Hz")
    print(f"  Bit 0: {BIT_0_FREQ} Hz, Bit 1: {BIT_1_FREQ} Hz")
    print(f"  Repeat interval: {REPEAT_INTERVAL}s")
    print("=" * 60)
    app.run(host='0.0.0.0', port=5000, debug=True)
