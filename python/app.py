import json
import math
import os
import subprocess
from time import time
from flask import Flask, send_from_directory, current_app, request, jsonify, redirect, url_for
from flask_cors import CORS
from werkzeug.utils import secure_filename
from config import UPLOAD_FOLDER
import secrets
from dataclasses import dataclass
from typing import List, Dict, Any, Tuple
from flask import g
from PIL import Image
import numpy as np
import hashlib

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Configure the upload folder location
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Allowed file extensions
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'mp4', 'avi', 'mov', 'mkv', 'webm'}

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Ensure the upload folder exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

@app.route('/')
def index():
    return '''
    <!DOCTYPE html>
    <html>
    <head>
        <title>Media Upload/Download Server</title>
    </head>
    <body>
        <h1>Media Upload/Download Server</h1>
        <h2>Upload File</h2>
        <form method="POST" action="/upload" enctype="multipart/form-data">
            <input type="file" name="file" accept=".png,.jpg,.jpeg,.gif,.bmp,.mp4,.avi,.mov,.mkv,.webm" required>
            <input type="submit" value="Upload">
        </form>
        <h2>Download Files</h2>
        <p>Access files via: <code>/download/&lt;filename&gt;</code></p>
        <p>Example: <a href="/download/mine.png">/download/mine.png</a></p>
    </body>
    </html>
    '''

@app.route('/download/<path:filename>')
def download_file(filename):
    # Construct the absolute path to the upload folder for security
    # send_from_directory ensures the requested filename is within this directory
    # protecting against directory traversal attacks.
    directory = os.path.join(current_app.root_path, app.config['UPLOAD_FOLDER'])
    return send_from_directory(
        directory, 
        filename, 
        as_attachment=True # Forces the browser to download the file
    )

@app.route('/files')
def list_files():
    """List all available files for download"""
    try:
        files = os.listdir(app.config['UPLOAD_FOLDER'])
        files = [f for f in files if os.path.isfile(os.path.join(app.config['UPLOAD_FOLDER'], f))]
        return jsonify({'files': files}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    

# Scramble a photo using various algorithms
# it looks for a file with a given filename, it should be in the python/inputs folder

@app.route('/scramble-photo-old', methods=['POST'])
def scramble_photo_old():
    """
    Scramble a photo using various algorithms (OLD VERSION)
    Expects JSON with: input, output, seed, mode, algorithm, and algorithm-specific params
    """
    # Accept payloads from the other backend which send:
    # { localFileName, localFilePath, params }
    # Normalize that into the expected schema (input, output, seed, mode, algorithm, ...)
    # incoming = request.get_json(silent=True)
    # if incoming and ('localFileName' in incoming or 'localFilePath' in incoming):
    #     params = incoming.get('params', {}) or {}
    #     input_name = incoming.get('localFileName') or os.path.basename(incoming.get('localFilePath', ''))
    #     output_name = params.get('output') or f"scrambled_{input_name}"
    #     normalized = {
    #         'input': input_name,
    #         'output': output_name,
    #         'seed': params.get('seed', 123456),
    #         'mode': params.get('mode', 'scramble'),
    #         'algorithm': params.get('algorithm', 'position'),
    #         'percentage': params.get('percentage', 100),
    #         'rows': params.get('rows'),
    #         'cols': params.get('cols'),
    #         'max_hue_shift': params.get('max_hue_shift'),
    #         'max_intensity_shift': params.get('max_intensity_shift')
    #     }
    #     # remove unset keys
    #     normalized = {k: v for k, v in normalized.items() if v is not None}
    #     # Cache normalized JSON so the code below (which reads request.json) gets this payload
    #     try:
    #         request._cached_json = normalized
    #     except Exception:
    #         # best-effort fallback: attach to flask.g (rarely needed)
    #         g.normalized_payload = normalized

    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400

        # Extract common parameters
        input_file = data.get('input')
        output_file = data.get('output')
        seed = data.get('seed', 123456)
        mode = data.get('mode', 'scramble')
        algorithm = data.get('algorithm', 'position')
        percentage = data.get('percentage', 100)

        if not input_file or not output_file:
            return jsonify({'error': 'input and output filenames required'}), 400

        # Build file paths
        input_path = os.path.join(app.config['UPLOAD_FOLDER'], input_file)
        output_path = os.path.join(app.config['UPLOAD_FOLDER'], output_file)

        if not os.path.exists(input_path):
            return jsonify({'error': f'Input file {input_file} not found'}), 404

        # Build command based on algorithm
        cmd = []
        
        if algorithm == 'position':
            # Position scrambling (default tile shuffling)
            rows = data.get('rows', 6)
            cols = data.get('cols', 6)
            cmd = [
                'python3', 'scramble_photo.py',
                '--input', input_path,
                '--output', output_path,
                '--seed', str(seed),
                '--rows', str(rows),
                '--cols', str(cols),
                '--mode', mode,
                '--percentage', str(percentage)
            ]
        
        elif algorithm == 'color':
            # Color scrambling (hue shifting)
            max_hue_shift = data.get('max_hue_shift', 64)
            cmd = [
                'python3', 'scramble_photo.py',
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
            cmd = [
                'python3', 'scramble_photo_rotate.py',
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
            cmd = [
                'python3', 'scramble_photo_mirror.py',
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
            cmd = [
                'python3', 'scramble_photo_intensity.py',
                '--input', input_path,
                '--output', output_path,
                '--algorithm', 'intensity',
                '--max-intensity-shift', str(max_intensity_shift),
                '--seed', str(seed),
                '--mode', mode,
                '--percentage', str(percentage)
            ]
        
        else:
            return jsonify({'error': f'Unknown algorithm: {algorithm}'}), 400

        # Execute the scrambling command
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        
        if result.returncode != 0:
            return jsonify({
                'error': 'Scrambling failed',
                'details': result.stderr
            }), 500

        # Check if output file was created
        if not os.path.exists(output_path):
            return jsonify({'error': 'Output file was not created'}), 500

        return jsonify({
            'message': 'Photo scrambled successfully',
            'output_file': output_file,
            'algorithm': algorithm,
            'seed': seed,
            'download_url': f'/download/{output_file}'
        }), 200

    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Scrambling operation timed out'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


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
        output_path = os.path.join(app.config['UPLOAD_FOLDER'], output_file)

        print(f"\n📁 FLASK: File paths:")
        print(f"  - Input path: {input_path}")
        print(f"  - Output path: {output_path}")
        print(f"  - Upload folder: {app.config['UPLOAD_FOLDER']}")

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
                '--percentage', str(percentage)
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
                '--percentage', str(percentage)
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
                '--percentage', str(percentage)
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
                '--percentage', str(percentage)
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
                '--percentage', str(percentage)
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
            input_name = params.get('input') or data.get('localFileName') or os.path.basename(data.get('localFilePath', ''))
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
        output_path = os.path.join(app.config['UPLOAD_FOLDER'], output_file)

        print(f"\n📁 FLASK: File paths:")
        print(f"  - Input path: {input_path}")
        print(f"  - Output path: {output_path}")
        print(f"  - Upload folder: {app.config['UPLOAD_FOLDER']}")

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

        response_data = {
            'message': 'Video scrambled successfully',
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
            input_name = params.get('input') or data.get('localFileName') or os.path.basename(data.get('localFilePath', ''))
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












if __name__ == '__main__':
    # Use the development server only for testing, not production on a VPS
    app.run(host='0.0.0.0', port=5000)
