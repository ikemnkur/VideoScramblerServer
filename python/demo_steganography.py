#!/usr/bin/env python3
"""
Demo script showing how to use the image steganography tools.
"""
import os
import sys

def demo_image_steganography():
    """Demonstrate embedding and decoding messages in images."""
    
    # Check if we have a test image
    if not os.path.exists("Lamborghini_Veneno.jpg"):
        print("Error: Need test image 'Lamborghini_Veneno.jpg' to run demo")
        return False
    
    print("=== Image Steganography Demo ===\n")
    
    # Test 1: Simple short message
    print("1. Testing with short message...")
    message1 = "HELLO WORLD"
    
    # Embed
    cmd1_embed = f'python3 embed_code_image.py --input Lamborghini_Veneno.jpg --output demo1.jpg --message "{message1}" --rows 15 --cell-size 4 --cell-gap 2 --dot-color "255,255,255"'
    print(f"Embedding: {cmd1_embed}")
    os.system(cmd1_embed)
    
    # Decode
    cmd1_decode = 'python3 decode_code_image.py --input demo1.jpg --rows 15 --cell-size 4 --cell-gap 2 --threshold 150'
    print(f"Decoding: {cmd1_decode}")
    os.system(cmd1_decode)
    
    print("\n" + "="*50 + "\n")
    
    # Test 2: Longer message
    print("2. Testing with longer message...")
    message2 = "This is a secret message embedded in the image using steganography!"
    
    # Embed
    cmd2_embed = f'python3 embed_code_image.py --input Lamborghini_Veneno.jpg --output demo2.jpg --message "{message2}" --rows 70 --cell-size 3 --cell-gap 1 --dot-color "200,200,200"'
    print(f"Embedding: {cmd2_embed}")
    os.system(cmd2_embed)
    
    # Decode
    cmd2_decode = 'python3 decode_code_image.py --input demo2.jpg --rows 70 --cell-size 3 --cell-gap 1 --threshold 120'
    print(f"Decoding: {cmd2_decode}")
    os.system(cmd2_decode)
    
    print("\n" + "="*50 + "\n")
    print("Demo completed! Check demo1.jpg and demo2.jpg for the results.")
    print("\nUsage tips:")
    print("- Use white dots (255,255,255) for better contrast")
    print("- Larger cell-size and cell-gap = more reliable but takes more space")
    print("- Adjust threshold (100-200) if decoding fails")
    print("- More rows = more characters can be embedded")
    
    return True

if __name__ == "__main__":
    if not demo_image_steganography():
        sys.exit(1)