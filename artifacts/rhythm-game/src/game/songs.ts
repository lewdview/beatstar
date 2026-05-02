import type { Note, Song } from './types';

function genBeats(
  bpm: number,
  duration: number,
  measures: Array<Array<{ beat: number; lane: number; type?: 'tap' | 'hold'; hold?: number }>>
): Note[] {
  const beatDur = 60 / bpm;
  const measureDur = beatDur * 4;
  const notes: Note[] = [];
  let id = 0;
  let measureStart = 2.5;

  const pattern = measures;
  let patternIdx = 0;

  while (measureStart + measureDur < duration - 3) {
    const measure = pattern[patternIdx % pattern.length];
    for (const entry of measure) {
      const t = measureStart + entry.beat * beatDur;
      if (t < duration - 3) {
        notes.push({
          id: id++,
          time: t,
          lane: entry.lane,
          type: entry.type || 'tap',
          holdDuration: entry.hold,
        });
      }
    }
    measureStart += measureDur;
    patternIdx++;
  }

  return notes;
}

const song1Notes = genBeats(82, 95, [
  [
    { beat: 0, lane: 1 },
    { beat: 1, lane: 3 },
    { beat: 2, lane: 0 },
    { beat: 3, lane: 2 },
  ],
  [
    { beat: 0, lane: 2 },
    { beat: 0.5, lane: 3 },
    { beat: 1.5, lane: 1 },
    { beat: 2, lane: 0 },
    { beat: 3, lane: 2 },
    { beat: 3.5, lane: 1 },
  ],
  [
    { beat: 0, lane: 0, type: 'hold', hold: 0.6 },
    { beat: 1, lane: 3 },
    { beat: 2, lane: 1 },
    { beat: 2.5, lane: 2 },
    { beat: 3, lane: 0 },
  ],
  [
    { beat: 0, lane: 3 },
    { beat: 0.5, lane: 2 },
    { beat: 1, lane: 1 },
    { beat: 1.5, lane: 0 },
    { beat: 2, lane: 1 },
    { beat: 2.5, lane: 2 },
    { beat: 3, lane: 3 },
    { beat: 3.5, lane: 2 },
  ],
]);

const song2Notes = genBeats(120, 100, [
  [
    { beat: 0, lane: 0 },
    { beat: 0.5, lane: 2 },
    { beat: 1, lane: 1 },
    { beat: 1.5, lane: 3 },
    { beat: 2, lane: 0 },
    { beat: 2.5, lane: 2 },
    { beat: 3, lane: 1 },
    { beat: 3.5, lane: 3 },
  ],
  [
    { beat: 0, lane: 1, type: 'hold', hold: 0.4 },
    { beat: 1, lane: 3, type: 'hold', hold: 0.4 },
    { beat: 2, lane: 0 },
    { beat: 2.5, lane: 1 },
    { beat: 3, lane: 2 },
    { beat: 3.5, lane: 3 },
  ],
  [
    { beat: 0, lane: 2 },
    { beat: 0.5, lane: 0 },
    { beat: 1, lane: 3 },
    { beat: 1.5, lane: 1 },
    { beat: 2, lane: 2 },
    { beat: 3, lane: 0 },
    { beat: 3.5, lane: 1 },
  ],
  [
    { beat: 0, lane: 0 },
    { beat: 0, lane: 3 },
    { beat: 1, lane: 1 },
    { beat: 1, lane: 2 },
    { beat: 2, lane: 0 },
    { beat: 2, lane: 3 },
    { beat: 3, lane: 1 },
    { beat: 3, lane: 2 },
  ],
]);

const song3Notes = genBeats(145, 110, [
  [
    { beat: 0, lane: 0 },
    { beat: 0.25, lane: 1 },
    { beat: 0.5, lane: 2 },
    { beat: 0.75, lane: 3 },
    { beat: 1, lane: 2 },
    { beat: 1.25, lane: 1 },
    { beat: 1.5, lane: 0 },
    { beat: 2, lane: 3 },
    { beat: 2.5, lane: 1 },
    { beat: 3, lane: 2 },
    { beat: 3.5, lane: 0 },
  ],
  [
    { beat: 0, lane: 1, type: 'hold', hold: 0.3 },
    { beat: 0.5, lane: 3 },
    { beat: 1, lane: 0, type: 'hold', hold: 0.3 },
    { beat: 1.5, lane: 2 },
    { beat: 2, lane: 1 },
    { beat: 2.25, lane: 3 },
    { beat: 2.5, lane: 2 },
    { beat: 2.75, lane: 0 },
    { beat: 3, lane: 1 },
    { beat: 3.5, lane: 3 },
  ],
  [
    { beat: 0, lane: 0 },
    { beat: 0, lane: 2 },
    { beat: 0.5, lane: 1 },
    { beat: 0.5, lane: 3 },
    { beat: 1, lane: 0 },
    { beat: 1, lane: 2 },
    { beat: 1.5, lane: 1 },
    { beat: 2, lane: 3 },
    { beat: 2.5, lane: 0 },
    { beat: 3, lane: 2 },
    { beat: 3.25, lane: 1 },
    { beat: 3.5, lane: 3 },
    { beat: 3.75, lane: 0 },
  ],
]);

export const SONGS: Song[] = [
  {
    id: 'transmission-001',
    title: 'TRANSMISSION 001',
    artist: 'TH3SCR1B3',
    bpm: 82,
    duration: 95,
    difficulty: 'LIGHT',
    difficultyLevel: 3,
    description: 'The signal finds you in the dark. Begin here.',
    moodTag: 'Melancholic / Ambient',
    notes: song1Notes,
  },
  {
    id: 'signal-rising',
    title: 'SIGNAL_RISING',
    artist: 'TH3SCR1B3',
    bpm: 120,
    duration: 100,
    difficulty: 'DARK',
    difficultyLevel: 6,
    description: 'The transmission intensifies. The static becomes music.',
    moodTag: 'Driving / Electronic',
    notes: song2Notes,
  },
  {
    id: 'break-of-light',
    title: 'BR34K_OF_LIGHT',
    artist: 'TH3SCR1B3',
    bpm: 145,
    duration: 110,
    difficulty: 'VOID',
    difficultyLevel: 9,
    description: 'Past the dark, velocity becomes transcendence.',
    moodTag: 'Intense / Euphoric',
    notes: song3Notes,
  },
];

export function getSong(id: string): Song | undefined {
  return SONGS.find((s) => s.id === id);
}

export function getHighScore(songId: string): number {
  const key = `hs_${songId}`;
  return parseInt(localStorage.getItem(key) || '0', 10);
}

export function saveHighScore(songId: string, score: number): void {
  const key = `hs_${songId}`;
  const current = getHighScore(songId);
  if (score > current) {
    localStorage.setItem(key, score.toString());
  }
}
