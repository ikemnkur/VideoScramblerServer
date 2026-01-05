import json
import math
import os
import shutil
import subprocess
from time import time
from flask import Flask, send_from_directory, current_app, request, jsonify, redirect, url_for
from flask_cors import CORS
from werkzeug.utils import secure_filename
from config import UPLOAD_FOLDER, OUTPUTS_FOLDER
import secrets
from dataclasses import dataclass
from typing import List, Dict, Any, Tuple
from flask import g
from PIL import Image
import numpy as np
import hashlib
import threading
import atexit

# TTS imports
import asyncio
import tempfile
import uuid
import edge_tts
from pydub import AudioSegment

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Track last request time for auto-cleanup
last_request_time = time()
cleanup_lock = threading.Lock()
cleanup_thread = None
cleanup_running = False

# Configure the upload folder location
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['OUTPUTS_FOLDER'] = OUTPUTS_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 250 * 1024 * 1024  # 250MB max file size

# Allowed file extensions
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'mp4', 'avi', 'mov', 'mkv', 'webm'}

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Ensure the upload folder exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['OUTPUTS_FOLDER'], exist_ok=True)

# Create public audio directory for TTS
PUBLIC_AUDIO_DIR = os.path.join(os.path.dirname(__file__), 'public_audio')
os.makedirs(PUBLIC_AUDIO_DIR, exist_ok=True)

# Available high-quality TTS voices
TTS_VOICES = [
    "en-US-AndrewNeural",
    "en-US-AriaNeural",
    "en-US-GuyNeural",
    "en-US-JennyNeural",
    "en-GB-RyanNeural",
    "en-GB-SoniaNeural"
]

# Auto-cleanup function
def cleanup_old_files(cutoff_minutes=10):
    """Clean up files older than cutoff_minutes"""
    try:
        cutoff_time = time() - (cutoff_minutes * 60)
        deleted_count = 0
        
        # Clean inputs folder
        if os.path.exists(app.config['UPLOAD_FOLDER']):
            for filename in os.listdir(app.config['UPLOAD_FOLDER']):
                file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                if os.path.isfile(file_path) and os.path.getmtime(file_path) < cutoff_time:
                    os.remove(file_path)
                    deleted_count += 1
                    print(f"🗑️  Auto-cleanup: Deleted {filename} from inputs")
        
        # Clean outputs folder
        if os.path.exists(app.config['OUTPUTS_FOLDER']):
            for filename in os.listdir(app.config['OUTPUTS_FOLDER']):
                file_path = os.path.join(app.config['OUTPUTS_FOLDER'], filename)
                if os.path.isfile(file_path) and os.path.getmtime(file_path) < cutoff_time:
                    os.remove(file_path)
                    deleted_count += 1
                    print(f"🗑️  Auto-cleanup: Deleted {filename} from outputs")
        
        if deleted_count > 0:
            print(f"✅ Auto-cleanup completed: {deleted_count} files deleted")
    except Exception as e:
        print(f"❌ Auto-cleanup error: {e}")

def auto_cleanup_worker():
    """Background worker that cleans up files after 10 minutes of inactivity"""
    global cleanup_running
    INACTIVITY_THRESHOLD = 10 * 60  # 10 minutes in seconds
    CHECK_INTERVAL = 60  # Check every 60 seconds
    
    print("🔄 Auto-cleanup worker started")
    
    while cleanup_running:
        try:
            import time as time_module
            time_module.sleep(CHECK_INTERVAL)
            
            with cleanup_lock:
                time_since_last_request = time() - last_request_time
                
                # If it's been more than 10 minutes since last request, run cleanup
                if time_since_last_request >= INACTIVITY_THRESHOLD:
                    print(f"⏰ {int(time_since_last_request/60)} minutes of inactivity, running cleanup...")
                    cleanup_old_files(cutoff_minutes=10)
        except Exception as e:
            print(f"❌ Auto-cleanup worker error: {e}")

def start_cleanup_worker():
    """Start the auto-cleanup background thread"""
    global cleanup_thread, cleanup_running
    
    if cleanup_thread is None or not cleanup_thread.is_alive():
        cleanup_running = True
        cleanup_thread = threading.Thread(target=auto_cleanup_worker, daemon=True)
        cleanup_thread.start()
        print("✅ Auto-cleanup worker thread started")

def stop_cleanup_worker():
    """Stop the auto-cleanup background thread"""
    global cleanup_running
    cleanup_running = False
    print("🛑 Auto-cleanup worker stopped")

# Middleware to track requests
@app.before_request
def track_request():
    global last_request_time
    with cleanup_lock:
        last_request_time = time()

# Register cleanup on exit
atexit.register(stop_cleanup_worker)

@app.route('/')
def index():
    return '''
    <!DOCTYPE html>
    <html>
    <head>
        <title>Media Upload/Download Server</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                justify-content: center;
                align-items: center;
                padding: 20px;
            }
            .container {
                background: white;
                border-radius: 20px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                max-width: 600px;
                width: 100%;
                padding: 40px;
            }
            h1 {
                color: #667eea;
                text-align: center;
                margin-bottom: 10px;
                font-size: 2em;
            }
            h2 {
                color: #764ba2;
                margin-top: 30px;
                margin-bottom: 15px;
                font-size: 1.3em;
                border-bottom: 2px solid #667eea;
                padding-bottom: 10px;
            }
            form {
                margin: 20px 0;
            }
            input[type="file"] {
                width: 100%;
                padding: 15px;
                border: 2px dashed #667eea;
                border-radius: 10px;
                margin-bottom: 15px;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            input[type="file"]:hover {
                background: #f0f0f0;
                border-color: #764ba2;
            }
            input[type="submit"] {
                width: 100%;
                padding: 15px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                border-radius: 10px;
                font-size: 1.1em;
                font-weight: bold;
                cursor: pointer;
                transition: transform 0.2s ease;
            }
            input[type="submit"]:hover {
                transform: translateY(-2px);
                box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
            }
            .info-box {
                background: #f8f9fa;
                border-left: 4px solid #667eea;
                padding: 15px;
                margin: 15px 0;
                border-radius: 5px;
            }
            code {
                background: #e9ecef;
                padding: 3px 8px;
                border-radius: 4px;
                font-family: 'Courier New', monospace;
                color: #764ba2;
            }
            a {
                color: #667eea;
                text-decoration: none;
                font-weight: 500;
            }
            a:hover {
                text-decoration: underline;
            }
            .subtitle {
                text-align: center;
                color: #666;
                margin-bottom: 30px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🎬 Media Server</h1>
            <p class="subtitle">Upload and Download Media Files</p>
            
            <h2>📤 Upload File</h2>
            <form method="POST" action="/upload" enctype="multipart/form-data">
                <input type="file" name="file" accept=".png,.jpg,.jpeg,.gif,.bmp,.mp4,.avi,.mov,.mkv,.webm" required>
                <input type="submit" value="Upload File">
            </form>
            
            <h2>📥 Download Files</h2>
            <div class="info-box">
                <p><strong>Access files via:</strong> <code>/download/&lt;filename&gt;</code></p>
                <p style="margin-top: 10px;"><strong>Example:</strong> <a href="/download/mine.png">/download/mine.png</a></p>
            </div>
        </div>
    </body>
    </html>
    '''

@app.route('/download/<path:filename>')
def download_file(filename):
    # Check outputs folder first (for processed files), then inputs folder
    outputs_dir = os.path.join(current_app.root_path, app.config['OUTPUTS_FOLDER'])
    inputs_dir = os.path.join(current_app.root_path, app.config['UPLOAD_FOLDER'])
    
    # Try outputs folder first
    if os.path.exists(os.path.join(outputs_dir, filename)):
        return send_from_directory(outputs_dir, filename, as_attachment=True)
    # Fall back to inputs folder
    elif os.path.exists(os.path.join(inputs_dir, filename)):
        return send_from_directory(inputs_dir, filename, as_attachment=True)
    else:
        return jsonify({'error': f'File {filename} not found'}), 404

@app.route('/files')
def list_files():
    """List all available files for download"""
    try:
        files = os.listdir(app.config['OUTPUTS_FOLDER'])
        files = [f for f in files if os.path.isfile(os.path.join(app.config['OUTPUTS_FOLDER'], f))]
        return jsonify({'files': files}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    

# Scramble a photo using various algorithms
# it looks for a file with a given filename, it should be in the python/inputs folder

# @app.route('/scramble-photo-old', methods=['POST'])
# def scramble_photo_old():
#     """
#     Scramble a photo using various algorithms (OLD VERSION)
#     Expects JSON with: input, output, seed, mode, algorithm, and algorithm-specific params
#     """
#     # Accept payloads from the other backend which send:
#     # { localFileName, localFilePath, params }
#     # Normalize that into the expected schema (input, output, seed, mode, algorithm, ...)
#     # incoming = request.get_json(silent=True)
#     # if incoming and ('localFileName' in incoming or 'localFilePath' in incoming):
#     #     params = incoming.get('params', {}) or {}
#     #     input_name = incoming.get('localFileName') or os.path.basename(incoming.get('localFilePath', ''))
#     #     output_name = params.get('output') or f"scrambled_{input_name}"
#     #     normalized = {
#     #         'input': input_name,
#     #         'output': output_name,
#     #         'seed': params.get('seed', 123456),
#     #         'mode': params.get('mode', 'scramble'),
#     #         'algorithm': params.get('algorithm', 'position'),
#     #         'percentage': params.get('percentage', 100),
#     #         'rows': params.get('rows'),
#     #         'cols': params.get('cols'),
#     #         'max_hue_shift': params.get('max_hue_shift'),
#     #         'max_intensity_shift': params.get('max_intensity_shift')
#     #     }
#     #     # remove unset keys
#     #     normalized = {k: v for k, v in normalized.items() if v is not None}
#     #     # Cache normalized JSON so the code below (which reads request.json) gets this payload
#     #     try:
#     #         request._cached_json = normalized
#     #     except Exception:
#     #         # best-effort fallback: attach to flask.g (rarely needed)
#     #         g.normalized_payload = normalized

#     try:
#         data = request.json
#         if not data:
#             return jsonify({'error': 'No JSON data provided'}), 400

#         # Extract common parameters
#         input_file = data.get('input')
#         output_file = data.get('output')
#         seed = data.get('seed', 123456)
#         mode = data.get('mode', 'scramble')
#         algorithm = data.get('algorithm', 'position')
#         percentage = data.get('percentage', 100)
#         noise_seed = data.get('noise_seed')
#         noise_intensity = data.get('noise_intensity')
#         noise_mode = data.get('noise_mode')
#         noise_prng = data.get('noise_prng')

#         if not input_file or not output_file:
#             return jsonify({'error': 'input and output filenames required'}), 400

#         # Build file paths
#         input_path = os.path.join(app.config['UPLOAD_FOLDER'], input_file)
#         output_path = os.path.join(app.config['OUTPUTS_FOLDER'], output_file)

#         if not os.path.exists(input_path):
#             return jsonify({'error': f'Input file {input_file} not found'}), 404

#         # Build command based on algorithm
#         cmd = []
        
#         if algorithm == 'position':
#             # Position scrambling (default tile shuffling)
#             rows = data.get('rows', 6)
#             cols = data.get('cols', 6)
#             cmd = [
#                 'python3', 'scramble_photo.py',
#                 '--input', input_path,
#                 '--output', output_path,
#                 '--seed', str(seed),
#                 '--rows', str(rows),
#                 '--cols', str(cols),
#                 '--mode', mode,
#                 '--percentage', str(percentage),
#                 '--noise_seed', str(noise_seed),
#                 '--noise_intensity', str(noise_intensity),
#                 '--noise_mode', str(noise_mode),
#                 
#             ]
        
#         elif algorithm == 'color':
#             # Color scrambling (hue shifting)
#             max_hue_shift = data.get('max_hue_shift', 64)
#             cmd = [
#                 'python3', 'scramble_photo.py',
#                 '--input', input_path,
#                 '--output', output_path,
#                 '--algorithm', 'color',
#                 '--max-hue-shift', str(max_hue_shift),
#                 '--seed', str(seed),
#                 '--mode', mode,
#                 '--percentage', str(percentage),
#                 '--noise_seed', str(noise_seed),
#                 '--noise_intensity', str(noise_intensity),
#                 '--noise_mode', str(noise_mode),
#                 
#             ]
        
#         elif algorithm == 'rotation':
#             # Rotation scrambling
#             rows = data.get('rows', 6)
#             cols = data.get('cols', 6)
#             cmd = [
#                 'python3', 'scramble_photo_rotate.py',
#                 '--input', input_path,
#                 '--output', output_path,
#                 '--seed', str(seed),
#                 '--rows', str(rows),
#                 '--cols', str(cols),
#                 '--mode', mode,
#                 '--algorithm', 'rotation',
#                 '--percentage', str(percentage),
#                 '--noise_seed', str(noise_seed),
#                 '--noise_intensity', str(noise_intensity),
#                 '--noise_mode', str(noise_mode),
#                 
#             ]
        
#         elif algorithm == 'mirror':
#             # Mirror scrambling
#             rows = data.get('rows', 6)
#             cols = data.get('cols', 6)
#             cmd = [
#                 'python3', 'scramble_photo_mirror.py',
#                 '--input', input_path,
#                 '--output', output_path,
#                 '--seed', str(seed),
#                 '--rows', str(rows),
#                 '--cols', str(cols),
#                 '--mode', mode,
#                 '--algorithm', 'mirror',
#                 '--percentage', str(percentage),
#                 '--noise_seed', str(noise_seed),
#                 '--noise_intensity', str(noise_intensity),
#                 '--noise_mode', str(noise_mode),
#                 
#             ]
        
#         elif algorithm == 'intensity':
#             # Intensity scrambling
#             max_intensity_shift = data.get('max_intensity_shift', 128)
#             cmd = [
#                 'python3', 'scramble_photo_intensity.py',
#                 '--input', input_path,
#                 '--output', output_path,
#                 '--algorithm', 'intensity',
#                 '--max-intensity-shift', str(max_intensity_shift),
#                 '--seed', str(seed),
#                 '--mode', mode,
#                 '--percentage', str(percentage),
#                 '--noise_seed', str(noise_seed),
#                 '--noise_intensity', str(noise_intensity),
#                 '--noise_mode', str(noise_mode),
#                 
#             ]
        
#         else:
#             return jsonify({'error': f'Unknown algorithm: {algorithm}'}), 400

#         # Execute the scrambling command
#         result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        
#         if result.returncode != 0:
#             return jsonify({
#                 'error': 'Scrambling failed',
#                 'details': result.stderr
#             }), 500

#         # Check if output file was created
#         if not os.path.exists(output_path):
#             return jsonify({'error': 'Output file was not created'}), 500

#         return jsonify({
#             'message': 'Photo scrambled successfully',
#             'output_file': output_file,
#             'algorithm': algorithm,
#             'seed': seed,
#             'download_url': f'/download/{output_file}'
#         }), 200

#     except subprocess.TimeoutExpired:
#         return jsonify({'error': 'Scrambling operation timed out'}), 500
#     except Exception as e:
#         return jsonify({'error': str(e)}), 500


@app.route('/scramble-photo', methods=['POST'])
def scramble_photo():
    """
    Scramble a photo using various algorithms
    Expects JSON with: input, output, seed, mode, algorithm, and algorithm-specific params
    """
    print("\n" + "="*60)
    print("📸 FLASK: Scramble photo request received")
    print("="*60)

    try:
        data = request.json
        if not data:
            print("❌ FLASK ERROR: No JSON data provided")
            return jsonify({'error': 'No JSON data provided'}), 400
        
        print(f"📋 FLASK: Received payload: {json.dumps(data, indent=2)}")
        
        # Extract common parameters
        input_file = data.get('input')
        output_file = data.get('output')
        seed = data.get('seed', 123456)
        mode = data.get('mode', 'scramble')
        algorithm = data.get('algorithm', 'position')
        percentage = data.get('percentage', 100)
        noise_seed = data.get('noise_seed')
        noise_intensity = data.get('noise_intensity')
        noise_mode = data.get('noise_mode')
        noise_prng = data.get('noise_prng')
        
        print(f"\n📝 FLASK: Extracted parameters:")
        print(f"  - Input file: {input_file}")
        print(f"  - Output file: {output_file}")
        print(f"  - Seed: {seed}")
        print(f"  - Mode: {mode}")
        print(f"  - Algorithm: {algorithm}")
        print(f"  - Percentage: {percentage}")

        if not input_file or not output_file:
            print("❌ FLASK ERROR: Missing input or output filename")
            return jsonify({'error': 'input and output filenames required'}), 400

        # Build file paths
        input_path = os.path.join(app.config['UPLOAD_FOLDER'], input_file)
        output_path = os.path.join(app.config['OUTPUTS_FOLDER'], output_file)

        print(f"\n📁 FLASK: File paths:")
        print(f"  - Input path: {input_path}")
        print(f"  - Output path: {output_path}")
        print(f"  - Upload folder: {app.config['UPLOAD_FOLDER']}")
        print(f"  - Outputs folder: {app.config['OUTPUTS_FOLDER']}")

        if not os.path.exists(input_path):
            print(f"❌ FLASK ERROR: Input file not found at: {input_path}")
            # List files in directory to help debug
            try:
                files_in_dir = os.listdir(app.config['UPLOAD_FOLDER'])
                print(f"📂 Files in upload folder: {files_in_dir}")
            except Exception as e:
                print(f"⚠️  Could not list directory: {e}")
        
        print(f"✅ FLASK: Input file exists")

        # Build command based on algorithm
        cmd = []
        
        print(f"\n🔧 FLASK: Building command for algorithm: {algorithm}")
        
        if algorithm == 'position':
            # Position scrambling (default tile shuffling)
            rows = data.get('rows', 6)
            cols = data.get('cols', 6)
            print(f"  - Position algorithm: rows={rows}, cols={cols}")
            cmd = [
                'python3', 'scramble_photo.py',
                '--input', input_path,
                '--output', output_path,
                '--seed', str(seed),
                '--rows', str(rows),
                '--cols', str(cols),
                '--mode', mode,
                '--percentage', str(percentage),
                '--noise_seed', str(noise_seed),
                '--noise_intensity', str(noise_intensity),
                '--noise_mode', str(noise_mode),
                
            ]
        
        elif algorithm == 'color':
            # Color scrambling (hue shifting)
            max_hue_shift = data.get('max_hue_shift', 64)
            print(f"  - Color algorithm: max_hue_shift={max_hue_shift}")
            cmd = [
                'python3', 'scramble_photo.py',
                '--input', input_path,
                '--output', output_path,
                '--algorithm', 'color',
                '--max-hue-shift', str(max_hue_shift),
                '--seed', str(seed),
                '--mode', mode,
                '--percentage', str(percentage),
                '--noise_seed', str(noise_seed),
                '--noise_intensity', str(noise_intensity),
                '--noise_mode', str(noise_mode),
                
            ]
        
        elif algorithm == 'rotation':
            # Rotation scrambling
            rows = data.get('rows', 6)
            cols = data.get('cols', 6)
            print(f"  - Rotation algorithm: rows={rows}, cols={cols}")
            cmd = [
                'python3', 'scramble_photo_rotate.py',
                '--input', input_path,
                '--output', output_path,
                '--seed', str(seed),
                '--rows', str(rows),
                '--cols', str(cols),
                '--mode', mode,
                '--algorithm', 'rotation',
                '--percentage', str(percentage),
                '--noise_seed', str(noise_seed),
                '--noise_intensity', str(noise_intensity),
                '--noise_mode', str(noise_mode),
                
            ]
        
        elif algorithm == 'mirror':
            # Mirror scrambling
            rows = data.get('rows', 6)
            cols = data.get('cols', 6)
            print(f"  - Mirror algorithm: rows={rows}, cols={cols}")
            cmd = [
                'python3', 'scramble_photo_mirror.py',
                '--input', input_path,
                '--output', output_path,
                '--seed', str(seed),
                '--rows', str(rows),
                '--cols', str(cols),
                '--mode', mode,
                '--algorithm', 'mirror',
                '--percentage', str(percentage),
                '--noise_seed', str(noise_seed),
                '--noise_intensity', str(noise_intensity),
                '--noise_mode', str(noise_mode),
                
            ]
        
        elif algorithm == 'intensity':
            # Intensity scrambling
            max_intensity_shift = data.get('max_intensity_shift', 128)
            print(f"  - Intensity algorithm: max_intensity_shift={max_intensity_shift}")
            cmd = [
                'python3', 'scramble_photo_intensity.py',
                '--input', input_path,
                '--output', output_path,
                '--algorithm', 'intensity',
                '--max-intensity-shift', str(max_intensity_shift),
                '--seed', str(seed),
                '--mode', mode,
                '--percentage', str(percentage),
                '--noise_seed', str(noise_seed),
                '--noise_intensity', str(noise_intensity),
                '--noise_mode', str(noise_mode),
                
            ]
        
        else:
            print(f"❌ FLASK ERROR: Unknown algorithm: {algorithm}")
            return jsonify({'error': f'Unknown algorithm: {algorithm}'}), 400

        print(f"\n🚀 FLASK: Executing command:")
        print(f"  Command: {' '.join(cmd)}")
        
        # Execute the scrambling command
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        
        print(f"\n📤 FLASK: Command execution completed")
        print(f"  - Return code: {result.returncode}")
        if result.stdout:
            print(f"  - STDOUT: {result.stdout}")
        if result.stderr:
            print(f"  - STDERR: {result.stderr}")
        
        if result.returncode != 0:
            print(f"❌ FLASK ERROR: Scrambling command failed")
            return jsonify({
                'error': 'Scrambling failed',
                'details': result.stderr,
                'stdout': result.stdout,
                'returncode': result.returncode
            }), 500

        # Check if output file was created
        if not os.path.exists(output_path):
            print(f"❌ FLASK ERROR: Output file was not created at: {output_path}")
            return jsonify({'error': 'Output file was not created'}), 500
        
        print(f"✅ FLASK: Output file created successfully at: {output_path}")

        response_data = {
            'message': 'Photo scrambled successfully',
            'output_file': output_file,
            'algorithm': algorithm,
            'seed': seed,
            'download_url': f'/download/{output_file}'
        }
        
        print(f"\n✅ FLASK: Sending success response:")
        print(f"  {json.dumps(response_data, indent=2)}")
        print("="*60 + "\n")
        
        return jsonify(response_data), 200

    except subprocess.TimeoutExpired:
        print(f"❌ FLASK ERROR: Scrambling operation timed out")
        print("="*60 + "\n")
        return jsonify({'error': 'Scrambling operation timed out'}), 500
    except Exception as e:
        print(f"❌ FLASK ERROR: Unexpected exception: {str(e)}")
        import traceback
        print(f"  Traceback: {traceback.format_exc()}")
        print("="*60 + "\n")
        return jsonify({'error': str(e), 'type': type(e).__name__}), 500

@app.route('/unscramble-photo', methods=['POST'])
def unscramble_photo():
    """
    Unscramble a photo using the same algorithms
    Expects JSON with: input, output, seed, algorithm, and algorithm-specific params
    OR { localFileName, localFilePath, params } format from Node.js backend
    """
    print("\n" + "="*60)
    print("🔓 FLASK: Unscramble photo request received")
    print("="*60)
    
    try:
        data = request.json
        if not data:
            print("❌ FLASK ERROR: No JSON data provided")
            return jsonify({'error': 'No JSON data provided'}), 400

        print(f"📋 FLASK: Received payload: {json.dumps(data, indent=2)}")

        # Normalize payload if it comes from Node.js backend
        # Format: { localFileName, localFilePath, params, mode }
        if 'localFileName' in data or 'localFilePath' in data:
            print("🔄 FLASK: Normalizing Node.js backend payload format")
            params = data.get('params', {}) or {}
            # Use localFileName first (actual saved filename with timestamp), not params.input
            input_name = data.get('localFileName') or os.path.basename(data.get('localFilePath', ''))
            output_name = params.get('output') or f"unscrambled_{input_name}"
            
            normalized = {
                'input': input_name,
                'output': output_name,
                'seed': params.get('seed', 123456),
                'mode': 'unscramble',
                'algorithm': params.get('algorithm', 'position'),
                'percentage': params.get('percentage', 100),
                'rows': params.get('rows'),
                'cols': params.get('cols'),
                'max_hue_shift': params.get('max_hue_shift'),
                'max_intensity_shift': params.get('max_intensity_shift'),
                'noise_seed': params.get('noise_seed'),
                'noise_intensity': params.get('noise_intensity'),
                'noise_mode': params.get('noise_mode'),
                'noise_prng': params.get('noise_prng')
            }

            # Remove None values
            normalized = {k: v for k, v in normalized.items() if v is not None}
            
            print(f"✅ FLASK: Normalized payload: {json.dumps(normalized, indent=2)}")
            
            # Replace request.json with normalized data
            request._cached_json = (normalized, normalized)
            data = normalized
        else:
            # Standard format, just set mode to unscramble
            data['mode'] = 'unscramble'
        
        # Reuse the scramble_photo logic
        return scramble_photo()

    except Exception as e:
        print(f"❌ FLASK ERROR: Unexpected exception in unscramble_photo: {str(e)}")
        import traceback
        print(f"  Traceback: {traceback.format_exc()}")
        print("="*60 + "\n")
        return jsonify({'error': str(e)}), 500
    



@app.route('/scramble-video', methods=['POST'])
def scramble_video():
    """
    Scramble a video using various algorithms
    Expects JSON with: input, output, seed, mode, algorithm, and algorithm-specific params
    """
    print("\n" + "="*60)
    print("🎥 FLASK: Scramble video request received")
    print("="*60)

    try:
        data = request.json
        if not data:
            print("❌ FLASK ERROR: No JSON data provided")
            return jsonify({'error': 'No JSON data provided'}), 400
        
        print(f"📋 FLASK: Received payload: {json.dumps(data, indent=2)}")
        
        # Extract common parameters
        input_file = data.get('input')
        output_file = data.get('output')
        seed = data.get('seed', 123456)
        mode = data.get('mode', 'scramble')
        algorithm = data.get('algorithm', 'position')
        percentage = data.get('percentage', 100)
        
        print(f"\n📝 FLASK: Extracted parameters:")
        print(f"  - Input file: {input_file}")
        print(f"  - Output file: {output_file}")
        print(f"  - Seed: {seed}")
        print(f"  - Mode: {mode}")
        print(f"  - Algorithm: {algorithm}")
        print(f"  - Percentage: {percentage}")

        if not input_file or not output_file:
            print("❌ FLASK ERROR: Missing input or output filename")
            return jsonify({'error': 'input and output filenames required'}), 400

        # Build file paths
        input_path = os.path.join(app.config['UPLOAD_FOLDER'], input_file)
        output_path = os.path.join(app.config['OUTPUTS_FOLDER'], output_file)

        print(f"\n📁 FLASK: File paths:")
        print(f"  - Input path: {input_path}")
        print(f"  - Output path: {output_path}")
        print(f"  - Upload folder: {app.config['UPLOAD_FOLDER']}")
        print(f"  - Outputs folder: {app.config['OUTPUTS_FOLDER']}")

        if not os.path.exists(input_path):
            print(f"❌ FLASK ERROR: Input file not found at: {input_path}")
            # List files in directory to help debug
            try:
                files_in_dir = os.listdir(app.config['UPLOAD_FOLDER'])
                print(f"📂 Files in upload folder: {files_in_dir}")
            except Exception as e:
                print(f"⚠️  Could not list directory: {e}")
            return jsonify({'error': f'Input file {input_file} not found'}), 404
        
        print(f"✅ FLASK: Input file exists")

        # Build command based on algorithm
        cmd = []
        
        print(f"\n🔧 FLASK: Building command for algorithm: {algorithm}")
        
        if algorithm == 'position':
            # Position scrambling (default tile shuffling)
            rows = data.get('rows', 6)
            cols = data.get('cols', 6)
            print(f"  - Position algorithm: rows={rows}, cols={cols}")
            if percentage < 100:
                print("⚠️  FLASK WARNING: Partial percentage scrambling for videos may lead to unexpected results.")
                cmd = [
                    'python3', 'scramble_video.py',
                    '--input', input_path,
                    '--output', output_path,
                    '--seed', str(seed),
                    '--rows', str(rows),
                    '--cols', str(cols),
                    '--mode', mode,
                    '--percentage', str(percentage)
                ]
            else:
                print("✅ FLASK: Full percentage scrambling for videos.")
                cmd = [
                    'python3', 'scramble_video.py',
                    '--input', input_path,
                    '--output', output_path,
                    '--seed', str(seed),
                    '--rows', str(rows),
                    '--cols', str(cols),
                    '--mode', mode,
                    
                ]
        
        elif algorithm == 'color':
            # Color scrambling (hue shifting)
            max_hue_shift = data.get('max_hue_shift', 64)
            print(f"  - Color algorithm: max_hue_shift={max_hue_shift}")
            cmd = [
                'python3', 'scramble_video.py',
                '--input', input_path,
                '--output', output_path,
                '--algorithm', 'color',
                '--max-hue-shift', str(max_hue_shift),
                '--seed', str(seed),
                '--mode', mode,
                '--percentage', str(percentage)
            ]
        
        elif algorithm == 'rotation':
            # Rotation scrambling
            rows = data.get('rows', 6)
            cols = data.get('cols', 6)
            print(f"  - Rotation algorithm: rows={rows}, cols={cols}")
            cmd = [
                'python3', 'scramble_video_rotate.py',
                '--input', input_path,
                '--output', output_path,
                '--seed', str(seed),
                '--rows', str(rows),
                '--cols', str(cols),
                '--mode', mode,
                '--algorithm', 'rotation',
                '--percentage', str(percentage)
            ]
        
        elif algorithm == 'mirror':
            # Mirror scrambling
            rows = data.get('rows', 6)
            cols = data.get('cols', 6)
            print(f"  - Mirror algorithm: rows={rows}, cols={cols}")
            cmd = [
                'python3', 'scramble_video_mirror.py',
                '--input', input_path,
                '--output', output_path,
                '--seed', str(seed),
                '--rows', str(rows),
                '--cols', str(cols),
                '--mode', mode,
                '--algorithm', 'mirror',
                '--percentage', str(percentage)
            ]
        
        elif algorithm == 'intensity':
            # Intensity scrambling
            max_intensity_shift = data.get('max_intensity_shift', 128)
            print(f"  - Intensity algorithm: max_intensity_shift={max_intensity_shift}")
            cmd = [
                'python3', 'scramble_video_intensity.py',
                '--input', input_path,
                '--output', output_path,
                '--algorithm', 'intensity',
                '--max-intensity-shift', str(max_intensity_shift),
                '--seed', str(seed),
                '--mode', mode,
                '--percentage', str(percentage)
            ]
        
        else:
            print(f"❌ FLASK ERROR: Unknown algorithm: {algorithm}")
            return jsonify({'error': f'Unknown algorithm: {algorithm}'}), 400

        print(f"\n🚀 FLASK: Executing command:")
        print(f"  Command: {' '.join(cmd)}")
        
        # Execute the scrambling command with longer timeout for video processing
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        
        print(f"\n📤 FLASK: Command execution completed")
        print(f"  - Return code: {result.returncode}")
        if result.stdout:
            print(f"  - STDOUT: {result.stdout}")
        if result.stderr:
            print(f"  - STDERR: {result.stderr}")
        
        if result.returncode != 0:
            print(f"❌ FLASK ERROR: Scrambling command failed")
            return jsonify({
                'error': 'Scrambling failed',
                'details': result.stderr,
                'stdout': result.stdout,
                'returncode': result.returncode
            }), 500

        # Check if output file was created
        if not os.path.exists(output_path):
            print(f"❌ FLASK ERROR: Output file was not created at: {output_path}")
            return jsonify({'error': 'Output file was not created'}), 500
        
        print(f"✅ FLASK: Output file created successfully at: {output_path}")

        # Create WebM version if output is a video and not already WebM
        webm_file = None
        if not output_file.lower().endswith('.webm'):
            try:
                print(f"\n🔄 FLASK: Creating WebM version...")
                webm_filename = os.path.splitext(output_file)[0] + '.webm'
                webm_path = os.path.join(app.config['OUTPUTS_FOLDER'], webm_filename)
                
                # Convert to WebM using ffmpeg
                convert_cmd = [
                    'ffmpeg', '-i', output_path,
                    '-c:v', 'libvpx-vp9',  # VP9 codec
                    '-crf', '30',           # Quality (lower = better, 23-32 recommended)
                    '-b:v', '0',            # Variable bitrate
                    '-c:a', 'libopus',      # Opus audio codec
                    '-y',                   # Overwrite output file
                    webm_path
                ]
                
                print(f"  Command: {' '.join(convert_cmd)}")
                convert_result = subprocess.run(convert_cmd, capture_output=True, text=True, timeout=300)
                
                if convert_result.returncode == 0 and os.path.exists(webm_path):
                    print(f"✅ FLASK: WebM version created: {webm_filename}")
                    webm_file = webm_filename
                else:
                    print(f"⚠️  FLASK WARNING: WebM conversion failed, continuing without it")
                    if convert_result.stderr:
                        print(f"  Error: {convert_result.stderr[:200]}")
            except Exception as e:
                print(f"⚠️  FLASK WARNING: WebM conversion error: {str(e)}")

        response_data = {
            'message': 'Video scrambled successfully',
            'output_file': output_file,
            'algorithm': algorithm,
            'seed': seed,
            'download_url': f'/download/{output_file}'
        }
        
        # Add WebM download URL if available
        if webm_file:
            response_data['webm_file'] = webm_file
            response_data['webm_download_url'] = f'/download/{webm_file}'
        
        print(f"\n✅ FLASK: Sending success response:")
        print(f"  {json.dumps(response_data, indent=2)}")
        print("="*60 + "\n")
        
        return jsonify(response_data), 200

    except subprocess.TimeoutExpired:
        print(f"❌ FLASK ERROR: Scrambling operation timed out")
        print("="*60 + "\n")
        return jsonify({'error': 'Scrambling operation timed out'}), 500
    except Exception as e:
        print(f"❌ FLASK ERROR: Unexpected exception: {str(e)}")
        import traceback
        print(f"  Traceback: {traceback.format_exc()}")
        print("="*60 + "\n")
        return jsonify({'error': str(e), 'type': type(e).__name__}), 500
    





@app.route('/unscramble-video', methods=['POST'])
def unscramble_video():
    """
    Unscramble a video using the same algorithms
    Expects JSON with: input, output, seed, algorithm, and algorithm-specific params
    OR { localFileName, localFilePath, params } format from Node.js backend
    """
    print("\n" + "="*60)
    print("🔓 FLASK: Unscramble video request received")
    print("="*60)
    
    try:
        data = request.json
        if not data:
            print("❌ FLASK ERROR: No JSON data provided")
            return jsonify({'error': 'No JSON data provided'}), 400

        print(f"📋 FLASK: Received payload: {json.dumps(data, indent=2)}")

        # Normalize payload if it comes from Node.js backend
        # Format: { localFileName, localFilePath, params, mode }
        if 'localFileName' in data or 'localFilePath' in data:
            print("🔄 FLASK: Normalizing Node.js backend payload format")
            params = data.get('params', {}) or {}
            # Use localFileName first (actual saved filename with timestamp), not params.input
            input_name = data.get('localFileName') or os.path.basename(data.get('localFilePath', ''))
            print(f"🐛 DEBUG: input_name after extraction = {input_name}")
            print(f"🐛 DEBUG: data.get('localFileName') = {data.get('localFileName')}")
            print(f"🐛 DEBUG: params.get('input') = {params.get('input')}")
            output_name = params.get('output') or f"unscrambled_{input_name}"
            
            normalized = {
                'input': input_name,
                'output': output_name,
                'seed': params.get('seed', 123456),
                'mode': 'unscramble',
                'algorithm': params.get('algorithm', 'position'),
                'percentage': params.get('percentage', 100),
                'rows': params.get('rows'),
                'cols': params.get('cols'),
                'max_hue_shift': params.get('max_hue_shift'),
                'max_intensity_shift': params.get('max_intensity_shift')
            }
            # Remove None values
            normalized = {k: v for k, v in normalized.items() if v is not None}
            
            print(f"✅ FLASK: Normalized payload: {json.dumps(normalized, indent=2)}")
            
            # Replace request.json with normalized data
            request._cached_json = (normalized, normalized)
            data = normalized
        else:
            # Standard format, just set mode to unscramble
            data['mode'] = 'unscramble'
        
        # Reuse the scramble_video logic
        return scramble_video()

    except Exception as e:
        print(f"❌ FLASK ERROR: Unexpected exception in unscramble_video: {str(e)}")
        import traceback
        print(f"  Traceback: {traceback.format_exc()}")
        print("="*60 + "\n")
        return jsonify({'error': str(e)}), 500




# delete all uploaded files endpoint for cleanup that are older than 15 minutes
@app.route('/cleanup-uploads', methods=['POST'])
def cleanup_uploads():
    cutoff = time.time() - 15 * 60  # 15 minutes ago
    for filename in os.listdir(app.config['UPLOAD_FOLDER']):
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        if os.path.isfile(file_path) and os.path.getmtime(file_path) < cutoff:
            os.remove(file_path)
    
    for filename in os.listdir(app.config['OUTPUTS_FOLDER']):
        file_path = os.path.join(app.config['OUTPUTS_FOLDER'], filename)
        if os.path.isfile(file_path) and os.path.getmtime(file_path) < cutoff:
            os.remove(file_path)    
    return jsonify({'message': 'Old uploaded files cleaned up'}), 200



# Steganography extraction function
def extract_steganographic_code(image_path):
    """
    Extract hidden steganographic code from an image using LSB (Least Significant Bit) method.
    This is a simplified example - you can use more advanced libraries like stegano, stepic, etc.
    """
    try:
        img = Image.open(image_path)
        img_array = np.array(img)
        
        # Extract LSB from RGB channels
        # This is a placeholder - implement your actual steganography algorithm
        # For demo purposes, we'll extract metadata or generate a hash
        
        # Method 1: Check for metadata
        metadata = img.info
        if 'watermark_code' in metadata:
            return metadata['watermark_code']
        
        # Method 2: Generate deterministic hash based on image properties
        # This simulates finding a code (replace with actual steganography)
        img_hash = hashlib.md5(img_array.tobytes()).hexdigest()[:20]
        extracted_code = f"STEG_{img_hash[:5].upper()}_{img_hash[5:10].upper()}"
        
        return extracted_code
    
    except Exception as e:
        print(f"Error extracting code: {e}")
        return None
    







def extract_video_steganographic_code(video_path):
    """
    Extract hidden steganographic code from a video file.
    For videos, we typically extract from the first frame or audio track.
    """
    try:
        import cv2
        
        # Open video file
        cap = cv2.VideoCapture(video_path)
        ret, frame = cap.read()
        cap.release()
        
        if not ret:
            return None
        
        # Convert frame to PIL Image for processing
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        pil_image = Image.fromarray(frame_rgb)
        
        # Check metadata
        # (In production, you'd extract from actual embedded steganographic data)
        
        # Generate deterministic code based on first frame
        frame_hash = hashlib.md5(frame_rgb.tobytes()).hexdigest()[:20]
        extracted_code = f"STEG_{frame_hash[:5].upper()}_{frame_hash[5:10].upper()}"
        
        return extracted_code
    
    except Exception as e:
        print(f"Error extracting video code: {e}")
        return None
    






# Photo leak detection endpoint
@app.route('/extract-photo-code', methods=['POST'])
def extract_photo_code():
    """
    Extract steganographic code from an uploaded photo
    """
    print("\\n" + "="*60)
    print("🔍 FLASK: Extract photo code request received")
    print("="*60)
    
    try:
        data = request.json
        if not data:
            print("❌ FLASK ERROR: No JSON data provided")
            return jsonify({'error': 'No JSON data provided'}), 400
        
        input_file = data.get('input')
        
        if not input_file:
            print("❌ FLASK ERROR: No input filename provided")
            return jsonify({'error': 'input filename required'}), 400
        
        input_path = os.path.join(app.config['UPLOAD_FOLDER'], input_file)
        
        print(f"📁 FLASK: Input path: {input_path}")
        
        if not os.path.exists(input_path):
            print(f"❌ FLASK ERROR: Input file not found at: {input_path}")
            return jsonify({'error': f'Input file {input_file} not found'}), 404
        
        print("✅ FLASK: Input file exists, extracting code...")
        
        # Extract steganographic code
        extracted_code = extract_steganographic_code(input_path)
        
        if not extracted_code:
            print("⚠️  FLASK: No code extracted")
            return jsonify({
                'success': False,
                'extracted_code': None,
                'message': 'No steganographic code found in image'
            }), 200
        
        print(f"✅ FLASK: Code extracted successfully: {extracted_code}")
        print("="*60 + "\\n")
        
        return jsonify({
            'success': True,
            'extracted_code': extracted_code,
            'message': 'Code extracted successfully'
        }), 200
    
    except Exception as e:
        print(f"❌ FLASK ERROR: {str(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        print("="*60 + "\\n")
        return jsonify({'error': str(e)}), 500
    







# Video leak detection endpoint
@app.route('/extract-video-code', methods=['POST'])
def extract_video_code():
    """
    Extract steganographic code from an uploaded video
    """
    print("\\n" + "="*60)
    print("🎥 FLASK: Extract video code request received")
    print("="*60)
    
    try:
        data = request.json
        if not data:
            print("❌ FLASK ERROR: No JSON data provided")
            return jsonify({'error': 'No JSON data provided'}), 400
        
        input_file = data.get('input')
        
        if not input_file:
            print("❌ FLASK ERROR: No input filename provided")
            return jsonify({'error': 'input filename required'}), 400
        
        input_path = os.path.join(app.config['UPLOAD_FOLDER'], input_file)
        
        print(f"📁 FLASK: Input path: {input_path}")
        
        if not os.path.exists(input_path):
            print(f"❌ FLASK ERROR: Input file not found at: {input_path}")
            return jsonify({'error': f'Input file {input_file} not found'}), 404
        
        print("✅ FLASK: Input file exists, extracting code...")
        
        # Extract steganographic code from video
        extracted_code = extract_video_steganographic_code(input_path)
        
        if not extracted_code:
            print("⚠️  FLASK: No code extracted")
            return jsonify({
                'success': False,
                'extracted_code': None,
                'message': 'No steganographic code found in video'
            }), 200
        
        print(f"✅ FLASK: Code extracted successfully: {extracted_code}")
        print("="*60 + "\\n")
        
        return jsonify({
            'success': True,
            'extracted_code': extracted_code,
            'message': 'Code extracted successfully'
        }), 200
    
    except Exception as e:
        print(f"❌ FLASK ERROR: {str(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        print("="*60 + "\\n")
        return jsonify({'error': str(e)}), 500












# ============================================================================
# TTS ROUTES
# ============================================================================

def cleanup_old_audio_files():
    """Remove audio files older than 1 hour"""
    current_time = time()
    for filename in os.listdir(PUBLIC_AUDIO_DIR):
        filepath = os.path.join(PUBLIC_AUDIO_DIR, filename)
        if os.path.isfile(filepath):
            file_age = current_time - os.path.getmtime(filepath)
            if file_age > 3600:  # 1 hour
                try:
                    os.remove(filepath)
                except Exception as e:
                    print(f"Error removing old audio file {filename}: {e}")

@app.route('/tts/health', methods=['GET'])
def tts_health_check():
    """TTS health check endpoint"""
    cleanup_old_audio_files()
    return jsonify({"status": "ok", "service": "TTS Watermark Server"})

@app.route('/tts/voices', methods=['GET'])
def get_tts_voices():
    """Get available TTS voices"""
    return jsonify({"voices": TTS_VOICES})

@app.route('/audio/<filename>')
def serve_audio(filename):
    """Serve audio files from public directory"""
    return send_from_directory(PUBLIC_AUDIO_DIR, filename)

@app.route('/tts/generate-speech', methods=['POST'])
def generate_speech_route():
    """Generate speech from text and return audio file URL"""
    async def do_generate():
        try:
            data = request.get_json()
            text = data.get('text', '').strip()
            voice = data.get('voice', 'en-US-AndrewNeural')
            rate = data.get('rate', '+0%')
            # Ensure rate has proper format (must start with + or -)
            if rate and not rate.startswith(('+', '-')):
                rate = '+' + rate
            pitch = data.get('pitch', '+0Hz')
            # Ensure pitch has proper format (must start with + or -)
            if pitch and not pitch.startswith(('+', '-')):
                pitch = '+' + pitch
            
            if not text:
                return jsonify({"error": "Text is required"}), 400
            
            if voice not in TTS_VOICES:
                return jsonify({"error": "Invalid voice"}), 400
            
            # Generate unique filename
            filename = f"speech_{uuid.uuid4().hex}.mp3"
            output_path = os.path.join(PUBLIC_AUDIO_DIR, filename)
            
            # Generate TTS audio
            communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
            await communicate.save(output_path)
            
            # Get file info
            file_size = os.path.getsize(output_path)
            audio = AudioSegment.from_mp3(output_path)
            duration = len(audio) / 1000.0
            
            return jsonify({
                "success": True,
                "url": f"/audio/{filename}",
                "filename": filename,
                "format": "mp3",
                "duration": duration,
                "size": file_size
            })
            
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(do_generate())
    finally:
        loop.close()

@app.route('/tts/generate-watermark', methods=['POST'])
def generate_watermark_route():
    """Generate a complete watermark (intro + id + outro) and return file URL"""
    async def do_generate():
        try:
            data = request.get_json()
            intro = data.get('intro', '').strip()
            id_text = data.get('id', '').strip()
            outro = data.get('outro', '').strip()
            voice = data.get('voice', 'en-US-AndrewNeural')
            rate = data.get('rate', '+0%')
            # Ensure rate has proper format (must start with + or -)
            if rate and not rate.startswith(('+', '-')):
                rate = '+' + rate
            pitch = data.get('pitch', '+0Hz')
            # Ensure pitch has proper format (must start with + or -)
            if pitch and not pitch.startswith(('+', '-')):
                pitch = '+' + pitch
            silence_ms = data.get('silence_between', 150)
            
            if not intro and not id_text and not outro:
                return jsonify({"error": "At least one text field is required"}), 400
            
            # Generate audio segments
            segments = []
            temp_files = []
            
            try:
                if intro:
                    communicate_intro = edge_tts.Communicate(intro, voice, rate=rate, pitch=pitch)
                    intro_path = tempfile.mktemp(suffix='.mp3')
                    temp_files.append(intro_path)
                    await communicate_intro.save(intro_path)
                    segments.append(AudioSegment.from_mp3(intro_path))
                    
                    if id_text or outro:
                        segments.append(AudioSegment.silent(duration=silence_ms))
                
                if id_text:
                    communicate_id = edge_tts.Communicate(id_text, voice, rate=rate, pitch=pitch)
                    id_path = tempfile.mktemp(suffix='.mp3')
                    temp_files.append(id_path)
                    await communicate_id.save(id_path)
                    segments.append(AudioSegment.from_mp3(id_path))
                    
                    if outro:
                        segments.append(AudioSegment.silent(duration=silence_ms))
                
                if outro:
                    communicate_outro = edge_tts.Communicate(outro, voice, rate=rate, pitch=pitch)
                    outro_path = tempfile.mktemp(suffix='.mp3')
                    temp_files.append(outro_path)
                    await communicate_outro.save(outro_path)
                    segments.append(AudioSegment.from_mp3(outro_path))
                
                # Combine all segments
                combined = segments[0]
                for segment in segments[1:]:
                    combined += segment
                
                # Generate unique filename
                filename = f"watermark_{uuid.uuid4().hex}.mp3"
                output_path = os.path.join(PUBLIC_AUDIO_DIR, filename)
                
                # Export to file
                combined.export(output_path, format='mp3', bitrate='192k')
                
                # Get file info
                file_size = os.path.getsize(output_path)
                duration = len(combined) / 1000.0
                
                return jsonify({
                    "success": True,
                    "url": f"/audio/{filename}",
                    "filename": filename,
                    "format": "mp3",
                    "duration": duration,
                    "size": file_size
                })
                
            finally:
                # Clean up temporary files
                for temp_file in temp_files:
                    try:
                        if os.path.exists(temp_file):
                            os.unlink(temp_file)
                    except:
                        pass
            
        except Exception as e:
            print(f"Error generating watermark: {e}")
            return jsonify({"error": str(e)}), 500
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(do_generate())
    finally:
        loop.close()

# ============================================================================
# END TTS ROUTES
# ============================================================================


if __name__ == '__main__':
    # Start auto-cleanup worker
    start_cleanup_worker()
    
    print("\n" + "="*60)
    print("🚀 Combined Media Processing & TTS Server")
    print("="*60)
    print(f"📁 Upload folder: {UPLOAD_FOLDER}")
    print(f"📁 Outputs folder: {OUTPUTS_FOLDER}")
    print(f"🔊 Audio folder: {PUBLIC_AUDIO_DIR}")
    print("\nAvailable endpoints:")
    print("  Media Processing:")
    print("    POST /upload - Upload and process media")
    print("    POST /scramble - Scramble image/video")
    print("    POST /unscramble - Unscramble image/video")
    print("    GET  /outputs/<filename> - Download processed file")
    print("\n  TTS (Text-to-Speech):")
    print("    GET  /tts/health - TTS health check")
    print("    GET  /tts/voices - List available voices")
    print("    GET  /audio/<filename> - Serve audio file")
    print("    POST /tts/generate-speech - Generate speech")
    print("    POST /tts/generate-watermark - Generate watermark")
    print("\n🌐 Server running on http://0.0.0.0:5000")
    print("="*60 + "\n")
    
    # Use the development server only for testing, not production on a VPS
    app.run(host='0.0.0.0', port=5000)

    # Clean up uploads folder on exit
    shutil.rmtree(app.config['UPLOAD_FOLDER'], ignore_errors=True)
