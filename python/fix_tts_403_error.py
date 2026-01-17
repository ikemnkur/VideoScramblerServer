#!/usr/bin/env python3
"""
Edge TTS 403 Error Diagnostic and Fix Script

This script helps diagnose and fix common 403 Forbidden errors
when using Microsoft Edge TTS API.
"""

import sys
import subprocess
import time
import asyncio

def check_edge_tts_version():
    """Check the installed edge-tts version"""
    try:
        result = subprocess.run(
            [sys.executable, '-m', 'pip', 'show', 'edge-tts'],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            for line in result.stdout.split('\n'):
                if line.startswith('Version:'):
                    version = line.split(':')[1].strip()
                    print(f"✅ edge-tts installed: version {version}")
                    return version
        print("❌ edge-tts not installed")
        return None
    except Exception as e:
        print(f"❌ Error checking edge-tts: {e}")
        return None

def upgrade_edge_tts():
    """Upgrade edge-tts to the latest version"""
    print("\n📦 Upgrading edge-tts...")
    try:
        result = subprocess.run(
            [sys.executable, '-m', 'pip', 'install', '--upgrade', 'edge-tts'],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            print("✅ edge-tts upgraded successfully")
            print(result.stdout)
            return True
        else:
            print("❌ Failed to upgrade edge-tts")
            print(result.stderr)
            return False
    except Exception as e:
        print(f"❌ Error upgrading edge-tts: {e}")
        return False

async def test_tts_connection():
    """Test if TTS connection works"""
    try:
        import edge_tts
        print("\n🧪 Testing Edge TTS connection...")
        
        test_text = "This is a test."
        voice = "en-US-AndrewNeural"
        
        communicate = edge_tts.Communicate(test_text, voice)
        
        # Try to get the first chunk of audio data
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                print("✅ Connection successful! Edge TTS is working.")
                return True
        
        print("⚠️  No audio data received, but no error either.")
        return False
        
    except Exception as e:
        error_str = str(e)
        print(f"❌ Connection failed: {error_str}")
        
        if '403' in error_str:
            print("\n📋 403 Forbidden Error Detected!")
            print("This typically means:")
            print("  1. Rate limiting - You've made too many requests")
            print("  2. Token expired - The service token needs updating")
            print("  3. IP blocked - Your IP may be temporarily blocked")
            print("  4. Geographic restrictions - Service may not be available in your region")
            
        return False

def print_solutions():
    """Print possible solutions"""
    print("\n" + "="*60)
    print("SOLUTIONS FOR 403 ERRORS")
    print("="*60)
    
    print("\n1️⃣  UPGRADE EDGE-TTS (Recommended)")
    print("   Command: pip install --upgrade edge-tts")
    print("   This updates the service tokens and fixes compatibility issues.")
    
    print("\n2️⃣  ADD RATE LIMITING")
    print("   Add delays between TTS requests (already implemented in tts_server.py)")
    print("   Wait time: 0.5s → 1s → 2s (exponential backoff)")
    
    print("\n3️⃣  WAIT AND RETRY")
    print("   If rate limited, wait 5-10 minutes before trying again.")
    
    print("\n4️⃣  USE ALTERNATIVE TTS SERVICE")
    print("   Consider alternatives:")
    print("   - Google Cloud TTS (paid, but very reliable)")
    print("   - Amazon Polly (paid)")
    print("   - pyttsx3 (offline, lower quality)")
    
    print("\n5️⃣  CHECK EDGE-TTS GITHUB ISSUES")
    print("   Visit: https://github.com/rany2/edge-tts/issues")
    print("   Check if others are experiencing similar issues.")
    
    print("\n6️⃣  USE VPN OR PROXY")
    print("   If geographic restrictions apply, try using a VPN.")
    
    print("\n" + "="*60)

def main():
    print("="*60)
    print("EDGE TTS 403 ERROR DIAGNOSTIC TOOL")
    print("="*60)
    
    # Check version
    version = check_edge_tts_version()
    
    if not version:
        print("\n❗ edge-tts is not installed!")
        print("   Install with: pip install edge-tts")
        return
    
    # Prompt user to upgrade
    print("\nDo you want to upgrade edge-tts? (y/n): ", end='')
    response = input().strip().lower()
    
    if response == 'y':
        if upgrade_edge_tts():
            print("\n✅ Upgrade complete. Please restart your TTS server.")
            version = check_edge_tts_version()
    
    # Test connection
    print("\nDo you want to test the TTS connection? (y/n): ", end='')
    response = input().strip().lower()
    
    if response == 'y':
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            success = loop.run_until_complete(test_tts_connection())
            if not success:
                print_solutions()
        finally:
            loop.close()
    else:
        print_solutions()
    
    print("\n" + "="*60)
    print("Diagnostic complete.")
    print("="*60)

if __name__ == "__main__":
    main()
