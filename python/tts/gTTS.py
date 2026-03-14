from gtts import gTTS
import argparse
import os
import subprocess

def sanitize_filename(name: str) -> str:
	safe = "".join(c for c in name if c.isalnum() or c in ("-", "_"))
	return safe or "output"


def main():
    parser = argparse.ArgumentParser(description="Convert text to speech using Google TTS and save as MP3")
    parser.add_argument("--text", help="Input text to convert to speech")
    parser.add_argument("--filename", help="Output filename without extension")
    parser.add_argument("--speed", type=float, default=1.0, help="Playback speed (0.5=half speed, 1.0=normal, 1.5=faster)")
    parser.add_argument("--lang", default='en', help="Language code (default: en)")
    parser.add_argument("--slow", action='store_true', help="Use slow speech mode")

    args = parser.parse_args()

    base_name = sanitize_filename(args.filename)
    mp3_path = f"{base_name}.mp3"
    temp_mp3 = f"{base_name}_temp.mp3"

    text = args.text
    language = args.lang

    # Create a gTTS object
    speech = gTTS(text=text, lang=language, slow=args.slow)

    # Save the audio file
    speech.save(temp_mp3)

    # Apply speed adjustment using ffmpeg if needed
    if args.speed != 1.0:
        speed_filter = f"atempo={args.speed}"
        cmd = f"ffmpeg -y -i {temp_mp3} -af {speed_filter} {mp3_path}"
        if os.system(cmd) != 0:
            raise RuntimeError("ffmpeg speed adjustment failed")
        os.remove(temp_mp3)
    else:
        os.rename(temp_mp3, mp3_path)

    print(mp3_path)


if __name__ == "__main__":
    main()