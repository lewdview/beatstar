
export interface ChapterMeta {
  month: number;
  name: string;
  sub: string;
  diff: 'EASY' | 'MEDIUM' | 'HARD' | 'BRUTAL';
  dc: string;
  platNeeded: number;
}

export const CHAPTERS: ChapterMeta[] = [
  { month: 1,  name: 'JANUARY',   sub: 'GATEWAY SIGNAL',   diff: 'EASY',   dc: '#39FF14', platNeeded: 2  },
  { month: 2,  name: 'FEBRUARY',  sub: 'EMERGENCE',         diff: 'EASY',   dc: '#39FF14', platNeeded: 2  },
  { month: 3,  name: 'MARCH',     sub: 'STATIC RISE',       diff: 'EASY',   dc: '#39FF14', platNeeded: 3  },
  { month: 4,  name: 'APRIL',     sub: 'FREQUENCY',         diff: 'MEDIUM', dc: '#00E5FF', platNeeded: 3  },
  { month: 5,  name: 'MAY',       sub: 'SIGNAL SURGE',      diff: 'MEDIUM', dc: '#00E5FF', platNeeded: 3  },
  { month: 6,  name: 'JUNE',      sub: 'INTERFERENCE',      diff: 'MEDIUM', dc: '#00E5FF', platNeeded: 4  },
  { month: 7,  name: 'JULY',      sub: 'WAVELENGTH',        diff: 'HARD',   dc: '#E5B800', platNeeded: 4  },
  { month: 8,  name: 'AUGUST',    sub: 'RESONANCE',         diff: 'HARD',   dc: '#E5B800', platNeeded: 5  },
  { month: 9,  name: 'SEPTEMBER', sub: 'DISTORTION',        diff: 'HARD',   dc: '#E5B800', platNeeded: 5  },
  { month: 10, name: 'OCTOBER',   sub: 'THRESHOLD',         diff: 'BRUTAL', dc: '#FF1493', platNeeded: 5  },
  { month: 11, name: 'NOVEMBER',  sub: 'FRACTURE',          diff: 'BRUTAL', dc: '#FF1493', platNeeded: 6  },
  { month: 12, name: 'DECEMBER',  sub: 'TRANSMISSION END',  diff: 'BRUTAL', dc: '#FF1493', platNeeded: 7  },
];

/**
 * Calculates the imposed difficulty level for a campaign stage.
 * Rules:
 * 1. Each chapter starts at a 'base' difficulty level based on the month.
 * 2. Regular tracks ramp up from that base level towards Level 9.
 * 3. Bonus tracks are always Level 10 (Brutal).
 */
export function calculateCampaignDifficulty(monthNum: number, stageIndex: number, totalRegular: number, isBonus: boolean): number {
  if (isBonus) return 10;

  // Base starting level ramps from 1 (January) to 7 (December)
  // This satisfies "overall easy - brutal by december"
  const baseLevel = 1 + Math.floor((monthNum - 1) * (6 / 11));
  
  // Ramp from baseLevel up to 9 for regular tracks
  const targetLevel = 9;
  
  if (totalRegular <= 1) return baseLevel;
  
  const progress = stageIndex / (totalRegular - 1);
  const rawLevel = baseLevel + (targetLevel - baseLevel) * progress;
  
  return Math.max(1, Math.min(10, Math.round(rawLevel)));
}
