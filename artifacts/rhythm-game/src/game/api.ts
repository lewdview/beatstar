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

  const difficultyLevel = calcDifficulty(bpm, valence, notes.length);

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

function calcDifficulty(bpm: number, valence: number, noteCount: number): number {
  const bpmScore = Math.min(10, Math.max(1, Math.round((bpm - 60) / 15)));
  const densityScore = Math.min(10, Math.max(1, Math.round(noteCount / 20)));
  return Math.round((bpmScore + densityScore) / 2);
}

/** Snap a timestamp to the nearest 16th-note grid at the given BPM. */
function snapToBeat(time: number, bpm: number, subdivision = 16): number {
  const subDur = (60 / bpm) * (4 / subdivision);
  return Math.round(time / subDur) * subDur;
}

/**
 * Five musical phrase patterns. Each is an 8-slot lane sequence (0=A, 1=S, 2=D).
 * A new pattern is picked whenever a phrase boundary (silence > 0.65 s) is detected.
 */
const PHRASE_PATTERNS: number[][] = [
  [0, 1, 2, 1, 0, 2, 1, 0],  // ascending bounce
  [2, 1, 0, 1, 2, 0, 1, 2],  // descending bounce
  [0, 2, 1, 0, 2, 1, 0, 2],  // outer ping-pong
  [1, 0, 2, 1, 0, 2, 1, 0],  // center-out alternating
  [0, 2, 0, 1, 2, 1, 2, 0],  // irregular cross
];

export function generateNotesFromLyrics(words: LyricsWord[], bpm = 100): Note[] {
  const notes: Note[] = [];
  let id = 0;
  let patternIdx = 0;
  let noteInPattern = 0;
  let lastSnapped = -1;
  const MIN_GAP = 0.10;

  for (const word of words) {
    if (word.start < 1.0) continue;

    // Snap to nearest 16th note so tapping aligns with the beat grid
    const snapped = snapToBeat(word.start, bpm, 16);
    if (snapped - lastSnapped < MIN_GAP) continue;

    // Phrase boundary: silence > 0.65 s → advance to next lane pattern
    if (lastSnapped > 0 && snapped - lastSnapped > 0.65) {
      patternIdx = (patternIdx + 1) % PHRASE_PATTERNS.length;
      noteInPattern = 0;
    }

    const pattern = PHRASE_PATTERNS[patternIdx];
    const lane    = pattern[noteInPattern % pattern.length];
    noteInPattern++;
    lastSnapped = snapped;

    const dur    = word.end - word.start;
    const isHold = dur > 0.55;

    notes.push({
      id: id++,
      time: snapped,
      lane,
      type: isHold ? 'hold' : 'tap',
      holdDuration: isHold ? Math.min(dur * 0.7, 2.0) : undefined,
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
