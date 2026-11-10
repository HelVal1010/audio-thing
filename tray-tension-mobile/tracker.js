// Mobile Vision & Alignment Tracker (ONNX Runtime Web + YOLOv8n)
// Runs 100% client-side in the browser on smartphone or desktop.

class TablewareTracker {
  constructor() {
    this.session = null;
    this.modelLoading = false;
    this.modelLoaded = false;
    this.lastInferenceTime = 0;
    this.fps = 0;
    this.frameCount = 0;
    this.fpsLastTime = performance.now();

    // 640x640 canvas for YOLO tensor pre-processing
    this.prepCanvas = document.createElement('canvas');
    this.prepCanvas.width = 640;
    this.prepCanvas.height = 640;
    this.prepCtx = this.prepCanvas.getContext('2d', { willReadFrequently: true });

    // Cutlery & Tray State
    this.tray = {
      present: true,
      angle: 0.0,
      perp_angle: 90.0,
      has_perp: true
    };

    this.plate = { present: false, x: 0, y: 0, r: 0 };
    this.fork = { present: false, x: 0, y: 0, angle: 90.0, delta_deg: 0.0, aligned: true, e: 0.0, ttl: 0 };
    this.spoon = { present: false, x: 0, y: 0, angle: 90.0, delta_deg: 0.0, aligned: true, e: 0.0, ttl: 0 };

    this.tol_deg = 2.5;
    this.max_deg = 15.0;
    this.hold_s = 5.0;
    this.harmony_t0 = null;
    this.harmony = 0.0;
    this.e_left = 0.0;
    this.e_right = 0.0;
    this.tension = 0.0;

    // Smoothing factor for moving averages
    this.alpha = 0.35;
  }

  async loadModel(modelPath = './yolov8n.onnx') {
    if (this.modelLoading || this.modelLoaded) return;
    this.modelLoading = true;
    try {
      // Configure ONNX Runtime Web to use WebGL or WASM
      ort.env.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 2);
      this.session = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['webgl', 'wasm'],
        graphOptimizationLevel: 'all'
      });
      this.modelLoaded = true;
      console.log('YOLOv8n ONNX model loaded successfully!');
    } catch (err) {
      console.warn('WebGL execution provider failed, falling back to WASM:', err);
      try {
        this.session = await ort.InferenceSession.create(modelPath, {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all'
        });
        this.modelLoaded = true;
        console.log('YOLOv8n ONNX model loaded successfully (WASM fallback)!');
      } catch (e2) {
        console.error('Fatal: Could not load YOLO ONNX model:', e2);
      }
    } finally {
      this.modelLoading = false;
    }
  }

  wrap90(d) {
    return ((d + 90) % 180 + 180) % 180 - 90;
  }

  clamp01(v) {
    return Math.min(1.0, Math.max(0.0, v));
  }

  // Prepares the 640x640 float32 tensor from a source canvas/video
  createTensorFromSource(source) {
    const sw = source.videoWidth || source.width;
    const sh = source.videoHeight || source.height;
    if (!sw || !sh) return null;

    this.prepCtx.drawImage(source, 0, 0, 640, 640);
    const imgData = this.prepCtx.getImageData(0, 0, 640, 640).data;
    const floatData = new Float32Array(3 * 640 * 640);
    const channelSize = 640 * 640;

    for (let i = 0; i < channelSize; i++) {
      const idx = i * 4;
      floatData[i] = imgData[idx] / 255.0;                       // R
      floatData[channelSize + i] = imgData[idx + 1] / 255.0;     // G
      floatData[channelSize * 2 + i] = imgData[idx + 2] / 255.0; // B
    }

    return new ort.Tensor('float32', floatData, [1, 3, 640, 640]);
  }

  // Process a video frame
  async detect(sourceCanvas, mainCtx) {
    if (!this.modelLoaded || !this.session) return null;

    const t0 = performance.now();
    const tensor = this.createTensorFromSource(sourceCanvas);
    if (!tensor) return null;

    const feeds = {};
    feeds[this.session.inputNames[0]] = tensor;

    let output;
    try {
      const results = await this.session.run(feeds);
      output = results[this.session.outputNames[0]]; // Shape: [1, 84, 8400]
    } catch (e) {
      console.warn('Inference error:', e);
      return null;
    }

    const tInfer = performance.now() - t0;
    this.lastInferenceTime = tInfer;

    // Track FPS
    this.frameCount++;
    const now = performance.now();
    if (now - this.fpsLastTime >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.fpsLastTime));
      this.frameCount = 0;
      this.fpsLastTime = now;
    }

    // Parse YOLOv8 predictions: shape [1, 84, 8400]
    const data = output.data;
    const anchors = 8400;
    const origW = sourceCanvas.width;
    const origH = sourceCanvas.height;
    const xFactor = origW / 640.0;
    const yFactor = origH / 640.0;

    const boxes = [];
    const scores = [];
    const classIds = [];

    // Filter for cutlery and dishware: 41: cup, 42: fork, 43: knife, 44: spoon, 45: bowl
    const TARGET_CLASSES = [41, 42, 43, 44, 45];

    for (let a = 0; a < anchors; a++) {
      let maxScore = 0;
      let maxCid = -1;
      for (const cid of TARGET_CLASSES) {
        const s = data[(4 + cid) * anchors + a];
        if (s > maxScore) {
          maxScore = s;
          maxCid = cid;
        }
      }

      if (maxScore > 0.08) {
        const cx = data[0 * anchors + a] * xFactor;
        const cy = data[1 * anchors + a] * yFactor;
        const bw = data[2 * anchors + a] * xFactor;
        const bh = data[3 * anchors + a] * yFactor;
        const x = cx - bw / 2.0;
        const y = cy - bh / 2.0;

        boxes.push([x, y, bw, bh]);
        scores.push(maxScore);
        classIds.push(maxCid);
      }
    }

    // Non-Maximum Suppression (NMS)
    const indices = this.nms(boxes, scores, 0.40);
    const detections = indices.map(i => ({
      classId: classIds[i],
      score: scores[i],
      box: boxes[i],
      cx: boxes[i][0] + boxes[i][2] / 2.0,
      cy: boxes[i][1] + boxes[i][3] / 2.0
    }));

    // Update alignment engine
    this.updateAlignment(detections, sourceCanvas, mainCtx);
    return detections;
  }

  // Fast NMS implementation
  nms(boxes, scores, iouThreshold) {
    const order = scores.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]).map(x => x[1]);
    const keep = [];

    while (order.length > 0) {
      const idx = order.shift();
      keep.push(idx);

      const boxA = boxes[idx];
      const remaining = [];

      for (const nextIdx of order) {
        const boxB = boxes[nextIdx];
        const x1 = Math.max(boxA[0], boxB[0]);
        const y1 = Math.max(boxA[1], boxB[1]);
        const x2 = Math.min(boxA[0] + boxA[2], boxB[0] + boxB[2]);
        const y2 = Math.min(boxA[1] + boxA[3], boxB[1] + boxB[3]);

        const w = Math.max(0, x2 - x1);
        const h = Math.max(0, y2 - y1);
        const inter = w * h;
        const union = (boxA[2] * boxA[3]) + (boxB[2] * boxB[3]) - inter;
        const iou = union > 0 ? inter / union : 0;

        if (iou < iouThreshold) {
          remaining.push(nextIdx);
        }
      }
      order.length = 0;
      order.push(...remaining);
    }
    return keep;
  }

  // Extract precise physical angle from high-contrast cutlery pixels
  extractAngleFromCrop(sourceCanvas, box) {
    const [bx, by, bw, bh] = box;
    const pad = 12;
    const x0 = Math.max(0, Math.floor(bx - pad));
    const y0 = Math.max(0, Math.floor(by - pad));
    const x1 = Math.min(sourceCanvas.width, Math.ceil(bx + bw + pad));
    const y1 = Math.min(sourceCanvas.height, Math.ceil(by + bh + pad));
    const cw = x1 - x0;
    const ch = y1 - y0;

    if (cw < 8 || ch < 8) return 90.0;

    // Read pixels from source
    const cropCtx = this.prepCtx;
    cropCtx.drawImage(sourceCanvas, x0, y0, cw, ch, 0, 0, cw, ch);
    const imgData = cropCtx.getImageData(0, 0, cw, ch).data;

    // Sobel gradient and metallic edge extraction
    const xs = [], ys = [];
    let sumX = 0, sumY = 0;

    for (let y = 1; y < ch - 1; y += 2) {
      for (let x = 1; x < cw - 1; x += 2) {
        const idx = (y * cw + x) * 4;
        const gray = 0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2];

        // Approximate gradient magnitude
        const idxR = (y * cw + (x + 1)) * 4;
        const idxL = (y * cw + (x - 1)) * 4;
        const idxD = ((y + 1) * cw + x) * 4;
        const idxU = ((y - 1) * cw + x) * 4;

        const gL = 0.299 * imgData[idxL] + 0.587 * imgData[idxL + 1] + 0.114 * imgData[idxL + 2];
        const gR = 0.299 * imgData[idxR] + 0.587 * imgData[idxR + 1] + 0.114 * imgData[idxR + 2];
        const gU = 0.299 * imgData[idxU] + 0.587 * imgData[idxU + 1] + 0.114 * imgData[idxU + 2];
        const gD = 0.299 * imgData[idxD] + 0.587 * imgData[idxD + 1] + 0.114 * imgData[idxD + 2];

        const gx = gR - gL;
        const gy = gD - gU;
        const mag = Math.hypot(gx, gy);

        // Sharp metallic edges
        if (mag > 32) {
          xs.push(x);
          ys.push(y);
          sumX += x;
          sumY += y;
        }
      }
    }

    const n = xs.length;
    if (n < 16) {
      return (bh >= bw ? 90.0 : 0.0);
    }

    // PCA on high-contrast edge coordinates
    const mx = sumX / n;
    const my = sumY / n;
    let cxx = 0, cyy = 0, cxy = 0;

    for (let i = 0; i < n; i++) {
      const dx = xs[i] - mx;
      const dy = ys[i] - my;
      cxx += dx * dx;
      cyy += dy * dy;
      cxy += dx * dy;
    }

    cxx /= n;
    cyy /= n;
    cxy /= n;

    // Angle of principal axis
    const angleRad = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
    let angleDeg = (angleRad * 180.0 / Math.PI);
    angleDeg = (angleDeg % 180.0 + 180.0) % 180.0;
    return angleDeg;
  }

  // Update real-time alignment and tension
  updateAlignment(detections, sourceCanvas) {
    const W = sourceCanvas.width;
    const H = sourceCanvas.height;

    // 1. Detect Bowl / Plate
    const bowls = detections.filter(d => d.classId === 41 || d.classId === 45);
    if (bowls.length > 0) {
      bowls.sort((a, b) => b.score - a.score);
      const b = bowls[0];
      this.plate.present = true;
      this.plate.x = b.cx;
      this.plate.y = b.cy;
      this.plate.r = Math.max(b.box[2], b.box[3]) / 2.0;
    }

    const refX = this.plate.present ? this.plate.x : W / 2.0;
    const refY = this.plate.present ? this.plate.y : H / 2.0;

    // 2. Separate Cutlery into Left (Fork) and Right (Spoon)
    const cutlery = detections.filter(d => d.classId === 42 || d.classId === 43 || d.classId === 44);
    const leftItems = [];
    const rightItems = [];

    cutlery.forEach(d => {
      const lateral = d.cx - refX;
      if (lateral < -20) leftItems.push(d);
      else if (lateral > +20) rightItems.push(d);
    });

    // 3. Process Fork (Left)
    if (leftItems.length > 0) {
      leftItems.sort((a, b) => (b.classId === 42 ? 1 : 0) - (a.classId === 42 ? 1 : 0) || b.score - a.score);
      const f = leftItems[0];
      const rawAngle = this.extractAngleFromCrop(sourceCanvas, f.box);

      if (this.fork.present) {
        this.fork.x += this.alpha * (f.cx - this.fork.x);
        this.fork.y += this.alpha * (f.cy - this.fork.y);
        this.fork.angle = (this.fork.angle + this.alpha * this.wrap90(rawAngle - this.fork.angle) + 180) % 180;
      } else {
        this.fork.x = f.cx;
        this.fork.y = f.cy;
        this.fork.angle = rawAngle;
      }

      this.fork.present = true;
      this.fork.ttl = 15;
    } else if (this.fork.ttl > 0) {
      this.fork.ttl--;
      this.fork.present = true;
    } else {
      this.fork.present = false;
    }

    // 4. Process Spoon (Right)
    if (rightItems.length > 0) {
      rightItems.sort((a, b) => (b.classId === 44 ? 1 : 0) - (a.classId === 44 ? 1 : 0) || b.score - a.score);
      const s = rightItems[0];
      const rawAngle = this.extractAngleFromCrop(sourceCanvas, s.box);

      if (this.spoon.present) {
        this.spoon.x += this.alpha * (s.cx - this.spoon.x);
        this.spoon.y += this.alpha * (s.cy - this.spoon.y);
        this.spoon.angle = (this.spoon.angle + this.alpha * this.wrap90(rawAngle - this.spoon.angle) + 180) % 180;
      } else {
        this.spoon.x = s.cx;
        this.spoon.y = s.cy;
        this.spoon.angle = rawAngle;
      }

      this.spoon.present = true;
      this.spoon.ttl = 15;
    } else if (this.spoon.ttl > 0) {
      this.spoon.ttl--;
      this.spoon.present = true;
    } else {
      this.spoon.present = false;
    }

    // Calculate alignment errors relative to perpendicular normal
    const perp = this.tray.perp_angle;

    if (this.fork.present) {
      const deltaF = Math.abs(this.wrap90(this.fork.angle - perp));
      this.fork.delta_deg = Math.round(deltaF * 10) / 10;
      this.fork.aligned = (deltaF <= this.tol_deg);
      this.e_left = deltaF <= this.tol_deg ? 0.0 : this.clamp01((deltaF - this.tol_deg) / (this.max_deg - this.tol_deg));
      this.fork.e = Math.round(this.e_left * 1000) / 1000;
    } else {
      this.e_left = 0.85;
      this.fork.aligned = false;
    }

    if (this.spoon.present) {
      const deltaS = Math.abs(this.wrap90(this.spoon.angle - perp));
      this.spoon.delta_deg = Math.round(deltaS * 10) / 10;
      this.spoon.aligned = (deltaS <= this.tol_deg);
      this.e_right = deltaS <= this.tol_deg ? 0.0 : this.clamp01((deltaS - this.tol_deg) / (this.max_deg - this.tol_deg));
      this.spoon.e = Math.round(this.e_right * 1000) / 1000;
    } else {
      this.e_right = 0.85;
      this.spoon.aligned = false;
    }

    this.tension = this.clamp01(0.5 * (this.e_left + this.e_right) + 0.5 * Math.max(this.e_left, this.e_right));

    // Harmony timer
    const nowSec = performance.now() / 1000.0;
    if (this.fork.present && this.spoon.present && this.fork.aligned && this.spoon.aligned) {
      if (this.harmony_t0 === null) this.harmony_t0 = nowSec;
      this.harmony = this.clamp01((nowSec - this.harmony_t0) / this.hold_s);
    } else {
      this.harmony_t0 = null;
      this.harmony = 0.0;
    }
  }

  // Diagnostic state for HUD & Audio
  getState() {
    const reasons = [];
    let status = 'DISHARMONY';

    if (this.tension <= 0.05 && this.fork.present && this.spoon.present) {
      status = 'HARMONIOUS';
      reasons.push(`Fork is aligned (${this.fork.delta_deg}° off-axis, within 2.5° tolerance).`);
      reasons.push(`Spoon is aligned (${this.spoon.delta_deg}° off-axis, within 2.5° tolerance).`);
    } else {
      status = 'DISHARMONY';
      if (!this.fork.present) reasons.push('Fork not detected on the left.');
      else if (!this.fork.aligned) reasons.push(`Fork tilted ${this.fork.delta_deg}° off-axis (causing dissonance in Left Ear).`);

      if (!this.spoon.present) reasons.push('Spoon not detected on the right.');
      else if (!this.spoon.aligned) reasons.push(`Spoon tilted ${this.spoon.delta_deg}° off-axis (causing dissonance in Right Ear).`);
    }

    return {
      tray: this.tray,
      plate: this.plate,
      fork: this.fork,
      spoon: this.spoon,
      e_left: this.e_left,
      e_right: this.e_right,
      tension: this.tension,
      harmony: this.harmony,
      status,
      reasons,
      fps: this.fps,
      inferTime: Math.round(this.lastInferenceTime)
    };
  }
}
