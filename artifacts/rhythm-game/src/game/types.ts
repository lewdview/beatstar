export interface Note {
  id: number;
  time: number;
  lane: number;
  type: 'tap' | 'hold' | 'swipe';
  holdDuration?: number;
  targetLane?: number;
  swipeDirection?: 'left' | 'right' | 'up' | 'down' | 'up-left' | 'up-right' | 'down-left' | 'down-right';
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  duration: number;
  difficulty: 'LIGHT' | 'DARK' | 'VOID';
  difficultyLevel: number;
  description: string;
  notes: Note[];
  moodTag: string;
}

export interface ScoreEntry {
  songId: string;
  score: number;
  maxCombo: number;
  perfects: number;
  goods: number;
  misses: number;
  rank: string;
  timestamp: number;
}

export type JudgmentType = 'PERFECT+' | 'PERFECT' | 'GOOD' | 'MISS';

export interface JudgmentDisplay {
  type: JudgmentType;
  lane: number;
  id: number;
  ts: number;
}

export interface GameState {
  score: number;
  combo: number;
  maxCombo: number;
  perfectPlus: number;
  perfects: number;
  goods: number;
  misses: number;
  progress: number;
}
