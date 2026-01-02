#!/usr/bin/env python3
"""
Test script for image hybrid steganography
Demonstrates embedding, extraction, and robustness to re-encoding
"""

import os
import sys
from PIL import Image
import numpy as np

# Import the steganography module
from image_hybrid_stegano import ImageHybridSteganography


def create_test_image(filename, size=(800, 600), mode='RGB'):
    """Create a test image with varied content"""
    if mode == 'RGB':
        # Create colorful gradient image
        img = Image.new('RGB', size)
        pixels = img.load()
        
        for y in range(size[1]):
            for x in range(size[0]):
                r = int((x / size[0]) * 255)
                g = int((y / size[1]) * 255)
                b = int(((x + y) / (size[0] + size[1])) * 255)
                pixels[x, y] = (r, g, b)
    else:
        # Create grayscale gradient
        img = Image.new('L', size)
        pixels = img.load()
        
        for y in range(size[1]):
            for x in range(size[0]):
                val = int(((x + y) / (size[0] + size[1])) * 255)
                pixels[x, y] = val
    
    img.save(filename)
    print(f"✅ Created test image: {filename}")
    return filename


def test_basic_embed_extract():
    """Test 1: Basic embed and extract"""
    print("\n" + "="*70)
    print("TEST 1: Basic Embed and Extract")
    print("="*70)
    
    # Create test image
    original = "test_original.png"
    create_test_image(original, size=(800, 600))
    
    # Embed data
    hidden = "test_hidden.png"
    test_data = "Hello, World! This is a secret message."
    
    stego = ImageHybridSteganography()
    print(f"\nEmbedding: '{test_data}'")
    stego.embed_data(original, hidden, test_data)
    
    # Extract data
    print("\nExtracting data...")
    extracted = stego.extract_data(original, hidden)
    
    # Verify
    if extracted == test_data:
        print("✅ TEST 1 PASSED: Data matches!")
    else:
        print(f"❌ TEST 1 FAILED: Expected '{test_data}', got '{extracted}'")
    
    return extracted == test_data


def test_jpeg_reencoding():
    """Test 2: Robustness to JPEG re-encoding"""
    print("\n" + "="*70)
    print("TEST 2: JPEG Re-encoding Robustness")
    print("="*70)
    
    # Create test image
    original = "test_original2.png"
    create_test_image(original, size=(800, 600))
    
    # Embed data
    hidden = "test_hidden2.png"
    test_data = "Robust data that survives JPEG compression!"
    
    stego = ImageHybridSteganography()
    print(f"\nEmbedding: '{test_data}'")
    stego.embed_data(original, hidden, test_data)
    
    # Re-encode as JPEG with various quality levels
    results = {}
    for quality in [95, 90, 85]:
        reencoded = f"test_reencoded_q{quality}.jpg"
        
        # Re-encode using PIL
        img = Image.open(hidden)
        img.save(reencoded, 'JPEG', quality=quality)
        print(f"\n📷 Re-encoded as JPEG with quality={quality}")
        
        # Try to extract
        print("Extracting from re-encoded image...")
        try:
            extracted = stego.extract_data(original, reencoded)
            results[quality] = (extracted == test_data)
            
            if extracted == test_data:
                print(f"✅ Quality {quality}: Extraction successful!")
            else:
                print(f"⚠️  Quality {quality}: Extracted '{extracted}' (partial match)")
        except Exception as e:
            print(f"❌ Quality {quality}: Extraction failed - {e}")
            results[quality] = False
    
    # Summary
    passed = sum(results.values())
    total = len(results)
    print(f"\n{'='*70}")
    print(f"TEST 2 RESULT: {passed}/{total} quality levels passed")
    print(f"{'='*70}")
    
    return passed >= 2  # Pass if at least 2 quality levels work


def test_png_reencoding():
    """Test 3: Robustness to PNG re-encoding"""
    print("\n" + "="*70)
    print("TEST 3: PNG Re-encoding Robustness")
    print("="*70)
    
    # Create test image
    original = "test_original3.png"
    create_test_image(original, size=(800, 600))
    
    # Embed data
    hidden = "test_hidden3.png"
    test_data = "Data that survives PNG optimization!"
    
    stego = ImageHybridSteganography()
    print(f"\nEmbedding: '{test_data}'")
    stego.embed_data(original, hidden, test_data)
    
    # Re-encode as PNG (PIL will optimize)
    reencoded = "test_reencoded.png"
    img = Image.open(hidden)
    img.save(reencoded, 'PNG', optimize=True)
    print(f"\n📷 Re-encoded as optimized PNG")
    
    # Extract
    print("Extracting from re-encoded image...")
    extracted = stego.extract_data(original, reencoded)
    
    # Verify
    if extracted == test_data:
        print("✅ TEST 3 PASSED: Data survives PNG optimization!")
        return True
    else:
        print(f"❌ TEST 3 FAILED: Expected '{test_data}', got '{extracted}'")
        return False


def test_max_data_length():
    """Test 4: Maximum data length (255 characters)"""
    print("\n" + "="*70)
    print("TEST 4: Maximum Data Length (255 chars)")
    print("="*70)
    
    # Create test image
    original = "test_original4.png"
    create_test_image(original, size=(1024, 768))  # Larger image for max data
    
    # Create max length data (255 characters)
    test_data = "A" * 255
    
    stego = ImageHybridSteganography()
    print(f"\nEmbedding 255 characters...")
    stego.embed_data(original, "test_hidden4.png", test_data)
    
    # Extract
    print("Extracting...")
    extracted = stego.extract_data(original, "test_hidden4.png")
    
    # Verify
    if extracted == test_data:
        print("✅ TEST 4 PASSED: Max length data works!")
        return True
    else:
        print(f"❌ TEST 4 FAILED: Length mismatch")
        return False


def test_grayscale_image():
    """Test 5: Grayscale image support"""
    print("\n" + "="*70)
    print("TEST 5: Grayscale Image Support")
    print("="*70)
    
    # Create grayscale test image
    original = "test_grayscale.png"
    create_test_image(original, size=(800, 600), mode='L')
    
    # Embed data
    hidden = "test_hidden_gray.png"
    test_data = "Grayscale steganography test!"
    
    stego = ImageHybridSteganography()
    print(f"\nEmbedding: '{test_data}'")
    stego.embed_data(original, hidden, test_data)
    
    # Extract
    print("Extracting...")
    extracted = stego.extract_data(original, hidden)
    
    # Verify
    if extracted == test_data:
        print("✅ TEST 5 PASSED: Grayscale images work!")
        return True
    else:
        print(f"❌ TEST 5 FAILED: Expected '{test_data}', got '{extracted}'")
        return False


def test_varchar_realistic_data():
    """Test 6: Realistic VARCHAR data (IDs, tokens, etc.)"""
    print("\n" + "="*70)
    print("TEST 6: Realistic VARCHAR Data")
    print("="*70)
    
    # Create test image
    original = "test_original6.png"
    create_test_image(original, size=(800, 600))
    
    # Test various realistic data types
    test_cases = [
        "user_id:12345678|token:abc123xyz789",
        "https://example.com/verify?code=XYZ123ABC789",
        "SESSION_ID=9f8e7d6c5b4a3210;USER=john.doe@example.com",
        '{"id":"usr_1234","hash":"a1b2c3d4e5f6"}',
    ]
    
    stego = ImageHybridSteganography()
    passed = 0
    
    for i, test_data in enumerate(test_cases, 1):
        hidden = f"test_hidden6_{i}.png"
        print(f"\nTest case {i}: '{test_data}'")
        
        stego.embed_data(original, hidden, test_data)
        extracted = stego.extract_data(original, hidden)
        
        if extracted == test_data:
            print(f"  ✅ Passed")
            passed += 1
        else:
            print(f"  ❌ Failed: got '{extracted}'")
    
    print(f"\n{'='*70}")
    print(f"TEST 6 RESULT: {passed}/{len(test_cases)} cases passed")
    print(f"{'='*70}")
    
    return passed == len(test_cases)


def cleanup_test_files():
    """Remove test files"""
    patterns = [
        "test_original*.png",
        "test_hidden*.png",
        "test_grayscale.png",
        "test_hidden_gray.png",
        "test_reencoded*.jpg",
        "test_reencoded*.png",
    ]
    
    import glob
    for pattern in patterns:
        for file in glob.glob(pattern):
            try:
                os.remove(file)
                print(f"  Removed: {file}")
            except:
                pass


def main():
    print("="*70)
    print("HYBRID IMAGE STEGANOGRAPHY TEST SUITE")
    print("="*70)
    print("\nThis test suite validates the robustness of the steganography system.")
    print("It tests embedding, extraction, and resilience to various re-encodings.\n")
    
    # Run all tests
    results = {}
    
    try:
        results['test1'] = test_basic_embed_extract()
        results['test2'] = test_jpeg_reencoding()
        results['test3'] = test_png_reencoding()
        results['test4'] = test_max_data_length()
        results['test5'] = test_grayscale_image()
        results['test6'] = test_varchar_realistic_data()
    except KeyboardInterrupt:
        print("\n\n⚠️  Tests interrupted by user")
        return
    except Exception as e:
        print(f"\n\n❌ Test suite error: {e}")
        import traceback
        traceback.print_exc()
        return
    
    # Final summary
    print("\n" + "="*70)
    print("FINAL TEST SUMMARY")
    print("="*70)
    
    total = len(results)
    passed = sum(results.values())
    
    for test_name, passed_flag in results.items():
        status = "✅ PASSED" if passed_flag else "❌ FAILED"
        print(f"{test_name}: {status}")
    
    print(f"\n{'='*70}")
    print(f"OVERALL: {passed}/{total} tests passed")
    print(f"{'='*70}")
    
    # Cleanup
    print("\nCleaning up test files...")
    cleanup_test_files()
    print("✅ Cleanup complete")
    
    if passed == total:
        print("\n🎉 All tests passed! The system is working correctly.")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Please review the output above.")
        return 1


if __name__ == '__main__':
    sys.exit(main())
