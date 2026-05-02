import type { Note } from './types';

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

let catalogCache: GameSong[] | null = null;
let loadingPromise: Promise<GameSong[]> | null = null;

export async function loadCatalog(): Promise<GameSong[]> {
  if (catalogCache) return catalogCache;
  if (loadingPromise) return loadingPromise;

  loadingPromise = fetch(RELEASE_DATA_URL)
    .then((r) => r.json())
    .then((data) => {
      catalogCache = (data.releases as any[])
        .filter((r) => r.storedAudioUrl)
        .map(buildGameSong);
      return catalogCache;
    });

  return loadingPromise;
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
      ? generateNotesFromLyrics(lyricsWords)
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

const LANE_SEQUENCE = [0, 2, 1, 0, 2, 1, 2, 0, 1, 2, 0, 2, 1, 0, 1, 2, 0, 1, 0, 2];

export function generateNotesFromLyrics(words: LyricsWord[]): Note[] {
  const notes: Note[] = [];
  let id = 0;
  let laneIdx = 0;
  let lastTime = -1;

  for (const word of words) {
    if (word.start < 1.0) continue;
    if (word.start - lastTime < 0.11) continue;

    const dur = word.end - word.start;
    const isHold = dur > 0.55;
    const lane = LANE_SEQUENCE[laneIdx % LANE_SEQUENCE.length];
    laneIdx++;
    lastTime = word.start;

    notes.push({
      id: id++,
      time: word.start,
      lane,
      type: isHold ? 'hold' : 'tap',
      holdDuration: isHold ? Math.min(dur * 0.7, 2.0) : undefined,
    });
  }

  return notes;
}

export function generateNotesFromBPM(bpm: number, duration: number): Note[] {
  const beatDur = 60 / bpm;
  const measureDur = beatDur * 4;
  const notes: Note[] = [];
  let id = 0;
  let measureStart = 2.5;
  const patterns = [
    [
      { beat: 0, lane: 1 }, { beat: 1, lane: 2 },
      { beat: 2, lane: 0 }, { beat: 3, lane: 1 },
    ],
    [
      { beat: 0, lane: 0 }, { beat: 0.5, lane: 2 },
      { beat: 1.5, lane: 1 }, { beat: 2, lane: 0 },
      { beat: 3, lane: 2 }, { beat: 3.5, lane: 1 },
    ],
    [
      { beat: 0, lane: 2 }, { beat: 1, lane: 0 },
      { beat: 2, lane: 1 }, { beat: 2.5, lane: 2 },
      { beat: 3, lane: 0 },
    ],
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
