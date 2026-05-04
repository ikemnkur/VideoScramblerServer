/**
 * python-service.cjs
 * 
 * Replaces the Flask (app.py) server by running Python scripts directly
 * via child_process. Import this module into server.cjs and call the
 * exported functions instead of making HTTP requests to Flask.
 * 
 * Usage in server.cjs:
 *   const pythonService = require('./python-service.cjs');
 *   // then replace axios.post(`${FLASKAPP_LINK}/scramble-photo`, payload)
 *   // with:  await pythonService.scramblePhoto(payload)
 */

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// ─── Paths ───────────────────────────────────────────────────
const PYTHON_DIR = path.join(__dirname, 'python');
const PYTHON_CMD = path.join(PYTHON_DIR, 'venv', 'bin', 'python3');
const INPUTS_DIR = path.join(PYTHON_DIR, 'inputs');
const OUTPUTS_DIR = path.join(PYTHON_DIR, 'outputs');
const PUBLIC_AUDIO_DIR = path.join(PYTHON_DIR, 'public_audio');

// Ensure directories exist
[INPUTS_DIR, OUTPUTS_DIR, PUBLIC_AUDIO_DIR].forEach(dir => {
  fs.mkdirSync(dir, { recursive: true });
});

// ─── TTS voices ──────────────────────────────────────────────
const TTS_VOICES = [
  'en-US-AndrewNeural',
  'en-US-AriaNeural',
  'en-US-GuyNeural',
  'en-US-JennyNeural',
  'en-GB-RyanNeural',
  'en-GB-SoniaNeural',
];

// ─── Auto-cleanup ────────────────────────────────────────────
let lastRequestTime = Date.now();
let cleanupInterval = null;

function touchActivity() {
  lastRequestTime = Date.now();
}

function cleanupOldFiles(cutoffMinutes = 10) {
  const cutoff = Date.now() - cutoffMinutes * 60 * 1000;
  let deleted = 0;

  [INPUTS_DIR, OUTPUTS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) return;
    for (const file of fs.readdirSync(dir)) {
      const fp = path.join(dir, file);
      try {
        const stat = fs.statSync(fp);
        if (stat.isFile() && stat.mtimeMs < cutoff) {
          fs.unlinkSync(fp);
          deleted++;
          console.log(`🗑️  Auto-cleanup: Deleted ${file}`);
        }
      } catch { /* ignore */ }
    }
  });
  if (deleted > 0) console.log(`✅ Auto-cleanup completed: ${deleted} files deleted`);
}

function startCleanupWorker() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    if (Date.now() - lastRequestTime >= 10 * 60 * 1000) {
      cleanupOldFiles(10);
    }
  }, 60_000);
  // Don't prevent Node from exiting
  cleanupInterval.unref();
  console.log('✅ Auto-cleanup worker thread started');
}

function stopCleanupWorker() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  console.log('🛑 Auto-cleanup worker stopped');
}

// ─── Helper: run a Python script ─────────────────────────────
function runPython(scriptName, args, timeoutMs = 60_000) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(PYTHON_DIR, scriptName);
    console.log(`🚀 Executing: ${PYTHON_CMD} ${scriptName} ${args.join(' ')}`);

    execFile(PYTHON_CMD, [scriptPath, ...args], {
      cwd: PYTHON_DIR,
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024, // 10 MB
    }, (error, stdout, stderr) => {
      if (error) {
        if (error.killed) {
          return reject({ timeout: true, message: 'Operation timed out' });
        }
        return reject({
          message: error.message,
          stdout,
          stderr,
          code: error.code,
        });
      }
      resolve({ stdout, stderr });
    });
  });
}

// ─── Helper: run ffmpeg ──────────────────────────────────────
function runFfmpeg(args, timeoutMs = 300_000) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) return reject({ message: error.message, stderr });
      resolve({ stdout, stderr });
    });
  });
}

// ═════════════════════════════════════════════════════════════
//  STANDARD PHOTO
// ═════════════════════════════════════════════════════════════

/**
 * Scramble (or unscramble) a photo using scramble_photo.py
 * @param {Object} data - { input, output, seed, mode, algorithm, percentage, rows, cols,
 *   noise_seed, noise_intensity, noise_mode, ... }
 */
async function scramblePhoto(data) {
    console.log('📸 scramblePhoto called with data:', data);
  touchActivity();
  const {
    input, output,
    seed = 123456, mode = 'scramble',
    percentage = 100, rows = 8, cols = 8,
    noise_seed, noise_intensity, noise_mode,
  } = data;

  if (!input || !output) throw { status: 400, error: 'input and output filenames required' };

  const inputPath = path.join(INPUTS_DIR, input);
  const outputPath = path.join(OUTPUTS_DIR, output);

  if (!fs.existsSync(inputPath)) throw { status: 404, error: `Input file ${input} not found` };

  const args = [
    '--input', inputPath,
    '--output', outputPath,
    '--seed', String(seed),
    '--rows', String(rows),
    '--cols', String(cols),
    '--mode', mode,
    '--percentage', String(percentage),
    '--noise_seed', String(noise_seed),
    '--noise_intensity', String(noise_intensity),
    '--noise_mode', String(noise_mode),
  ];

  await runPython('scramble_photo.py', args);

  if (!fs.existsSync(outputPath)) throw { status: 500, error: 'Output file was not created' };

  return {
    message: 'Photo scrambled successfully',
    output_file: output,
    algorithm: data.algorithm || 'position',
    seed,
    download_url: `/download/${output}`,
  };
}

/**
 * Unscramble photo — normalises Node.js-backend payload then delegates to scramblePhoto
 */
async function unscramblePhoto(data) {
  touchActivity();

  // Normalise { localFileName, localFilePath, params } format
  if (data.localFileName || data.localFilePath) {
    const params = data.params || {};
    const inputName = data.localFileName || path.basename(data.localFilePath || '');
    const outputName = params.output || `unscrambled_${inputName}`;

    data = {
      input: inputName,
      output: outputName,
      seed: params.seed ?? 123456,
      mode: 'unscramble',
      algorithm: params.algorithm || 'position',
      percentage: params.percentage ?? 100,
      rows: params.rows,
      cols: params.cols,
      noise_seed: params.noise_seed,
      noise_intensity: params.noise_intensity,
      noise_mode: params.noise_mode,
      noise_prng: params.noise_prng,
    };
  } else {
    data.mode = 'unscramble';
  }

  return scramblePhoto(data);
}

// ═════════════════════════════════════════════════════════════
//  PRO PHOTO (HPF / blur)
// ═════════════════════════════════════════════════════════════

async function scramblePhotoPro(data) {

  console.log('⚡ scramblePhotoPro called with data:', data);  
  touchActivity();
  const {
    input, output,
    seed = 123456, mode = 'scramble',
    percentage = 100, rows = 8, cols = 8,
    noise_seed, noise_intensity,
  } = data;

  if (!input || !output) throw { status: 400, error: 'input and output filenames required' };

  const inputPath = path.join(INPUTS_DIR, input);
  const outputPath = path.join(OUTPUTS_DIR, output);

  if (!fs.existsSync(inputPath)) throw { status: 404, error: `Input file ${input} not found` };

  const args = [
    '--input', inputPath,
    '--output', outputPath,
    '--seed', String(seed),
    '--rows', String(rows),
    '--cols', String(cols),
    '--mode', mode,
    '--blur-ksize', String(percentage),
    '--noise_seed', String(noise_seed),
    '--noise_intensity', String(noise_intensity),
    '--watermark-rows', '2',
  ];

  await runPython('scramble_photo2x_blur.py', args);

  if (!fs.existsSync(outputPath)) throw { status: 500, error: 'Output file was not created' };

  return {
    message: 'Photo scrambled successfully',
    output_file: output,
    seed,
    download_url: `/download/${output}`,
  };
}

async function unscramblePhotoPro(data) {
  touchActivity();

  if (data.localFileName || data.localFilePath) {
    const params = data.params || {};
    const inputName = data.localFileName || path.basename(data.localFilePath || '');
    const outputName = params.output || `unscrambled_${inputName}`;

    data = {
      input: inputName,
      output: outputName,
      seed: params.seed ?? 123456,
      mode: 'unscramble',
      'blur-ksize': params.percentage ?? 100,
      rows: params.rows,
      cols: params.cols,
      noise_seed: params.noise_seed,
      noise_intensity: params.noise_intensity,
      noise_prng: params.noise_prng,
      percentage: params.percentage ?? 100,
    };
  } else {
    data.mode = 'unscramble';
  }

  return scramblePhotoPro(data);
}

// ═════════════════════════════════════════════════════════════
//  STANDARD VIDEO
// ═════════════════════════════════════════════════════════════

async function scrambleVideo(data) {
  touchActivity();
  const {
    input, output,
    seed = 123456, mode = 'scramble',
    percentage = 100, rows = 8, cols = 8,
  } = data;

  if (!input || !output) throw { status: 400, error: 'input and output filenames required' };

  const inputPath = path.join(INPUTS_DIR, input);
  const outputPath = path.join(OUTPUTS_DIR, output);

  if (!fs.existsSync(inputPath)) throw { status: 404, error: `Input file ${input} not found` };

  const args = [
    '--input', inputPath,
    '--output', outputPath,
    '--seed', String(seed),
    '--rows', String(rows),
    '--cols', String(cols),
    '--mode', mode,
  ];

  if (percentage < 100) {
    args.push('--percentage', String(percentage));
  }

  await runPython('scramble_video.py', args, 300_000);

  if (!fs.existsSync(outputPath)) throw { status: 500, error: 'Output file was not created' };

  const result = {
    message: 'Video scrambled successfully',
    output_file: output,
    algorithm: data.algorithm || 'position',
    seed,
    download_url: `/download/${output}`,
  };

  // Create WebM version if not already WebM
  if (!output.toLowerCase().endsWith('.webm')) {
    try {
      const webmFilename = path.parse(output).name + '.webm';
      const webmPath = path.join(OUTPUTS_DIR, webmFilename);
      await runFfmpeg([
        '-i', outputPath,
        '-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0',
        '-c:a', 'libopus', '-y', webmPath,
      ]);
      if (fs.existsSync(webmPath)) {
        result.webm_file = webmFilename;
        result.webm_download_url = `/download/${webmFilename}`;
      }
    } catch (e) {
      console.warn('⚠️  WebM conversion failed, continuing without it:', e.message);
    }
  }

  return result;
}

async function unscrambleVideo(data) {
  touchActivity();

  if (data.localFileName || data.localFilePath) {
    const params = data.params || {};
    const inputName = data.localFileName || path.basename(data.localFilePath || '');
    const outputName = params.output || `unscrambled_${inputName}`;

    data = {
      input: inputName,
      output: outputName,
      seed: params.seed ?? 123456,
      mode: 'unscramble',
      algorithm: params.algorithm || 'position',
      percentage: params.percentage ?? 100,
      rows: params.rows,
      cols: params.cols,
    };
  } else {
    data.mode = 'unscramble';
  }

  return scrambleVideo(data);
}

// ═════════════════════════════════════════════════════════════
//  PRO VIDEO (HPF / blur)
// ═════════════════════════════════════════════════════════════

async function scrambleVideoPro(data) {
  touchActivity();
  const {
    input, output,
    seed = 123456, mode = 'scramble',
    rows = 8, cols = 8,
    blur_ksize = 50,
  } = data;

  if (!input || !output) throw { status: 400, error: 'input and output filenames required' };

  const inputPath = path.join(INPUTS_DIR, input);
  const outputPath = path.join(OUTPUTS_DIR, output);

  if (!fs.existsSync(inputPath)) throw { status: 404, error: `Input file ${input} not found` };

  const args = [
    '-i', inputPath,
    '-o', outputPath,
    '--algorithm', 'hpf',
    '--seed', String(seed),
    '--rows', String(rows),
    '--cols', String(cols),
    '--mode', mode,
    '--watermark-rows', '2',
    '--blur-ksize', String(blur_ksize),
  ];

  await runPython('scramble_video2x_blur.py', args, 300_000);

  if (!fs.existsSync(outputPath)) throw { status: 500, error: 'Output file was not created' };

  const result = {
    message: 'Video scrambled successfully',
    output_file: output,
    seed,
    download_url: `/download/${output}`,
  };

  // Create WebM version
  if (!output.toLowerCase().endsWith('.webm')) {
    try {
      const webmFilename = path.parse(output).name + '.webm';
      const webmPath = path.join(OUTPUTS_DIR, webmFilename);
      await runFfmpeg([
        '-i', outputPath,
        '-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0',
        '-c:a', 'libopus', '-y', webmPath,
      ]);
      if (fs.existsSync(webmPath)) {
        result.webm_file = webmFilename;
        result.webm_download_url = `/download/${webmFilename}`;
      }
    } catch (e) {
      console.warn('⚠️  WebM conversion failed, continuing without it:', e.message);
    }
  }

  return result;
}

async function unscrambleVideoPro(data) {
  touchActivity();

  if (data.localFileName || data.localFilePath) {
    const params = data.params || {};
    const inputName = data.localFileName || path.basename(data.localFilePath || '');
    const outputName = params.output || `unscrambled_${inputName}`;

    data = {
      input: inputName,
      output: outputName,
      seed: params.seed ?? 123456,
      mode: 'unscramble',
      algorithm: params.algorithm || 'hpf',
      blur_ksize: params.blur_ksize ?? 50,
      rows: params.rows,
      cols: params.cols,
    };
  } else {
    data.mode = 'unscramble';
  }

  return scrambleVideoPro(data);
}

// ═════════════════════════════════════════════════════════════
//  AUDIO STEGANOGRAPHY
// ═════════════════════════════════════════════════════════════

async function audioSteganoEmbed(data) {
  touchActivity();
  const { input, output, secret_message } = data;

  if (!input || !output || !secret_message) {
    throw { status: 400, error: 'input, output, and secret_message are required' };
  }

  const inputPath = path.join(INPUTS_DIR, input);
  const outputPath = path.join(OUTPUTS_DIR, output);

  if (!fs.existsSync(inputPath)) throw { status: 404, error: `Input file ${input} not found` };

  await runPython('audio_stegano.py', [
    '--mode', 'embed',
    '--original', inputPath,
    '--output', outputPath,
    '--data', secret_message,
  ]);

  if (!fs.existsSync(outputPath)) throw { status: 500, error: 'Output file was not created' };

  return {
    success: true,
    message: 'Audio watermarked successfully',
    output_file: output,
    download_url: `/download/${output}`,
  };
}

async function audioSteganoExtract(data) {
  touchActivity();
  const { input, original } = data;

  if (!input) throw { status: 400, error: 'input (leaked audio) is required' };

  const leakedPath = path.join(INPUTS_DIR, input);
  if (!fs.existsSync(leakedPath)) throw { status: 404, error: `Leaked audio file ${input} not found` };

  let originalPath = leakedPath;
  if (original) {
    const op = path.join(INPUTS_DIR, original);
    if (fs.existsSync(op)) originalPath = op;
  }

  const { stdout } = await runPython('audio_stegano.py', [
    '--mode', 'extract',
    '--original', originalPath,
    '--modified', leakedPath,
  ]);

  // Parse extracted code from stdout
  let extractedCode = null;
  if (stdout) {
    for (const line of stdout.split('\n')) {
      if (line.includes('Extracted data:') || line.includes('Data:')) {
        extractedCode = line.split(':').slice(1).join(':').trim();
        break;
      }
    }
    if (!extractedCode) {
      const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length) extractedCode = lines[lines.length - 1];
    }
  }

  return {
    success: Boolean(extractedCode),
    message: 'Audio extraction completed',
    extracted_code: extractedCode,
  };
}

// ═════════════════════════════════════════════════════════════
//  TTS (Text-to-Speech via edge-tts Python)
// ═════════════════════════════════════════════════════════════

function cleanupOldAudioFiles() {
  const cutoff = Date.now() - 3600_000; // 1 hour
  if (!fs.existsSync(PUBLIC_AUDIO_DIR)) return;
  for (const file of fs.readdirSync(PUBLIC_AUDIO_DIR)) {
    const fp = path.join(PUBLIC_AUDIO_DIR, file);
    try {
      if (fs.statSync(fp).mtimeMs < cutoff) fs.unlinkSync(fp);
    } catch { /* ignore */ }
  }
}

function ttsHealthCheck() {
  cleanupOldAudioFiles();
  return { status: 'ok', service: 'TTS Watermark Server' };
}

function getTtsVoices() {
  return { voices: TTS_VOICES };
}

/**
 * Generate speech via edge-tts CLI
 */
async function generateSpeech(data) {
  touchActivity();
  const { text, voice = 'en-US-AndrewNeural', rate = '+0%', pitch = '+0Hz' } = data;
  if (!text || !text.trim()) throw { status: 400, error: 'Text is required' };
  if (!TTS_VOICES.includes(voice)) throw { status: 400, error: 'Invalid voice' };

  let r = rate;
  if (r && !r.startsWith('+') && !r.startsWith('-')) r = '+' + r;
  let p = pitch;
  if (p && !p.startsWith('+') && !p.startsWith('-')) p = '+' + p;

  const filename = `speech_${uuidv4().replace(/-/g, '')}.mp3`;
  const outputPath = path.join(PUBLIC_AUDIO_DIR, filename);

  // Use a small inline Python script to call edge_tts
  const pyScript = `
import asyncio, sys, json, os
import edge_tts
from pydub import AudioSegment

async def main():
    data = json.loads(sys.argv[1])
    comm = edge_tts.Communicate(data['text'], data['voice'], rate=data['rate'], pitch=data['pitch'])
    await comm.save(data['output'])
    audio = AudioSegment.from_mp3(data['output'])
    print(json.dumps({
        'duration': len(audio) / 1000.0,
        'size': os.path.getsize(data['output'])
    }))

asyncio.run(main())
`;

  const payload = JSON.stringify({ text: text.trim(), voice, rate: r, pitch: p, output: outputPath });

  const { stdout } = await new Promise((resolve, reject) => {
    execFile(PYTHON_CMD, ['-c', pyScript, payload], {
      cwd: PYTHON_DIR,
      timeout: 60_000,
      maxBuffer: 5 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) return reject({ message: error.message, stderr });
      resolve({ stdout, stderr });
    });
  });

  const info = JSON.parse(stdout.trim());

  return {
    success: true,
    url: `/audio/${filename}`,
    filename,
    format: 'mp3',
    duration: info.duration,
    size: info.size,
  };
}

/**
 * Generate a TTS watermark (intro + id + outro)
 */
async function generateWatermark(data) {
  touchActivity();
  const {
    intro = '', id = '', outro = '',
    voice = 'en-US-AndrewNeural',
    rate = '+0%', pitch = '+0Hz',
    silence_between = 150,
  } = data;

  if (!intro.trim() && !id.trim() && !outro.trim()) {
    throw { status: 400, error: 'At least one text field is required' };
  }

  let r = rate;
  if (r && !r.startsWith('+') && !r.startsWith('-')) r = '+' + r;
  let p = pitch;
  if (p && !p.startsWith('+') && !p.startsWith('-')) p = '+' + p;

  const filename = `watermark_${uuidv4().replace(/-/g, '')}.mp3`;
  const outputPath = path.join(PUBLIC_AUDIO_DIR, filename);

  const pyScript = `
import asyncio, sys, json, os, tempfile
import edge_tts
from pydub import AudioSegment

async def main():
    data = json.loads(sys.argv[1])
    voice = data['voice']
    rate = data['rate']
    pitch = data['pitch']
    silence_ms = data['silence_between']
    segments = []
    temp_files = []

    try:
        for i, text in enumerate([data.get('intro',''), data.get('id',''), data.get('outro','')]):
            if not text.strip():
                continue
            comm = edge_tts.Communicate(text.strip(), voice, rate=rate, pitch=pitch)
            tmp = tempfile.mktemp(suffix='.mp3')
            temp_files.append(tmp)
            await comm.save(tmp)
            if segments:
                segments.append(AudioSegment.silent(duration=silence_ms))
            segments.append(AudioSegment.from_mp3(tmp))

        combined = segments[0]
        for s in segments[1:]:
            combined += s

        combined.export(data['output'], format='mp3', bitrate='192k')
        print(json.dumps({
            'duration': len(combined) / 1000.0,
            'size': os.path.getsize(data['output'])
        }))
    finally:
        for f in temp_files:
            try:
                os.unlink(f)
            except:
                pass

asyncio.run(main())
`;

  const payload = JSON.stringify({
    intro: intro.trim(), id: id.trim(), outro: outro.trim(),
    voice, rate: r, pitch: p, silence_between: silence_between,
    output: outputPath,
  });

  const { stdout } = await new Promise((resolve, reject) => {
    execFile(PYTHON_CMD, ['-c', pyScript, payload], {
      cwd: PYTHON_DIR,
      timeout: 60_000,
      maxBuffer: 5 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) return reject({ message: error.message, stderr });
      resolve({ stdout, stderr });
    });
  });

  const info = JSON.parse(stdout.trim());

  return {
    success: true,
    url: `/audio/${filename}`,
    filename,
    format: 'mp3',
    duration: info.duration,
    size: info.size,
  };
}

// ═════════════════════════════════════════════════════════════
//  FILE SERVING & CLEANUP
// ═════════════════════════════════════════════════════════════

function listFiles() {
  try {
    const files = fs.readdirSync(OUTPUTS_DIR).filter(f =>
      fs.statSync(path.join(OUTPUTS_DIR, f)).isFile()
    );
    return { files };
  } catch (e) {
    throw { status: 500, error: e.message };
  }
}

/**
 * Returns the absolute path to a downloadable file, checking outputs then inputs.
 * Returns null if not found.
 */
function getDownloadPath(filename) {
  const outPath = path.join(OUTPUTS_DIR, filename);
  if (fs.existsSync(outPath)) return outPath;
  const inPath = path.join(INPUTS_DIR, filename);
  if (fs.existsSync(inPath)) return inPath;
  return null;
}

/**
 * Returns the absolute path to a public audio file, or null.
 */
function getAudioPath(filename) {
  const fp = path.join(PUBLIC_AUDIO_DIR, filename);
  if (fs.existsSync(fp)) return fp;
  return null;
}

function cleanupUploads() {
  const cutoff = Date.now() - 15 * 60 * 1000;

  [INPUTS_DIR, OUTPUTS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) return;
    for (const file of fs.readdirSync(dir)) {
      const fp = path.join(dir, file);
      try {
        const stat = fs.statSync(fp);
        if (stat.isFile() && stat.mtimeMs < cutoff) fs.unlinkSync(fp);
      } catch { /* ignore */ }
    }
  });

  return { message: 'Old uploaded files cleaned up' };
}

// ═════════════════════════════════════════════════════════════
//  EXPORTS
// ═════════════════════════════════════════════════════════════

module.exports = {
  // Paths (useful for multer config in server.cjs)
  PYTHON_DIR,
  INPUTS_DIR,
  OUTPUTS_DIR,
  PUBLIC_AUDIO_DIR,
  TTS_VOICES,

  // Lifecycle
  startCleanupWorker,
  stopCleanupWorker,
  touchActivity,

  // Standard photo
  scramblePhoto,
  unscramblePhoto,

  // Pro photo
  scramblePhotoPro,
  unscramblePhotoPro,

  // Standard video
  scrambleVideo,
  unscrambleVideo,

  // Pro video
  scrambleVideoPro,
  unscrambleVideoPro,

  // Audio steganography
  audioSteganoEmbed,
  audioSteganoExtract,

  // TTS
  ttsHealthCheck,
  getTtsVoices,
  generateSpeech,
  generateWatermark,

  // Files
  listFiles,
  getDownloadPath,
  getAudioPath,
  cleanupUploads,
  cleanupOldAudioFiles,
};
