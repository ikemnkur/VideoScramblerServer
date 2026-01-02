# Hybrid Image Steganography

A robust steganography system that embeds data into images as noise-like patterns with high redundancy, allowing data recovery even after re-encoding (JPEG, PNG, etc.).

## Features

- **Redundant Embedding**: Each bit is stored 7 times for error correction
- **Noise-Like Patterns**: Data appears as subtle disturbances (±3 intensity levels)
- **Multiple Copies**: Data is distributed throughout the image in multiple locations
- **Majority Voting**: Robust extraction using consensus across redundant copies
- **Re-encoding Resilient**: Works even after JPEG/PNG compression and optimization
- **Large Capacity**: Supports up to 255 characters (VARCHAR size)
- **Format Support**: Works with both grayscale and color images

## How It Works

### Embedding Process
1. Data is encoded with a length prefix (1 byte + data)
2. Each bit is converted to a binary representation
3. Each bit is embedded multiple times (7x redundancy) throughout the image
4. Bits are stored by adding or subtracting a small amplitude (±3) to pixel values
5. Multiple complete copies are distributed across the image

### Extraction Process
1. Original and modified images are compared (pixel-by-pixel subtraction)
2. The difference reveals the embedded noise patterns
3. Multiple encoding positions are scanned
4. Redundant bits are recovered using majority voting
5. Valid encodings are extracted and compared
6. Final result is determined by consensus

## Installation

Requires Python 3.6+ and PIL/Pillow:

```bash
pip install Pillow numpy
```

## Usage

### Embed Data

```bash
python3 image_hybrid_stegano.py \
    --mode embed \
    --input original.jpg \
    --output hidden.png \
    --data "Secret message here"
```

### Extract Data

```bash
python3 image_hybrid_stegano.py \
    --mode extract \
    --original original.jpg \
    --modified hidden.png
```

### Test with Re-encoding

```bash
# 1. Embed data
python3 image_hybrid_stegano.py \
    --mode embed \
    --input photo.png \
    --output hidden.png \
    --data "Test123"

# 2. Re-encode the image (simulating upload/download)
convert hidden.png -quality 90 reencoded.jpg

# 3. Extract (should still work!)
python3 image_hybrid_stegano.py \
    --mode extract \
    --original photo.png \
    --modified reencoded.jpg
```

## Running Tests

Run the comprehensive test suite:

```bash
python3 test_image_hybrid_stegano.py
```

This tests:
- Basic embedding and extraction
- JPEG re-encoding at various quality levels
- PNG optimization
- Maximum data length (255 chars)
- Grayscale image support
- Realistic VARCHAR data types

## Use Cases

### 1. User Authentication Tokens
```bash
# Embed user ID and session token
python3 image_hybrid_stegano.py \
    --mode embed \
    --input avatar.png \
    --output avatar_signed.png \
    --data "user_id:12345|token:abc123xyz"
```

### 2. Watermarking with Metadata
```bash
# Embed copyright and tracking info
python3 image_hybrid_stegano.py \
    --mode embed \
    --input photo.jpg \
    --output photo_watermarked.png \
    --data "©2026 Company Inc|id:IMG_98765"
```

### 3. Verification Codes
```bash
# Embed verification URL
python3 image_hybrid_stegano.py \
    --mode embed \
    --input document.png \
    --output document_verified.png \
    --data "https://verify.example.com?code=XYZ123"
```

### 4. Database Reference Keys
```bash
# Embed foreign key reference
python3 image_hybrid_stegano.py \
    --mode embed \
    --input product.jpg \
    --output product_tagged.png \
    --data '{"db":"products","id":"prod_1234567890"}'
```

## Technical Details

### Parameters
- **Redundancy**: 7 copies per bit
- **Amplitude**: ±3 intensity levels
- **Block Size**: 8 pixels (for future block-based implementations)
- **Max Data**: 255 characters (VARCHAR size)

### Image Requirements
- Minimum size: ~100x100 pixels (for 255 char data)
- Recommended: 800x600 or larger for better resilience
- Formats: PNG, JPG, BMP, etc. (any PIL-supported format)

### Robustness
The system is designed to survive:
- JPEG compression (quality 85+)
- PNG optimization
- Minor color adjustments
- Slight scaling/resizing
- Format conversions

It may NOT survive:
- Heavy compression (JPEG quality < 80)
- Aggressive filtering/blurring
- Significant cropping
- Color space conversions (RGB ↔ CMYK)

## Comparison with Traditional Steganography

| Feature | Traditional LSB | Hybrid Approach |
|---------|----------------|-----------------|
| Redundancy | None | 7x per bit |
| Re-encoding | ❌ Fails | ✅ Survives |
| Error Correction | ❌ No | ✅ Majority voting |
| Visibility | Imperceptible | Minimal noise |
| Capacity | High | Moderate (255 chars) |
| Recovery Method | Direct read | Differential comparison |

## API Usage

You can also use the class directly in your Python code:

```python
from image_hybrid_stegano import ImageHybridSteganography

# Initialize
stego = ImageHybridSteganography()

# Embed
stego.embed_data('original.jpg', 'hidden.png', 'Secret data')

# Extract
data = stego.extract_data('original.jpg', 'hidden.png')
print(f"Extracted: {data}")
```

## Limitations

- Maximum data size: 255 characters
- Requires original image for extraction
- Works best with images that have some natural variation
- Very uniform/solid color images may show visible patterns
- Extraction accuracy decreases with heavy compression

## Security Note

This system is designed for **data integrity and recovery**, not security. The embedded data:
- Is not encrypted
- Can be detected with the original image
- Should not be used for sensitive information without additional encryption

For secure applications, encrypt your data before embedding.

## License

MIT License - feel free to use in your projects!

## Contributing

Improvements welcome! Areas for enhancement:
- Encryption integration
- Adaptive redundancy based on image complexity
- Block-based DCT embedding for better JPEG resilience
- Support for video files
- GUI interface

---

**Author**: Created for VideoScramblerServer project  
**Date**: January 2026  
**Version**: 1.0
