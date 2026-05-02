export class AudioManager {
  private ctx: AudioContext | null = null;
  private startTime = 0;
  private masterGain: GainNode | null = null;
  private scheduledNodes: AudioNode[] = [];

  async init(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.7;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  getAudioTime(): number {
    if (!this.ctx) return 0;
    return this.ctx.currentTime;
  }

  getGameTime(): number {
    if (!this.ctx) return 0;
    return this.ctx.currentTime - this.startTime;
  }

  markStart(): void {
    if (!this.ctx) return;
    this.startTime = this.ctx.currentTime;
  }

  private makeBuffer(sampleRate: number, duration: number, fill: (i: number, sampleRate: number) => number): AudioBuffer {
    const ctx = this.ctx!;
    const samples = Math.floor(sampleRate * duration);
    const buf = ctx.createBuffer(1, samples, sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < samples; i++) {
      data[i] = fill(i, sampleRate);
    }
    return buf;
  }

  private scheduleKick(t: number): void {
    const ctx = this.ctx!;
    const gain = this.masterGain!;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.15);
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(g);
    g.connect(gain);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  private scheduleSnare(t: number): void {
    const ctx = this.ctx!;
    const sampleRate = ctx.sampleRate;

    const noiseBuffer = this.makeBuffer(sampleRate, 0.2, () => Math.random() * 2 - 1);
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    filter.Q.value = 0.8;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    source.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain!);
    source.start(t);
    source.stop(t + 0.2);
  }

  private scheduleHihat(t: number, open = false): void {
    const ctx = this.ctx!;
    const sampleRate = ctx.sampleRate;
    const duration = open ? 0.15 : 0.06;

    const noiseBuffer = this.makeBuffer(sampleRate, duration, () => Math.random() * 2 - 1);
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 8000;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);

    source.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain!);
    source.start(t);
    source.stop(t + duration + 0.01);
  }

  private scheduleNote(freq: number, t: number, duration: number, waveform: OscillatorType = 'sawtooth'): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();

    const distortion = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i * 2) / 256 - 1;
      curve[i] = ((Math.PI + 200) * x) / (Math.PI + 200 * Math.abs(x));
    }
    distortion.curve = curve;

    osc.type = waveform;
    osc.frequency.value = freq;

    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.02);
    g.gain.setValueAtTime(0.18, t + duration - 0.05);
    g.gain.linearRampToValueAtTime(0.001, t + duration);

    osc.connect(distortion);
    distortion.connect(g);
    g.connect(this.masterGain!);
    osc.start(t);
    osc.stop(t + duration + 0.01);
  }

  private scheduleBass(freq: number, t: number, duration: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;

    osc.type = 'triangle';
    osc.frequency.value = freq;

    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain!);
    osc.start(t);
    osc.stop(t + duration + 0.01);
  }

  scheduleSong(songId: string, bpm: number, duration: number): void {
    const ctx = this.ctx!;
    const base = this.startTime;
    const beat = 60 / bpm;
    const measure = beat * 4;
    const now = base;

    const schedules: Record<string, () => void> = {
      'transmission-001': () => {
        const scale = [110, 130.81, 146.83, 164.81, 196, 220, 246.94];
        let t = now;
        while (t < base + duration) {
          const mOffset = t - now;
          const mIndex = Math.floor(mOffset / measure) % 4;

          this.scheduleKick(t);
          this.scheduleHihat(t + beat * 0.5);
          this.scheduleSnare(t + beat * 2);
          this.scheduleHihat(t + beat * 2.5);
          this.scheduleKick(t + beat * 3);
          this.scheduleHihat(t + beat * 3.5);

          const noteFreq = scale[mIndex % scale.length];
          this.scheduleBass(noteFreq * 0.5, t, beat * 1.8);
          this.scheduleNote(noteFreq, t + beat * 0.75, beat * 0.4, 'sine');
          this.scheduleNote(noteFreq * 1.5, t + beat * 1.5, beat * 0.3, 'sine');
          this.scheduleNote(scale[(mIndex + 2) % scale.length], t + beat * 2.75, beat * 0.5, 'sine');

          t += measure;
        }
      },
      'signal-rising': () => {
        const scale = [220, 261.63, 293.66, 329.63, 392, 440];
        let t = now;
        while (t < base + duration) {
          const mOffset = t - now;
          const mIndex = Math.floor(mOffset / measure) % 4;

          this.scheduleKick(t);
          this.scheduleKick(t + beat * 2);
          this.scheduleSnare(t + beat);
          this.scheduleSnare(t + beat * 3);
          for (let h = 0; h < 8; h++) {
            this.scheduleHihat(t + (beat / 2) * h, h % 4 === 2);
          }

          const noteFreq = scale[mIndex % scale.length];
          this.scheduleBass(noteFreq * 0.5, t, beat * 0.8);
          this.scheduleBass(noteFreq * 0.5, t + beat, beat * 0.8);
          this.scheduleNote(noteFreq, t + beat * 0.5, beat * 0.25);
          this.scheduleNote(noteFreq * 1.25, t + beat * 1.5, beat * 0.25);
          this.scheduleNote(scale[(mIndex + 1) % scale.length], t + beat * 2.5, beat * 0.3);
          this.scheduleNote(scale[(mIndex + 3) % scale.length], t + beat * 3.5, beat * 0.25);

          t += measure;
        }
      },
      'break-of-light': () => {
        const scale = [293.66, 329.63, 369.99, 440, 493.88, 587.33];
        let t = now;
        while (t < base + duration) {
          const mOffset = t - now;
          const mIndex = Math.floor(mOffset / measure) % 4;

          for (let k = 0; k < 4; k++) {
            this.scheduleKick(t + beat * k);
          }
          this.scheduleSnare(t + beat);
          this.scheduleSnare(t + beat * 3);
          for (let h = 0; h < 16; h++) {
            this.scheduleHihat(t + (beat / 4) * h);
          }

          const noteFreq = scale[mIndex % scale.length];
          for (let n = 0; n < 4; n++) {
            this.scheduleBass(noteFreq * 0.5, t + beat * n, beat * 0.6);
            this.scheduleNote(noteFreq * (1 + n * 0.25), t + beat * n + beat * 0.25, beat * 0.15, 'square');
          }
          this.scheduleNote(scale[(mIndex + 2) % scale.length] * 2, t + beat * 0.5, beat * 0.5, 'sawtooth');
          this.scheduleNote(scale[(mIndex + 4) % scale.length] * 2, t + beat * 2.5, beat * 0.5, 'sawtooth');

          t += measure;
        }
      },
    };

    const fn = schedules[songId];
    if (fn) fn();
  }

  stop(): void {
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
      this.masterGain = null;
      this.scheduledNodes = [];
    }
  }

  isReady(): boolean {
    return this.ctx !== null;
  }
}
