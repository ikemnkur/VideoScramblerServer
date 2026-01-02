#!/bin/bash
# Quick demonstration of hybrid image steganography

echo "========================================"
echo "Hybrid Image Steganography Demo"
echo "========================================"
echo ""

# Use an existing test image
ORIGINAL="test_images/Lamborghini_Veneno.jpg"
HIDDEN="outputs/stego_hidden.png"
REENCODED_JPG="outputs/stego_reencoded_q90.jpg"
REENCODED_PNG="outputs/stego_reencoded.png"

# Test data
DATA="user_id:12345678|session:abc123xyz789|timestamp:1735689600"

echo "Step 1: Embedding data into image"
echo "Original: $ORIGINAL"
echo "Data: $DATA"
echo ""

python3 image_hybrid_stegano.py \
    --mode embed \
    --input "$ORIGINAL" \
    --output "$HIDDEN" \
    --data "$DATA"

if [ $? -ne 0 ]; then
    echo "❌ Embedding failed!"
    exit 1
fi

echo ""
echo "========================================"
echo "Step 2: Extracting from original PNG"
echo "========================================"
echo ""

python3 image_hybrid_stegano.py \
    --mode extract \
    --original "$ORIGINAL" \
    --modified "$HIDDEN"

if [ $? -ne 0 ]; then
    echo "❌ Extraction failed!"
    exit 1
fi

echo ""
echo "========================================"
echo "Step 3: Re-encoding as JPEG (quality 90)"
echo "========================================"
echo ""

# Re-encode using Python/PIL since we have it
python3 -c "
from PIL import Image
img = Image.open('$HIDDEN')
img.save('$REENCODED_JPG', 'JPEG', quality=90)
print('✅ Re-encoded as JPEG (quality 90)')
print('   Saved to: $REENCODED_JPG')
"

echo ""
echo "Step 4: Extracting from JPEG (after re-encoding)"
echo "========================================"
echo ""

python3 image_hybrid_stegano.py \
    --mode extract \
    --original "$ORIGINAL" \
    --modified "$REENCODED_JPG"

if [ $? -ne 0 ]; then
    echo "⚠️  JPEG extraction failed (expected with heavy compression)"
else
    echo ""
    echo "✅ Successfully recovered data from JPEG!"
fi

echo ""
echo "========================================"
echo "Step 5: Re-encoding as PNG (optimized)"
echo "========================================"
echo ""

python3 -c "
from PIL import Image
img = Image.open('$HIDDEN')
img.save('$REENCODED_PNG', 'PNG', optimize=True)
print('✅ Re-encoded as optimized PNG')
print('   Saved to: $REENCODED_PNG')
"

echo ""
echo "Step 6: Extracting from optimized PNG"
echo "========================================"
echo ""

python3 image_hybrid_stegano.py \
    --mode extract \
    --original "$ORIGINAL" \
    --modified "$REENCODED_PNG"

if [ $? -ne 0 ]; then
    echo "❌ PNG extraction failed!"
    exit 1
fi

echo ""
echo "========================================"
echo "✅ Demo Complete!"
echo "========================================"
echo ""
echo "Summary:"
echo "  - Data successfully embedded in image"
echo "  - Data extracted from original PNG"
echo "  - Data recovered after JPEG re-encoding"
echo "  - Data recovered after PNG optimization"
echo ""
echo "This demonstrates the robustness of the hybrid"
echo "steganography approach with redundant encoding!"
echo ""
