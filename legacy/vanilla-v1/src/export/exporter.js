// Full-resolution export: streaming re-decode of the source via seek
// stepping, effect chain rendered per frame with animated params, encoded
// with WebCodecs VideoEncoder and muxed to MP4 (mp4-muxer from CDN).
// Original audio is decoded, trim-aligned and encoded to AAC (or Opus).

import { Engine } from '../engine/renderer.js';
import { SeekStepper } from '../engine/video.js';
import { registry } from '../effects/registry.js';
import { resolveParams, chainMaxReach } from '../animation/resolver.js';

const MP4_MUXER_CDN = 'https://cdn.jsdelivr.net/npm/mp4-muxer@5/+esm';

export class ExportError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // 'nowebcodecs' | 'cdn' | 'codec' | 'aborted' | 'render'
  }
}

/** Pre-flight numbers for the export dialog. */
export function estimateExport({ video, chain, trim, scale }) {
  const outW = even(video.width * scale);
  const outH = even(video.height * scale);
  const ctx = { fps: video.fps, duration: video.duration };
  const reach = chainMaxReach(chain, ctx);
  const frames = Math.max(1, Math.round((trim.out - trim.in) * video.fps));
  const ringMB = (outW * outH * 4 * (reach + 2)) / (1024 * 1024);
  return { outW, outH, frames, reach, ringMB };
}

function even(v) {
  return Math.max(2, 2 * Math.round(v / 2));
}

async function pickVideoCodec(width, height, framerate, bitrate) {
  const candidates = [
    { codec: 'avc1.640034', mux: 'avc' }, // High L5.2 (4K)
    { codec: 'avc1.640028', mux: 'avc' }, // High L4.0 (1080p)
    { codec: 'avc1.42001f', mux: 'avc' }, // Baseline L3.1
    { codec: 'vp09.00.50.08', mux: 'vp9' },
  ];
  for (const c of candidates) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported({
        codec: c.codec, width, height, framerate, bitrate,
      });
      if (supported) return c;
    } catch { /* try next */ }
  }
  return null;
}

async function decodeAudio(file, trim) {
  const ctx = new AudioContext({ sampleRate: 48000 });
  try {
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    const sr = buf.sampleRate;
    const from = Math.floor(trim.in * sr);
    const to = Math.min(Math.ceil(trim.out * sr), buf.length);
    if (to <= from) return null;
    const channels = [];
    for (let c = 0; c < buf.numberOfChannels; c++) {
      channels.push(buf.getChannelData(c).slice(from, to));
    }
    return { sampleRate: sr, channels, length: to - from };
  } catch {
    return null; // silent clip or undecodable audio — export video only
  } finally {
    ctx.close();
  }
}

async function pickAudioCodec(sampleRate, numberOfChannels) {
  if (!('AudioEncoder' in window)) return null;
  const candidates = [
    { codec: 'mp4a.40.2', mux: 'aac' },
    { codec: 'opus', mux: 'opus' },
  ];
  for (const c of candidates) {
    try {
      const { supported } = await AudioEncoder.isConfigSupported({
        codec: c.codec, sampleRate, numberOfChannels, bitrate: 192_000,
      });
      if (supported) return c;
    } catch { /* try next */ }
  }
  return null;
}

/**
 * @returns {Promise<{blob: Blob, filename: string, warnings: string[]}>}
 */
export async function exportVideo({ video, chain, trim, scale, includeAudio, onProgress, signal }) {
  if (!('VideoEncoder' in window)) {
    throw new ExportError('nowebcodecs', 'WebCodecs no disponible');
  }
  let mp4;
  try {
    mp4 = await import(/* @vite-ignore */ MP4_MUXER_CDN);
  } catch {
    throw new ExportError('cdn', 'No se pudo cargar mp4-muxer (¿sin conexión?)');
  }

  const warnings = [];
  const fps = video.fps;
  const { outW, outH, frames, reach } = estimateExport({ video, chain, trim, scale });
  const bitrate = Math.round(Math.min(40e6, Math.max(2e6, outW * outH * fps * 0.12)));

  const vcodec = await pickVideoCodec(outW, outH, fps, bitrate);
  if (!vcodec) throw new ExportError('codec', 'Ningún códec de video soportado a esta resolución');

  // --- audio (decoded first: the muxer needs to know the track layout) ---
  let audio = null;
  let acodec = null;
  if (includeAudio) {
    audio = await decodeAudio(video.file, trim);
    if (audio) {
      acodec = await pickAudioCodec(audio.sampleRate, audio.channels.length);
      if (!acodec) {
        audio = null;
        warnings.push('Audio omitido: AudioEncoder/AAC no soportado en este navegador.');
      }
    } else {
      warnings.push('El clip no tiene pista de audio decodificable.');
    }
  }

  // --- muxer + encoders ---
  const target = new mp4.ArrayBufferTarget();
  const muxer = new mp4.Muxer({
    target,
    video: { codec: vcodec.mux, width: outW, height: outH, frameRate: fps },
    audio: audio ? {
      codec: acodec.mux,
      sampleRate: audio.sampleRate,
      numberOfChannels: audio.channels.length,
    } : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  let encoderError = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encoderError = e; },
  });
  encoder.configure({ codec: vcodec.codec, width: outW, height: outH, framerate: fps, bitrate });

  // --- offscreen full-res engine, ring sized to the chain's real reach ---
  const canvas = document.createElement('canvas');
  const engine = new Engine(canvas, { preserveDrawingBuffer: true });
  const info = engine.configure({
    srcWidth: video.width, srcHeight: video.height,
    targetWidth: outW,
    depth: reach + 2,
  });
  if (info.depth < info.requestedDepth) {
    warnings.push(`Buffer de export limitado por memoria: delays recortados a ${info.depth} frames. ` +
      'Exporta a menor escala para el alcance completo.');
  }

  const stepper = new SeekStepper(video.url);
  const abort = () => {
    stepper.dispose();
    engine.dispose();
    try { encoder.close(); } catch { /* already closed */ }
  };

  try {
    await stepper.ready();
    const preRoll = Math.min(info.depth - 1, Math.ceil(reach), Math.floor(trim.in * fps));

    for (let i = -preRoll; i < frames; i++) {
      if (signal?.aborted) throw new ExportError('aborted', 'cancelado');
      if (encoderError) throw new ExportError('render', String(encoderError));

      const t = trim.in + i / fps;
      await stepper.seek(t + 0.0001);
      engine.pushFrame(stepper.video);
      if (i < 0) {
        onProgress?.({ phase: 'preroll', done: i + preRoll + 1, total: preRoll });
        continue;
      }

      engine.render(chain, registry, {
        time: t, fps, duration: video.duration,
        params: (fx) => resolveParams(fx, t),
      });

      const frame = new VideoFrame(canvas, {
        timestamp: Math.round((i / fps) * 1e6),
        duration: Math.round(1e6 / fps),
      });
      encoder.encode(frame, { keyFrame: i % Math.max(1, Math.round(fps * 2)) === 0 });
      frame.close();

      while (encoder.encodeQueueSize > 8) {
        if (signal?.aborted) throw new ExportError('aborted', 'cancelado');
        await new Promise((r) => setTimeout(r, 4));
      }
      onProgress?.({ phase: 'video', done: i + 1, total: frames });
    }
    await encoder.flush();

    // --- audio encode (fast, after video) ---
    if (audio) {
      await encodeAudioTrack(mp4, muxer, audio, acodec, signal);
    }

    muxer.finalize();
    const blob = new Blob([target.buffer], { type: 'video/mp4' });
    const filename = `${video.name.replace(/\.[^.]+$/, '')}_timeshift.mp4`;
    return { blob, filename, warnings };
  } finally {
    abort();
  }
}

async function encodeAudioTrack(mp4, muxer, audio, acodec, signal) {
  const { sampleRate, channels, length } = audio;
  const numCh = channels.length;
  let error = null;
  const aenc = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => { error = e; },
  });
  aenc.configure({ codec: acodec.codec, sampleRate, numberOfChannels: numCh, bitrate: 192_000 });

  const CHUNK = 1024;
  for (let off = 0; off < length; off += CHUNK) {
    if (signal?.aborted || error) break;
    const n = Math.min(CHUNK, length - off);
    const data = new Float32Array(n * numCh);
    for (let c = 0; c < numCh; c++) {
      data.set(channels[c].subarray(off, off + n), c * n);
    }
    aenc.encode(new AudioData({
      format: 'f32-planar',
      sampleRate,
      numberOfFrames: n,
      numberOfChannels: numCh,
      timestamp: Math.round((off / sampleRate) * 1e6),
      data,
    }));
    if (aenc.encodeQueueSize > 16) await new Promise((r) => setTimeout(r, 2));
  }
  await aenc.flush();
  aenc.close();
}
