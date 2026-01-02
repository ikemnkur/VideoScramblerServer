# Tileable Noise Functions for Photo Scrambler

## Overview

I've successfully converted the JavaScript noise functions to Python and integrated them into `scramble_photo.py`. The noise is applied **before** scrambling and removed **after** unscrambling.

## Converted Functions

### Core Utility Functions
- `gcd(a, b)` - Greatest common divisor
- `mod(n, m)` - True mathematical modulo (handles negatives correctly)
- `clamp_int(n, lo, hi)` - Clamp number to integer range
- `clamp(v, min, max)` - Clamp float value

### Noise Generation Functions
- `generate_noise_tile_offsets(tile_size, seed, intensity)` - Creates deterministic tileable noise pattern
- `apply_noise_add_mod256(frame, tile_offsets, tile_size)` - Adds noise before scrambling
- `apply_noise_sub_mod256(frame, tile_offsets, tile_size)` - Removes noise after unscrambling

## Key Features

✅ **Tileable**: Noise pattern repeats seamlessly across the image  
✅ **Deterministic**: Same seed always produces same noise  
✅ **Reversible**: Noise can be perfectly removed using same parameters  
✅ **Modulo 256**: Uses proper modulo arithmetic to prevent overflow/underflow  
✅ **Separate Seed**: Noise uses `seed + 999` to keep it independent from scrambling

## Usage

### Command Line

**Scramble with noise:**
```bash
python3 scramble_photo.py \
  --input original.jpg \
  --output scrambled.png \
  --seed 12345 \
  --rows 4 --cols 4 \
  --noise-intensity 64 \
  --noise-tile-size 16 \
  --mode scramble
```

**Unscramble and remove noise:**
```bash
python3 scramble_photo.py \
  --input scrambled.png \
  --output restored.png \
  --seed 12345 \
  --rows 4 --cols 4 \
  --noise-intensity 64 \
  --noise-tile-size 16 \
  --mode unscramble
```

### Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `--noise-intensity` | `0` | Noise strength (0-128). 0=disabled, 64=moderate, 128=strong |
| `--noise-tile-size` | `16` | Size of repeating tile pattern in pixels |

### Recommended Settings

- **Subtle noise**: `--noise-intensity 32`
- **Moderate noise**: `--noise-intensity 64` (recommended)
- **Strong noise**: `--noise-intensity 96`
- **Maximum noise**: `--noise-intensity 128`

## How It Works

### Scramble Mode
1. Load image
2. **Add tileable noise** (if intensity > 0)
3. Scramble tiles
4. Save scrambled image
5. Save parameters (including noise settings)

### Unscramble Mode
1. Load scrambled image
2. Unscramble tiles
3. **Remove tileable noise** (if intensity > 0)
4. Save restored image

## Technical Details

### Noise Generation
- Uses Mulberry32 PRNG for deterministic random generation
- Creates integer offsets in range `[-intensity, +intensity]`
- Offsets stored per pixel per RGB channel
- Pattern is `tile_size × tile_size` and repeats seamlessly

### Noise Application
- Uses modulo 256 arithmetic: `(value ± offset) mod 256`
- Prevents pixel value overflow/underflow
- Applied to RGB channels only (alpha unchanged)
- Tileable application using `(x % tile_size, y % tile_size)`

### Reversibility
The noise is perfectly reversible because:
1. Addition and subtraction are inverse operations
2. Modulo 256 arithmetic is closed (0-255 always stays 0-255)
3. Same seed generates identical noise pattern
4. Deterministic tile indexing

## Saved Parameters

The `.params.json` file now includes noise settings:
```json
{
  "version": 2,
  "seed": 12345,
  "n": 4,
  "m": 4,
  "perm1based": [...],
  "noise_intensity": 64,
  "noise_tile_size": 16
}
```

## Example Output

```
Noise enabled: intensity=64, tile_size=16
Done. Output photo: outputs/scrambled.png
Scramble params saved to: outputs/scrambled.params.json
```

## Demo Script

Run `./demo_scramble_with_noise.sh` to see a complete demonstration.

## Benefits

1. **Extra Obfuscation**: Noise adds another layer of protection
2. **Tileable Pattern**: No visible seams in the noise
3. **Deterministic**: Same parameters always produce same result
4. **Perfectly Reversible**: Original image restored exactly
5. **Separate from Scrambling**: Noise and scrambling use different seeds
6. **Modular**: Can be enabled/disabled with `--noise-intensity 0`

## Notes

- Noise is applied to RGB channels only (alpha unchanged)
- Noise seed is automatically set to `main_seed + 999`
- The tile pattern repeats across the entire image
- Noise intensity of 0 disables the feature entirely
- Works with both full (100%) and partial percentage scrambling
