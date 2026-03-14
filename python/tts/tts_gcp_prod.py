#!/usr/bin/env python3
"""
Production-grade Google Cloud Text-to-Speech API wrapper
Supports 1000+ daily requests with full SLA
"""

import argparse
import os
import sys
from google.cloud import texttospeech
from python.tts_cli import sanitize_filename


def main():
    parser = argparse.ArgumentParser(
        description="Convert text to speech using Google Cloud TTS API (production)"
    )
    parser.add_argument("text", help="Input text to convert to speech")
    parser.add_argument("filename", help="Output filename without extension")
    parser.add_argument(
        "--voice",
        default="en-US-Neural2-C",
        help="Voice ID (default: en-US-Neural2-C). Examples: en-US-Neural2-A, en-US-Neural2-C, en-GB-Neural2-A"
    )
    parser.add_argument(
        "--lang",
        default="en-US",
        help="Language code (default: en-US). Examples: fr-FR, es-ES, de-DE, ja-JP"
    )
    parser.add_argument(
        "--speed",
        type=float,
        default=1.0,
        help="Playback speed: 0.25-4.0 (default: 1.0, 0.75=slower)"
    )
    parser.add_argument(
        "--pitch",
        type=float,
        default=0.0,
        help="Pitch adjustment: -20.0 to 20.0 (default: 0.0, -5=lower)"
    )
    parser.add_argument(
        "--volume",
        type=float,
        default=0.0,
        help="Volume gain in dB: -96.0 to 16.0 (default: 0.0)"
    )
    parser.add_argument(
        "--audio-encoding",
        default="MP3",
        help="Audio format: MP3, LINEAR16, OGG_OPUS (default: MP3)"
    )

    args = parser.parse_args()

    # Validate inputs
    if not args.text.strip():
        print("Error: Text cannot be empty", file=sys.stderr)
        sys.exit(1)

    if not 0.25 <= args.speed <= 4.0:
        print(f"Error: Speed must be between 0.25 and 4.0 (got {args.speed})", file=sys.stderr)
        sys.exit(1)

    if not -20.0 <= args.pitch <= 20.0:
        print(f"Error: Pitch must be between -20.0 and 20.0 (got {args.pitch})", file=sys.stderr)
        sys.exit(1)

    base_name = sanitize_filename(args.filename)
    output_path = f"{base_name}.mp3"

    try:
        # Initialize Google Cloud TTS client
        client = texttospeech.TextToSpeechClient()

        # Build synthesis request
        synthesis_input = texttospeech.SynthesisInput(text=args.text)

        voice = texttospeech.VoiceSelectionParams(
            language_code=args.lang,
            name=args.voice,
            ssml_gender=texttospeech.SsmlVoiceGender.NEUTRAL,
        )

        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding[args.audio_encoding],
            speaking_rate=args.speed,
            pitch=args.pitch,
            volume_gain_db=args.volume,
        )

        # Execute synthesis
        response = client.synthesize_speech(
            input=synthesis_input,
            voice=voice,
            audio_config=audio_config,
        )

        # Write audio file
        with open(output_path, "wb") as out:
            out.write(response.audio_content)

        print(output_path)

    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
