import type { Note } from './types';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { loadOpts } from '@/lib/options';

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

export function clearCatalogCache() {
  catalogCache = null;
  loadingPromise = null;
}

export async function loadCatalog(): Promise<GameSong[]> {
  if (catalogCache) return catalogCache;
  if (loadingPromise) return loadingPromise;

  const promise = (async (): Promise<GameSong[]> => {
    try {
      // Development switch for local files
      const useLocal = (typeof localStorage !== 'undefined' && (localStorage.getItem('opt_useLocalFiles') === 'true' || localStorage.getItem('useLocalFiles') === 'true')) || 
                       (import.meta.env && import.meta.env.VITE_USE_LOCAL_FILES === 'true');

      // 1. Try Supabase first if configured and not forcing local
      if (supabase && !useLocal) {
        const { data, error } = await supabase
          .from('releases')
          .select('*')
          .eq('status', 'released')
          .order('day', { ascending: true });

        if (!error && data && data.length > 0) {
          console.log('Fetched catalog from Supabase');
          catalogCache = data.map((r) => buildGameSong(r, false));
          return catalogCache;
        }
        if (error) console.error('Supabase fetch error:', error);
      }

      // 2. Fallback to Firebase if Supabase fails
      if (!useLocal && db) {
        try {
          const releasesRef = collection(db, 'releases');
          const q = query(releasesRef, where('status', '==', 'released'), orderBy('day', 'asc'));
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            console.log('Fetched catalog from Firebase (Supabase fallback)');
            const data = snapshot.docs.map(doc => doc.data());
            catalogCache = data.map((r) => buildGameSong(r, false));
            return catalogCache;
          }
        } catch (err) {
          console.error('Firebase fallback fetch error:', err);
        }
      }

      // 3. Fallback to static JSON
      const r = await fetch(RELEASE_DATA_URL);
      const data = await r.json();
      console.log(`Fetched catalog from Static JSON fallback (useLocal: ${useLocal})`);
      catalogCache = (data.releases as any[]).map((r: any) => buildGameSong(r, useLocal));
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

function buildGameSong(r: any, useLocal = false): GameSong {
  const lyricsWords: LyricsWord[] = r.lyricsWords || [];
  const bpm = r.tempo || 100;
  const duration = Math.ceil(r.duration || 180);
  const valence = r.valence ?? 0.5;

  const opts = loadOpts();
  let useLyrics = false;
  if (opts.noteGenerationSource === 'lyrics') {
    useLyrics = lyricsWords.length > 0;
  } else if (opts.noteGenerationSource === 'bpm') {
    useLyrics = false;
  } else {
    useLyrics = lyricsWords.length > 15;
  }

  const notes = useLyrics
    ? generateNotesFromLyrics(lyricsWords, bpm)
    : generateNotesFromBPM(bpm, duration);

  const difficultyLevel = calcDifficulty(bpm, valence, notes.length, duration);

  let audioUrl = r.storedAudioUrl;
  let coverArt = r.coverArt || null;

  if (useLocal) {
    const LOCAL_BASE = '/@fs/Volumes/extremeUno/th3scr1b3-365-warp/365-releases/';
    if (r.manifestAudioPath) {
      audioUrl = LOCAL_BASE + decodeURIComponent(r.manifestAudioPath);
    } else if (r.fileName && r.date) {
      // Fallback if manifestAudioPath isn't present
      const monthStr = new Date(r.date).toLocaleString('en-US', { month: 'long' }).toLowerCase();
      audioUrl = LOCAL_BASE + `audio/${monthStr}/${decodeURIComponent(r.fileName)}`;
    }
    if (coverArt && coverArt.includes('/releaseready/')) {
      const parts = coverArt.split('/releaseready/');
      if (parts.length > 1) {
        coverArt = LOCAL_BASE + decodeURIComponent(parts[1]);
      }
    }
  }

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
    audioUrl,
    coverArt,
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
  // --- New Extended Patterns ---
  [0, 1, 1, 2, 2, 1, 1, 0],  // staircase climb and fall
  [2, 2, 1, 1, 0, 0, 1, 1],  // reverse staircase
  [0, 2, 2, 0, 1, 1, 1, 1],  // outside-in rush
  [1, 2, 0, 1, 2, 0, 1, 2],  // relentless swirl right
  [1, 0, 2, 1, 0, 2, 1, 0],  // relentless swirl left
  [0, 1, 2, 2, 1, 0, 0, 1],  // double end bounce
  [1, 1, 1, 0, 2, 0, 2, 0],  // machine gun center to spread
  [0, 0, 2, 2, 0, 0, 2, 2],  // hard alternating corners
  [1, 2, 1, 0, 1, 2, 1, 0],  // anchor center, weave out
  [0, 2, 1, 1, 0, 2, 1, 1],  // snap to middle
  // --- Advanced Dynamic Patterns ---
  [0, 1, 2, 0, 1, 2, 0, 1],  // rolling right
  [2, 1, 0, 2, 1, 0, 2, 1],  // rolling left
  [1, 0, 1, 0, 1, 2, 1, 2],  // center-left then center-right weave
  [0, 0, 0, 1, 2, 2, 2, 1],  // triple tap corners with transition
  [1, 2, 2, 1, 0, 0, 1, 1],  // double taps moving left/right
  [0, 2, 0, 2, 1, 0, 2, 1],  // corner ping-pong with center step
  [0, 1, 0, 1, 2, 1, 2, 1],  // zig-zag steps
  [1, 0, 2, 0, 1, 2, 0, 2],  // outer focus crossing center
  [2, 2, 0, 0, 1, 1, 2, 2],  // heavy doubles
  [1, 1, 2, 0, 1, 1, 0, 2],  // stutter-heavy flow
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
  // --- New Extended Patterns ---
  [{ type: 'swipe', lane: 0, dir: 'down' }, { type: 'swipe', lane: 2, dir: 'down' }, { type: 'tap', lane: 1 }, { type: 'swipe', lane: 1, dir: 'up' }],
  [{ type: 'tap', lane: 1 }, { type: 'tap', lane: 1 }, { type: 'swipe', lane: 0, dir: 'left' }, { type: 'swipe', lane: 2, dir: 'right' }],
  [{ type: 'swipe', lane: 2, dir: 'right' }, { type: 'tap', lane: 1 }, { type: 'swipe', lane: 0, dir: 'left' }, { type: 'tap', lane: 1 }],
  [{ type: 'tap', lane: 0 }, { type: 'tap', lane: 2 }, { type: 'swipe', lane: 1, dir: 'down' }, { type: 'swipe', lane: 1, dir: 'up' }],
  [{ type: 'swipe', lane: 1, dir: 'up-left' }, { type: 'swipe', lane: 1, dir: 'up-right' }, { type: 'tap', lane: 0 }, { type: 'tap', lane: 2 }],
  // --- Advanced Dynamic Patterns ---
  [{ type: 'swipe', lane: 1, dir: 'up' }, { type: 'swipe', lane: 1, dir: 'down' }, { type: 'tap', lane: 0 }, { type: 'tap', lane: 2 }], // rapid vertical center
  [{ type: 'swipe', lane: 0, dir: 'left' }, { type: 'swipe', lane: 2, dir: 'right' }, { type: 'tap', lane: 1 }, { type: 'swipe', lane: 1, dir: 'up' }], // outward swipe spread
  [{ type: 'swipe', lane: 0, dir: 'left' }, { type: 'swipe', lane: 1, dir: 'up' }, { type: 'swipe', lane: 2, dir: 'right' }, { type: 'tap', lane: 1 }], // circular movement
  [{ type: 'swipe', lane: 0, dir: 'up-left' }, { type: 'tap', lane: 2 }, { type: 'swipe', lane: 2, dir: 'up-right' }, { type: 'tap', lane: 0 }], // alternate side-swipes
  [{ type: 'tap', lane: 1 }, { type: 'swipe', lane: 0, dir: 'down' }, { type: 'swipe', lane: 2, dir: 'down' }, { type: 'swipe', lane: 1, dir: 'down' }], // downward hammer slam
  [{ type: 'swipe', lane: 1, dir: 'down-left' }, { type: 'tap', lane: 0 }, { type: 'swipe', lane: 1, dir: 'down-right' }, { type: 'tap', lane: 2 }], // diagonal sweeps
  [{ type: 'tap', lane: 0 }, { type: 'swipe', lane: 0, dir: 'up' }, { type: 'tap', lane: 2 }, { type: 'swipe', lane: 2, dir: 'up' }], // asymmetric syncopated swipes
  [{ type: 'swipe', lane: 1, dir: 'left' }, { type: 'swipe', lane: 1, dir: 'right' }, { type: 'tap', lane: 0 }, { type: 'tap', lane: 2 }], // center cross sweeps
  [{ type: 'swipe', lane: 0, dir: 'up' }, { type: 'swipe', lane: 1, dir: 'up' }, { type: 'swipe', lane: 2, dir: 'up' }, { type: 'tap', lane: 1 }], // escalating up swipes
  [{ type: 'tap', lane: 1 }, { type: 'swipe', lane: 0, dir: 'up-left' }, { type: 'tap', lane: 1 }, { type: 'swipe', lane: 2, dir: 'down-right' }], // opposite diagonal flickers
];

/** Mixed patterns incorporating lane-change slides with rhythmic taps */
const SLIDE_MIXED_PATTERNS: PatternStep[][] = [
  [{ type: 'slide', lane: 0, target: 1, dir: 'right' }, { type: 'tap', lane: 1 }, { type: 'slide', lane: 1, target: 2, dir: 'right' }, { type: 'tap', lane: 2 }],
  [{ type: 'slide', lane: 0, target: 2, dir: 'right' }, { type: 'tap', lane: 1 }, { type: 'slide', lane: 2, target: 0, dir: 'left' }, { type: 'tap', lane: 1 }],
  [{ type: 'tap', lane: 1 }, { type: 'slide', lane: 1, target: 0, dir: 'left' }, { type: 'tap', lane: 0 }, { type: 'slide', lane: 0, target: 1, dir: 'right' }],
  [{ type: 'tap', lane: 0 }, { type: 'slide', lane: 1, target: 2, dir: 'right' }, { type: 'tap', lane: 2 }, { type: 'slide', lane: 2, target: 1, dir: 'left' }],
  // --- New Extended Patterns ---
  [{ type: 'slide', lane: 2, target: 0, dir: 'left' }, { type: 'tap', lane: 0 }, { type: 'slide', lane: 0, target: 2, dir: 'right' }, { type: 'tap', lane: 2 }],
  [{ type: 'tap', lane: 1 }, { type: 'tap', lane: 1 }, { type: 'slide', lane: 0, target: 2, dir: 'right' }, { type: 'tap', lane: 2 }],
  [{ type: 'slide', lane: 1, target: 0, dir: 'left' }, { type: 'slide', lane: 0, target: 1, dir: 'right' }, { type: 'tap', lane: 2 }, { type: 'tap', lane: 1 }],
  [{ type: 'tap', lane: 2 }, { type: 'slide', lane: 2, target: 0, dir: 'left' }, { type: 'tap', lane: 0 }, { type: 'slide', lane: 0, target: 2, dir: 'right' }],
  // --- Advanced Dynamic Patterns ---
  [{ type: 'slide', lane: 1, target: 0, dir: 'left' }, { type: 'tap', lane: 2 }, { type: 'slide', lane: 1, target: 2, dir: 'right' }, { type: 'tap', lane: 0 }], // center split slides
  [{ type: 'slide', lane: 0, target: 2, dir: 'right' }, { type: 'slide', lane: 2, target: 0, dir: 'left' }, { type: 'tap', lane: 1 }, { type: 'tap', lane: 1 }], // long crossing diagonals
  [{ type: 'slide', lane: 0, target: 1, dir: 'right' }, { type: 'slide', lane: 1, target: 0, dir: 'left' }, { type: 'slide', lane: 0, target: 2, dir: 'right' }, { type: 'tap', lane: 2 }], // zig-zag slide
  [{ type: 'slide', lane: 2, target: 1, dir: 'left' }, { type: 'slide', lane: 1, target: 2, dir: 'right' }, { type: 'tap', lane: 0 }, { type: 'tap', lane: 1 }], // bounce slide
  [{ type: 'tap', lane: 1 }, { type: 'slide', lane: 0, target: 2, dir: 'right' }, { type: 'slide', lane: 2, target: 1, dir: 'left' }, { type: 'tap', lane: 0 }], // continuous shift loop
  [{ type: 'slide', lane: 1, target: 0, dir: 'left' }, { type: 'slide', lane: 0, target: 2, dir: 'right' }, { type: 'tap', lane: 1 }, { type: 'tap', lane: 2 }], // sweeping arc
  [{ type: 'slide', lane: 0, target: 1, dir: 'right' }, { type: 'tap', lane: 2 }, { type: 'slide', lane: 2, target: 1, dir: 'left' }, { type: 'tap', lane: 0 }], // inward slides
  [{ type: 'slide', lane: 1, target: 2, dir: 'right' }, { type: 'slide', lane: 2, target: 0, dir: 'left' }, { type: 'tap', lane: 1 }, { type: 'swipe', lane: 1, dir: 'up' }], // slide slide tap swipe mix
  [{ type: 'tap', lane: 0 }, { type: 'slide', lane: 1, target: 0, dir: 'left' }, { type: 'tap', lane: 2 }, { type: 'slide', lane: 1, target: 2, dir: 'right' }], // symmetrical outer transitions
  [{ type: 'slide', lane: 0, target: 2, dir: 'right' }, { type: 'tap', lane: 1 }, { type: 'swipe', lane: 2, dir: 'down' }, { type: 'tap', lane: 0 }], // long slide with quick recovery swipe
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
  // --- New Extended Patterns ---
  // Double tap center -> burst outside
  [
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 2 } },
  ],
  // Syncopated side shifts
  [
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 2 } },
  ],
  // Hard cross
  [
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 2 } },
  ],
  // --- Advanced Dynamic Patterns ---
  [
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 2 } },
  ], // inward pinch and split
  [
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 2 } },
  ], // staggered duals
  [
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 2 } },
  ], // corner storm
  [
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 2 } },
  ], // shifting double-taps
  [
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 2 } },
  ], // center-outer pulse
  [
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 2 } },
  ], // tri-directional mix
  [
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 1 } },
  ], // asymmetrical outer weave
  [
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 1 } },
  ], // cross transitions to center
  [
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 1 } },
  ], // corner heavy bounce
  [
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 2 } },
  ], // shifting weaving pairs
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
  // --- New Extended Patterns ---
  // Hold side + intense center tapping
  [
    { a: { type: 'hold', lane: 0 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'hold', lane: 2 }, b: { type: 'tap', lane: 1 } },
  ],
  // Hold outer + tap inner alternating
  [
    { a: { type: 'hold', lane: 2 }, b: { type: 'tap', lane: 0 } },
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 0 } },
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 1 } },
  ],
  // Dual split holds
  [
    { a: { type: 'hold', lane: 0 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'hold', lane: 2 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'hold', lane: 0 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 1 } },
  ],
  // --- Advanced Dynamic Patterns ---
  [
    { a: { type: 'hold', lane: 0 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'tap', lane: 2 }, b: { type: 'hold', lane: 1 } },
    { a: { type: 'hold', lane: 2 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'hold', lane: 1 } },
  ], // cross hold-tap alternation
  [
    { a: { type: 'hold', lane: 0 }, b: { type: 'hold', lane: 1 } },
    { a: { type: 'tap', lane: 2 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'hold', lane: 1 }, b: { type: 'hold', lane: 2 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 0 } },
  ], // moving double hold
  [
    { a: { type: 'hold', lane: 1 }, b: { type: 'hold', lane: 1 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'hold', lane: 1 }, b: { type: 'hold', lane: 1 } },
  ], // shield layout (center hold, outer taps)
  [
    { a: { type: 'hold', lane: 0 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'hold', lane: 0 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'hold', lane: 2 }, b: { type: 'tap', lane: 0 } },
    { a: { type: 'hold', lane: 2 }, b: { type: 'tap', lane: 1 } },
  ], // continuous side anchor holds
  [
    { a: { type: 'hold', lane: 1 }, b: { type: 'tap', lane: 0 } },
    { a: { type: 'tap', lane: 2 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'hold', lane: 1 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 0 } },
  ], // center anchor hold with staggered outer taps
  [
    { a: { type: 'hold', lane: 0 }, b: { type: 'hold', lane: 2 } },
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'hold', lane: 1 }, b: { type: 'hold', lane: 1 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 2 } },
  ], // outer double hold to center single hold transition
  [
    { a: { type: 'hold', lane: 0 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'hold', lane: 2 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'tap', lane: 0 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'hold', lane: 1 }, b: { type: 'tap', lane: 1 } },
  ], // staggered split holds
  [
    { a: { type: 'hold', lane: 2 }, b: { type: 'tap', lane: 0 } },
    { a: { type: 'hold', lane: 1 }, b: { type: 'tap', lane: 0 } },
    { a: { type: 'hold', lane: 0 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'hold', lane: 1 }, b: { type: 'tap', lane: 2 } },
  ], // progressive anchor shifts
  [
    { a: { type: 'hold', lane: 0 }, b: { type: 'hold', lane: 2 } },
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'tap', lane: 1 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'hold', lane: 0 }, b: { type: 'hold', lane: 2 } },
  ], // double side hold wall with inner taps
  [
    { a: { type: 'hold', lane: 1 }, b: { type: 'tap', lane: 0 } },
    { a: { type: 'hold', lane: 2 }, b: { type: 'tap', lane: 1 } },
    { a: { type: 'hold', lane: 0 }, b: { type: 'tap', lane: 2 } },
    { a: { type: 'hold', lane: 1 }, b: { type: 'tap', lane: 0 } },
  ], // swirling holds
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
          // Cyclical variety with all phrase types, expanded to 16 cycles for less repetition
          const cycle = (phraseCount - 2) % 16;
          if (cycle === 1 || cycle === 9) phraseType = 'dual';
          else if (cycle === 2 || cycle === 10) phraseType = 'swipe';
          else if (cycle === 4 || cycle === 12) phraseType = 'slide';
          else if (cycle === 5 || cycle === 13) phraseType = 'dual_hold';
          else if (cycle === 7 || cycle === 15) phraseType = 'swipe';
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

  interface BPMPatternStep {
    beat: number;
    lane: number;
    type?: 'tap' | 'hold' | 'swipe' | 'slide';
    holdDurationBeats?: number;
    targetLane?: number;
    swipeDirection?: Note['swipeDirection'];
  }

  const patterns: BPMPatternStep[][] = [
    // 1. Quarter-note walk (basic tap pattern)
    [
      { beat: 0, lane: 1, type: 'tap' },
      { beat: 1, lane: 2, type: 'tap' },
      { beat: 2, lane: 0, type: 'tap' },
      { beat: 3, lane: 1, type: 'tap' }
    ],
    // 2. 8th-note syncopation with swipes
    [
      { beat: 0, lane: 0, type: 'tap' },
      { beat: 0.5, lane: 2, type: 'swipe', swipeDirection: 'right' },
      { beat: 1.5, lane: 1, type: 'tap' },
      { beat: 2, lane: 0, type: 'tap' },
      { beat: 3, lane: 2, type: 'swipe', swipeDirection: 'up' },
      { beat: 3.5, lane: 1, type: 'tap' }
    ],
    // 3. Ascending run + hold
    [
      { beat: 0, lane: 0, type: 'tap' },
      { beat: 0.5, lane: 1, type: 'tap' },
      { beat: 1, lane: 2, type: 'hold', holdDurationBeats: 1.0 },
      { beat: 2.5, lane: 0, type: 'tap' },
      { beat: 3, lane: 1, type: 'swipe', swipeDirection: 'left' }
    ],
    // 4. Clave rhythm with dual notes
    [
      { beat: 0, lane: 0, type: 'tap' },
      { beat: 0, lane: 2, type: 'tap' },
      { beat: 0.75, lane: 1, type: 'tap' },
      { beat: 1.5, lane: 0, type: 'tap' },
      { beat: 1.5, lane: 2, type: 'tap' },
      { beat: 2.25, lane: 1, type: 'tap' },
      { beat: 3, lane: 0, type: 'tap' },
      { beat: 3, lane: 2, type: 'tap' }
    ],
    // 5. Lane slide transition (crossing)
    [
      { beat: 0, lane: 0, type: 'slide', holdDurationBeats: 1.5, targetLane: 2, swipeDirection: 'right' },
      { beat: 1.5, lane: 2, type: 'tap' },
      { beat: 2.0, lane: 2, type: 'slide', holdDurationBeats: 1.5, targetLane: 0, swipeDirection: 'left' },
      { beat: 3.5, lane: 0, type: 'tap' }
    ],
    // 6. Triplet rush + swipes
    [
      { beat: 0, lane: 1, type: 'tap' },
      { beat: 0.33, lane: 0, type: 'swipe', swipeDirection: 'left' },
      { beat: 0.66, lane: 2, type: 'swipe', swipeDirection: 'right' },
      { beat: 1.5, lane: 1, type: 'tap' },
      { beat: 2.5, lane: 0, type: 'tap' },
      { beat: 3, lane: 2, type: 'swipe', swipeDirection: 'up' }
    ],
    // 7. Heavy dual holds (shield)
    [
      { beat: 0, lane: 0, type: 'hold', holdDurationBeats: 1.5 },
      { beat: 0, lane: 2, type: 'hold', holdDurationBeats: 1.5 },
      { beat: 1.5, lane: 1, type: 'tap' },
      { beat: 2.0, lane: 1, type: 'tap' },
      { beat: 2.5, lane: 1, type: 'swipe', swipeDirection: 'up' }
    ],
    // 8. Staggered hold and tap
    [
      { beat: 0, lane: 0, type: 'hold', holdDurationBeats: 1.5 },
      { beat: 0.5, lane: 2, type: 'tap' },
      { beat: 1.0, lane: 1, type: 'tap' },
      { beat: 2.0, lane: 2, type: 'hold', holdDurationBeats: 1.5 },
      { beat: 2.5, lane: 0, type: 'tap' },
      { beat: 3.0, lane: 1, type: 'tap' }
    ],
    // 9. Diagonal swipe hammer
    [
      { beat: 0, lane: 1, type: 'tap' },
      { beat: 1, lane: 0, type: 'swipe', swipeDirection: 'down-left' },
      { beat: 1.5, lane: 2, type: 'swipe', swipeDirection: 'down-right' },
      { beat: 2.5, lane: 1, type: 'tap' },
      { beat: 3, lane: 0, type: 'swipe', swipeDirection: 'up-left' },
      { beat: 3.5, lane: 2, type: 'swipe', swipeDirection: 'up-right' }
    ],
    // 10. Zig-zag slide weave
    [
      { beat: 0, lane: 1, type: 'slide', holdDurationBeats: 1.0, targetLane: 0, swipeDirection: 'left' },
      { beat: 1.0, lane: 0, type: 'slide', holdDurationBeats: 1.0, targetLane: 2, swipeDirection: 'right' },
      { beat: 2.0, lane: 2, type: 'slide', holdDurationBeats: 1.0, targetLane: 1, swipeDirection: 'left' },
      { beat: 3.0, lane: 1, type: 'swipe', swipeDirection: 'up' }
    ],
    // 11. Stutter syncopated dual taps
    [
      { beat: 0, lane: 0, type: 'tap' },
      { beat: 0, lane: 1, type: 'tap' },
      { beat: 0.75, lane: 1, type: 'tap' },
      { beat: 0.75, lane: 2, type: 'tap' },
      { beat: 1.5, lane: 0, type: 'tap' },
      { beat: 1.5, lane: 2, type: 'tap' },
      { beat: 2.5, lane: 1, type: 'swipe', swipeDirection: 'down' },
      { beat: 3.0, lane: 0, type: 'tap' },
      { beat: 3.5, lane: 2, type: 'tap' }
    ],
    // 12. Swirl slides
    [
      { beat: 0, lane: 0, type: 'slide', holdDurationBeats: 1.0, targetLane: 1, swipeDirection: 'right' },
      { beat: 1.0, lane: 2, type: 'slide', holdDurationBeats: 1.0, targetLane: 1, swipeDirection: 'left' },
      { beat: 2.0, lane: 1, type: 'hold', holdDurationBeats: 1.5 },
      { beat: 2.5, lane: 0, type: 'tap' },
      { beat: 3.0, lane: 2, type: 'tap' }
    ]
  ];

  let pi = 0;
  while (measureStart + measureDur < duration - 3) {
    for (const e of patterns[pi % patterns.length]) {
      const t = measureStart + e.beat * beatDur;
      if (t < duration - 3) {
        const type: Note['type'] = e.type === 'slide' ? 'hold' : (e.type ?? 'tap');
        const holdDuration = e.type === 'hold' || e.type === 'slide'
          ? (e.holdDurationBeats ?? 1.0) * beatDur
          : undefined;
        notes.push({
          id: id++,
          time: t,
          lane: e.lane,
          type,
          holdDuration,
          targetLane: e.targetLane,
          swipeDirection: e.swipeDirection
        });
      }
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
