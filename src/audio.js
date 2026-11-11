// Small synthesized sound set (no audio files): key clicks, success, miss, round and finish cues.

export class Sound {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.ctx = null;
    this.noise = null;
  }

  _ctx() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      const len = Math.floor(this.ctx.sampleRate * 0.05);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  _tone(freq, { type = 'sine', at = 0, dur = 0.12, gain = 0.08, to = null } = {}) {
    const c = this._ctx();
    if (!c) return;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  key() {
    const c = this._ctx();
    if (!c) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1700 + Math.random() * 900;
    f.Q.value = 1.4;
    const g = c.createGain();
    g.gain.value = 0.22;
    src.connect(f).connect(g).connect(c.destination);
    src.start(t);
  }

  error() { this._tone(210, { type: 'triangle', dur: 0.14, gain: 0.09, to: 140 }); }
  success() { this._tone(784, { dur: 0.09, gain: 0.05 }); this._tone(1175, { at: 0.07, dur: 0.14, gain: 0.05 }); }
  miss() { this._tone(392, { type: 'triangle', dur: 0.16, gain: 0.06 }); this._tone(294, { type: 'triangle', at: 0.13, dur: 0.24, gain: 0.06 }); }
  round() { [523, 659, 784].forEach((f, i) => this._tone(f, { at: i * 0.08, dur: 0.16, gain: 0.045 })); }
  complete() { [523, 659, 784, 1047].forEach((f, i) => this._tone(f, { at: i * 0.1, dur: 0.3, gain: 0.05 })); }
}
