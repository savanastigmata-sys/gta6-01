// Procedural sound, WebAudio only — no audio files, no network. Everything
// is a small oscillator or noise burst, started on the first user gesture.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    } catch {
      ctx = null;
      return false;
    }
    return true;
  }

  function blip(freq, dur, type, vol) {
    if (!ensure() || muted) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol || 0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch {
      /* sound is decoration; never break the game */
    }
  }

  return {
    /** Call from any user gesture so the browser unlocks audio. */
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = value ? 0 : 0.5;
      if (value) this.setEngine(0);
    },
    isMuted() {
      return muted;
    },
    /** Engine hum follows speed 0..1; 0 silences it. */
    setEngine(speed01) {
      if (!ctx || muted) return;
      try {
        engineGain.gain.setTargetAtTime(speed01 * 0.05, ctx.currentTime, 0.1);
        engineOsc.frequency.setTargetAtTime(46 + speed01 * 90, ctx.currentTime, 0.1);
      } catch {
        /* ignore */
      }
    },
    setSiren(on) {
      if (!ensure()) return;
      try {
        if (on && !sirenTimer) {
          let high = false;
          sirenGain.gain.setTargetAtTime(muted ? 0 : 0.035, ctx.currentTime, 0.1);
          sirenTimer = setInterval(() => {
            high = !high;
            sirenOsc.frequency.setTargetAtTime(high ? 950 : 650, ctx.currentTime, 0.05);
          }, 420);
        } else if (!on && sirenTimer) {
          clearInterval(sirenTimer);
          sirenTimer = null;
          sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        }
      } catch {
        /* ignore */
      }
    },
    pickup() {
      blip(880, 0.12, 'sine', 0.14);
      setTimeout(() => blip(1320, 0.14, 'sine', 0.12), 70);
    },
    crash() {
      blip(90, 0.25, 'sawtooth', 0.2);
    },
    mission() {
      blip(523, 0.12, 'triangle', 0.16);
      setTimeout(() => blip(659, 0.12, 'triangle', 0.16), 110);
      setTimeout(() => blip(784, 0.22, 'triangle', 0.16), 220);
    },
    busted() {
      blip(220, 0.5, 'sawtooth', 0.16);
    },
  };
}
