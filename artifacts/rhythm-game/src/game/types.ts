export type NoteType = 
  | 'tap' 
  | 'hold' 
  | 'swipe' 
  | 'hold-swipe'
  | 'double'
  | 'slide'
  | 'zigzag'
  | 'repeater'
  | 'chain'
  | 'mine'
  | 'lift'
  | 'harmony'
  | 'scratch'
  | 'accent'
  | 'break'
  | 'choice'
  | 'burst'
  | 'remix'
  | 'stream'
  | 'spiral'
  | 'pulse'
  | 'shift';

export interface Note {
  id: number;
  time: number;
  lane: number;
  type: NoteType;
  holdDuration?: number;
  targetLane?: number;
  swipeDirection?: 'left' | 'right' | 'up' | 'down' | 'up-left' | 'up-right' | 'down-left' | 'down-right';
  remixEffect?: 'vocals_isolate' | 'drums_mute' | 'bass_boost' | 'lead_solo';
  choicePath?: 'left' | 'right';
  zigzagAmplitude?: number;
  repeaterCount?: number;
  stage?: number;
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

export type JudgmentType = 'PERFECT+' | 'PERFECT' | 'GOOD' | 'MISS' | 'SHIELDED';

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
