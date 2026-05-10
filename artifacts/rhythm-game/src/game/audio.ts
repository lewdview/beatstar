/**
 * AudioManager — centralized sample-based SFX engine.
 *
 * Architecture:
 *  - Single shared AudioContext, lazily created on first interaction.
 *  - WAV files are fetched once, decoded into AudioBuffers, and cached in a Map.
 *  - `playSfx()` is fire-and-forget: creates a one-shot BufferSourceNode each call.
 *  - `preloadAll()` bulk-loads every game SFX so there's zero latency at play time.
 */

export type SfxName =
  | 'back'
  | 'rewind1'
  | 'rewind2'
  | 'gmeover'
  | 'fusion'
  | 'gold_get'
  | 'reveal'
  | 'open_chest'
  | 'bing_before_platinum'
  | 'queue_before_mythic'
  | 'tap_nav';

/** Canonical file mapping — keeps messy filenames out of call sites. */
const SFX_FILES: Record<SfxName, string> = {
  back:                   'back',
  rewind1:                'rewind1',
  rewind2:                'rewind2',
  gmeover:                'gmeover',
  fusion:                 'fusion',
  gold_get:               'gold_get',
  reveal:                 'reveal',
  open_chest:             'open_chest',
  bing_before_platinum:   'bing befre pltinum',
  queue_before_mythic:    'que_before_mythic',
  tap_nav:                'back',  // re-use click sound for generic navigation taps
};

/** All SFX names that should be eagerly preloaded. */
const PRELOAD_LIST: SfxName[] = [
  'back',
  'rewind1',
  'gmeover',
  'fusion',
  'gold_get',
  'reveal',
  'open_chest',
  'bing_before_platinum',
  'queue_before_mythic',
];

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bufferCache: Map<string, AudioBuffer> = new Map();
  private loadingPromises: Map<string, Promise<void>> = new Map();
  private preloaded = false;

  // ── lifecycle ──────────────────────────────────────────────────

  /** Lazy-init the AudioContext. Safe to call multiple times. */
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

  /** Ensure AudioContext is ready (call on first user gesture). */
  async ensureReady(): Promise<void> {
    await this.init();
  }

  isReady(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  // ── loading ────────────────────────────────────────────────────

  /**
   * Load a single SFX by canonical name into the buffer cache.
   * De-duplicates concurrent requests for the same file.
   */
  async loadSfx(name: SfxName): Promise<void> {
    const filename = SFX_FILES[name] ?? name;
    if (this.bufferCache.has(filename)) return;
    if (this.loadingPromises.has(filename)) return this.loadingPromises.get(filename)!;

    if (!this.ctx) await this.init();

    const promise = (async () => {
      const url = `/audio/sfx/${encodeURIComponent(filename)}.wav`;
      try {
        const response = await fetch(url);
        if (!response.ok) {
          console.warn(`SFX 404: ${url}`);
          return;
        }
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.ctx!.decodeAudioData(arrayBuffer);
        this.bufferCache.set(filename, audioBuffer);
      } catch (err) {
        console.warn(`Failed to load sfx "${name}" (${url}):`, err);
      } finally {
        this.loadingPromises.delete(filename);
      }
    })();

    this.loadingPromises.set(filename, promise);
    return promise;
  }

  /**
   * Bulk-preload every gameplay SFX.
   * Call once after the first user interaction (e.g. on Home page click).
   */
  async preloadAll(): Promise<void> {
    if (this.preloaded) return;
    this.preloaded = true;
    await this.init();
    await Promise.allSettled(PRELOAD_LIST.map((n) => this.loadSfx(n)));
  }

  // ── playback ───────────────────────────────────────────────────

  /**
   * Fire-and-forget SFX playback. If the buffer hasn't loaded yet,
   * the call is silently skipped (no audible delay, no error).
   */
  playSfx(name: SfxName, volume = 0.6): void {
    if (!this.ctx || !this.masterGain) return;
    const filename = SFX_FILES[name] ?? name;
    const buffer = this.bufferCache.get(filename);
    if (!buffer) return;

    // Resume if suspended (handles mobile after tab switch)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, volume));
    source.connect(gain);
    gain.connect(this.masterGain);
    source.start(0);
  }

  // ── teardown ───────────────────────────────────────────────────

  stop(): void {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
      this.masterGain = null;
    }
  }
}

export const audioManager = new AudioManager();
