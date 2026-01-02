#!/bin/bash
# Demo: Scrambling with Tileable Noise

echo "=========================================="
echo "Photo Scrambler with Tileable Noise Demo"
echo "=========================================="
echo ""

ORIGINAL="test_images/Lamborghini_Veneno.jpg"
SCRAMBLED="outputs/demo_noise_scrambled.png"
UNSCRAMBLED="outputs/demo_noise_unscrambled.png"
SEED=54321

echo "1. Original image: $ORIGINAL"
echo ""

echo "2. Scrambling with noise..."
echo "   - 4x4 grid"
echo "   - Noise intensity: 64 (moderate)"
echo "   - Tile size: 16x16"
echo ""

python3 scramble_photo.py \
  --input "$ORIGINAL" \
  --output "$SCRAMBLED" \
  --seed $SEED \
  --rows 4 \
  --cols 4 \
  --noise-intensity 64 \
  --noise-tile-size 16 \
  --mode scramble

echo ""
echo "3. Unscrambling and removing noise..."
echo ""

python3 scramble_photo.py \
  --input "$SCRAMBLED" \
  --output "$UNSCRAMBLED" \
  --seed $SEED \
  --rows 4 \
  --cols 4 \
  --noise-intensity 64 \
  --noise-tile-size 16 \
  --mode unscramble

echo ""
echo "=========================================="
echo "Demo Complete!"
echo "=========================================="
echo ""
echo "Output files:"
echo "  Scrambled (with noise): $SCRAMBLED"
echo "  Unscrambled (original):  $UNSCRAMBLED"
echo ""
echo "The noise is:"
echo "  ✓ Tileable (no seams)"
echo "  ✓ Deterministic (based on seed)"
echo "  ✓ Reversible (perfectly removed on unscramble)"
echo "  ✓ Applied BEFORE scrambling"
echo "  ✓ Removed AFTER unscrambling"
echo ""
