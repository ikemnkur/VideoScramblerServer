# Fixing 403 Forbidden Error in Edge TTS

## Problem Summary

You're encountering this error:
```
Error generating watermark: 403, message='Invalid response status', 
url='wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?...'
```

## Root Causes

### 1. **Rate Limiting** (Most Common) ⏱️
Microsoft Edge TTS has rate limits. Making multiple requests in quick succession triggers a 403 response.

**Indicators:**
- Error occurs after several successful requests
- Happens when testing repeatedly
- Works again after waiting a few minutes

### 2. **Expired Service Token** 🔑
The `edge-tts` library uses a hardcoded `TrustedClientToken` that Microsoft occasionally rotates or revokes.

**Indicators:**
- Error occurs on first request
- Persists even after waiting
- Affects all users simultaneously

### 3. **Geographic Restrictions** 🌍
Microsoft may block certain IP ranges or geographic regions.

**Indicators:**
- Works from some locations but not others
- VPN changes behavior

### 4. **Outdated Library Version** 📦
An old version of `edge-tts` may have compatibility issues or expired tokens.

**Indicators:**
- Using edge-tts version older than 6.0.0
- Other users report the library working fine

## Solutions (In Order of Effectiveness)

### ✅ Solution 1: Upgrade edge-tts (RECOMMENDED)

This is the most effective solution as it updates service tokens and fixes compatibility issues.

```bash
# Upgrade to latest version
pip install --upgrade edge-tts

# Or use the diagnostic script
python3 fix_tts_403_error.py
```

**Why this works:** The maintainers of `edge-tts` regularly update the service tokens and connection parameters when Microsoft makes changes.

### ✅ Solution 2: Implement Retry Logic with Exponential Backoff

Already implemented in your updated `tts_server.py`:

```python
# Retries 3 times with delays: 0.5s → 1s → 2s
for attempt in range(max_retries):
    try:
        communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
        await communicate.save(output_path)
        break
    except Exception as e:
        if '403' in str(e) and attempt < max_retries - 1:
            wait_time = (2 ** attempt) * 0.5
            await asyncio.sleep(wait_time)
        else:
            raise
```

**Why this works:** Gives Microsoft's rate limiter time to reset between requests.

### ✅ Solution 3: Add Request Delays

Add a small delay between consecutive TTS requests in your application:

```python
import asyncio

# After each TTS generation
await asyncio.sleep(0.5)  # 500ms delay
```

### ✅ Solution 4: Check edge-tts GitHub Issues

Visit the [edge-tts GitHub repository](https://github.com/rany2/edge-tts/issues) to:
- Check if others are experiencing similar issues
- Find the latest workarounds
- Report new issues

### ✅ Solution 5: Use a VPN or Proxy

If geographic restrictions apply:
```bash
# Use a VPN service
# Or route through a proxy in a different region
```

### ✅ Solution 6: Switch to Alternative TTS

If Edge TTS continues to fail, consider alternatives:

**Free Options:**
- **pyttsx3** (offline, lower quality)
  ```bash
  pip install pyttsx3
  ```

**Paid Options (More Reliable):**
- **Google Cloud Text-to-Speech** - $4 per 1M characters
- **Amazon Polly** - $4 per 1M characters
- **Microsoft Azure TTS** - $15 per 1M characters (ironically more reliable)

## Quick Diagnostic Steps

### Step 1: Run the Diagnostic Script
```bash
cd /home/ikem/Documents/VideoScramblerServer/python
python3 fix_tts_403_error.py
```

### Step 2: Check Your edge-tts Version
```bash
pip show edge-tts
```

If version is below 6.0.0, upgrade immediately.

### Step 3: Test Manually
```bash
python3 -c "
import asyncio
import edge_tts

async def test():
    tts = edge_tts.Communicate('Hello world', 'en-US-AndrewNeural')
    await tts.save('test.mp3')
    print('Success!')

asyncio.run(test())
"
```

If this fails, the issue is with `edge-tts` itself, not your server.

### Step 4: Check for Rate Limiting
Wait 10 minutes, then try again. If it works, you were rate limited.

## What I've Already Fixed in Your Code

### ✅ Added Retry Logic
Both `/generate-speech` and `/generate-watermark` endpoints now retry up to 3 times with exponential backoff.

### ✅ Better Error Messages
403 errors now return helpful information:
```json
{
  "error": "Microsoft Edge TTS service returned 403 Forbidden...",
  "details": "...",
  "solution": "Wait a few minutes and try again, or update edge-tts library"
}
```

### ✅ Changed HTTP Status Code
Changed from `500 Internal Server Error` to `503 Service Unavailable` for 403 errors, which is more semantically correct.

## Testing the Fix

### Test 1: Single Request
```bash
curl -X POST http://localhost:5001/generate-speech \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello world",
    "voice": "en-US-AndrewNeural"
  }'
```

### Test 2: Multiple Requests (Rate Limiting Test)
```bash
for i in {1..5}; do
  echo "Request $i"
  curl -X POST http://localhost:5001/generate-speech \
    -H "Content-Type: application/json" \
    -d "{\"text\": \"Test $i\", \"voice\": \"en-US-AndrewNeural\"}"
  sleep 1
done
```

### Test 3: Watermark Generation
```bash
curl -X POST http://localhost:5001/generate-watermark \
  -H "Content-Type: application/json" \
  -d '{
    "intro": "This content is licensed to",
    "id": "User ID 12345",
    "outro": "Unauthorized sharing is prohibited"
  }'
```

## Monitoring for Future Issues

### Enable Debug Logging
In your `tts_server.py`, you can see retry attempts in the console:
```
403 error on attempt 1/3, retrying in 0.5s...
403 error on attempt 2/3, retrying in 1.0s...
```

### Track Success Rate
Consider adding metrics:
```python
success_count = 0
failure_count = 0

# After each request
if success:
    success_count += 1
else:
    failure_count += 1

print(f"Success rate: {success_count/(success_count+failure_count)*100:.1f}%")
```

## Prevention Tips

1. **Rate Limit Client-Side**: Don't allow users to spam the TTS button
2. **Cache Results**: Store generated audio and reuse if same text requested
3. **Queue Requests**: Process TTS requests sequentially with delays
4. **Set Request Limits**: Max 10 requests per minute per user

## When to Escalate

If after trying all solutions the error persists:

1. **Check edge-tts GitHub Issues** - Others may have found a solution
2. **Report the Issue** - Help the community by reporting
3. **Consider Migration** - Switch to a paid, more reliable TTS service

## Additional Resources

- [edge-tts GitHub](https://github.com/rany2/edge-tts)
- [Microsoft Edge Read Aloud API](https://azure.microsoft.com/en-us/products/cognitive-services/text-to-speech/)
- [Alternative TTS Services Comparison](https://cloud.google.com/text-to-speech/docs/quotas)

## Summary

**Immediate Action:** Run `pip install --upgrade edge-tts` and restart your server.

**Long-term:** The retry logic I added will handle temporary 403 errors automatically. If errors persist after upgrading, consider switching to a paid TTS service for production use.
