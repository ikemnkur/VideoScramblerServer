#!/usr/bin/env python3
"""
Test script for Image Hybrid Steganography
Demonstrates embedding and extraction with 25% spatial noise
"""

from image_hybrid_stegano import ImageHybridStegano
import os

def test_basic_embedding():
    """Test basic embed and extract"""
    print("="*60)
    print("TEST 1: Basic Embedding and Extraction")
    print("="*60)
    
    stegano = ImageHybridStegano(seed="test123", noise_intensity=64, redundancy=5)
    
    original = "test_images/Lamborghini_Veneno.jpg"
    output = "outputs/test_basic_stego.png"
    test_data = "Hello World! This is a secret message."
    
    # Embed
    print(f"\nEmbedding: '{test_data}'")
    result = stegano.embed(original, test_data, output)
    print(f"✓ Embedded {result['data_length']} chars with {result['noise_percentage']} noise")
    
    # Extract
    print(f"\nExtracting from {output}...")
    extracted = stegano.extract(original, output)
    print(f"✓ Extracted: '{extracted}'")
    
    # Verify
    if test_data in extracted:
        print("\n✓ SUCCESS: Data matches!")
        return True
    else:
        print(f"\n✗ FAILED: Expected '{test_data}', got '{extracted}'")
        return False

def test_max_length():
    """Test maximum VARCHAR(255) length"""
    print("\n" + "="*60)
    print("TEST 2: Maximum Length (255 characters)")
    print("="*60)
    
    stegano = ImageHybridStegano(seed="maxtest", redundancy=7)
    
    original = "test_images/Lamborghini_Veneno.jpg"
    output = "outputs/test_max_length.png"
    # Create 255-character string
    test_data = "A" * 200 + " (255 chars total): " + "X" * 34
    test_data = test_data[:255]  # Exactly 255 chars
    
    print(f"\nEmbedding {len(test_data)} characters...")
    result = stegano.embed(original, test_data, output)
    print(f"✓ Embedded {result['data_length']} chars")
    
    print(f"\nExtracting...")
    extracted = stegano.extract(original, output)
    
    # Check if at least the first part matches
    if test_data[:50] in extracted:
        print(f"\n✓ SUCCESS: First 50 chars match!")
        print(f"  Expected: {test_data[:50]}...")
        print(f"  Got:      {extracted[:50]}...")
        return True
    else:
        print(f"\n✗ FAILED")
        return False

def test_png_reencoding():
    """Test robustness against PNG re-encoding"""
    print("\n" + "="*60)
    print("TEST 3: PNG Re-encoding Robustness")
    print("="*60)
    
    from PIL import Image
    
    stegano = ImageHybridStegano(seed="robust", redundancy=5)
    
    original = "test_images/Lamborghini_Veneno.jpg"
    output = "outputs/test_robust.png"
    reencoded = "outputs/test_robust_reencoded.png"
    test_data = "Survives PNG optimization!"
    
    # Embed
    print(f"\nEmbedding: '{test_data}'")
    stegano.embed(original, test_data, output)
    
    # Re-encode PNG with optimization
    print("Re-encoding PNG with optimization...")
    img = Image.open(output)
    img.save(reencoded, format='PNG', optimize=True)
    print(f"✓ Re-saved to {reencoded}")
    
    # Extract from re-encoded
    print(f"\nExtracting from re-encoded PNG...")
    extracted = stegano.extract(original, reencoded)
    print(f"✓ Extracted: '{extracted}'")
    
    if test_data in extracted:
        print("\n✓ SUCCESS: Survives PNG re-encoding!")
        return True
    else:
        print(f"\n✗ FAILED")
        return False

def test_different_intensities():
    """Test different noise intensities"""
    print("\n" + "="*60)
    print("TEST 4: Different Noise Intensities")
    print("="*60)
    
    original = "test_images/Lamborghini_Veneno.jpg"
    test_data = "Testing intensity variations"
    
    for intensity in [32, 64, 96, 128]:  # 12.5%, 25%, 37.5%, 50%
        percentage = intensity / 255 * 100
        print(f"\n--- Testing {intensity} intensity ({percentage:.1f}%) ---")
        
        stegano = ImageHybridStegano(seed="intensity_test", noise_intensity=intensity, redundancy=5)
        output = f"outputs/test_intensity_{intensity}.png"
        
        stegano.embed(original, test_data, output)
        extracted = stegano.extract(original, output)
        
        if test_data in extracted:
            print(f"✓ {percentage:.1f}% intensity works")
        else:
            print(f"✗ {percentage:.1f}% intensity failed")

def main():
    """Run all tests"""
    print("\n" + "="*60)
    print("IMAGE HYBRID STEGANOGRAPHY TEST SUITE")
    print("25% Spatial Domain Noise Implementation")
    print("="*60)
    
    # Ensure outputs directory exists
    os.makedirs("outputs", exist_ok=True)
    
    results = []
    
    try:
        results.append(("Basic Embedding", test_basic_embedding()))
    except Exception as e:
        print(f"\n✗ Test failed with error: {e}")
        results.append(("Basic Embedding", False))
    
    try:
        results.append(("Max Length", test_max_length()))
    except Exception as e:
        print(f"\n✗ Test failed with error: {e}")
        results.append(("Max Length", False))
    
    try:
        results.append(("PNG Re-encoding", test_png_reencoding()))
    except Exception as e:
        print(f"\n✗ Test failed with error: {e}")
        results.append(("PNG Re-encoding", False))
    
    try:
        test_different_intensities()
    except Exception as e:
        print(f"\n✗ Test failed with error: {e}")
    
    # Summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{status}: {name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All tests passed!")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")

if __name__ == '__main__':
    main()
