// Mobile Video & Audio Demo Recorder using MediaRecorder API
// Records canvas overlay + stereo synth audio directly to high-res video file.

class DemoRecorder {
  constructor() {
    this.recorder = null;
    this.chunks = [];
    this.recording = false;
    this.startTime = 0;
    this.timerInterval = null;
    this.onTimerUpdate = null;
  }

  isRecording() {
    return this.recording;
  }

  getSupportedMimeType() {
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4'
    ];
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) {
        return t;
      }
    }
    return '';
  }

  start(canvas, audioTrack = null) {
    if (this.recording) return;

    // Capture 30 FPS video stream from canvas
    const videoStream = canvas.captureStream(30);
    const tracks = [...videoStream.getVideoTracks()];

    if (audioTrack) {
      tracks.push(audioTrack);
    }

    const combinedStream = new MediaStream(tracks);
    const mimeType = this.getSupportedMimeType();

    try {
      this.recorder = new MediaRecorder(combinedStream, mimeType ? { mimeType, videoBitsPerSecond: 3500000 } : {});
    } catch (e) {
      console.warn('Fallback to default MediaRecorder options:', e);
      this.recorder = new MediaRecorder(combinedStream);
    }

    this.chunks = [];
    this.recorder.ondataavailable = e => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };

    this.recorder.onstop = () => {
      this.exportVideo();
    };

    this.recorder.start(250); // Slice every 250ms
    this.recording = true;
    this.startTime = performance.now();

    if (this.onTimerUpdate) {
      this.timerInterval = setInterval(() => {
        const elapsedSec = Math.floor((performance.now() - this.startTime) / 1000);
        const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
        const secs = String(elapsedSec % 60).padStart(2, '0');
        this.onTimerUpdate(`${mins}:${secs}`);
      }, 500);
    }
  }

  stop() {
    if (!this.recording || !this.recorder) return;
    this.recording = false;
    clearInterval(this.timerInterval);
    if (this.recorder.state !== 'inactive') {
      this.recorder.stop();
    }
  }

  exportVideo() {
    const mime = this.recorder.mimeType || 'video/webm';
    const blob = new Blob(this.chunks, { type: mime });
    const ext = mime.includes('mp4') ? 'mp4' : 'webm';

    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `tableware-ocd-demo-${dateStr}.${ext}`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);

    console.log(`Demo video exported: ${filename} (${(blob.size / 1024 / 1024).toFixed(2)} MB)`);
  }
}
