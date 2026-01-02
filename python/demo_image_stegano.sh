#!/bin/bash
# Quick demo of Image Hybrid Steganography

echo "=========================================="
echo "Image Hybrid Steganography Demo"
echo "25% Spatial Noise Implementation"
echo "=========================================="
echo ""

# Test image
ORIGINAL="test_images/Lamborghini_Veneno.jpg"
MODIFIED="outputs/demo_stego.png"
SECRET="This is my secret data hidden in the image!"

echo "1. Embedding secret data..."
echo "   Original: $ORIGINAL"
echo "   Secret: '$SECRET'"
echo ""

python3 image_hybrid_stegano.py \
  --mode embed \
  --original "$ORIGINAL" \
  --modified "$MODIFIED" \
  --data "$SECRET" \
  --seed "demo_key_123" \
  --intensity 64 \
  --redundancy 5

echo ""
echo "2. Extracting data..."
echo ""

python3 image_hybrid_stegano.py \
  --mode extract \
  --original "$ORIGINAL" \
  --modified "$MODIFIED" \
  --seed "demo_key_123" \
  --intensity 64 \
  --redundancy 5

echo ""
echo "=========================================="
echo "Demo Complete!"
echo "=========================================="
echo ""
echo "Key features:"
echo "  ✓ 25% spatial noise (64/255 intensity)"
echo "  ✓ 5x redundancy for error correction"
echo "  ✓ Survives PNG re-encoding"
echo "  ✓ Supports up to VARCHAR(255)"
echo ""
echo "Output saved to: $MODIFIED"
echo ""
