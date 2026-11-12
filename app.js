// Main Mobile Application Controller
// Orchestrates camera, YOLO detection, Web Audio, HUD rendering, and video recording.

document.addEventListener('DOMContentLoaded', async () => {
  const video = document.getElementById('cameraVideo');
  const canvas = document.getElementById('renderCanvas');
  const ctx = canvas.getContext('2d');

  // UI Elements
  const statusBadge = document.getElementById('statusBadge');
  const fpsTag = document.getElementById('fpsTag');
  const inferTag = document.getElementById('inferTag');
  const recordBtn = document.getElementById('recordBtn');
  const recordDot = document.getElementById('recordDot');
  const recordText = document.getElementById('recordText');
  const recordTimer = document.getElementById('recordTimer');
  const audioBtn = document.getElementById('audioBtn');
  const swapStereoBtn = document.getElementById('swapStereoBtn');
  const swapStereoText = document.getElementById('swapStereoText');
  const flipCamBtn = document.getElementById('flipCamBtn');
  const hideUiBtn = document.getElementById('hideUiBtn');
  const restoreUiBtn = document.getElementById('restoreUiBtn');
  const restoreFsBtn = document.getElementById('restoreFsBtn');
  const fsBtn = document.getElementById('fsBtn');
  const overlayBtn = document.getElementById('overlayBtn');
  const collapseDiagBtn = document.getElementById('collapseDiagBtn');
  const diagCard = document.getElementById('diagCard');
  const diagStatus = document.getElementById('diagStatus');
  const diagList = document.getElementById('diagList');
  const leftMeter = document.getElementById('leftMeter');
  const rightMeter = document.getElementById('rightMeter');
  const leftMeterLabel = document.getElementById('leftMeterLabel');
  const rightMeterLabel = document.getElementById('rightMeterLabel');
  const harmonyCircle = document.getElementById('harmonyCircle');

  // Instances
  const tracker = new TablewareTracker();
  const recorder = new DemoRecorder();

  let currentFacing = 'environment'; // Rear camera default for phone
  let isDetecting = false;
  let audioStarted = false;
  let showOverlays = true;

  // 1. Initialize Camera
  async function startCamera(facing = 'environment') {
    if (video.srcObject) {
      video.srcObject.getTracks().forEach(t => t.stop());
    }

    statusBadge.textContent = 'CONNECTING CAMERA...';
    statusBadge.className = 'badge loading';

    try {
      const constraints = {
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;
      await video.play();

      updateDimensions();

      statusBadge.textContent = 'CAMERA READY';
      statusBadge.className = 'badge ready';
    } catch (err) {
      console.warn('Environment camera failed, trying any camera:', err);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        video.srcObject = stream;
        await video.play();
        updateDimensions();
        statusBadge.textContent = 'CAMERA READY';
        statusBadge.className = 'badge ready';
      } catch (e2) {
        console.error('Camera access denied:', e2);
        statusBadge.textContent = 'CAMERA DENIED';
        statusBadge.className = 'badge error';
      }
    }
  }

  // 2. Initialize Model
  async function initTracker() {
    statusBadge.textContent = 'LOADING YOLO AI...';
    statusBadge.className = 'badge loading';
    await tracker.loadModel('./yolov8n.onnx');
    if (tracker.modelLoaded) {
      statusBadge.textContent = 'SYSTEM ACTIVE';
      statusBadge.className = 'badge live';
    } else {
      statusBadge.textContent = 'MODEL ERROR';
      statusBadge.className = 'badge error';
    }
  }

  // 3. User interaction to start audio (browser policy)
  function ensureAudio() {
    if (!audioStarted) {
      DeskAudio.start();
      audioStarted = true;
      audioBtn.classList.remove('muted');
      audioBtn.innerHTML = '<span>🔊</span> Audio On';
    }
  }

  window.addEventListener('click', ensureAudio, { once: true });
  window.addEventListener('touchstart', ensureAudio, { once: true });

  audioBtn.onclick = () => {
    ensureAudio();
    const muted = !DeskAudio.isMuted();
    DeskAudio.setMuted(muted);
    if (muted) {
      audioBtn.classList.add('muted');
      audioBtn.innerHTML = '<span>🔇</span> Muted';
    } else {
      audioBtn.classList.remove('muted');
      audioBtn.innerHTML = '<span>🔊</span> Audio On';
    }
  };

  // Stereo Swap (Left <-> Right) Handler
  function updateStereoUI() {
    const flipped = DeskAudio.isFlipped();
    if (swapStereoBtn) {
      if (flipped) {
        swapStereoBtn.classList.add('swapped');
        if (swapStereoText) swapStereoText.textContent = 'Stereo: R/L';
        swapStereoBtn.title = 'Stereo Swapped (Left: Spoon, Right: Fork) - Tap to restore';
      } else {
        swapStereoBtn.classList.remove('swapped');
        if (swapStereoText) swapStereoText.textContent = 'Stereo: L/R';
        swapStereoBtn.title = 'Stereo Normal (Left: Fork, Right: Spoon) - Tap to swap';
      }
    }
    if (leftMeterLabel) {
      leftMeterLabel.textContent = flipped ? 'Left Ear (Spoon)' : 'Left Ear (Fork)';
    }
    if (rightMeterLabel) {
      rightMeterLabel.textContent = flipped ? 'Right Ear (Fork)' : 'Right Ear (Spoon)';
    }
  }

  if (swapStereoBtn) {
    swapStereoBtn.onclick = () => {
      ensureAudio();
      const next = !DeskAudio.isFlipped();
      DeskAudio.setFlip(next);
      updateStereoUI();
      DeskAudio.testStereo(); // Plays quick left-then-right acoustic confirmation chime
    };
  }

  flipCamBtn.onclick = () => {
    currentFacing = (currentFacing === 'environment' ? 'user' : 'environment');
    startCamera(currentFacing);
  };

  // Dynamic Canvas Dimension & DPR Handling
  function updateDimensions() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (!w || !h) return;

    // devicePixelRatio capped at 2 for performance on mobile
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.round(w * dpr);
    const targetH = Math.round(h * dpr);

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
  }

  window.addEventListener('resize', updateDimensions);
  window.addEventListener('orientationchange', () => {
    setTimeout(updateDimensions, 100);
    setTimeout(updateDimensions, 300);
  });

  // Center-crop video to cover destination canvas with 1:1 isotropic scaling (zero distortion)
  function drawVideoCover(ctx, video, destW, destH) {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh || !destW || !destH) return;

    const vAspect = vw / vh;
    const dAspect = destW / destH;
    let sx, sy, sw, sh;

    if (dAspect > vAspect) {
      // Screen/canvas is wider than camera stream: crop top & bottom
      sw = vw;
      sh = vw / dAspect;
      sx = 0;
      sy = (vh - sh) / 2;
    } else {
      // Screen/canvas is taller than camera stream: crop sides
      sh = vh;
      sw = vh * dAspect;
      sx = (vw - sw) / 2;
      sy = 0;
    }

    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, destW, destH);
  }

  // Fullscreen Mode Controls
  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
  }

  function updateFullscreenUI() {
    const fs = isFullscreen();
    const text = fs ? 'Exit FS' : 'Fullscreen';
    const icon = fs ? '🗗' : '⛶';
    if (fsBtn) {
      fsBtn.innerHTML = `<span>${icon}</span> ${text}`;
      fsBtn.title = fs ? 'Exit Fullscreen' : 'Enter Fullscreen';
    }
    if (restoreFsBtn) {
      restoreFsBtn.innerHTML = `<span>${icon}</span>`;
      restoreFsBtn.title = fs ? 'Exit Fullscreen' : 'Enter Fullscreen';
    }
  }

  async function toggleFullscreen() {
    try {
      const doc = document;
      const docEl = document.documentElement;

      if (!isFullscreen()) {
        if (docEl.requestFullscreen) {
          await docEl.requestFullscreen();
        } else if (docEl.webkitRequestFullscreen) {
          await docEl.webkitRequestFullscreen();
        } else if (docEl.msRequestFullscreen) {
          await docEl.msRequestFullscreen();
        }
      } else {
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        } else if (doc.msExitFullscreen) {
          await doc.msExitFullscreen();
        }
      }
    } catch (err) {
      console.warn('Fullscreen request error:', err);
    }
  }

  if (fsBtn) {
    fsBtn.onclick = (e) => {
      e.stopPropagation();
      toggleFullscreen();
    };
  }
  if (restoreFsBtn) {
    restoreFsBtn.onclick = (e) => {
      e.stopPropagation();
      toggleFullscreen();
    };
  }

  document.addEventListener('fullscreenchange', () => {
    updateFullscreenUI();
    setTimeout(updateDimensions, 100);
  });
  document.addEventListener('webkitfullscreenchange', () => {
    updateFullscreenUI();
    setTimeout(updateDimensions, 100);
  });

  // Clean Screen Recording Mode: Hide all UI boxes
  function hideUI() {
    document.body.classList.add('ui-hidden');
  }

  function showUI() {
    document.body.classList.remove('ui-hidden');
  }

  hideUiBtn.onclick = (e) => {
    e.stopPropagation();
    hideUI();
  };

  restoreUiBtn.onclick = (e) => {
    e.stopPropagation();
    showUI();
  };

  // Tapping viewport when UI is hidden toggles it back
  canvas.addEventListener('click', () => {
    if (document.body.classList.contains('ui-hidden')) {
      showUI();
    }
  });

  // Toggle AR detection lines on/off
  overlayBtn.onclick = () => {
    showOverlays = !showOverlays;
    overlayBtn.innerHTML = showOverlays ? '<span>📐</span> Lines On' : '<span>📐</span> Lines Off';
    overlayBtn.style.opacity = showOverlays ? '1' : '0.6';
  };

  // Collapse / Expand Diagnostics card
  collapseDiagBtn.onclick = (e) => {
    e.stopPropagation();
    const isCollapsed = diagCard.classList.toggle('collapsed');
    collapseDiagBtn.textContent = isCollapsed ? '+' : '—';
    collapseDiagBtn.title = isCollapsed ? 'Expand card' : 'Minimize card';
  };

  // 4. Video Recording Handler
  recorder.onTimerUpdate = timeStr => {
    recordTimer.textContent = timeStr;
  };

  recordBtn.onclick = () => {
    ensureAudio();
    if (!recorder.isRecording()) {
      const audioTrack = DeskAudio.getAudioTrack();
      recorder.start(canvas, audioTrack);
      recordBtn.classList.add('recording');
      recordDot.classList.add('active');
      recordText.textContent = 'Stop & Save';
      recordTimer.hidden = false;
    } else {
      recorder.stop();
      recordBtn.classList.remove('recording');
      recordDot.classList.remove('active');
      recordText.textContent = 'Record Demo';
      recordTimer.hidden = true;
      recordTimer.textContent = '00:00';
    }
  };

  // 5. Drawing HUD Overlays onto Canvas
  function drawHUD(state) {
    if (!showOverlays) return; // Completely clean camera view when toggled off!
    const W = canvas.width;
    const H = canvas.height;

    // Draw Plate
    if (state.plate.present) {
      const px = state.plate.x;
      const py = state.plate.y;
      const pr = state.plate.r;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, 2 * Math.PI);
      ctx.strokeStyle = '#5cc98a';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = 'rgba(92, 201, 138, 0.15)';
      ctx.fill();

      ctx.fillStyle = '#5cc98a';
      ctx.font = 'bold 15px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Plate / Bowl', px, py + 5);
    }

    // Draw Tray Normal Reference
    if (state.tray.has_perp) {
      const cx = state.plate.present ? state.plate.x : W / 2;
      const cy = state.plate.present ? state.plate.y : H / 2;
      const rad = (state.tray.perp_angle * Math.PI) / 180.0;
      const nx = cx + Math.cos(rad) * 110;
      const ny = cy + Math.sin(rad) * 110;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(nx, ny);
      ctx.strokeStyle = '#f4c542';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Arrow head
      const headlen = 14;
      ctx.beginPath();
      ctx.moveTo(nx, ny);
      ctx.lineTo(nx - headlen * Math.cos(rad - Math.PI / 7), ny - headlen * Math.sin(rad - Math.PI / 7));
      ctx.lineTo(nx - headlen * Math.cos(rad + Math.PI / 7), ny - headlen * Math.sin(rad + Math.PI / 7));
      ctx.closePath();
      ctx.fillStyle = '#f4c542';
      ctx.fill();

      ctx.fillStyle = '#f4c542';
      ctx.font = 'bold 13px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`Target Normal: ${state.tray.perp_angle.toFixed(1)}°`, cx, cy - 12);
    }

    // Draw Fork
    if (state.fork.present) {
      const fx = state.fork.x;
      const fy = state.fork.y;
      const ang = (state.fork.angle * Math.PI) / 180.0;
      const col = state.fork.aligned ? '#5cc98a' : '#e05a4f';

      ctx.beginPath();
      ctx.arc(fx, fy, 6, 0, 2 * Math.PI);
      ctx.fillStyle = col;
      ctx.fill();

      // Long axis line
      ctx.beginPath();
      ctx.moveTo(fx - Math.cos(ang) * 60, fy - Math.sin(ang) * 60);
      ctx.lineTo(fx + Math.cos(ang) * 60, fy + Math.sin(ang) * 60);
      ctx.strokeStyle = col;
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.fillStyle = col;
      ctx.font = 'bold 15px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`Fork: ${state.fork.delta_deg}° ${state.fork.aligned ? '✓' : '✗'}`, fx, fy - 22);
    }

    // Draw Spoon
    if (state.spoon.present) {
      const sx = state.spoon.x;
      const sy = state.spoon.y;
      const ang = (state.spoon.angle * Math.PI) / 180.0;
      const col = state.spoon.aligned ? '#5cc98a' : '#e05a4f';

      ctx.beginPath();
      ctx.arc(sx, sy, 6, 0, 2 * Math.PI);
      ctx.fillStyle = col;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(sx - Math.cos(ang) * 60, sy - Math.sin(ang) * 60);
      ctx.lineTo(sx + Math.cos(ang) * 60, sy + Math.sin(ang) * 60);
      ctx.strokeStyle = col;
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.fillStyle = col;
      ctx.font = 'bold 15px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`Spoon: ${state.spoon.delta_deg}° ${state.spoon.aligned ? '✓' : '✗'}`, sx, sy - 22);
    }
  }

  // 6. Main Animation & Inference Loop
  let frameCount = 0;

  async function loop() {
    frameCount++;

    if (video.readyState >= 2) {
      // 1. Draw live camera frame with isotropic center-crop cover (zero aspect distortion)
      drawVideoCover(ctx, video, canvas.width, canvas.height);

      // 2. Run YOLO detection every 2nd frame in background
      if (tracker.modelLoaded && !isDetecting && frameCount % 2 === 0) {
        isDetecting = true;
        tracker.detect(canvas, ctx).finally(() => {
          isDetecting = false;
        });
      }

      // 3. Get current state & draw overlays
      const isFlipped = DeskAudio.isFlipped();
      const state = tracker.getState(isFlipped);
      drawHUD(state);

      // 4. Update Audio Engine
      DeskAudio.update(state);

      // 5. Update HTML UI Readouts
      fpsTag.textContent = `${state.fps} FPS`;
      inferTag.textContent = `${state.inferTime} ms`;

      // Ear meters reflect what is heard in each respective ear
      const leftVal = isFlipped ? state.e_right : state.e_left;
      const rightVal = isFlipped ? state.e_left : state.e_right;

      leftMeter.style.width = `${leftVal * 100}%`;
      leftMeter.style.background = `hsl(${120 - 120 * leftVal} 70% 50%)`;

      rightMeter.style.width = `${rightVal * 100}%`;
      rightMeter.style.background = `hsl(${120 - 120 * rightVal} 70% 50%)`;

      // Harmony progress ring
      const circ = 2 * Math.PI * 26; // r=26
      const offset = circ * (1 - state.harmony);
      harmonyCircle.style.strokeDashoffset = offset;

      // Diagnostic Card
      diagStatus.textContent = state.status;
      diagStatus.className = `status-tag ${state.status.toLowerCase()}`;
      diagList.innerHTML = state.reasons.map(r => `<li>${r}</li>`).join('');
    }

    requestAnimationFrame(loop);
  }

  // Start everything
  await startCamera('environment');
  await initTracker();
  requestAnimationFrame(loop);
});
