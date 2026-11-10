// Mobile Sound engine for Dining Tableware Alignment (OCD Experience).
// Left Ear  = Fork alignment (Left channel)
// Right Ear = Spoon alignment (Right channel)
// Center    = Grounding sub-drone (65.4 Hz)
// Also exposes getMediaStream() to pipe studio-quality audio directly into video recordings.

const DeskAudio = (() => {
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  let ac = null, master, comp, streamDest = null;
  let muted = false, flip = false;

  // Sound nodes
  let droneOsc, droneGain, droneFilter;
  let forkCons, forkClash, forkGain1, forkGain2, forkFilter, forkPan;
  let spoonCons, spoonClash, spoonGain1, spoonGain2, spoonFilter, spoonPan;
  let lfo, lfoForkGain, lfoSpoonGain;

  const ROOT = 130.81; // C3

  function start() {
    if (ac) {
      if (ac.state === 'suspended') ac.resume();
      return;
    }
    ac = new (window.AudioContext || window.webkitAudioContext)();

    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 8;
    comp.ratio.value = 5;
    comp.connect(ac.destination);

    // Audio stream destination for video recording
    if (ac.createMediaStreamDestination) {
      streamDest = ac.createMediaStreamDestination();
      comp.connect(streamDest);
    }

    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(comp);

    // Global tension LFO for microtonal flutter
    lfo = ac.createOscillator();
    lfo.frequency.value = 5.0;
    lfoForkGain = ac.createGain();
    lfoForkGain.gain.value = 0;
    lfoSpoonGain = ac.createGain();
    lfoSpoonGain.gain.value = 0;
    lfo.connect(lfoForkGain);
    lfo.connect(lfoSpoonGain);
    lfo.start();

    // 1. Center grounding sub-drone (C2 = 65.4 Hz)
    droneOsc = ac.createOscillator();
    droneOsc.type = 'sine';
    droneOsc.frequency.value = ROOT * 0.5;
    droneFilter = ac.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 240;
    droneGain = ac.createGain();
    droneGain.gain.value = 0.15;
    droneOsc.connect(droneFilter);
    droneFilter.connect(droneGain);
    droneGain.connect(master);
    droneOsc.start();

    // 2. Left Voice: FORK (Panned Left: -0.85)
    forkCons = ac.createOscillator();
    forkCons.type = 'triangle';
    forkCons.frequency.value = ROOT;
    forkGain1 = ac.createGain();
    forkGain1.gain.value = 0.15;

    forkClash = ac.createOscillator();
    forkClash.type = 'sawtooth';
    forkClash.frequency.value = ROOT * (45 / 32);
    forkGain2 = ac.createGain();
    forkGain2.gain.value = 0;

    forkFilter = ac.createBiquadFilter();
    forkFilter.type = 'lowpass';
    forkFilter.frequency.value = 800;

    forkPan = ac.createStereoPanner ? ac.createStereoPanner() : null;
    if (forkPan) forkPan.pan.value = -0.85;

    forkCons.connect(forkGain1);
    forkClash.connect(forkGain2);
    forkGain1.connect(forkFilter);
    forkGain2.connect(forkFilter);
    if (forkPan) {
      forkFilter.connect(forkPan);
      forkPan.connect(master);
    } else {
      forkFilter.connect(master);
    }
    lfoForkGain.connect(forkClash.detune);
    forkCons.start();
    forkClash.start();

    // 3. Right Voice: SPOON (Panned Right: +0.85)
    spoonCons = ac.createOscillator();
    spoonCons.type = 'sine';
    spoonCons.frequency.value = ROOT * (5 / 4);
    spoonGain1 = ac.createGain();
    spoonGain1.gain.value = 0.15;

    spoonClash = ac.createOscillator();
    spoonClash.type = 'sawtooth';
    spoonClash.frequency.value = ROOT * (16 / 15) * 2;
    spoonGain2 = ac.createGain();
    spoonGain2.gain.value = 0;

    spoonFilter = ac.createBiquadFilter();
    spoonFilter.type = 'lowpass';
    spoonFilter.frequency.value = 850;

    spoonPan = ac.createStereoPanner ? ac.createStereoPanner() : null;
    if (spoonPan) spoonPan.pan.value = 0.85;

    spoonCons.connect(spoonGain1);
    spoonClash.connect(spoonGain2);
    spoonGain1.connect(spoonFilter);
    spoonGain2.connect(spoonFilter);
    if (spoonPan) {
      spoonFilter.connect(spoonPan);
      spoonPan.connect(master);
    } else {
      spoonFilter.connect(master);
    }
    lfoSpoonGain.connect(spoonClash.detune);
    spoonCons.start();
    spoonClash.start();
  }

  function chime(big = true) {
    if (!ac) return;
    const now = ac.currentTime;
    const notes = big ? [ROOT, ROOT * 5 / 4, ROOT * 3 / 2, ROOT * 2] : [ROOT * 5 / 4, ROOT * 3 / 2];
    notes.forEach((f, idx) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'sine';
      o.frequency.value = f * 2;
      const t0 = now + idx * 0.08;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + (big ? 2.2 : 1.2));
      o.connect(g);
      g.connect(master);
      o.start(t0);
      o.stop(t0 + 2.5);
    });
  }

  // Update called on live alignment calculation
  function update(state) {
    if (!ac || !state) return;
    const now = ac.currentTime;
    const tc = 0.08;

    const ef = clamp(state.e_left != null ? state.e_left : 0);
    const es = clamp(state.e_right != null ? state.e_right : 0);
    const t = clamp(state.tension != null ? state.tension : Math.max(ef, es));

    const droneVol = 0.16 + t * 0.1;
    droneGain.gain.setTargetAtTime(droneVol, now, tc);
    droneFilter.frequency.setTargetAtTime(220 + t * 300, now, tc);

    lfo.frequency.setTargetAtTime(4.0 + t * 12.0, now, tc);
    lfoForkGain.gain.setTargetAtTime(ef * 45, now, tc);
    lfoSpoonGain.gain.setTargetAtTime(es * 45, now, tc);

    // Left Ear: Fork
    const fConsVol = 0.22 * Math.max(0, 1.0 - 0.75 * ef);
    const fClashVol = 0.28 * Math.pow(ef, 1.3);
    forkGain1.gain.setTargetAtTime(fConsVol, now, tc);
    forkGain2.gain.setTargetAtTime(fClashVol, now, tc);
    forkFilter.frequency.setTargetAtTime(800 + ef * 2800, now, tc);
    forkFilter.Q.setTargetAtTime(0.7 + ef * 6.0, now, tc);

    // Right Ear: Spoon
    const sConsVol = 0.22 * Math.max(0, 1.0 - 0.75 * es);
    const sClashVol = 0.28 * Math.pow(es, 1.3);
    spoonGain1.gain.setTargetAtTime(sConsVol, now, tc);
    spoonGain2.gain.setTargetAtTime(sClashVol, now, tc);
    spoonFilter.frequency.setTargetAtTime(850 + es * 2800, now, tc);
    spoonFilter.Q.setTargetAtTime(0.7 + es * 6.0, now, tc);

    if (forkPan) forkPan.pan.setTargetAtTime(flip ? 0.85 : -0.85, now, 0.1);
    if (spoonPan) spoonPan.pan.setTargetAtTime(flip ? -0.85 : 0.85, now, 0.1);
  }

  function setMuted(m) {
    muted = m;
    if (ac && master) master.gain.setTargetAtTime(m ? 0 : 0.8, ac.currentTime, 0.05);
  }

  function setFlip(f) {
    flip = f;
  }

  return {
    start,
    update,
    chime,
    setMuted,
    setFlip,
    running: () => !!ac && ac.state === 'running',
    isMuted: () => muted,
    getAudioTrack: () => streamDest && streamDest.stream.getAudioTracks().length ? streamDest.stream.getAudioTracks()[0] : null,
  };
})();
