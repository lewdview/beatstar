export type GameOpts = {
  missSystem: boolean;
  hudMisses: boolean;
  comboDisplay: boolean;
  judgmentText: boolean;
  audioOffset: number;
  laneKeys: [string, string, string];
  laneColors: [string, string, string];
};

export const DEFAULT_OPTS: GameOpts = {
  missSystem: true,
  hudMisses: true,
  comboDisplay: true,
  judgmentText: true,
  audioOffset: 0,
  laneKeys: ["a", "s", "d"],
  laneColors: ["#FF5400", "#4A314D", "#ACE894"],
};

export function loadOpts(): GameOpts {
  const bool = (key: string, def: boolean) =>
    localStorage.getItem(key) === null ? def : localStorage.getItem(key) !== "false";
  return {
    missSystem:   bool("opt_missSystem", true),
    hudMisses:    bool("opt_hudMisses", true),
    comboDisplay: bool("opt_comboDisplay", true),
    judgmentText: bool("opt_judgmentText", true),
    audioOffset:  parseFloat(localStorage.getItem("opt_audioOffset") ?? "0") || 0,
    laneKeys: [
      localStorage.getItem("opt_laneKey_0") ?? DEFAULT_OPTS.laneKeys[0],
      localStorage.getItem("opt_laneKey_1") ?? DEFAULT_OPTS.laneKeys[1],
      localStorage.getItem("opt_laneKey_2") ?? DEFAULT_OPTS.laneKeys[2],
    ],
    laneColors: [
      localStorage.getItem("opt_laneColor_0") ?? DEFAULT_OPTS.laneColors[0],
      localStorage.getItem("opt_laneColor_1") ?? DEFAULT_OPTS.laneColors[1],
      localStorage.getItem("opt_laneColor_2") ?? DEFAULT_OPTS.laneColors[2],
    ],
  };
}

export function saveLaneKey(lane: 0 | 1 | 2, key: string) {
  localStorage.setItem(`opt_laneKey_${lane}`, key);
}

export function saveLaneColor(lane: 0 | 1 | 2, color: string) {
  localStorage.setItem(`opt_laneColor_${lane}`, color);
}

export function resetOpts() {
  Object.keys(localStorage)
    .filter(k => k.startsWith("opt_"))
    .forEach(k => localStorage.removeItem(k));
}

export function keyLabel(rawKey: string): string {
  const arrows: Record<string, string> = {
    ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓",
    " ": "SPC",
  };
  return arrows[rawKey] ?? rawKey.toUpperCase();
}
