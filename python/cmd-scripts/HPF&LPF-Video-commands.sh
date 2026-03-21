# Basic scramble (auto grid)
python3 scramble_video2x_blur.py --input video.mp4 --output scrambled.mp4

# Scramble with specific seed
python3 scramble_video2x_blur.py -i video.mp4 -o scrambled.mp4 --seed 12345

# Scramble with custom grid size
python3 scramble_video2x_blur.py -i video.mp4 -o scrambled.mp4 --rows 4 --cols 6

# Unscramble using params file
python3 scramble_video2x_blur.py -i scrambled.mp4 -o original.mp4 --mode unscramble --seed 12345 --rows 4 --cols 6

# Scramble only 50% of tiles
python3 scramble_video2x_blur.py -i video.mp4 -o scrambled.mp4 --percentage 50

# Scramble only 25% of tiles with custom grid
python3 scramble_video2x_blur.py -i video.mp4 -o scrambled.mp4 --rows 5 --cols 5 --percentage 25 --seed 9999

# Basic color scramble
python3 scramble_video2x_blur.py -i video.mp4 -o color_scrambled.mp4 --algorithm color

# Color scramble with max hue shift
python3 scramble_video2x_blur.py -i video.mp4 -o color_scrambled.mp4 --algorithm color --max-hue-shift 128

# Color scramble with moderate shift and custom grid
python3 scramble_video2x_blur.py -i video.mp4 -o color_scrambled.mp4 --algorithm color --max-hue-shift 64 --rows 3 --cols 4

# Unscramble color-scrambled video
python3 scramble_video2x_blur.py -i color_scrambled.mp4 -o original.mp4 --mode unscramble --algorithm color --seed 12345




# Basic HPF scramble
python3 scramble_video2x_blur.py -i video.mp4 -o hpf_scrambled.mp4 --algorithm hpf

# HPF with custom blur kernel size (more blur = more scrambling)
python3 scramble_video2x_blur.py -i video.mp4 -o hpf_scrambled.mp4 --algorithm hpf --blur-ksize 25

# HPF with watermark space (top/bottom empty rows)
python3 scramble_video2x_blur.py -i video.mp4 -o hpf_scrambled.mp4 --algorithm hpf --watermark-rows 2

# HPF with all options
python3 scramble_video2x_blur.py -i video.mp4 -o hpf_scrambled.mp4 --algorithm hpf --rows 4 --cols 4 --blur-ksize 21 --watermark-rows 3 --seed 7777

# Unscramble HPF video
python3 scramble_video2x_blur.py -i hpf_scrambled.mp4 -o original.mp4 --mode unscramble --algorithm hpf --seed 7777 --rows 4 --cols 4 --blur-ksize 21 --watermark-rows 3



# Output as WebM
python3 scramble_video2x_blur.py -i video.mp4 -o scrambled.webm

# Output as AVI
python3 scramble_video2x_blur.py -i video.mp4 -o scrambled.avi

# Output as MP4
python3 scramble_video2x_blur.py -i video.webm -o scrambled.mp4


#Complete HPF scramble with all options and unscramble
python3 scramble_video2x_blur.py \
  -i hpf_scrambled.mp4 -o original.mp4 \
  --mode unscramble --algorithm hpf \
  --seed 7777 --rows 4 --cols 4 \
  --blur-ksize 21 --watermark-rows 3 \
  --wm-id 65256 \
  --wm-alpha 0.025 \
  --wm-scale 1.0 \
  --wm-numbers 4 \
  --wm-duration 10 \
  --wm-placement custom \
  --wm-max-margin 30 \
  --wm-min-margin 5