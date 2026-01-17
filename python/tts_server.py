"""
TTS Watermark Server
Uses edge-tts for high-quality text-to-speech generation
"""
import asyncio
import os
import tempfile
import uuid
import time
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import edge_tts
from pydub import AudioSegment
import io

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend requests

# Create public audio directory
PUBLIC_AUDIO_DIR = os.path.join(os.path.dirname(__file__), 'public_audio')
os.makedirs(PUBLIC_AUDIO_DIR, exist_ok=True)

# Available high-quality voices
VOICES = [
    "en-US-AndrewNeural",
    "en-US-AriaNeural",
    "en-US-GuyNeural",
    "en-US-JennyNeural",
    "en-GB-RyanNeural",
    "en-GB-SoniaNeural"
]

def cleanup_old_files():
    """Remove audio files older than 1 hour"""
    current_time = time.time()
    for filename in os.listdir(PUBLIC_AUDIO_DIR):
        filepath = os.path.join(PUBLIC_AUDIO_DIR, filename)
        if os.path.isfile(filepath):
            file_age = current_time - os.path.getmtime(filepath)
            if file_age > 3600:  # 1 hour
                try:
                    os.remove(filepath)
                except Exception as e:
                    print(f"Error removing old file {filename}: {e}")

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    cleanup_old_files()
    return jsonify({"status": "ok", "service": "TTS Watermark Server"})

@app.route('/voices', methods=['GET'])
def get_voices():
    """Get available TTS voices"""
    return jsonify({"voices": VOICES})

@app.route('/audio/<filename>')
def serve_audio(filename):
    """Serve audio files from public directory"""
    return send_from_directory(PUBLIC_AUDIO_DIR, filename)

@app.route('/generate-speech', methods=['POST'])
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
            
            if voice not in VOICES:
                return jsonify({"error": "Invalid voice"}), 400
            
            # Generate unique filename
            filename = f"speech_{uuid.uuid4().hex}.mp3"
            output_path = os.path.join(PUBLIC_AUDIO_DIR, filename)
            
            # Generate TTS audio with retry logic
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
                    await communicate.save(output_path)
                    break
                except Exception as e:
                    error_str = str(e)
                    if '403' in error_str and attempt < max_retries - 1:
                        wait_time = (2 ** attempt) * 0.5  # Exponential backoff
                        print(f"403 error on attempt {attempt + 1}/{max_retries}, retrying in {wait_time}s...")
                        await asyncio.sleep(wait_time)
                    else:
                        raise
            
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

@app.route('/generate-watermark', methods=['POST'])
def generate_watermark_route():
    """Generate a complete watermark (intro + id + outro) and return file URL"""
    async def generate_with_retry(text, voice, rate, pitch, max_retries=3):
        """Generate TTS with retry logic for 403 errors"""
        for attempt in range(max_retries):
            try:
                temp_path = tempfile.mktemp(suffix='.mp3')
                communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
                await communicate.save(temp_path)
                return temp_path
            except Exception as e:
                error_str = str(e)
                if '403' in error_str and attempt < max_retries - 1:
                    wait_time = (2 ** attempt) * 0.5  # Exponential backoff: 0.5s, 1s, 2s
                    print(f"403 error on attempt {attempt + 1}/{max_retries}, retrying in {wait_time}s...")
                    await asyncio.sleep(wait_time)
                else:
                    raise
        raise Exception("Max retries exceeded")
    
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
                    intro_path = await generate_with_retry(intro, voice, rate, pitch)
                    temp_files.append(intro_path)
                    segments.append(AudioSegment.from_mp3(intro_path))
                    
                    if id_text or outro:
                        segments.append(AudioSegment.silent(duration=silence_ms))
                
                if id_text:
                    id_path = await generate_with_retry(id_text, voice, rate, pitch)
                    temp_files.append(id_path)
                    segments.append(AudioSegment.from_mp3(id_path))
                    
                    if outro:
                        segments.append(AudioSegment.silent(duration=silence_ms))
                
                if outro:
                    outro_path = await generate_with_retry(outro, voice, rate, pitch)
                    temp_files.append(outro_path)
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
            error_msg = str(e)
            print(f"Error generating watermark: {error_msg}")
            
            # Provide more helpful error message for 403 errors
            if '403' in error_msg:
                return jsonify({
                    "error": "Microsoft Edge TTS service returned 403 Forbidden. This can happen due to: "
                             "(1) Rate limiting - too many requests, (2) Geographic restrictions, "
                             "(3) Service token expired. Try updating edge-tts: pip install --upgrade edge-tts",
                    "details": error_msg,
                    "solution": "Wait a few minutes and try again, or update edge-tts library"
                }), 503  # Service Unavailable is more appropriate than 500
            
            return jsonify({"error": error_msg}), 500
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(do_generate())
    finally:
        loop.close()

@app.route('/apply-watermark', methods=['POST'])
def apply_watermark_route():
    """Apply watermark to an audio file at intervals and return file URL"""
    async def do_apply():
        try:
            data = request.get_json()
            
            # Get watermark file URL
            watermark_url = data.get('watermark_url', '')
            if not watermark_url:
                return jsonify({"error": "Watermark URL is required"}), 400
            
            # Get original audio file (uploaded from frontend)
            # This would need to be handled differently - see note below
            
            return jsonify({"error": "Not implemented - use client-side watermark application"}), 501
            
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(do_apply())
    finally:
        loop.close()

if __name__ == '__main__':
    print("Starting TTS Watermark Server...")
    print(f"Audio files will be saved to: {PUBLIC_AUDIO_DIR}")
    print("Available endpoints:")
    print("  GET  /health - Health check")
    print("  GET  /voices - List available voices")
    print("  GET  /audio/<filename> - Serve audio file")
    print("  POST /generate-speech - Generate single speech segment")
    print("  POST /generate-watermark - Generate complete watermark")
    print("\nServer running on http://localhost:5001")
    app.run(host='0.0.0.0', port=5001, debug=True)
