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
  | 'rewind'
  | 'gmeover'
  | 'fusion'
  | 'gold_get'
  | 'silver_get'
  | 'bronxe_get'
  | 'diamond'
  | 'mythic_get'
  | 'platinum_get'
  | 'reveal'
  | 'open_chest'
  | 'bing_before_platinum'
  | 'queue_before_mythic'
  | 'tap_nav'
  | 'continue?'
  | 'countdown'
  | 'gameover_countdown'
  | 'outof_continues'
  | 'perfect'
  | 'results'
  | 'resuts2'
  | 'select_high_short'
  | 'select_start_song'
  | 'song_completion'
  | 'locked_out'
  | 'not_enough'
  | 'error'
  | 'hidden_secret_found'
  | 'new_modes_available'
  | 'pause'
  | 'pause_2'
  | 'intro'
  | 'intro_2'
  | 'intro3'
  | 'cas_slam_down'
  | 'case_open_2'
  | 'open_basic'
  | 'open_basic_2'
  | 'open_case'
  | 'by_th3scr1b3'
  | 'inbetween'
  | 'crowd'
  | 'month_3';

const REWIND_TRACKS = [
  'rewind1', 'rewind2', 'rewind3', 'rewind4',
  'rewind5', 'rewind6', 'rewind7', 'rewind8'
];

let nextRewindIdx = Math.floor(Math.random() * REWIND_TRACKS.length);

// ── Canonical filename map ─────────────────────────────────────────────────
// Maps logical SFX names to actual filenames on disk (no .wav extension).
// Typos / spaces in actual filenames are contained here so callers never
// need to know about them.
const SFX_FILES: Record<SfxName, string> = {
  back:                   'back',
  rewind:                 'rewind1',         // dynamically cycled — see playSfx()
  gmeover:                'gmeover',
  fusion:                 'fusion',
  gold_get:               'gold_voice_get',
  silver_get:             'silver_get',
  bronxe_get:             'bronxe_get',
  diamond:                'diamond',
  mythic_get:             'mythic_get',
  platinum_get:           'platinum _get_voice',  // space intentional — matches disk
  reveal:                 'reveal',
  open_chest:             'open_chest',
  bing_before_platinum:   'bing befre pltinum',   // typo intentional — matches disk
  queue_before_mythic:    'que_before_mythic',
  // Navigation tap — crisp short blip, NOT the back sound
  tap_nav:                'select_high_short',
  'continue?':            'continue?',
  countdown:              'countdown',
  gameover_countdown:     'gameover_countdown',
  outof_continues:        'outof_continues',
  perfect:                'perfect',
  results:                'results',
  resuts2:                'resuts2',
  select_high_short:      'select_high_short',
  select_start_song:      'select_start_song',
  song_completion:        'song_completion',
  locked_out:             'locked_out',
  not_enough:             'not_enough',
  error:                  'error',
  hidden_secret_found:    'hidden_secret_found',
  new_modes_available:    'new_modes_available',
  pause:                  'pause',
  pause_2:                'pause_2',
  intro:                  'intro',
  intro_2:                'intro_2',
  intro3:                 'intro3',
  cas_slam_down:          'cas_slam_down',
  case_open_2:            'case_open_2',
  open_basic:             'open_basic',
  open_basic_2:           'open_basic_2',
  open_case:              'open_case',
  by_th3scr1b3:           'by_th3scr1b3',
  inbetween:              'inbetween',
  crowd:                  'crowd',
  month_3:                'month_3',
};

// ── Preload list ───────────────────────────────────────────────────────────
// Everything used during active gameplay must be here — latency-sensitive.
const PRELOAD_LIST: SfxName[] = [
  // Navigation / UI
  'back',
  'tap_nav',
  'pause',
  'pause_2',
  // Gameplay
  'countdown',
  'rewind',
  'gmeover',
  'outof_continues',
  'gameover_countdown',
  'song_completion',
  'select_start_song',
  'hidden_secret_found',
  'fusion',
  'perfect',
  // Results
  'reveal',
  'open_chest',
  'bing_before_platinum',
  'queue_before_mythic',
  'gold_get',
  'silver_get',
  'bronxe_get',
  'platinum_get',
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
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
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
    if (name === 'rewind') {
      await Promise.all(REWIND_TRACKS.map(f => this._loadSingleSfx(f)));
      return;
    }
    const filename = SFX_FILES[name] ?? name;
    await this._loadSingleSfx(filename);
  }

  private async _loadSingleSfx(filename: string): Promise<void> {
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
        console.warn(`Failed to load sfx "${filename}" (${url}):`, err);
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
    let filename = SFX_FILES[name] ?? name;
    if (name === 'rewind') {
      filename = REWIND_TRACKS[nextRewindIdx % REWIND_TRACKS.length];
      nextRewindIdx++;
    }
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
