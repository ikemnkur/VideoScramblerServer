# Frame Section Duplication Steganography - README

## Overview
This implementation encodes secret data in videos by selectively duplicating frame sections from the previous frame. It's similar to QR codes but uses temporal redundancy instead of spatial patterns.

## How It Works

### Encoding
1. Divide each video frame into a grid (e.g., 4×4 = 16 sections)
2. For each section and each bit to encode:
   - **Bit = 0**: Copy section from previous frame (duplicate)
   - **Bit = 1**: Keep current frame's content + optional brightness boost

### Decoding
1. Compare consecutive frames section-by-section
2. Compute difference for each section
3. Use adaptive threshold (median) to classify:
   - Low difference → bit = 0 (duplicated)
   - High difference → bit = 1 (changed)

## Features

### ✅ Implemented
- **Frame-to-frame section duplication** - Each section encodes 1 bit
- **Adaptive thresholding** - Automatically adjusts for video compression artifacts
- **Brightness modulation** - Enhances detection by boosting non-duplicated sections
- **Reed-Solomon error correction** - Corrects transmission errors (requires `reedsolo`)
- **Configurable grid sizes** - 2×2, 4×4, 8×8, 16×16 (must be powers of 2)
- **Frame interval control** - Encode every frame or at specific intervals

## Usage

### Installation
```bash
# Install required package for error correction
pip install reedsolo

# Or if using venv
./venv/bin/pip install reedsolo
```

### Encoding
```bash
python embed_code_frames_duplicate.py \
  --input input.mp4 \
  --output encoded.mp4 \
  --message "Hello World!" \
  --h-divisions 4 \
  --v-divisions 4 \
  --interval 1 \
  --ecc 10 \
  --brightness-shift 25
```

**Parameters:**
- `--h-divisions`: Horizontal grid divisions (2, 4, 8, 16)
- `--v-divisions`: Vertical grid divisions (2, 4, 8, 16)
- `--interval`: Encode every N frames (1 = every frame)
- `--ecc`: Reed-Solomon error correction symbols (0-50, recommend 10-20)
- `--brightness-shift`: Brightness boost for bit=1 sections (0-50, recommend 15-25)

### Decoding
```bash
python decode_code_frames_duplicate.py \
  --input encoded.mp4 \
  --h-divisions 4 \
  --v-divisions 4 \
  --interval 1 \
  --ecc 10 \
  --threshold auto
```

**Parameters:**
- Must match encoding parameters (divisions, interval, ecc)
- `--threshold`: Fixed threshold or `None` for adaptive (recommended)
- `--max-frames`: Limit frames to process (useful for testing)

## Capacity

| Grid Size | Bits/Frame | @ 30 FPS | Capacity/Second |
|-----------|------------|----------|-----------------|
| 2×2       | 4 bits     | 30 fps   | 120 bits/s (15 B/s) |
| 4×4       | 16 bits    | 30 fps   | 480 bits/s (60 B/s) |
| 8×8       | 64 bits    | 30 fps   | 1920 bits/s (240 B/s) |
| 16×16     | 256 bits   | 30 fps   | 7680 bits/s (960 B/s) |

With Reed-Solomon ECC (10 symbols), actual data capacity is ~70% of above.

## Diagnostic Tool
```bash
python diagnose_duplicate_threshold.py \
  --input encoded.mp4 \
  --h-divisions 4 \
  --v-divisions 4 \
  --max-frames 20
```

Shows section difference statistics to help tune the threshold parameter.

## Challenges & Solutions

### Challenge 1: Video Compression
**Problem:** MP4 compression modifies pixels, so duplicated sections aren't perfectly identical.

**Solutions:**
- ✅ Adaptive per-frame thresholding (median-based)
- ✅ Brightness modulation to increase signal strength
- ✅ Reed-Solomon error correction
- 🔄 Use lower compression codecs (AVI, or high-quality MP4)

### Challenge 2: Detection Accuracy
**Problem:** Distinguishing duplicated vs. naturally similar sections.

**Solutions:**
- ✅ Brightness shift for bit=1 sections makes them more distinct
- ✅ Adaptive threshold based on distribution within each frame
- 🔄 Could add spatial diversity (don't use adjacent sections in same frame)

### Challenge 3: Error Correction Overload
**Problem:** Too many bit errors overwhelm Reed-Solomon ECC.

**Solutions:**
- ✅ Increase brightness shift (15 → 25)
- ✅ Use larger grid (more bits per frame, shorter encoding duration)
- 🔄 Reduce frame interval (encode less frequently)
- 🔄 Interleaving/shuffling bits across multiple frames

## Performance
- **Encoding:** ~Real-time on modern hardware (1920×1080 @ 30fps)
- **Decoding:** ~Real-time
- **Best Results:** Videos with motion (static videos have low natural frame differences)

## Future Improvements
1. **Spatial interleaving** - Distribute bits across multiple frames
2. **Frequency domain encoding** - Use DCT coefficients instead of pixel values
3. **Motion compensation** - Account for camera/object movement
4. **Multiple redundancy** - Encode each bit multiple times
5. **Checksum validation** - Add CRC or hash to verify decoded data

## Files
- `embed_code_frames_duplicate.py` - Encoder script
- `decode_code_frames_duplicate.py` - Decoder script  
- `diagnose_duplicate_threshold.py` - Diagnostic tool

## Example Results
Tested on 5-second video (173 frames, 1920×1080, 30fps):

**Without improvements:**
- Decoded: "�ello World" (partial success)

**With brightness shift (15):**
- Decoded: "�ello$crldg" (better but still errors)

**With brightness shift (25) + ECC (10):**
- ECC too many errors, but raw data shows improvement

**Recommendation:** Use uncompressed format (AVI) or high-quality MP4 for best results.
