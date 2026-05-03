// ── medal/score persistence ──────────────────────────────────────
const MEDAL_ORDER = ['', 'NONE', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM'] as const;

export function getMedalForSong(songId: string): string {
  return localStorage.getItem(`medal_${songId}`) ?? '';
}

export function saveMedal(songId: string, medal: string): void {
  const current = getMedalForSong(songId);
  if (MEDAL_ORDER.indexOf(medal as any) > MEDAL_ORDER.indexOf(current as any)) {
    localStorage.setItem(`medal_${songId}`, medal);
  }
}

export function getHighScore(songId: string): number {
  return parseInt(localStorage.getItem(`hs_${songId}`) ?? '0', 10);
}

export function saveHighScore(songId: string, score: number): void {
  const current = getHighScore(songId);
  if (score > current) localStorage.setItem(`hs_${songId}`, String(score));
}

export function getSongScore(songId: string): number {
  return getHighScore(songId);
}

export function getTotalScore(): number {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('hs_')) total += parseInt(localStorage.getItem(key) ?? '0', 10);
  }
  return total;
}

export function getTotalPlatinums(): number {
  let count = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('medal_') && localStorage.getItem(key) === 'PLATINUM') count++;
  }
  return count;
}

export function getTotalCleared(): number {
  let count = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('medal_') && localStorage.getItem(key) && localStorage.getItem(key) !== '') count++;
  }
  return count;
}

export function getChapterPlatinums(songIds: string[]): number {
  return songIds.filter(id => getMedalForSong(id) === 'PLATINUM').length;
}

export function getChapterCleared(songIds: string[]): number {
  return songIds.filter(id => {
    const m = getMedalForSong(id);
    return m && m !== '';
  }).length;
}

export function saveScoreHistory(songId: string, score: number): void {
  const h = getScoreHistory(songId);
  h.unshift(score);
  localStorage.setItem(`scores_${songId}`, JSON.stringify(h.slice(0, 10)));
}

export function getScoreHistory(songId: string): number[] {
  try { return JSON.parse(localStorage.getItem(`scores_${songId}`) ?? '[]'); }
  catch { return []; }
}
