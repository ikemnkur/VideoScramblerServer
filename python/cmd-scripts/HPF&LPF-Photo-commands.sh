# Scramble with auto-detected grid size
python3 python/scramble_photo2x_blur.py \
  -i input_photo.jpg \
  -o scrambled_photo.jpg

# Scramble with specific grid size and seed
python3 python/scramble_photo2x_blur.py \
  -i input_photo.jpg \
  -o scrambled_photo.jpg \
  --seed 12345 \
  --rows 6 \
  --cols 6

# Unscramble (use same seed and grid)
python3 python/scramble_photo2x_blur.py \
  -i scrambled_photo.jpg \
  -o restored_photo.jpg \
  --seed 12345 \
  --rows 6 \
  --cols 6 \
  --mode unscramble

  # HPF scramble with default 1 watermark row
python3 python/scramble_photo2x_blur.py \
  -i input_photo.jpg \
  -o scrambled_hpf.jpg \
  --algorithm hpf \
  --seed 99999 \
  --rows 4 \
  --cols 4

# HPF scramble with 2 watermark rows and larger blur
python3 python/scramble_photo2x_blur.py \
  -i input_photo.jpg \
  -o scrambled_hpf.jpg \
  --algorithm hpf \
  --seed 99999 \
  --rows 4 \
  --cols 4 \
  --blur-ksize 21 \
  --watermark-rows 2

# HPF unscramble
python3 python/scramble_photo2x_blur.py \
  -i scrambled_hpf.jpg \
  -o restored_photo.jpg \
  --algorithm hpf \
  --seed 99999 \
  --rows 4 \
  --cols 4 \
  --mode unscramble \
  --watermark-rows 2

  # Scramble only 50% of tiles (spatial only)
python3 python/scramble_photo2x_blur.py \
  -i input_photo.jpg \
  -o partial_scrambled.jpg \
  --seed 12345 \
  --percentage 50

# Scramble 75% of tiles with specific grid
python3 python/scramble_photo2x_blur.py \
  -i input_photo.jpg \
  -o partial_scrambled.jpg \
  --seed 12345 \
  --rows 5 \
  --cols 5 \
  --percentage 75

  # Add moderate noise (intensity 64) before scrambling
python3 python/scramble_photo2x_blur.py \
  -i input_photo.jpg \
  -o noisy_scrambled.jpg \
  --seed 12345 \
  --noise_intensity 64

# Unscramble with noise removal (use same seed)
python3 python/scramble_photo2x_blur.py \
  -i noisy_scrambled.jpg \
  -o restored_photo.jpg \
  --seed 12345 \
  --mode unscramble \
  --noise_intensity 64

  # Create a test image and scramble it
python3 -c "
import cv2
import numpy as np
img = np.random.randint(0, 256, (480, 640, 3), dtype=np.uint8)
cv2.rectangle(img, (100, 100), (540, 380), (0, 255, 0), -1)
cv2.circle(img, (320, 240), 80, (255, 0, 0), -1)
cv2.imwrite('/tmp/test_photo.jpg', img)
print('Test image created: /tmp/test_photo.jpg')
"

# HPF scramble the test image
python3 python/scramble_photo2x_blur.py \
  -i /tmp/test_photo.jpg \
  -o /tmp/test_scrambled.jpg \
  --algorithm hpf \
  --rows 4 \
  --cols 4 \
  --seed 12345 \
  --watermark-rows 2

# Unscramble it
python3 python/scramble_photo2x_blur.py \
  -i /tmp/test_scrambled.jpg \
  -o /tmp/test_restored.jpg \
  --algorithm hpf \
  --rows 4 \
  --cols 4 \
  --seed 12345 \
  --mode unscramble \
  --watermark-rows 2

  python3 scramble_photo2x_blur.py \
  -i scrambled_hpf.jpg \
  -o restored_photo.jpg \
  --algorithm hpf \
  --seed 99999 \
  --rows 16 \
  --cols 16 \
  --blur-ksize 48 \
  --watermark-rows 2 \
  --mode unscramble