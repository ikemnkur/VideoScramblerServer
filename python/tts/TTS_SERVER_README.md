# TTS Watermark Server Setup

## Quick Start

### 1. Install Python Dependencies

```bash
pip install -r tts_requirements.txt
```

**Note:** You also need `ffmpeg` installed on your system for pydub to work:
- **Ubuntu/Debian:** `sudo apt-get install ffmpeg`
- **macOS:** `brew install ffmpeg`
- **Windows:** Download from https://ffmpeg.org/download.html

### 2. Start the TTS Server

```bash
python tts_server.py
```

The server will start on `http://localhost:5001`

### 3. Open the Audio Tagging Page

Open `src/pages/audio_tagging.html` in your browser and start generating watermarks!

## Features

- **High-Quality TTS**: Uses Microsoft Edge's neural voices
- **Multiple Voices**: Choose from 6 different English voices
- **Adjustable Speech Rate**: Control how fast the text is spoken
- **Watermark Generation**: Combine intro, ID, and outro text
- **Audio Processing**: Apply watermarks at intervals to your audio files

## API Endpoints

### `GET /health`
Health check endpoint

### `GET /voices`
List all available TTS voices

### `POST /generate-speech`
Generate speech from a single text string

**Request Body:**
```json
{
  "text": "Text to speak",
  "voice": "en-US-AndrewNeural",
  "rate": "+0%",
  "pitch": "+0Hz"
}
```

### `POST /generate-watermark`
Generate a complete watermark (intro + id + outro)

**Request Body:**
```json
{
  "intro": "Unscrambled by",
  "id": "USER 4821",
  "outro": "on scramblurr.com",
  "voice": "en-US-AndrewNeural",
  "rate": "+0%",
  "pitch": "+0Hz",
  "silence_between": 150
}
```

### `POST /apply-watermark`
Apply watermark to an audio file at intervals

**Request Body:**
```json
{
  "original_audio": "base64_encoded_audio",
  "watermark_text": {
    "intro": "Unscrambled by",
    "id": "USER 4821",
    "outro": "on scramblurr.com"
  },
  "voice": "en-US-AndrewNeural",
  "interval_seconds": 10,
  "start_offset": 0,
  "watermark_volume_db": -12
}
```

## Available Voices

- `en-US-AndrewNeural` - Male (Andrew)
- `en-US-AriaNeural` - Female (Aria)
- `en-US-GuyNeural` - Male (Guy)
- `en-US-JennyNeural` - Female (Jenny)
- `en-US-ChristopherNeural` - Male (Christopher)
- `en-US-EmmaNeural` - Female (Emma)

## Troubleshooting

**Error: "TTS server is not running"**
- Make sure you ran `python tts_server.py`
- Check that the server is running on port 5001
- Verify no firewall is blocking the connection

**Error: "No module named 'edge_tts'"**
- Run `pip install -r tts_requirements.txt`

**Error: Pydub can't find ffmpeg**
- Install ffmpeg on your system (see installation instructions above)
- Make sure ffmpeg is in your system PATH

## Integration with Main App

To integrate this with your main VideoScramblerApp:

1. Add TTS server startup to your main startup script
2. Update `VITE_TTS_SERVER_URL` in your `.env` file (if needed)
3. The audio tagging page automatically connects to `http://localhost:5001`

## Production Deployment

For production, consider:
- Using a process manager like `pm2` or `supervisor`
- Setting up proper logging
- Adding authentication to the API endpoints
- Using environment variables for configuration
- Deploying behind a reverse proxy (nginx)
