import type { Note } from './types';
import { supabase } from '@/lib/supabase';

const RELEASE_DATA_URL = 'https://th3scr1b3.art/release-data.json';

export interface LyricsWord {
  word: string;
  start: number;
  end: number;
}

export interface GameSong {
  id: string;
  day: number;
  date: string;
  title: string;
  artist: string;
  bpm: number;
  duration: number;
  mood: 'light' | 'dark';
  valence: number;
  moodTags: string[];
  description: string;
  audioUrl: string;
  coverArt: string | null;
  notes: Note[];
  key: string;
  genre: string[];
  difficultyLevel: number;
}

/** True if the song's release date is still in the future (not yet playable). */
export function isSongTimeLocked(song: GameSong): boolean {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return song.date > todayStr;
}

let catalogCache: GameSong[] | null = null;
let loadingPromise: Promise<GameSong[]> | null = null;

export async function loadCatalog(): Promise<GameSong[]> {
  if (catalogCache) return catalogCache;
  if (loadingPromise) return loadingPromise;

  const promise = (async (): Promise<GameSong[]> => {
    try {
      // 1. Try Supabase first if configured
      if (supabase) {
        const { data, error } = await supabase
          .from('releases')
          .select('*')
          .eq('status', 'released')
          .order('day', { ascending: true });

        if (!error && data && data.length > 0) {
          console.log('Fetched catalog from Supabase');
          catalogCache = data.map(buildGameSong);
          return catalogCache;
        }
        if (error) console.error('Supabase fetch error:', error);
      }

      // 2. Fallback to static JSON
      const r = await fetch(RELEASE_DATA_URL);
      const data = await r.json();
      console.log('Fetched catalog from Static JSON fallback');
      catalogCache = (data.releases as any[]).map(buildGameSong);
      return catalogCache;
    } catch (err) {
      console.error('Failed to load catalog:', err);
      return [];
    }
  })();

  loadingPromise = promise;
  return promise;
}

export async function getSongById(id: string): Promise<GameSong | null> {
  const catalog = await loadCatalog();
  return catalog.find((s) => s.id === id) ?? null;
}

function buildGameSong(r: any): GameSong {
  const lyricsWords: LyricsWord[] = r.lyricsWords || [];
  const bpm = r.tempo || 100;
  const duration = Math.ceil(r.duration || 180);
  const valence = r.valence ?? 0.5;

  const notes =
    lyricsWords.length > 15
      ? generateNotesFromLyrics(lyricsWords, bpm)
      : generateNotesFromBPM(bpm, duration);

  const difficultyLevel = calcDifficulty(bpm, valence, notes.length, duration);

  return {
    id: r.id,
    day: r.day,
    date: r.date,
    title: r.title || r.canonicalTitle || `Day ${r.day}`,
    artist: 'TH3SCR1B3',
    bpm,
    duration,
    mood: r.mood === 'light' ? 'light' : 'dark',
    valence,
    moodTags: Array.isArray(r.tags) ? r.tags.slice(0, 3) : [],
    description: r.description || '',
    audioUrl: r.storedAudioUrl,
    coverArt: r.coverArt || null,
    notes,
    key: r.key || '',
    genre: Array.isArray(r.genre) ? r.genre : [],
    difficultyLevel,
  };
}

function calcDifficulty(bpm: number, valence: number, noteCount: number, duration = 180): number {
  // BPM scoring: sigmoid-like curve centered at 120 BPM
  // <80 → 1-2, 100-120 → 3-5, 140-160 → 6-8, 180+ → 9-10
  const bpmNorm = (bpm - 80) / 100; // 0 at 80, 1 at 180
  const bpmScore = Math.min(10, Math.max(1, Math.round(1 + 9 * Math.max(0, Math.min(1, bpmNorm)))));

  // Note density: notes per second, normalized (0.5 nps=easy, 3+ nps=brutal)
  const nps = noteCount / Math.max(30, duration);
  const densityScore = Math.min(10, Math.max(1, Math.round(nps * 3.5)));

  // Valence as intensity modifier: dark/intense songs (low valence) feel harder
  const valenceBoost = valence < 0.35 ? 1 : valence > 0.7 ? -1 : 0;

  const raw = (bpmScore * 0.4 + densityScore * 0.5) + valenceBoost;
  return Math.max(1, Math.min(10, Math.round(raw)));
}

/** Snap a timestamp to the nearest 16th-note grid at the given BPM. */
function snapToBeat(time: number, bpm: number, subdivision = 16): number {
  const subDur = (60 / bpm) * (4 / subdivision);
  return Math.round(time / subDur) * subDur;
}

/**
 * Musical phrase patterns. Each is an 8-slot lane sequence (0=left, 1=center, 2=right).
 */
const PHRASE_PATTERNS: number[][] = [
  [0, 1, 2, 1, 0, 2, 1, 0],  // ascending bounce
  [2, 1, 0, 1, 2, 0, 1, 2],  // descending bounce
  [0, 2, 1, 0, 2, 1, 0, 2],  // outer ping-pong
  [1, 0, 2, 1, 0, 2, 1, 0],  // center-out alternating
  [0, 2, 0, 1, 2, 1, 2, 0],  // irregular cross
  [1, 1, 0, 2, 1, 1, 2, 0],  // stutter step (center-heavy)
  [0, 0, 1, 2, 2, 1, 0, 2],  // gallop (repeated starts)
  [0, 1, 0, 2, 1, 2, 0, 1],  // triplet feel
  [2, 0, 2, 0, 1, 1, 2, 0],  // wide bounce
  [1, 0, 1, 2, 1, 0, 1, 2],  // rapid center
];

/** Unified pattern step to support mixed note types in a single template */
interface PatternStep {
  type: 'tap' | 'swipe' | 'hold' | 'slide';
  lane: number;
  target?: number;
  dir?: Note['swipeDirection'];
}

/** Dual note step — two notes at the same time */
interface DualStep {
  a: PatternStep;
  b: PatternStep;
}

/** Mixed patterns incorporating swipes with regular taps */
const SWIPE_MIXED_PATTERNS: PatternStep[][] = [
  [{ type: 'tap', lane: 1 }, { type: 'swipe', lane: 0, dir: 'up-left' }, { type: 'tap', lane: 1 }, { type: 'swipe', lane: 2, dir: 'up-right' }],
  [{ type: 'swipe', lane: 1, dir: 'up' }, { type: 'tap', lane: 0 }, { type: 'tap', lane: 2 }, { type: 'swipe', lane: 1, dir: 'down' }],
  [{ type: 'swipe', lane: 0, dir: 'left' }, { type: 'swipe', lane: 2, dir: 'right' }, { type: 'tap', lane: 1 }, { type: 'tap', lane: 1 }],
  [{ type: 'tap', lane: 0 }, { type: 'swipe', lane: 1, dir: 'right' }, { type: 'swipe', lane: 2, dir: 'up-right' }, { type: 'tap', lane: 2 }],
  [{ type: 'swipe', lane: 0, dir: 'up' }, { type: 'tap', lane: 1 }, { type: 'swipe', lane: 2, dir: 'down' }, { type: 'tap', lane: 1 }],
];

/** Mixed patterns incorporating lane-change slides with rhythmic taps */
const SLIDE_MIXED_PATTERNS: PatternStep[][] = [
  [{ type: 'slide', lane: 0, target: 1, dir: 'right' }, { type: 'tap', lane: 1 }, { type: 'slide', lane: 1, target: 2, dir: 'right' }, { type: 'tap', lane: 2 }],
  [{ type: 'slide', lane: 0, target: 2, dir: 'right' }, { type: 'tap', lane: 1 }, { type: 'slide', lane: 2, target: 0, dir: 'left' }, { type: 'tap', lane: 1 }],
  [{ type: 'tap', lane: 1 }, { type: 'slide', lane: 1, target: 0, dir: 'left' }, { type: 'tap', lane: 0 }, { type: 'slide', lane: 0, target: 1, dir: 'right' }],
  [{ type: 'tap', lane: 0 }, { type: 'slide', lane: 1, target: 2, dir: 'right' }, { type: 'tap', lane: 2 }, { type: 'slide', lane: 2, target: 1, dir: 'left' }],
];

/** Dual TAP patterns — two notes fired at the same time */
const DUAL_TAP_PATTERNS: DualStep[][] = [
  // Outer pair -> single -> outer pair -> single
  [
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 1 } },
  ],
  // Left pair -> right pair -> both outer
  [
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'tap', lane: 2 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 2 } },
  ],
  // Alternating pairs
  [
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 1 } },
  ],
];

/** Dual HOLD patterns — hold one lane while tapping another */
const DUAL_HOLD_PATTERNS: DualStep[][] = [
  // Hold left + tap right, then hold right + tap left
  [
    { a: { type: 'hold', lane: 0 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'hold', lane: 2 }, b: { type: 'tap', lane: 0 } },
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 1 } },
  ],
  // Dual hold outer lanes
  [
    { a: { type: 'hold', lane: 0 }, b: { type: 'hold', lane: 2 } },
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 1 } },
  ],
  // Hold center + tap sides
  [
    { a: { type: 'hold', lane: 1 }, b: { type: 'tap', lane: 0 } },
    { a: { type: 'tap', lane: 2 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'hold', lane: 1 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 0 } },
  ],
];

export function generateNotesFromLyrics(words: LyricsWord[], bpm = 100): Note[] {
  const notes: Note[] = [];
  let id = 0;
  let patternIdx = 0;
  let noteInPattern = 0;
  let lastSnapped = -1;
  const MIN_GAP = 0.15;
  let phraseCount = 0;

  let phraseType: 'tap' | 'swipe' | 'slide' | 'dual' | 'dual_hold' = 'tap';

  for (const word of words) {
    if (word.start < 1.0) continue;

    const snapped = snapToBeat(word.start, bpm, 16);
    if (snapped - lastSnapped < MIN_GAP) continue;

    // Phrase boundary: silence > 0.65 s → advance to next template
    if (lastSnapped > 0 && snapped - lastSnapped > 0.65) {
      phraseCount++;
      noteInPattern = 0;
      patternIdx++;

      // First 2 phrases are always tap-only to establish rhythm
      if (phraseCount < 3) {
        phraseType = 'tap';
      } else {
        // Cyclical variety with all phrase types
        const cycle = (phraseCount - 2) % 8;
        if (cycle === 1) phraseType = 'dual';
        else if (cycle === 2) phraseType = 'swipe';
        else if (cycle === 4) phraseType = 'slide';
        else if (cycle === 5) phraseType = 'dual_hold';
        else if (cycle === 7) phraseType = 'swipe';
        else phraseType = 'tap';
      }
    }

    const dur = word.end - word.start;

    // ── Dual note phrases ──
    if (phraseType === 'dual') {
      const p = DUAL_TAP_PATTERNS[patternIdx % DUAL_TAP_PATTERNS.length];
      const step = p[noteInPattern % p.length];
      noteInPattern++;
      lastSnapped = snapped;
      notes.push({
        id: id++, time: snapped, lane: step.a.lane,
        type: step.a.type === 'slide' ? 'hold' : step.a.type,
        holdDuration: step.a.type === 'hold' ? Math.max(0.5, dur) : undefined,
      });
      if (step.b.lane !== step.a.lane) {
        notes.push({
          id: id++, time: snapped, lane: step.b.lane,
          type: step.b.type === 'slide' ? 'hold' : step.b.type,
          holdDuration: step.b.type === 'hold' ? Math.max(0.5, dur) : undefined,
        });
      }
      continue;
    }

    if (phraseType === 'dual_hold') {
      const p = DUAL_HOLD_PATTERNS[patternIdx % DUAL_HOLD_PATTERNS.length];
      const step = p[noteInPattern % p.length];
      noteInPattern++;
      lastSnapped = snapped;
      const isHoldA = step.a.type === 'hold';
      notes.push({
        id: id++, time: snapped, lane: step.a.lane,
        type: step.a.type === 'slide' ? 'hold' : step.a.type,
        holdDuration: isHoldA ? Math.max(0.5, Math.min(dur * 0.8, 1.5)) : undefined,
      });
      if (step.b.lane !== step.a.lane) {
        const isHoldB = step.b.type === 'hold';
        notes.push({
          id: id++, time: snapped, lane: step.b.lane,
          type: step.b.type === 'slide' ? 'hold' : step.b.type,
          holdDuration: isHoldB ? Math.max(0.5, Math.min(dur * 0.8, 1.5)) : undefined,
        });
      }
      continue;
    }

    // ── Single note phrases ──
    let lane: number;
    let type: Note['type'] = 'tap';
    let targetLane: number | undefined;
    let swipeDirection: Note['swipeDirection'];
    let holdDuration: number | undefined;

    if (phraseType === 'swipe') {
      const p = SWIPE_MIXED_PATTERNS[patternIdx % SWIPE_MIXED_PATTERNS.length];
      const entry = p[noteInPattern % p.length];
      lane = entry.lane;
      type = entry.type === 'slide' ? 'hold' : entry.type;
      swipeDirection = entry.dir;
      if (type === 'hold') holdDuration = Math.max(0.5, dur);
    } else if (phraseType === 'slide') {
      const p = SLIDE_MIXED_PATTERNS[patternIdx % SLIDE_MIXED_PATTERNS.length];
      const entry = p[noteInPattern % p.length];
      lane = entry.lane;
      targetLane = entry.target;
      swipeDirection = entry.dir;
      type = entry.type === 'slide' ? 'hold' : entry.type;
      if (type === 'hold') holdDuration = Math.max(0.6, Math.min(dur, 2.0));
    } else {
      const p = PHRASE_PATTERNS[patternIdx % PHRASE_PATTERNS.length];
      lane = p[noteInPattern % p.length];
      if (dur > 0.6) {
        type = 'hold';
        holdDuration = Math.min(dur * 0.8, 2.0);
      } else {
        type = 'tap';
      }
    }

    noteInPattern++;
    lastSnapped = snapped;

    notes.push({
      id: id++,
      time: snapped,
      lane,
      type,
      holdDuration,
      targetLane,
      swipeDirection,
    });
  }

  return notes;
}

export function generateNotesFromBPM(bpm: number, duration: number): Note[] {
  const beatDur    = 60 / bpm;
  const measureDur = beatDur * 4;
  const notes: Note[] = [];
  let id = 0;
  let measureStart = 2.5;

  // Five varied measure patterns (beat offsets + lanes)
  const patterns: { beat: number; lane: number }[][] = [
    // Quarter-note walk
    [{ beat: 0, lane: 1 }, { beat: 1, lane: 2 }, { beat: 2, lane: 0 }, { beat: 3, lane: 1 }],
    // 8th-note syncopation
    [{ beat: 0, lane: 0 }, { beat: 0.5, lane: 2 }, { beat: 1.5, lane: 1 },
     { beat: 2, lane: 0 }, { beat: 3, lane: 2 }, { beat: 3.5, lane: 1 }],
    // Ascending run
    [{ beat: 0, lane: 0 }, { beat: 0.5, lane: 1 }, { beat: 1, lane: 2 },
     { beat: 2, lane: 1 }, { beat: 2.5, lane: 0 }, { beat: 3, lane: 2 }],
    // 3-3-2 clave feel
    [{ beat: 0, lane: 2 }, { beat: 0.75, lane: 0 }, { beat: 1.5, lane: 1 },
     { beat: 2.25, lane: 2 }, { beat: 3, lane: 0 }],
    // Cross-lane with double finish
    [{ beat: 0, lane: 2 }, { beat: 1, lane: 0 }, { beat: 2, lane: 2 },
     { beat: 2.5, lane: 1 }, { beat: 3, lane: 0 }, { beat: 3.5, lane: 2 }],
  ];

  let pi = 0;
  while (measureStart + measureDur < duration - 3) {
    for (const e of patterns[pi % patterns.length]) {
      const t = measureStart + e.beat * beatDur;
      if (t < duration - 3) notes.push({ id: id++, time: t, lane: e.lane, type: 'tap' });
    }
    measureStart += measureDur;
    pi++;
  }
  return notes;
}

export function getHighScore(songId: string): number {
  return parseInt(localStorage.getItem(`hs_${songId}`) || '0', 10);
}

export function saveHighScore(songId: string, score: number): void {
  const current = getHighScore(songId);
  if (score > current) localStorage.setItem(`hs_${songId}`, score.toString());
}
