/**
 * Logic Land 3D Audio Engine
 * Pure Web Audio API synthesized sound effects and musical stingers.
 * 100% self-contained, no external audio files required.
 */
class LogicLandAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setMuted(muted) {
    this.muted = !!muted;
  }

  playTone(freq, type = 'sine', duration = 0.15, gainVal = 0.1, freqEnd = null) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (freqEnd !== null) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(10, freqEnd), t + duration);
      }

      gain.gain.setValueAtTime(gainVal, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + duration);
    } catch (e) {}
  }

  // Click & UI
  click() {
    this.playTone(600, 'sine', 0.08, 0.08, 800);
  }

  select() {
    this.playTone(520, 'triangle', 0.1, 0.1, 720);
  }

  // Correct answer / success
  correct() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      setTimeout(() => {
        this.playTone(freq, 'triangle', 0.18, 0.09);
      }, idx * 70);
    });
  }

  // Error / wrong answer
  wrong() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    this.playTone(240, 'sawtooth', 0.22, 0.08, 140);
    setTimeout(() => {
      this.playTone(180, 'sawtooth', 0.25, 0.08, 110);
    }, 120);
  }

  // Character movement step
  step() {
    this.playTone(280 + Math.random() * 40, 'sine', 0.05, 0.04, 150);
  }

  // Jump
  jump() {
    this.playTone(300, 'sine', 0.2, 0.08, 700);
  }

  // Collect item / coin
  coin() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    this.playTone(987.77, 'sine', 0.1, 0.09);
    setTimeout(() => {
      this.playTone(1318.51, 'sine', 0.25, 0.1);
    }, 80);
  }

  // Laser tick
  laserTick() {
    this.playTone(480, 'square', 0.07, 0.03, 320);
  }

  // Laser zap (failed gate)
  laserZap() {
    this.playTone(800, 'sawtooth', 0.25, 0.1, 80);
  }

  // Laser pass success
  laserPass() {
    this.playTone(580, 'sine', 0.12, 0.08, 900);
  }

  // Dial rotate
  dial() {
    this.playTone(400, 'triangle', 0.06, 0.06, 550);
  }

  // Victory fanfare
  victory() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const notes = [
      { f: 523.25, d: 0.12 }, // C5
      { f: 659.25, d: 0.12 }, // E5
      { f: 783.99, d: 0.12 }, // G5
      { f: 1046.5, d: 0.35 }  // C6
    ];
    let offset = 0;
    notes.forEach(n => {
      setTimeout(() => {
        this.playTone(n.f, 'triangle', n.d, 0.12);
      }, offset);
      offset += n.d * 1000 + 40;
    });
  }

  // Hint sound
  hint() {
    this.playTone(660, 'sine', 0.18, 0.09, 880);
  }
}

window.logicAudio = new LogicLandAudio();
