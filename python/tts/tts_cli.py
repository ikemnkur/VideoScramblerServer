import argparse
import os
import pyttsx3


def sanitize_filename(name: str) -> str:
	safe = "".join(c for c in name if c.isalnum() or c in ("-", "_"))
	return safe or "output"


def main():
	parser = argparse.ArgumentParser(description="Convert text to speech and save as MP3")
	
	parser.add_argument("--filename", help="Output filename without extension")
	parser.add_argument("--speed", type=float, default=150, help="Speech speed in words per minute (default: 150, slower: 80-120)")
	parser.add_argument("--pitch", type=float, default=1.0, help="Pitch level (default: 1.0, lower: 0.5-0.9)")
	parser.add_argument("--volume", type=float, default=1.0, help="Volume level 0-1 (default: 1.0)")
	parser.add_argument("--pause", type=float, default=0.1, help="Pause between words in seconds (default: 0.1)")
	parser.add_argument("--text", help="Input text to convert to speech")
	args = parser.parse_args()

	base_name = sanitize_filename(args.filename)
	wav_path = f"{base_name}.wav"
	mp3_path = f"{base_name}.mp3"

	engine = pyttsx3.init()
	engine.setProperty('rate', args.speed)
	engine.setProperty('pitch', args.pitch)
	engine.setProperty('volume', args.volume)
	
	# Add pauses between words
	text_with_pauses = args.text
	if args.pause > 0.1:
		text_with_pauses = " ".join(word for word in args.text.split()) # normalize spacing
		text_with_pauses = f" {'<break time=\"' + str(int(args.pause * 1000)) + 'ms\"/>'} ".join(text_with_pauses.split())
	
	engine.save_to_file(text_with_pauses, wav_path)
	engine.runAndWait()

	if os.system(f"ffmpeg -y -i {wav_path} {mp3_path}") != 0:
		raise RuntimeError("ffmpeg conversion failed")

	print(mp3_path)


if __name__ == "__main__":
	main()
