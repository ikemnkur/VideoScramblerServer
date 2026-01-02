# Image Hybrid Steganography - Spatial Domain Implementation

## Overview

This is a simplified, robust image steganography system that embeds data as **uniform 25% intensity spatial noise** directly in the pixel domain. The hidden data can be recovered by comparing the modified image with the original unmodified image.

## Key Features

- **Spatial Domain Embedding**: Data is embedded as +64/-64 intensity noise (25% of 255) directly in pixel values
- **Uniform Noise Pattern**: The noise is evenly distributed and visible but subtle
- **Redundancy**: Data is stored in multiple copies (default 5) for error correction
- **Reed-Solomon Error Correction**: Optional error correction for enhanced robustness
- **Lossless Compatible**: Works perfectly with PNG (lossless compression)
- **VARCHAR(255) Support**: Can store up to 255 characters of text data

## How It Works

### Embedding Process

1. **Data Preparation**: Input text is encoded to UTF-8 bytes and optionally wrapped with Reed-Solomon error correction
2. **Bit Conversion**: Bytes are converted to individual bits
3. **Noise Pattern Generation**: A deterministic, seed-based noise pattern is generated to select pixel positions
4. **Embedding**: Each bit is embedded as noise:
   - Bit `1` → Add +64 to pixel value (25% brightness increase)
   - Bit `0` → Add -64 to pixel value (25% brightness decrease)
5. **Redundancy**: The entire data is embedded 5 times in different locations
6. **Output**: Modified image is saved as PNG to preserve pixel values

### Extraction Process

1. **Difference Calculation**: Subtract original image from modified image to isolate the noise
2. **Pattern Recreation**: Regenerate the same deterministic noise pattern using the seed
3. **Bit Extraction**: Read each noise value at pattern positions:
   - Positive value → Bit `1`
   - Negative value → Bit `0`
4. **Majority Voting**: Compare all redundant copies and use majority vote for each bit
5. **Decoding**: Convert bits back to bytes, apply error correction, decode to text

## Usage

### Command Line

**Embed data:**
```bash
python3 image_hybrid_stegano.py \
  --mode embed \
  --original input.jpg \
  --modified output.png \
  --data "Your secret message here" \
  --seed "your_secret_key" \
  --intensity 64 \
  --redundancy 5
```

**Extract data:**
```bash
python3 image_hybrid_stegano.py \
  --mode extract \
  --original input.jpg \
  --modified output.png \
  --seed "your_secret_key" \
  --intensity 64 \
  --redundancy 5
```

### Python API

```python
from image_hybrid_stegano import ImageHybridStegano

# Create instance with 25% noise intensity
stegano = ImageHybridStegano(
    seed="my_secret_key",
    noise_intensity=64,  # 25% of 255
    redundancy=5
)

# Embed data
result = stegano.embed(
    image_path="original.jpg",
    data="Secret message up to 255 chars",
    output_path="stego.png"
)

# Extract data
extracted = stegano.extract(
    original_path="original.jpg",
    modified_path="stego.png"
)
print(f"Extracted: {extracted}")
```

## Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `seed` | `"default_seed"` | Seed for deterministic noise pattern generation (acts as key) |
| `noise_intensity` | `64` | Noise amplitude (64 = 25% of 255) |
| `redundancy` | `5` | Number of times data is stored redundantly |

## Noise Intensity Levels

You can adjust the noise intensity based on your needs:

| Intensity | Percentage | Visibility | Robustness |
|-----------|------------|------------|------------|
| 32 | 12.5% | Very subtle | Lower |
| 64 | 25.0% | Noticeable | Good ✓ |
| 96 | 37.5% | Visible | Better |
| 128 | 50.0% | Obvious | Best |

**Recommended**: 64 (25%) provides a good balance between subtlety and robustness.

## Format Compatibility

### ✅ Works With (Lossless)
- **PNG** - Perfect preservation, recommended format
- **PNG with optimization** - Data survives PNG optimization

### ❌ Does NOT Work With (Lossy)
- **JPEG** - Lossy compression destroys spatial noise patterns
- **WebP (lossy mode)** - Block-based compression affects noise
- Any format using DCT or heavy compression

**Important**: Always use PNG format for output to ensure lossless preservation of embedded data.

## Limitations

1. **Maximum Data Size**: 255 characters (VARCHAR limit)
2. **Requires Original**: Extraction requires the original unmodified image
3. **Format Restrictions**: Output must be PNG (or lossless format)
4. **Visible Noise**: The 25% noise is somewhat visible in the image
5. **Not Secure Encryption**: This is steganography (hiding data), not encryption (securing data)

## Security Considerations

- The `seed` acts as a simple key - same seed required for extraction
- This is **NOT cryptographic security** - data is not encrypted
- An attacker with the original image can easily see there's noise
- For true security, encrypt your data before embedding

## Testing

Run the test suite:

```bash
python3 test_image_hybrid_stegano.py
```

Tests include:
- Basic embedding and extraction
- Maximum length handling
- PNG re-encoding robustness
- Different noise intensity levels

## Dependencies

```bash
pip install numpy Pillow reedsolo
```

- `numpy`: Array operations
- `Pillow`: Image I/O
- `reedsolo`: Reed-Solomon error correction (optional but recommended)

## Example Output

```
✓ Successfully embedded 66 characters
  Encoded bytes: 96
  Noise intensity: 64 (25.1%)
  Redundancy: 5 copies
  Output: outputs/stego.png

✓ Extracted data: This is a test message that will be embedded as 25% spatial noise!
```

## Why Spatial Domain?

Compared to frequency domain methods (DCT, DWT):
- **Simpler**: Direct pixel manipulation
- **More Robust**: Not affected by JPEG-style block compression (when using PNG)
- **Predictable**: Noise pattern is deterministic and controllable
- **Faster**: No transforms needed

## License

This code is provided as-is for the VideoScramblerServer project.
