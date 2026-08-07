// Fallback export: MediaRecorder capturing the preview canvas in realtime
// to WebM (preview resolution). Used when WebCodecs/mp4-muxer is not
// available — the UI shows a visible notice about the downgrade.

export function canFallback() {
  return 'MediaRecorder' in window && !!HTMLCanvasElement.prototype.captureStream;
}

/**
 * @returns {Promise<{blob: Blob, filename: string, warnings: string[]}>}
 */
export function exportWebM({ video, canvas, trim, onProgress, signal }) {
  return new Promise((resolve, reject) => {
    const vEl = video.el;
    const fps = Math.min(video.fps, 60);
    const stream = canvas.captureStream(fps);

    // Pull the original audio track along when the browser exposes it.
    try {
      const av = vEl.captureStream?.();
      for (const track of av?.getAudioTracks() ?? []) stream.addTrack(track);
    } catch { /* video-only capture */ }

    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
      .find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) {
      reject(new Error('MediaRecorder sin soporte WebM'));
      return;
    }

    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12e6 });
    const parts = [];
    rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };

    const wasMuted = vEl.muted;
    const cleanup = () => {
      vEl.pause();
      vEl.muted = wasMuted;
      clearInterval(watch);
    };

    rec.onstop = () => {
      cleanup();
      if (signal?.aborted) {
        reject(Object.assign(new Error('cancelado'), { code: 'aborted' }));
        return;
      }
      resolve({
        blob: new Blob(parts, { type: 'video/webm' }),
        filename: `${video.name.replace(/\.[^.]+$/, '')}_timeshift_preview.webm`,
        warnings: ['Exportado con MediaRecorder: WebM en tiempo real a resolución de preview.'],
      });
    };
    rec.onerror = (e) => { cleanup(); reject(e.error ?? new Error('MediaRecorder')); };

    const watch = setInterval(() => {
      if (signal?.aborted || vEl.currentTime >= trim.out - 0.03) {
        rec.stop();
        return;
      }
      onProgress?.({
        phase: 'video',
        done: Math.max(0, vEl.currentTime - trim.in),
        total: Math.max(0.01, trim.out - trim.in),
      });
    }, 100);

    vEl.currentTime = trim.in;
    vEl.muted = true; // avoid double audio during realtime capture
    vEl.play().then(() => rec.start(250)).catch((e) => { cleanup(); reject(e); });
  });
}
