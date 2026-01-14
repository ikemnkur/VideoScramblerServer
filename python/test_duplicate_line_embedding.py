#!/usr/bin/env python3
"""
Test script for duplicate line embedding system.
This demonstrates the embedding and detection of user tracking codes.
"""

import os
import sys
import subprocess

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def run_command(cmd, description):
    """Run a command and print output"""
    print(f"\n{'='*60}")
    print(f"Running: {description}")
    print(f"Command: {' '.join(cmd)}")
    print('='*60)
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.stdout:
        print("STDOUT:")
        print(result.stdout)
    
    if result.stderr:
        print("STDERR:")
        print(result.stderr)
    
    if result.returncode != 0:
        print(f"❌ Command failed with return code {result.returncode}")
        return False
    else:
        print(f"✅ Command succeeded")
        return True

def main():
    print("="*60)
    print("DUPLICATE LINE EMBEDDING TEST")
    print("="*60)
    
    # Check if test image exists
    test_images_dir = os.path.join(os.path.dirname(__file__), 'test_images')
    if not os.path.exists(test_images_dir) or not os.listdir(test_images_dir):
        print(f"⚠️  No test images found in {test_images_dir}")
        print("Please add a test image to test_images/ directory")
        return
    
    # Get first image from test_images
    test_images = [f for f in os.listdir(test_images_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
    if not test_images:
        print("⚠️  No PNG/JPG images found in test_images/")
        return
    
    input_image = os.path.join(test_images_dir, test_images[0])
    print(f"\n📷 Using test image: {input_image}")
    
    # Output paths
    outputs_dir = os.path.join(os.path.dirname(__file__), 'outputs')
    os.makedirs(outputs_dir, exist_ok=True)
    
    embedded_image = os.path.join(outputs_dir, 'test_embedded.png')
    
    # Test parameters
    test_user_id = "USER123456"  # 10 characters
    
    print(f"\n🔑 Test user_id: {test_user_id}")
    print(f"   ASCII values: {[ord(c) for c in test_user_id]}")
    
    # Test 1: Embed tracking code
    print("\n" + "="*60)
    print("TEST 1: Embedding tracking code")
    print("="*60)
    
    embed_cmd = [
        sys.executable,
        'embed_code_image.py',
        '--input', input_image,
        '--output', embedded_image,
        '--user-id', test_user_id
    ]
    
    if not run_command(embed_cmd, "Embed tracking code"):
        return
    
    # Test 2: Detect tracking code
    print("\n" + "="*60)
    print("TEST 2: Detecting tracking code")
    print("="*60)
    
    decode_cmd = [
        sys.executable,
        'decode_code_image.py',
        '--input', embedded_image,
        '--tolerance', '0',
        '--diff-fraction', '0.0'
    ]
    
    if not run_command(decode_cmd, "Detect tracking code"):
        return
    
    # Test 3: Test with lossy compression (JPEG)
    print("\n" + "="*60)
    print("TEST 3: Testing with JPEG compression")
    print("="*60)
    
    jpeg_image = os.path.join(outputs_dir, 'test_embedded.jpg')
    
    # Convert to JPEG using ImageMagick or PIL
    try:
        from PIL import Image
        img = Image.open(embedded_image)
        img.save(jpeg_image, 'JPEG', quality=85)
        print(f"✅ Converted to JPEG: {jpeg_image}")
        
        # Try detection with tolerance
        decode_jpeg_cmd = [
            sys.executable,
            'decode_code_image.py',
            '--input', jpeg_image,
            '--tolerance', '5',
            '--diff-fraction', '0.01'
        ]
        
        run_command(decode_jpeg_cmd, "Detect tracking code from JPEG")
        
    except ImportError:
        print("⚠️  PIL not available, skipping JPEG test")
    
    print("\n" + "="*60)
    print("TESTS COMPLETE")
    print("="*60)
    print(f"\n📁 Output files:")
    print(f"   - {embedded_image}")
    if os.path.exists(jpeg_image):
        print(f"   - {jpeg_image}")

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    main()
