import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { getSongById, saveHighScore, isSongTimeLocked } from "@/game/api";
import { saveMedal, saveScoreHistory } from "@/game/progress";
import type { GameSong } from "@/game/api";
import type { Note, JudgmentDisplay, GameState } from "@/game/types";
import { loadOpts, keyLabel, type GameOpts } from "@/lib/options";
import { audioManager } from "@/game/audio";

// ── constants ────────────────────────────────────────────────────
const LANE_COUNT = 3;

// Approach time scales with difficulty: Level 1 = 2.5 s (easy), Level 10 = 1.35 s (brutal)
function approachTime(diffLevel: number): number {
  return Math.max(1.35, 2.5 - (diffLevel - 1) * 0.128);
}
const HIT_RATIO = 0.7;

// Hit windows scale with difficulty — easier = more forgiving
function perfectPlusWindow(diff: number): number {
  // Level 1: 0.060s, Level 10: 0.030s
  return Math.max(0.030, 0.060 - (diff - 1) * 0.0033);
}
function perfectWindow(diff: number): number {
  // Level 1: 0.110s, Level 10: 0.055s
  return Math.max(0.055, 0.110 - (diff - 1) * 0.0061);
}
function goodWindow(diff: number): number {
  // Level 1: 0.190s, Level 10: 0.100s
  return Math.max(0.100, 0.190 - (diff - 1) * 0.010);
}
function missWindow(diff: number): number {
  // Level 1: 0.360s, Level 10: 0.190s
  return Math.max(0.190, 0.360 - (diff - 1) * 0.019);
}

function getDifficultyLaneColor(baseColor: string, _diffLevel: number): string {
  return baseColor;
}

// Perspective highway geometry
const HW_TOP = 0.54;
const HW_BOT = 0.97;

const POWER_UPS = [
  {
    threshold: 20,
    type: "FEVER",
    duration: 9,
    multiplier: 2,
    color: "#E5B800",
    label: "FEVER",
  },
  {
    threshold: 40,
    type: "SURGE",
    duration: 11,
    multiplier: 3,
    color: "#FF1493",
    label: "SURGE",
  },
  {
    threshold: 60,
    type: "SIGNAL_LOCK",
    duration: 14,
    multiplier: 4,
    color: "#39FF14",
    label: "SIGNAL LOCK",
  },
] as const;
type PUType = (typeof POWER_UPS)[number]["type"];

// ── helpers ──────────────────────────────────────────────────────
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function hwAtProgress(p: number, W: number) {
  const w = W * lerp(HW_TOP, HW_BOT, p);
  const l = (W - w) / 2;
  return { left: l, right: l + w, width: w };
}
function laneAt(lane: number, progress: number, W: number) {
  const { left, width } = hwAtProgress(progress, W);
  const lw = width / LANE_COUNT;
  return { x: left + lane * lw, w: lw };
}

function getAccuracy(pp: number, p: number, g: number, m: number) {
  const tot = pp + p + g + m;
  return tot > 0 ? Math.round(((pp + p * 0.9 + g * 0.5) / tot) * 100) : 0;
}
function getMedal(pp: number, p: number, g: number, m: number) {
  const a = getAccuracy(pp, p, g, m);
  return a >= 93
    ? "PLATINUM"
    : a >= 80
      ? "GOLD"
      : a >= 60
        ? "SILVER"
        : a >= 40
          ? "BRONZE"
          : "NONE";
}

// ── rewind sound (Sample based) ──────────────────────────
function playRewindSound() {
  audioManager.playSfx("rewind", 0.8);
}

// ── interfaces ───────────────────────────────────────────────────
interface NoteState {
  note: Note;
  hit: boolean;
  missed: boolean;
  holdActive: boolean;
  holdProgress: number;
  currentLane: number; // For slide notes: tracking which lane the player is currently holding
  originLane: number;  // The lane that started this hold interaction
  visualLane: number;  // For slide notes: tracking smoothly animated visual lane position
}
interface LanePress {
  pressed: boolean;
  touchId?: number;
  isArrow?: string | null;
}
interface PUState {
  active: PUType | null;
  endTime: number;
  startTime: number;
  multiplier: number;
  color: string;
  label: string;
  duration: number;
  triggered: Set<number>;
}
interface HitParticle {
  vx: number;
  vy: number;
  size: number;
}
interface HitEffect {
  lane: number;
  startMs: number;
  cx: number;
  cy: number;
  color: string;
  kind: "PERFECT+" | "PERFECT" | "GOOD" | "SHIELDED";
  particles: HitParticle[];
}
interface AmbientParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
}

// ── component ────────────────────────────────────────────────────
// ── animated score counter ────────────────────────────────────────
function useAnimatedCount(target: number) {
  const [val, setVal] = useState(0);
  const frameRef = useRef(0);
  const baseRef = useRef({ from: 0, to: 0, t0: 0 });
  useEffect(() => {
    cancelAnimationFrame(frameRef.current);
    const from = baseRef.current.to ?? val;
    baseRef.current = { from, to: target, t0: performance.now() };
    const dur = Math.min(250, Math.max(60, Math.abs(target - from) * 0.08));
    const tick = () => {
      const { from, to, t0 } = baseRef.current;
      const pct = Math.min(1, (performance.now() - t0) / dur);
      const ease = 1 - (1 - pct) ** 3;
      setVal(Math.round(from + (to - from) * ease));
      if (pct < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target]);
  return val;
}

// ── game options (shared with /options page via @/lib/options) ────

export default function Game() {
  const { songId } = useParams<{ songId: string }>();
  const [, setLocation] = useLocation();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioOffsetRef = useRef(0);
  const laneColorsRef = useRef<[string, string, string]>(["#FF1493", "#00E5FF", "#39FF14"]);
  const laneKeysRef = useRef<[string, string, string]>(["a", "s", "d"]);
  const rafRef = useRef<number>(0);
  const notesRef = useRef<NoteState[]>([]);
  const laneRef = useRef<LanePress[]>([
    { pressed: false, isArrow: null },
    { pressed: false, isArrow: null },
    { pressed: false, isArrow: null },
  ]);
  const gsRef = useRef<GameState>({
    score: 0,
    combo: 0,
    maxCombo: 0,
    perfectPlus: 0,
    perfects: 0,
    goods: 0,
    misses: 0,
    progress: 0,
  });
  const jRef = useRef<JudgmentDisplay[]>([]);
  const jCounter = useRef(0);
  const songRef = useRef<GameSong | null>(null);
  const phaseRef = useRef<
    | "loading"
    | "buffering"
    | "countdown"
    | "playing"
    | "finished"
    | "continue"
    | "rewinding"
    | "audioError"
  >("loading");
  const puRef = useRef<PUState>({
    active: null,
    endTime: 0,
    startTime: 0,
    multiplier: 1,
    color: "#fff",
    label: "",
    duration: 0,
    triggered: new Set(),
  });
  const hitFxRef = useRef<HitEffect[]>([]);
  const shieldChargesRef = useRef<number>(0);
  const lastMissTimeRef = useRef<number>(0);
  const continueUsedRef = useRef<number>(0); // how many continues the player has used (max 3)
  const coverImgRef = useRef<HTMLImageElement | null>(null);
  const coverBlurRef = useRef<HTMLCanvasElement | null>(null);
  const scanPatternRef = useRef<CanvasPattern | null>(null);
  const lastMedalRef = useRef<string>("NONE");
  const ambientParticlesRef = useRef<AmbientParticle[]>([]);
  const lastFrameTimeRef = useRef<number>(performance.now());
  const medalStampRef = useRef<{ medal: string; startT: number } | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const laneGainsRef = useRef<GainNode[]>([]);
  const laneSilenced = useRef<boolean[]>([false, false, false]);
  const laneRestoreTimers = useRef<ReturnType<typeof setTimeout>[]>(
    [] as ReturnType<typeof setTimeout>[],
  );
  const missCountRef = useRef(0); // misses accumulated this attempt (triggers continue at 3)
  const rewindToRef = useRef(0);
  const rewindAnimRef = useRef<{ wallStart: number; fromT: number; toT: number } | null>(null);
  const drawRef = useRef<(() => void) | null>(null);

  const [phase, setPhase] = useState<typeof phaseRef.current>("loading");
  const [countdown, setCountdown] = useState(3);
  const [displayGs, setDisplayGs] = useState<GameState>(gsRef.current);
  const [displayJudge, setDisplayJudge] = useState<JudgmentDisplay[]>([]);
  const [bufferPct, setBufferPct] = useState(0);
  const [loadMsg, setLoadMsg] = useState("FETCHING TRANSMISSION...");
  const [puDisplay, setPuDisplay] = useState<{
    label: string;
    color: string;
    multiplier: number;
    progress: number;
  } | null>(null);
  const [missCount, setMissCount] = useState(0);
  const [continueCountdown, setContinueCountdown] = useState(10);
  const [opts, setOpts] = useState<GameOpts>(loadOpts);
  const optsRef = useRef(opts);
  useEffect(() => { optsRef.current = opts; }, [opts]);
  // Keep mutable refs current every render so draw/handlers always see latest values
  // without needing to be listed as useCallback dependencies.
  audioOffsetRef.current = opts.audioOffset;
  laneColorsRef.current = opts.laneColors;
  laneKeysRef.current = opts.laneKeys;
  const [showOptions, setShowOptions] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  useEffect(() => {
    // Pre-load all gameplay-critical SFX for zero-latency playback
    audioManager.loadSfx("rewind");
    audioManager.loadSfx("gmeover");
    audioManager.loadSfx("outof_continues");
    audioManager.loadSfx("gameover_countdown");
    audioManager.loadSfx("hidden_secret_found");
    audioManager.loadSfx("song_completion");
    audioManager.loadSfx("select_start_song");
    audioManager.loadSfx("pause_2");
    audioManager.loadSfx("fusion");
  }, []);

  const syncDisplay = useCallback(() => {
    setDisplayGs({ ...gsRef.current });
    setDisplayJudge([...jRef.current]);
  }, []);
  // audioOffset (ms) compensates for speaker latency: subtract it so hits land in time
  // with what the player hears rather than what the audio clock reports.
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);

  const getT = useCallback(() => (audioRef.current?.currentTime ?? 0) - audioOffsetRef.current / 1000, []);

  const calcScore = useCallback(
    (combo: number, j: "PERFECT+" | "PERFECT" | "GOOD") => {
      const pu = puRef.current;
      const puMul = pu.active && getT() < pu.endTime ? pu.multiplier : 1;
      const diff = songRef.current?.difficultyLevel ?? 5;

      let comboMul = 1;
      if (diff <= 3) {
        // LIGHT (Level 1-3): Max 3x
        comboMul = combo < 10 ? 1 : combo < 25 ? 1.5 : combo < 50 ? 2 : 3;
      } else if (diff <= 6) {
        // DARK (Level 4-6): Max 4x
        comboMul = combo < 10 ? 1 : combo < 25 ? 1.5 : combo < 50 ? 2 : combo < 75 ? 3 : 4;
      } else {
        // VOID (Level 7-10): Max 5x
        comboMul = combo < 10 ? 1 : combo < 25 ? 1.5 : combo < 50 ? 2 : combo < 75 ? 3 : combo < 100 ? 4 : 5;
      }

      const base = j === "PERFECT+" ? 500 : j === "PERFECT" ? 300 : 150;
      return Math.round(base * puMul * comboMul);
    },
    [getT],
  );

  const checkPowerUps = useCallback(
    (combo: number) => {
      const pu = puRef.current;
      const t = getT();
      for (const pw of POWER_UPS) {
        if (combo >= pw.threshold && !pu.triggered.has(pw.threshold)) {
          pu.triggered.add(pw.threshold);
          const finalLabel = pw.type === "SIGNAL_LOCK" ? "SIGNAL LOCK (SHIELD x2)" : pw.label;
          Object.assign(pu, {
            active: pw.type,
            endTime: t + pw.duration,
            startTime: t,
            multiplier: pw.multiplier,
            color: pw.color,
            label: finalLabel,
            duration: pw.duration,
          });
          setPuDisplay({
            label: finalLabel,
            color: pw.color,
            multiplier: pw.multiplier,
            progress: 1,
          });
          if (pw.type === "SIGNAL_LOCK") {
            shieldChargesRef.current = 2;
            // Distinct stinger for the defensive shield power-up
            audioManager.playSfx("hidden_secret_found", 0.9);
          } else {
            // Energetic activation for FEVER / SURGE
            audioManager.playSfx("fusion", 0.75);
          }
          break;
        }
      }
    },
    [getT],
  );

  const triggerHitFx = useCallback(
    (lane: number, kind: "PERFECT+" | "PERFECT" | "GOOD" | "SHIELDED") => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const W = canvas.width;
      const H = canvas.height;
      const hitY = H * HIT_RATIO;
      const { x: lx, w: lw } = laneAt(lane, 1, W);
      const cx = lx + lw / 2;
      const color =
        kind === "SHIELDED"
          ? "#00FFDD"
          : getDifficultyLaneColor(laneColorsRef.current[lane], songRef.current?.difficultyLevel ?? 5);

      const count =
        kind === "SHIELDED"
          ? 20
          : kind === "PERFECT+"
            ? 18
            : kind === "PERFECT"
              ? 13
              : 9;

      const particles: HitParticle[] = [];
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * (kind === "SHIELDED" ? 0.4 : 0.6);
        const speed = kind === "SHIELDED" ? 120 + Math.random() * 200 : 90 + Math.random() * 160;
        particles.push({
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - (kind === "SHIELDED" ? 40 : 80),
          size: (kind === "SHIELDED" ? 3 : 2.5) + Math.random() * 4.5,
        });
      }
      hitFxRef.current.push({
        lane,
        startMs: Date.now(),
        cx,
        cy: hitY,
        color,
        kind,
        particles,
      });
    },
    [],
  );

  const muteLane = useCallback((lane: number) => {
    const ctx = audioCtxRef.current;
    const gain = laneGainsRef.current[lane];
    if (!ctx || !gain || laneSilenced.current[lane]) return;
    laneSilenced.current[lane] = true;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 0.12);
    clearTimeout(laneRestoreTimers.current[lane]);
    laneRestoreTimers.current[lane] = setTimeout(() => {
      laneSilenced.current[lane] = false;
      const c = audioCtxRef.current;
      const g = laneGainsRef.current[lane];
      if (!c || !g) return;
      g.gain.cancelScheduledValues(c.currentTime);
      g.gain.setValueAtTime(g.gain.value, c.currentTime);
      g.gain.linearRampToValueAtTime(1.0, c.currentTime + 0.4);
    }, 3500);
  }, []);

  const restoreLane = useCallback((lane: number) => {
    if (!laneSilenced.current[lane]) return;
    laneSilenced.current[lane] = false;
    clearTimeout(laneRestoreTimers.current[lane]);
    const ctx = audioCtxRef.current;
    const gain = laneGainsRef.current[lane];
    if (!ctx || !gain) return;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1.0, ctx.currentTime + 0.25);
  }, []);

  const hitLane = useCallback(
    (lane: number, direction?: Note['swipeDirection']) => {
      if (phaseRef.current !== "playing") return;
      restoreLane(lane);
      const t = getT();
      const candidates = notesRef.current.filter(
        (ns) => ns.note.lane === lane && !ns.hit && !ns.missed,
      );
      if (!candidates.length) return;
      const ns = candidates.reduce((b, c) =>
        Math.abs(c.note.time - t) < Math.abs(b.note.time - t) ? c : b,
      );
      const diff = Math.abs(ns.note.time - t);
      const dl = songRef.current?.difficultyLevel ?? 5;
      if (diff > missWindow(dl)) return;

      // Swipe check
      if (ns.note.type === "swipe") {
        if (!direction || ns.note.swipeDirection !== direction) return;
      } else if (direction) {
        // If it's not a swipe note, but we got a swipe input, we still allow it as a tap
        // unless it's specifically a hold note start.
      }

      const isFever = puRef.current.active === "FEVER" && t < puRef.current.endTime;
      let j: "PERFECT+" | "PERFECT" | "GOOD" | null =
        diff <= perfectPlusWindow(dl)
          ? "PERFECT+"
          : diff <= perfectWindow(dl)
            ? "PERFECT"
            : diff <= goodWindow(dl)
              ? "GOOD"
              : null;
      if (j === "PERFECT" && isFever) {
        j = "PERFECT+";
      }
      if (!j) return;

      if (ns.note.type === "hold") {
        ns.holdActive = true;
        ns.currentLane = lane;
        ns.originLane = lane;
      } else ns.hit = true;

      const gs = gsRef.current;
      gs.score += calcScore(gs.combo, j);
      gs.combo++;
      gs.maxCombo = Math.max(gs.maxCombo, gs.combo);
      if (j === "PERFECT+") {
        gs.perfectPlus++;
        audioManager.playSfx("tap_nav", 0.15);
      }
      else if (j === "PERFECT") {
        gs.perfects++;
        audioManager.playSfx("tap_nav", 0.12);
      }
      else {
        gs.goods++;
        audioManager.playSfx("tap_nav", 0.1);
      }
      checkPowerUps(gs.combo);

      jRef.current = [
        ...jRef.current.filter((x) => Date.now() - x.ts < 600),
        { type: j, lane, id: ++jCounter.current, ts: Date.now() },
      ];

      // ── Hit explosion effect ──
      triggerHitFx(lane, j);

      syncDisplay();
    },
    [getT, calcScore, checkPowerUps, syncDisplay, restoreLane, triggerHitFx],
  );

  const releaseLane = useCallback(
    (lane: number) => {
      if (phaseRef.current !== "playing") return;
      const isSurge = puRef.current.active === "SURGE" && getT() < puRef.current.endTime;
      if (isSurge) return;
      const ns = notesRef.current.find(
        (n) =>
          n.note.type === "hold" &&
          n.holdActive &&
          n.currentLane === lane &&
          !n.hit,
      );
      if (!ns) return;

      // If it's a slide note, it must end in the targetLane
      if (ns.note.targetLane !== undefined && ns.currentLane !== ns.note.targetLane) {
        const isSignalLock = puRef.current.active === "SIGNAL_LOCK" && getT() < puRef.current.endTime && shieldChargesRef.current > 0;
        if (isSignalLock) {
          shieldChargesRef.current--;
          const activeLabel = `SIGNAL LOCK (SHIELD x${shieldChargesRef.current})`;
          puRef.current.label = activeLabel;
          setPuDisplay((prev) => prev ? { ...prev, label: activeLabel } : null);
          if (shieldChargesRef.current <= 0) {
            puRef.current.endTime = 0;
            puRef.current.active = null;
            setPuDisplay(null);
          }
          audioManager.playSfx("tap_nav", 0.35);
          triggerHitFx(ns.currentLane, "SHIELDED");

          // Treat as HIT with GOOD
          ns.hit = true;
          ns.holdActive = false;
          const gs = gsRef.current;
          gs.score += calcScore(gs.combo, "GOOD");
          gs.combo++;
          gs.maxCombo = Math.max(gs.maxCombo, gs.combo);
          gs.goods++;
          checkPowerUps(gs.combo);
          jRef.current = [
            ...jRef.current.filter((x) => Date.now() - x.ts < 600),
            { type: "SHIELDED", lane: ns.currentLane, id: ++jCounter.current, ts: Date.now() },
          ];
          syncDisplay();
          return;
        } else {
          // Did not finish the slide
          ns.holdActive = false;
          ns.missed = true;
          const gsx = gsRef.current;
          gsx.combo = 0;
          gsx.misses++;
          // Deactivate power up on combo break
          puRef.current.active = null;
          puRef.current.endTime = 0;
          setPuDisplay(null);
          puRef.current.triggered.clear();

          muteLane(ns.note.lane);
          syncDisplay();
          return;
        }
      }

      ns.hit = true;
      ns.holdActive = false;
      if (ns.holdProgress > 0.6) {
        const gs = gsRef.current;
        gs.score += calcScore(gs.combo, "PERFECT+");
        gs.combo++;
        gs.maxCombo = Math.max(gs.maxCombo, gs.combo);
        gs.perfectPlus++;
        checkPowerUps(gs.combo);
        jRef.current = [
          ...jRef.current.filter((x) => Date.now() - x.ts < 600),
          { type: "PERFECT+", lane: ns.currentLane, id: ++jCounter.current, ts: Date.now() },
        ];
      }
      syncDisplay();
    },
    [calcScore, checkPowerUps, syncDisplay, muteLane, triggerHitFx],
  );

  const moveHold = useCallback(
    (fromLane: number, toLane: number) => {
      if (phaseRef.current !== "playing") return;
      const ns = notesRef.current.find(
        (n) =>
          n.note.type === "hold" &&
          n.holdActive &&
          n.currentLane === fromLane &&
          !n.hit,
      );
      if (!ns) return;

      // Move the interaction to the new lane if it's a slide note
      if (ns.note.targetLane !== undefined && toLane === ns.note.targetLane) {
        ns.currentLane = toLane;
        audioManager.playSfx("hidden_secret_found", 0.3);

        // ── Slide success particle effect ──
        const canvas = canvasRef.current;
        if (canvas) {
          const W = canvas.width;
          const H = canvas.height;
          const hitY = H * HIT_RATIO;
          const { x: lx, w: lw } = laneAt(toLane, 1, W);
          const cx = lx + lw / 2;
          const lc = getDifficultyLaneColor(laneColorsRef.current[toLane], songRef.current?.difficultyLevel ?? 5);
          const particles: HitParticle[] = [];
          for (let i = 0; i < 6; i++) {
            const angle = (Math.random() - 0.5) * Math.PI;
            const speed = 40 + Math.random() * 60;
            particles.push({
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed - 20,
              size: 2 + Math.random() * 3,
            });
          }
          hitFxRef.current.push({
            lane: toLane,
            startMs: Date.now(),
            cx,
            cy: hitY,
            color: lc,
            kind: "GOOD", // Use GOOD kind for a subtler effect
            particles,
          });
        }
      }
    },
    [],
  );

  const finishGame = useCallback((failed = false) => {
    if (phaseRef.current === "finished") return;
    phaseRef.current = "finished";
    setPhase("finished");
    cancelAnimationFrame(rafRef.current);
    audioRef.current?.pause();
    audioRef.current && (audioRef.current.currentTime = 0);

    const gs = gsRef.current;
    // Medal calculated on complete/clear, even if continues were used
    const continuesUsed = continueUsedRef.current;
    const medal = failed ? "NONE" : getMedal(gs.perfectPlus, gs.perfects, gs.goods, gs.misses);

    if (!failed) {
      audioManager.playSfx("song_completion", 0.8);
    }

    // Save progress with error handling
    try {
      if (songRef.current && !failed) {
        saveHighScore(songRef.current.id, gs.score);
        saveMedal(songRef.current.id, medal);
        saveScoreHistory(songRef.current.id, gs.score);
      }

      sessionStorage.setItem(
        `result_${songId}`,
        JSON.stringify({
          score: gs.score,
          maxCombo: gs.maxCombo,
          perfectPlus: gs.perfectPlus,
          perfects: gs.perfects,
          goods: gs.goods,
          misses: gs.misses,
          medal,
          total: gs.perfectPlus + gs.perfects + gs.goods + gs.misses,
          failed,
          continuesUsed,
        }),
      );
    } catch (err) {
      console.error("Failed to save game results:", err);
    }

    // Shorter delay for a snappier transition to results
    setTimeout(() => {
      setLocation(`/results/${songId}`);
    }, 300);
  }, [songId, setLocation]);

  const doAbandon = useCallback(() => {
    if (phaseRef.current === "finished") return;
    phaseRef.current = "finished";
    cancelAnimationFrame(rafRef.current);
    audioRef.current?.pause();
    audioRef.current && (audioRef.current.currentTime = 0);
    const origin = sessionStorage.getItem(`game_origin_${songId}`) ?? '';
    const dest = origin === 'songs' ? '/songs' : origin ? `/${origin}` : '/campaign';
    setTimeout(() => setLocation(dest), 100);
  }, [songId, setLocation]);

  const doReturn = useCallback(() => {
    playRewindSound();
    continueUsedRef.current++;

    // Stop any existing draw loop first
    cancelAnimationFrame(rafRef.current);

    const audio = audioRef.current;
    const rewindTo = rewindToRef.current;
    const fromT = audio?.currentTime ?? (rewindTo + 2.5);

    // Arm the backwards animation — draw loop reads this to compute fake time
    rewindAnimRef.current = { wallStart: performance.now(), fromT, toT: rewindTo };

    // Reset miss counter immediately (pips clear visually)
    missCountRef.current = 0;
    lastMissTimeRef.current = 0;
    setMissCount(0);

    // Start the rewind render loop NOW so highway plays backwards
    phaseRef.current = "rewinding";
    setPhase("rewinding");
    rafRef.current = requestAnimationFrame(() => drawRef.current?.());

    // After the 1.2 s animation: restore notes, seek audio, resume
    setTimeout(() => {
      if (phaseRef.current !== "rewinding") return; // guard against double-fire
      cancelAnimationFrame(rafRef.current);

      // Undo misses that happened in the rewind window
      notesRef.current.forEach((ns) => {
        if (ns.missed && ns.note.time >= rewindTo - 0.5) {
          ns.missed = false;
          gsRef.current.misses = Math.max(0, gsRef.current.misses - 1);
        }
        // Also reset any hold notes that were in-flight
        if (ns.holdActive && ns.note.time >= rewindTo - 0.5) {
          ns.holdActive = false;
          ns.holdProgress = 0;
        }
      });
      gsRef.current.combo = 0;
      [0, 1, 2].forEach(restoreLane);
      rewindAnimRef.current = null;

      if (audio) {
        audio.currentTime = rewindTo;
        audio.play().catch(() => {});
      }

      phaseRef.current = "playing";
      setPhase("playing");
      rafRef.current = requestAnimationFrame(() => drawRef.current?.());
    }, 1200);
  }, [restoreLane]);

  // Auto-abandon countdown while continue screen is visible
  useEffect(() => {
    if (phase !== "continue") return;
    setContinueCountdown(10);
    // Play the tense countdown loop once on entry
    audioManager.playSfx("gameover_countdown", 0.55);
    let count = 10;
    const id = setInterval(() => {
      count--;
      setContinueCountdown(count);
      if (count <= 0) {
        clearInterval(id);
        finishGame();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [phase, finishGame]);

  // ═══════════════════════════════════════════════════════════════
  //  DRAW LOOP
  // ═══════════════════════════════════════════════════════════════
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const phase = phaseRef.current;
    if (!canvas || (phase !== "playing" && phase !== "rewinding") || pausedRef.current) return;
    const ctx = canvas.getContext("2d");
    if (!ctx || !songRef.current) return;
    const song = songRef.current;
    const isRewinding = phase === "rewinding";
    let t: number;
    if (isRewinding && rewindAnimRef.current) {
      const { wallStart, fromT, toT } = rewindAnimRef.current;
      const elapsed = (performance.now() - wallStart) / 1000;
      const p = Math.min(1, elapsed / 1.2);
      const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      t = fromT - (fromT - toT) * eased;
    } else {
      t = getT();
    }
    const W = canvas.width;
    const H = canvas.height;
    const pulse = 0.5 + 0.5 * Math.sin(t * 10); // 1.6Hz pulse for polish
    const AT = approachTime(song.difficultyLevel);
    const hitY = H * HIT_RATIO;
    const gs = gsRef.current;
    const pu = puRef.current;
    gs.progress = Math.min(1, t / song.duration);

    // Power-up display sync
    if (pu.active && t < pu.endTime) {
      setPuDisplay({
        label: pu.label,
        color: pu.color,
        multiplier: pu.multiplier,
        progress: (pu.endTime - t) / pu.duration,
      });
    } else if (pu.active && t >= pu.endTime) {
      pu.active = null;
      setPuDisplay(null);
    }

    const puActive = !!(pu.active && t < pu.endTime);
    const puColor = puActive ? pu.color : null;

    // ── 1. BACKGROUND ──────────────────────────────────────────
    // Canvas is transparent — CSS cover art layer shows through beneath everything
    ctx.clearRect(0, 0, W, H);

    // Save context for entire frame drawing (supports global translations / shake)
    ctx.save();

    // Ambient particles update & draw
    const now = performance.now();
    const frameDt = Math.min(0.1, (now - lastFrameTimeRef.current) / 1000);
    lastFrameTimeRef.current = now;

    const diffLevel = song.difficultyLevel;
    const isVoid = diffLevel >= 7;
    const speedFactor = diffLevel <= 3 ? 0.6 : diffLevel <= 6 ? 1.0 : 1.5;
    const particleColor = diffLevel <= 3 ? "#00FFDD" : diffLevel <= 6 ? "#39FF14" : "#FF1493";

    ctx.save();
    for (const p of ambientParticlesRef.current) {
      // update positions
      p.x += p.vx * frameDt * speedFactor;
      p.y += p.vy * frameDt * speedFactor;

      // wrap boundaries
      if (p.y < 0) {
        p.y = H;
        p.x = Math.random() * W;
      }
      if (p.x < 0 || p.x > W) {
        p.x = Math.random() * W;
      }

      ctx.fillStyle = particleColor;
      ctx.globalAlpha = p.alpha * (0.3 + 0.7 * Math.sin(t * 3 + p.x));
      ctx.shadowColor = particleColor;
      ctx.shadowBlur = diffLevel >= 7 ? 8 : 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Glitch/Shake viewport if VOID and high combo / power-up active
    let shakeX = 0;
    let shakeY = 0;
    if (isVoid && (puActive || gs.combo >= 40)) {
      if (Math.random() < 0.28) {
        shakeX = (Math.random() - 0.5) * 3.8;
        shakeY = (Math.random() - 0.5) * 3.8;
      }
    }
    if (shakeX !== 0 || shakeY !== 0) {
      ctx.translate(shakeX, shakeY);
    }

    // Full-screen effects (vignette, mood, scanlines) are now CSS overlays on the
    // outer wrapper — they cover the entire viewport uniformly so no column seam appears.

    const hwTop = hwAtProgress(0, W);
    const hwBot = hwAtProgress(1, W);

    // ── 2. LANE TRACK SURFACE ───────────────────────────────────
    // Hill crest: the top edge of the highway arcs upward (above screen) like cresting a hill.
    const hillCx = W / 2;
    const hillCy = -hitY * 0.09; // control point above the viewport
    const hillBow = W * 0.032; // how far rails bow outward at the shoulder
    const bowY = hitY * 0.28; // where the shoulder bow peaks

    ctx.save();
    ctx.beginPath();
    // Top edge as upward arc (hill crest silhouette)
    ctx.moveTo(hwTop.left, 0);
    ctx.quadraticCurveTo(hillCx, hillCy, hwTop.right, 0);
    ctx.lineTo(hwBot.right, hitY);
    ctx.lineTo(hwBot.left, hitY);
    ctx.closePath();
    ctx.clip();

    // Track surface: deep gradient for depth
    const trackGrad = ctx.createLinearGradient(0, 0, 0, hitY);
    trackGrad.addColorStop(0, "#08081a");
    trackGrad.addColorStop(0.35, "#0c0c22");
    trackGrad.addColorStop(0.7, "#10102a");
    trackGrad.addColorStop(1, "#141430");
    ctx.fillStyle = trackGrad;
    ctx.fillRect(0, 0, W, hitY);

    // Per-lane colored tint (very subtle accent under each lane)
    for (let i = 0; i < LANE_COUNT; i++) {
      const { x: lx0, w: lw0 } = laneAt(i, 0.3, W);
      const { x: lx1, w: lw1 } = laneAt(i, 1, W);
      const lc = getDifficultyLaneColor(laneColorsRef.current[i], songRef.current?.difficultyLevel ?? 5);
      const lcR = parseInt(lc.slice(1, 3), 16);
      const lcG = parseInt(lc.slice(3, 5), 16);
      const lcB = parseInt(lc.slice(5, 7), 16);
      const laneGrad = ctx.createLinearGradient(0, 0, 0, hitY);
      laneGrad.addColorStop(0, "transparent");
      laneGrad.addColorStop(0.6, `rgba(${lcR},${lcG},${lcB},0.03)`);
      laneGrad.addColorStop(1, `rgba(${lcR},${lcG},${lcB},0.07)`);
      ctx.fillStyle = laneGrad;
      ctx.beginPath();
      ctx.moveTo(lx0, hitY * 0.3);
      ctx.lineTo(lx0 + lw0, hitY * 0.3);
      ctx.lineTo(lx1 + lw1, hitY);
      ctx.lineTo(lx1, hitY);
      ctx.closePath();
      ctx.fill();
    }

    // Scrolling speed-lines — rushing forward effect per lane
    const speedCycle = hitY * 0.18;
    const speedOff = (t * 0.8 * hitY) % speedCycle;
    for (let row = -1; row < 8; row++) {
      const sy1 = speedOff + row * speedCycle;
      const sy2 = sy1 + speedCycle * 0.35;
      if (sy2 < 0 || sy1 > hitY) continue;
      const sp1 = Math.max(0, Math.min(1, sy1 / hitY));
      const sp2 = Math.max(0, Math.min(1, sy2 / hitY));
      const { left: sl1, right: sr1 } = hwAtProgress(sp1, W);
      const { left: sl2, right: sr2 } = hwAtProgress(sp2, W);
      const speedAlpha = 0.012 + sp1 * 0.04;
      ctx.fillStyle = `rgba(255,248,235,${speedAlpha})`;
      ctx.beginPath();
      ctx.moveTo(sl1, sy1);
      ctx.lineTo(sr1, sy1);
      ctx.lineTo(sr2, sy2);
      ctx.lineTo(sl2, sy2);
      ctx.closePath();
      ctx.fill();
    }

    // Subtle perspective horizontal grid lines
    for (let row = 0; row <= 16; row++) {
      const ry = (row / 16) * hitY;
      const rp = ry / hitY;
      const { left, right } = hwAtProgress(rp, W);
      ctx.strokeStyle = `rgba(255,248,235,${0.01 + rp * 0.025})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left, ry);
      ctx.lineTo(right, ry);
      ctx.stroke();
    }

    // Lane groove dividers — double-line with glow
    for (let l = 1; l < LANE_COUNT; l++) {
      const topPos = laneAt(l, 0, W);
      const botPos = laneAt(l, 1, W);
      // Dark groove
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(topPos.x, 0);
      ctx.lineTo(botPos.x, hitY);
      ctx.stroke();
      // Subtle glow line
      const divGrad = ctx.createLinearGradient(0, 0, 0, hitY);
      divGrad.addColorStop(0, "rgba(255,255,255,0.0)");
      divGrad.addColorStop(0.5, "rgba(255,255,255,0.08)");
      divGrad.addColorStop(1, "rgba(255,255,255,0.14)");
      ctx.strokeStyle = divGrad;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(topPos.x + 1.5, 0);
      ctx.lineTo(botPos.x + 1.5, hitY);
      ctx.stroke();
    }

    // ── HIT LINE BEAM ── neon horizontal bar at the hit zone
    const beamGrad = ctx.createLinearGradient(hwBot.left, 0, hwBot.right, 0);
    const beamColor = puColor ?? "rgba(255,248,235,0.7)";
    const beamPulse = 0.7 + 0.3 * Math.sin(t * 6);
    beamGrad.addColorStop(0, "transparent");
    beamGrad.addColorStop(0.15, beamColor);
    beamGrad.addColorStop(0.5, "rgba(255,255,255,0.9)");
    beamGrad.addColorStop(0.85, beamColor);
    beamGrad.addColorStop(1, "transparent");
    ctx.globalAlpha = beamPulse * 0.45;
    ctx.fillStyle = beamGrad;
    ctx.fillRect(hwBot.left, hitY - 2, hwBot.right - hwBot.left, 4);
    // Bloom glow under the beam
    ctx.globalAlpha = beamPulse * 0.12;
    ctx.shadowColor = puColor ?? "#fff";
    ctx.shadowBlur = 20;
    ctx.fillRect(hwBot.left, hitY - 1, hwBot.right - hwBot.left, 2);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";

    ctx.restore();

    // ── 3. TRACK EDGE RAILS ─────────────────────────────────────
    // Neon rails with strong glow
    const railColor = puColor ?? "rgba(255,248,235,0.55)";
    const railGlow = puColor ? `${puColor}CC` : "rgba(255,248,235,0.25)";

    // Outer glow pass (thicker, blurred)
    ctx.save();
    ctx.shadowColor = puColor ?? "rgba(255,248,235,0.4)";
    ctx.shadowBlur = 16;
    const railGlowGrad = ctx.createLinearGradient(0, 0, 0, hitY);
    railGlowGrad.addColorStop(0, "rgba(255,255,255,0.0)");
    railGlowGrad.addColorStop(0.3, railGlow);
    railGlowGrad.addColorStop(1, railColor);
    ctx.strokeStyle = railGlowGrad;
    ctx.lineWidth = 3;
    // Left rail
    ctx.beginPath();
    ctx.moveTo(hwTop.left, 0);
    ctx.quadraticCurveTo(hwTop.left - hillBow, bowY, hwBot.left, hitY);
    ctx.stroke();
    // Right rail
    ctx.beginPath();
    ctx.moveTo(hwTop.right, 0);
    ctx.quadraticCurveTo(hwTop.right + hillBow, bowY, hwBot.right, hitY);
    ctx.stroke();
    ctx.restore();

    // Inner bright core
    const railCoreGrad = ctx.createLinearGradient(0, 0, 0, hitY);
    railCoreGrad.addColorStop(0, "rgba(255,255,255,0.0)");
    railCoreGrad.addColorStop(0.5, "rgba(255,255,255,0.3)");
    railCoreGrad.addColorStop(1, "rgba(255,255,255,0.6)");
    ctx.strokeStyle = railCoreGrad;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hwTop.left, 0);
    ctx.quadraticCurveTo(hwTop.left - hillBow, bowY, hwBot.left, hitY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hwTop.right, 0);
    ctx.quadraticCurveTo(hwTop.right + hillBow, bowY, hwBot.right, hitY);
    ctx.stroke();

    // ── 4. POWER-UP SCREEN EDGE GLOW ───────────────────────────
    if (puActive && puColor) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 7);
      const ei = Math.min(1, (pu.endTime - t) / 2) * pulse * 0.7;
      const hex = Math.round(ei * 200)
        .toString(16)
        .padStart(2, "0");
      const eg1 = ctx.createLinearGradient(0, 0, 80, 0);
      eg1.addColorStop(0, `${puColor}${hex}`);
      eg1.addColorStop(1, "transparent");
      ctx.fillStyle = eg1;
      ctx.fillRect(0, 0, 80, H);
      const eg2 = ctx.createLinearGradient(W, 0, W - 80, 0);
      eg2.addColorStop(0, `${puColor}${hex}`);
      eg2.addColorStop(1, "transparent");
      ctx.fillStyle = eg2;
      ctx.fillRect(W - 80, 0, 80, H);
    }

    // ── 4.5. HIT ZONE BUTTONS (behind notes, semi-transparent) ──
    // Original height (space below hit line), centered so baseline bisects each button.
    const btnH = H - hitY;
    const btnY = hitY - btnH / 2; // baseline runs through the exact center
    // Clip to track width so buttons never overflow the highway edges
    ctx.save();
    ctx.beginPath();
    ctx.rect(hwBot.left, 0, hwBot.right - hwBot.left, H);
    ctx.clip();
    for (let i = 0; i < LANE_COUNT; i++) {
      const { x, w } = laneAt(i, 1, W);
      const pressed = laneRef.current[i].pressed;
      const lc = getDifficultyLaneColor(laneColorsRef.current[i], songRef.current?.difficultyLevel ?? 5);
      const silenced = laneSilenced.current[i];
      const bx = x + 4;
      const bw = w - 8;
      const bTop = btnY + (pressed ? 2 : 0);

      // Calculate themed difficulty hue
      const diffLvl = songRef.current?.difficultyLevel ?? 5;
      const diffColor = diffLvl <= 3 ? "#00FFDD" : diffLvl >= 7 ? "#FF1493" : "#39FF14";
      const r = parseInt(diffColor.slice(1, 3), 16);
      const g = parseInt(diffColor.slice(3, 5), 16);
      const b = parseInt(diffColor.slice(5, 7), 16);

      // Key body — semi-transparent ivory tinted with difficulty hue
      const kGrad = ctx.createLinearGradient(bx, bTop, bx, bTop + btnH);
      if (pressed) {
        kGrad.addColorStop(0, "rgba(210,203,191,0.52)");
        kGrad.addColorStop(0.66, "rgba(210,203,191,0.52)");
        kGrad.addColorStop(1, `rgba(${r},${g},${b},0.48)`);
      } else {
        kGrad.addColorStop(0, "rgba(255,252,245,0.32)");
        kGrad.addColorStop(0.66, "rgba(252,248,238,0.24)");
        kGrad.addColorStop(1, `rgba(${r},${g},${b},0.18)`);
      }
      ctx.fillStyle = kGrad;
      ctx.beginPath();
      ctx.roundRect(bx, bTop, bw, btnH, 10);
      ctx.fill();

      // Subtle border — tinted with difficulty hue
      ctx.strokeStyle = pressed
        ? `rgba(${r},${g},${b},0.55)`
        : `rgba(${r},${g},${b},0.22)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(bx, bTop, bw, btnH, 10);
      ctx.stroke();

      // Colored stripe — centered exactly on hitY
      const stripeH = Math.max(5, btnH * 0.06);
      const stripeTop = hitY - stripeH / 2 + (pressed ? 1 : 0);
      const stripeCol = silenced ? "rgba(70,68,65,0.55)" : lc;
      ctx.shadowColor = silenced ? "transparent" : lc;
      ctx.shadowBlur = pressed ? 18 : 10;
      ctx.fillStyle = stripeCol;
      ctx.globalAlpha = pressed ? 0.95 : silenced ? 0.35 : 0.78;
      ctx.beginPath();
      ctx.roundRect(bx + 4, stripeTop, bw - 8, stripeH, stripeH * 0.4);
      ctx.fill();
      // Bright core
      ctx.fillStyle = silenced ? "rgba(50,48,45,0.3)" : "rgba(255,255,255,0.5)";
      ctx.globalAlpha = pressed ? 0.75 : 0.55;
      ctx.beginPath();
      ctx.roundRect(
        bx + 7,
        stripeTop + stripeH * 0.15,
        bw - 14,
        stripeH * 0.38,
        stripeH * 0.2,
      );
      ctx.fill();

      // ── Inner radial glow (Beatstar style) ──
      if (pressed || !silenced) {
        ctx.save();
        const lcR2 = parseInt(lc.slice(1, 3), 16);
        const lcG2 = parseInt(lc.slice(3, 5), 16);
        const lcB2 = parseInt(lc.slice(5, 7), 16);
        const rg = ctx.createRadialGradient(bx + bw / 2, hitY, 0, bx + bw / 2, hitY, bw * 0.8);
        const rgAlpha = pressed ? 0.38 : 0.14 + pulse * 0.04;
        rg.addColorStop(0, `rgba(${lcR2},${lcG2},${lcB2},${rgAlpha})`);
        rg.addColorStop(1, `rgba(${lcR2},${lcG2},${lcB2},0)`);
        ctx.fillStyle = rg;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.roundRect(bx, bTop, bw, btnH, 10);
        ctx.fill();
        ctx.restore();
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";

      // Key label — below the baseline (lower half of key)
      const fs = Math.max(12, Math.floor(btnH * 0.13));
      ctx.fillStyle = pressed ? "rgba(50,45,40,0.7)" : "rgba(42,37,32,0.45)";
      ctx.font = `bold ${fs}px "Space Mono", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        keyLabel(laneKeysRef.current[i]),
        x + w / 2,
        hitY + (H - hitY) * 0.42 + (pressed ? 2 : 0),
      );

      // Muted overlay + ⊘ icon
      if (silenced) {
        ctx.fillStyle = "rgba(0,0,0,0.32)";
        ctx.beginPath();
        ctx.roundRect(bx, bTop, bw, btnH, 10);
        ctx.fill();
        const iconR = Math.min(bw, btnH) * 0.07;
        const iconX = bx + bw * 0.78;
        const iconY = hitY + (H - hitY) * 0.22;
        ctx.strokeStyle = "rgba(180,70,70,0.65)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(iconX, iconY, iconR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(iconX - iconR * 0.7, iconY + iconR * 0.7);
        ctx.lineTo(iconX + iconR * 0.7, iconY - iconR * 0.7);
        ctx.stroke();
      }
    }
    ctx.restore(); // end button clip

    // ── 5. NOTES ────────────────────────────────────────────────
    let dirty = false;
    for (const ns of notesRef.current) {
      if (ns.hit) continue;
      if (!isRewinding && ns.missed) continue;
      const { note } = ns;
      const lc = getDifficultyLaneColor(laneColorsRef.current[note.lane], songRef.current?.difficultyLevel ?? 5);
      const spawnT = note.time - AT;
      const prog = (t - spawnT) / AT;
      const noteY = prog * hitY;

      if (ns.visualLane === undefined) {
        ns.visualLane = ns.currentLane;
      }
      if (Math.abs(ns.visualLane - ns.currentLane) > 0.001) {
        ns.visualLane = lerp(ns.visualLane, ns.currentLane, 0.18);
      } else {
        ns.visualLane = ns.currentLane;
      }

      const isSurge = puRef.current.active === "SURGE" && t < puRef.current.endTime;
      if (note.type === "hold" && !ns.hit && !ns.missed && !ns.holdActive && isSurge && t >= note.time) {
        ns.holdActive = true;
        ns.currentLane = note.lane;
        ns.originLane = note.lane;
        audioManager.playSfx("tap_nav", 0.12);
      }

      if (ns.holdActive) {
        ns.holdProgress = Math.min(
          1,
          (t - note.time) / (note.holdDuration || 0.5),
        );
        if (isSurge && note.targetLane !== undefined) {
          ns.currentLane = note.lane + (note.targetLane - note.lane) * ns.holdProgress;
        }
      }

      if (ns.holdActive && ns.holdProgress >= 1 && isSurge) {
        ns.hit = true;
        ns.holdActive = false;
        const gs = gsRef.current;
        gs.score += calcScore(gs.combo, "PERFECT+");
        gs.combo++;
        gs.maxCombo = Math.max(gs.maxCombo, gs.combo);
        gs.perfectPlus++;
        checkPowerUps(gs.combo);
        jRef.current = [
          ...jRef.current.filter((x) => Date.now() - x.ts < 600),
          { type: "PERFECT+", lane: ns.currentLane, id: ++jCounter.current, ts: Date.now() },
        ];
        dirty = true;
      }

      // Miss detection — skip entirely during rewind (notes travel backwards; no new misses)
      if (!isRewinding && phaseRef.current === "playing") {
        const MW = missWindow(songRef.current?.difficultyLevel ?? 5);
        const isMissed =
          (note.type === "tap" && !ns.holdActive && t > note.time + MW) ||
          (note.type === "swipe" && t > note.time + MW) ||
          (note.type === "hold" && !ns.holdActive && t > note.time + MW);

        if (isMissed) {
          const isSignalLock = puRef.current.active === "SIGNAL_LOCK" && t < puRef.current.endTime && shieldChargesRef.current > 0;
          if (isSignalLock) {
            shieldChargesRef.current--;
            const activeLabel = `SIGNAL LOCK (SHIELD x${shieldChargesRef.current})`;
            puRef.current.label = activeLabel;
            setPuDisplay((prev) => prev ? { ...prev, label: activeLabel } : null);
            if (shieldChargesRef.current <= 0) {
              puRef.current.endTime = 0;
              puRef.current.active = null;
              setPuDisplay(null);
            }
            audioManager.playSfx("tap_nav", 0.35);
            triggerHitFx(note.lane, "SHIELDED");

            ns.hit = true;
            const gsx = gsRef.current;
            gsx.score += calcScore(gsx.combo, "GOOD");
            gsx.combo++;
            gsx.maxCombo = Math.max(gsx.maxCombo, gsx.combo);
            gsx.goods++;
            checkPowerUps(gsx.combo);
            jRef.current = [
              ...jRef.current.filter((x) => Date.now() - x.ts < 600),
              {
                type: "SHIELDED",
                lane: note.lane,
                id: ++jCounter.current,
                ts: Date.now(),
              },
            ];
            dirty = true;
            syncDisplay();
          } else {
            ns.missed = true;
            const gsx = gsRef.current;
            gsx.combo = 0;
            gsx.misses++;
            // Deactivate power up on combo break
            puRef.current.active = null;
            puRef.current.endTime = 0;
            setPuDisplay(null);
            puRef.current.triggered.clear();

            jRef.current = [
              ...jRef.current.filter((x) => Date.now() - x.ts < 600),
              {
                type: "MISS",
                lane: note.lane,
                id: ++jCounter.current,
                ts: Date.now(),
              },
            ];
            muteLane(note.lane);
            dirty = true;
            const now = Date.now();
            if (now - lastMissTimeRef.current > 350) {
              missCountRef.current++;
              lastMissTimeRef.current = now;
            }
            setMissCount(missCountRef.current);
            syncDisplay();
            if (missCountRef.current >= 3 && optsRef.current.missSystem) {
              const audio = audioRef.current;
              if (audio) {
                rewindToRef.current = Math.max(0, audio.currentTime - 2.5);
                audio.pause();
              }
              cancelAnimationFrame(rafRef.current);
              if (continueUsedRef.current >= 3) {
                // All continues exhausted — play the out-of-continues sting then fail
                audioManager.playSfx("outof_continues", 0.85);
                finishGame(true);
              } else {
                phaseRef.current = "continue";
                setPhase("continue");
                audioManager.playSfx("gmeover", 0.7);
              }
              return;
            }
          }
          continue;
        }
      }
      if (noteY < -80) continue;

      const { x: lx, w: lw } = laneAt(note.lane, prog, W);
      const noteH = lerp(22, 54, prog); // perspective scale — bigger closer
      const noteX = lx + 7;
      const noteW = lw - 14;
      const r = noteH * 0.32;

      if (note.type === "tap" || note.type === "swipe") {
        drawKey(ctx, noteX, noteY, noteW, noteH, r, lc, prog, false, note.swipeDirection);
      } else {
        // Hold/Slide trail — ivory ribbon with colored stripe
        const holdDur = note.holdDuration || 0.5;
        const headP = Math.max(0, prog - holdDur / AT);
        const headY = headP * hitY;

        // Determine lanes for trail rendering
        const startLane = note.lane;
        const endLane = note.targetLane !== undefined ? note.targetLane : note.lane;

        if (ns.holdActive) {
          const top = lerp(headY, hitY, ns.holdProgress);
          if (noteY > top) {
            // Determine lanes for the active trail segment
            const { x: hx, w: hw } = laneAt(endLane, headP, W);
            const { x: ax, w: aw } = laneAt(ns.visualLane, Math.min(prog, 1), W);
            const midY = (top + noteY) / 2;

            // Trail body (Curved to player's current lane)
            ctx.fillStyle = "rgba(245,240,228,0.22)";
            ctx.beginPath();
            ctx.moveTo(hx + hw * 0.25, top);
            ctx.lineTo(hx + hw * 0.75, top);
            ctx.quadraticCurveTo(ax + aw * 0.75, midY, ax + aw * 0.75, noteY + noteH / 2);
            ctx.lineTo(ax + aw * 0.25, noteY + noteH / 2);
            ctx.quadraticCurveTo(ax + aw * 0.25, midY, hx + hw * 0.25, top);
            ctx.fill();

            // Parse lane color to RGB for proper alpha compositing
            const lcR = parseInt(lc.slice(1, 3), 16);
            const lcG = parseInt(lc.slice(3, 5), 16);
            const lcB = parseInt(lc.slice(5, 7), 16);

            // ── ELECTRIC LIGHTNING ARCS ──
            const waveCount = 5;
            const trailLen = noteY - top;
            if (trailLen > 20) {
              ctx.save();
              ctx.shadowColor = lc;
              ctx.shadowBlur = 18;
              for (let i = 0; i < waveCount; i++) {
                const t_wave = (i + (t * 2.5) % 1) / waveCount;
                const wy = lerp(top + 6, noteY - 6, t_wave);
                const waveP = lerp(headP, Math.min(prog, 1), t_wave);
                const waveLane = lerp(endLane, ns.visualLane, t_wave);
                const { x: wx, w: ww } = laneAt(waveLane, waveP, W);
                const centerX = wx + ww * 0.5;
                const amp = ww * 0.25 * (0.5 + 0.5 * Math.sin(t * 10 + i * 2.1));
                const flicker = 0.4 + 0.6 * Math.abs(Math.sin(t * 18 + i * 3.7));

                // Main lightning arc
                ctx.strokeStyle = `rgba(${lcR},${lcG},${lcB},${flicker})`;
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.moveTo(centerX - amp, wy - 6);
                ctx.bezierCurveTo(
                  centerX + amp * 1.2, wy - 2,
                  centerX - amp * 0.8, wy + 4,
                  centerX + amp * 0.6, wy + 10
                );
                ctx.stroke();

                // Bright white core
                ctx.strokeStyle = `rgba(255,255,255,${flicker * 0.5})`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(centerX - amp * 0.6, wy - 4);
                ctx.bezierCurveTo(
                  centerX + amp * 0.8, wy,
                  centerX - amp * 0.5, wy + 3,
                  centerX + amp * 0.4, wy + 8
                );
                ctx.stroke();
              }
              ctx.restore();
            }

            // Colored stripe (Curved) with glow
            ctx.fillStyle = lc;
            ctx.globalAlpha = 0.65;
            ctx.shadowColor = lc;
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.moveTo(hx + hw * 0.38, top);
            ctx.lineTo(hx + hw * 0.62, top);
            ctx.quadraticCurveTo(ax + aw * 0.62, midY, ax + aw * 0.62, noteY + noteH / 2);
            ctx.lineTo(ax + aw * 0.38, noteY + noteH / 2);
            ctx.quadraticCurveTo(ax + aw * 0.38, midY, hx + hw * 0.38, top);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;
            ctx.shadowColor = "transparent";

            // ── Slide direction arrow indicator at the hit line ──
            if (note.targetLane !== undefined && Math.abs(ns.visualLane - note.targetLane) > 0.05) {
              const arrowDir = note.targetLane > ns.visualLane ? 1 : -1;
              const arrowX = ax + aw * 0.5 + arrowDir * aw * 0.35;
              const arrowY = noteY;
              const arrowPulse = 0.5 + 0.5 * Math.sin(t * 8);
              ctx.save();
              ctx.globalAlpha = 0.6 + arrowPulse * 0.4;
              ctx.fillStyle = lc;
              ctx.shadowColor = lc;
              ctx.shadowBlur = 12;
              ctx.beginPath();
              ctx.moveTo(arrowX + arrowDir * 12, arrowY);
              ctx.lineTo(arrowX - arrowDir * 4, arrowY - 8);
              ctx.lineTo(arrowX - arrowDir * 4, arrowY + 8);
              ctx.closePath();
              ctx.fill();
              ctx.restore();
            }
          }
        } else if (headY < noteY) {
          // Inactive trail — SMOOTH CURVE if it's a slide
          const { x: hx, w: hw } = laneAt(endLane, headP, W);
          const { x: tx, w: tw } = laneAt(startLane, prog, W);

          const midY = (headY + noteY) / 2;

          // Outer glow pulse for slide notes
          const isSlide = note.targetLane !== undefined;
          if (isSlide) {
            const glowPulse = 0.12 + 0.06 * Math.sin(t * 5);
            ctx.fillStyle = `rgba(245,240,228,${glowPulse})`;
            ctx.beginPath();
            ctx.moveTo(hx + hw * 0.18, headY);
            ctx.lineTo(hx + hw * 0.82, headY);
            ctx.quadraticCurveTo(tx + tw * 0.82, midY, tx + tw * 0.82, noteY + noteH / 2);
            ctx.lineTo(tx + tw * 0.18, noteY + noteH / 2);
            ctx.quadraticCurveTo(tx + tw * 0.18, midY, hx + hw * 0.18, headY);
            ctx.fill();
          }

          ctx.fillStyle = "rgba(245,240,228,0.18)";
          ctx.beginPath();
          ctx.moveTo(hx + hw * 0.25, headY);
          ctx.lineTo(hx + hw * 0.75, headY);
          ctx.quadraticCurveTo(tx + tw * 0.75, midY, tx + tw * 0.75, noteY + noteH / 2);
          ctx.lineTo(tx + tw * 0.25, noteY + noteH / 2);
          ctx.quadraticCurveTo(tx + tw * 0.25, midY, hx + hw * 0.25, headY);
          ctx.fill();

          // Colored center ribbon (curved)
          ctx.fillStyle = lc;
          ctx.globalAlpha = 0.5;
          ctx.shadowColor = lc;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.moveTo(hx + hw * 0.38, headY);
          ctx.lineTo(hx + hw * 0.62, headY);
          ctx.quadraticCurveTo(tx + tw * 0.62, midY, tx + tw * 0.62, noteY + noteH / 2);
          ctx.lineTo(tx + tw * 0.38, noteY + noteH / 2);
          ctx.quadraticCurveTo(tx + tw * 0.38, midY, hx + hw * 0.38, headY);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.shadowBlur = 0;
          ctx.shadowColor = "transparent";

          // ── Slide direction arrow at the tail (destination indicator) ──
          if (isSlide && note.targetLane !== undefined) {
            const arrowDir = note.targetLane > startLane ? 1 : -1;
            const arrowX = tx + tw * 0.5 + arrowDir * tw * 0.3;
            const arrowY2 = noteY - 2;
            const arrowPulse2 = 0.4 + 0.3 * Math.sin(t * 6);
            ctx.save();
            ctx.globalAlpha = arrowPulse2;
            ctx.fillStyle = lc;
            ctx.shadowColor = lc;
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.moveTo(arrowX + arrowDir * 10, arrowY2);
            ctx.lineTo(arrowX - arrowDir * 5, arrowY2 - 7);
            ctx.lineTo(arrowX - arrowDir * 5, arrowY2 + 7);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
        }
        drawKey(ctx, noteX, noteY, noteW, noteH, r, lc, prog, true, note.swipeDirection);
      }
    }

    // ── 5b. HIT EXPLOSION EFFECTS ───────────────────────────────
    const FX_DURATION = 520;
    const nowMs = Date.now();
    hitFxRef.current = hitFxRef.current.filter(
      (e) => nowMs - e.startMs < FX_DURATION,
    );
    for (const e of hitFxRef.current) {
      const t01 = (nowMs - e.startMs) / FX_DURATION; // 0→1
      const dt = (nowMs - e.startMs) / 1000; // seconds
      const easeOut = 1 - t01;

      // ─ Lane flash: bright overlay on the key area fading fast ─
      if (t01 < 0.18) {
        const flashAlpha =
          (1 - t01 / 0.18) * (e.kind === "PERFECT+" ? 0.55 : 0.35);
        const { x: fx, w: fw } = laneAt(e.lane, 1, W);
        const flashGrad = ctx.createLinearGradient(
          fx,
          e.cy - 60,
          fx,
          e.cy + 40,
        );
        flashGrad.addColorStop(0, `${e.color}00`);
        flashGrad.addColorStop(
          0.4,
          `${e.color}${Math.round(flashAlpha * 255)
            .toString(16)
            .padStart(2, "0")}`,
        );
        flashGrad.addColorStop(
          1,
          `${e.color}${Math.round(flashAlpha * 0.5 * 255)
            .toString(16)
            .padStart(2, "0")}`,
        );
        ctx.fillStyle = flashGrad;
        ctx.fillRect(fx + 4, e.cy - 60, fw - 8, 100);
      }

      // ─ Expanding rings ─
      const rings = e.kind === "PERFECT+" ? 2 : 1;
      for (let r = 0; r < rings; r++) {
        const delay = r * 0.08;
        const rt = Math.max(0, (t01 - delay) / (1 - delay));
        if (rt <= 0) continue;
        const maxR = e.kind === "PERFECT+" ? (r === 0 ? 60 : 85) : 52;
        const ringR = rt * maxR;
        const ringAlpha = Math.pow(1 - rt, 1.6) * (r === 0 ? 0.9 : 0.55);
        const ringW = lerp(r === 0 ? 5 : 3, 0.5, rt);
        ctx.save();
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 10;
        ctx.strokeStyle =
          e.color +
          Math.round(ringAlpha * 255)
            .toString(16)
            .padStart(2, "0");
        ctx.lineWidth = ringW;
        ctx.beginPath();
        ctx.arc(e.cx, e.cy, ringR, 0, Math.PI * 2);
        ctx.stroke();
        // White inner core ring (only first ring, very brief)
        if (r === 0 && t01 < 0.2) {
          const coreAlpha = (1 - t01 / 0.2) * 0.6;
          ctx.strokeStyle = `rgba(255,255,255,${coreAlpha})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(e.cx, e.cy, ringR * 0.45, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      // ─ Particles ─
      ctx.save();
      for (const p of e.particles) {
        const px = e.cx + p.vx * dt;
        const py = e.cy + p.vy * dt + 180 * dt * dt; // gravity
        const life = Math.max(0, 1 - t01 * 1.4);
        const size = p.size * (0.3 + 0.7 * (1 - t01));
        ctx.shadowColor = e.color;
        ctx.shadowBlur = size * 2.5;
        ctx.fillStyle =
          e.color +
          Math.round(life * 255)
            .toString(16)
            .padStart(2, "0");
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";

      // ─ PERFECT+ sparkle stars ─
      if (e.kind === "PERFECT+" && t01 < 0.6) {
        const starCount = 5;
        for (let s = 0; s < starCount; s++) {
          const angle = (s / starCount) * Math.PI * 2 + t01 * 2.5;
          const dist = 30 + t01 * 55;
          const sx = e.cx + Math.cos(angle) * dist;
          const sy = e.cy + Math.sin(angle) * dist;
          const starAlpha = Math.pow(1 - t01 / 0.6, 1.4) * 0.85;
          const starSize = lerp(5, 1.5, t01 / 0.6);
          ctx.strokeStyle =
            "#fff" +
            Math.round(starAlpha * 255)
              .toString(16)
              .padStart(2, "0");
          ctx.lineWidth = 1.5;
          ctx.shadowColor = "#fff";
          ctx.shadowBlur = 6;
          // 4-point star (two crossed lines)
          ctx.beginPath();
          ctx.moveTo(sx - starSize, sy);
          ctx.lineTo(sx + starSize, sy);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(sx, sy - starSize);
          ctx.lineTo(sx, sy + starSize);
          ctx.stroke();
        }
      }
      ctx.restore();
      void easeOut; // suppress unused warning
    }

    // ── 6. HIT ZONE BASELINE ────────────────────────────────────
    // Thick white glowing baseline — the stripe on the note must line up with this
    ctx.shadowColor = "rgba(255,255,255,0.8)";
    ctx.shadowBlur = 18;
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(hwBot.left - 16, hitY);
    ctx.lineTo(hwBot.right + 16, hitY);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
    // Subtle glow bloom below baseline — pulses with rhythm
    const bloomH = 20 + pulse * 12;
    const baseGlow = ctx.createLinearGradient(0, hitY, 0, hitY + bloomH);
    baseGlow.addColorStop(0, `rgba(255,255,255,${0.08 + pulse * 0.06})`);
    baseGlow.addColorStop(1, "rgba(255,255,255,0.0)");
    ctx.fillStyle = baseGlow;
    ctx.fillRect(hwBot.left - 16, hitY, hwBot.width + 32, bloomH);

    // ── 7. MEDAL PROGRESS METER ─────────────────────────────────
    const MEDAL_STOPS = [
      { name: "BRONZE", acc: 40, color: "#CD7F32" },
      { name: "SILVER", acc: 60, color: "#C0C0C0" },
      { name: "GOLD", acc: 80, color: "#FFD700" },
      { name: "PLATINUM", acc: 93, color: "#E0E0FF" },
    ];
    const MEDAL_COLOR_MAP: Record<string, string> = {
      BRONZE: "#CD7F32",
      SILVER: "#C0C0C0",
      GOLD: "#FFD700",
      PLATINUM: "#E0E0FF",
      NONE: "#444",
    };
    const { perfectPlus: pp, perfects: pfp, goods: gd, misses: ms } = gs;
    const tot = pp + pfp + gd + ms;
    const acc = tot > 0 ? ((pp + pfp * 0.9 + gd * 0.5) / tot) * 100 : 0;
    const curMedal =
      acc >= 93
        ? "PLATINUM"
        : acc >= 80
          ? "GOLD"
          : acc >= 60
            ? "SILVER"
            : acc >= 40
              ? "BRONZE"
              : "NONE";

    // Trigger stamp on new medal
    if (curMedal !== "NONE" && curMedal !== lastMedalRef.current) {
      lastMedalRef.current = curMedal;
      medalStampRef.current = { medal: curMedal, startT: t };
    }

    // Bar geometry — thin strip at very bottom
    const bPad = 14;
    const bH = 7;
    const bY = H - bH - 8;
    const bX = bPad;
    const bW = W - bPad * 2;

    // Track bg
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath();
    ctx.roundRect(bX, bY, bW, bH, bH / 2);
    ctx.fill();

    // Filled portion
    const fillFrac = Math.min(acc / 93, 1);
    if (fillFrac > 0) {
      const fW = bW * fillFrac;
      const fg = ctx.createLinearGradient(bX, 0, bX + bW, 0);
      fg.addColorStop(0, "#CD7F32");
      fg.addColorStop(0.43, "#C0C0C0");
      fg.addColorStop(0.72, "#FFD700");
      fg.addColorStop(1, "#E0E0FF");
      ctx.shadowColor = MEDAL_COLOR_MAP[curMedal];
      ctx.shadowBlur = 10;
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.roundRect(bX, bY, fW, bH, bH / 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";
      // Sheen highlight
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.beginPath();
      ctx.roundRect(bX, bY, fW, bH * 0.45, [bH / 2, bH / 2, 0, 0]);
      ctx.fill();
    }

    // Medal threshold ticks + labels
    for (const ms2 of MEDAL_STOPS) {
      const mx = bX + bW * (ms2.acc / 93);
      const achieved = fillFrac >= ms2.acc / 93;
      ctx.strokeStyle = achieved ? ms2.color : "rgba(100,100,100,0.5)";
      ctx.lineWidth = achieved ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(mx, bY - 5);
      ctx.lineTo(mx, bY + bH + 5);
      ctx.stroke();
      ctx.font = `bold 7px "Space Mono", monospace`;
      ctx.fillStyle = achieved ? ms2.color : "rgba(100,100,100,0.5)";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(ms2.name[0], mx, bY - 7);
    }

    // Medal stamp animation
    const stamp = medalStampRef.current;
    if (stamp) {
      const elapsed = t - stamp.startT;
      if (elapsed > 1.6) {
        medalStampRef.current = null;
      } else {
        const t01 = elapsed / 1.6;
        let scale: number;
        let alpha: number;
        if (t01 < 0.18) {
          // Smash in: huge → normal
          const inT = t01 / 0.18;
          scale = 2.6 - 1.6 * (1 - Math.pow(1 - inT, 2.5));
          alpha = 1;
        } else if (t01 < 0.72) {
          // Hold with triple bounce
          scale =
            1 + 0.08 * Math.abs(Math.sin(((t01 - 0.18) / 0.54) * Math.PI * 3));
          alpha = 1;
        } else {
          // Fade out
          scale = 1;
          alpha = 1 - (t01 - 0.72) / 0.28;
        }
        const mc = MEDAL_COLOR_MAP[stamp.medal] ?? "#fff";
        const scx = W / 2;
        const scy = H * 0.36;
        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.translate(scx, scy);
        ctx.scale(scale, scale);
        // Glow halo
        ctx.shadowColor = mc;
        ctx.shadowBlur = 36;
        const sw = 230;
        const sh = 68;
        ctx.fillStyle = "rgba(8,8,12,0.82)";
        ctx.beginPath();
        ctx.roundRect(-sw / 2, -sh / 2, sw, sh, 10);
        ctx.fill();
        ctx.shadowBlur = 0;
        // Border
        ctx.strokeStyle = mc;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(-sw / 2, -sh / 2, sw, sh, 10);
        ctx.stroke();
        // ★ MEDAL NAME ★
        ctx.fillStyle = mc;
        ctx.font = `bold 26px "Space Mono", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`★ ${stamp.medal} ★`, 0, -8);
        // Sub-label
        ctx.font = `bold 10px "Space Mono", monospace`;
        ctx.fillStyle = "rgba(255,255,255,0.65)";
        ctx.fillText("MEDAL UNLOCKED", 0, 18);
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }

    if (dirty) syncDisplay();

    // ── lives indicator ──────────────────────────────────────────
    {
      const dotSize = 11;
      const dotGap = 6;
      const totalW = 3 * dotSize + 2 * dotGap;
      const startX = W - totalW - 18;
      const dotY = hitY - 32;
      for (let i = 0; i < 3; i++) {
        const active = i < missCountRef.current; // filled = miss accumulated
        ctx.save();
        ctx.globalAlpha = active ? 0.88 : 0.15;
        ctx.fillStyle = "#FF1493";
        ctx.shadowBlur = active ? 14 : 0;
        ctx.shadowColor = "#FF1493";
        ctx.fillRect(
          startX + i * (dotSize + dotGap),
          dotY - dotSize / 2,
          dotSize,
          dotSize,
        );
        ctx.restore();
      }
    }

    // Restore context for entire frame drawing
    ctx.restore();

    // ── end check — ONLY during playing phase ──
    // Never trigger during rewind or continue. The continue screen's auto-abandon
    // timer calls finishGame independently if the player doesn't act.
    if (phaseRef.current === "playing" && !isRewinding) {
      const audio = audioRef.current;
      const allDone = notesRef.current.every((ns) => ns.hit || ns.missed);
      const lastT = notesRef.current.length
        ? Math.max(...notesRef.current.map((ns) => ns.note.time))
        : 0;

      // Only treat audio as "ended" if it naturally finished (not paused for rewind)
      const audioEnded = audio ? audio.ended : false;

      if ((allDone && t > lastT + 1.2) || audioEnded || t >= song.duration) {
        finishGame();
        return;
      }
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [getT, syncDisplay, finishGame, muteLane]);

  // Keep drawRef current so doReturn can schedule the loop without a circular dep
  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  // ── keyboard ──
  const keysDownRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const key = e.key;
      keysDownRef.current.add(key);

      // ── Diagonal detection from arrow keys ──
      const isUp = keysDownRef.current.has("ArrowUp");
      const isDown = keysDownRef.current.has("ArrowDown");
      const isLeft = keysDownRef.current.has("ArrowLeft");
      const isRight = keysDownRef.current.has("ArrowRight");

      let swipeDir: Note['swipeDirection'] | undefined;
      if (isUp && isLeft) swipeDir = 'up-left';
      else if (isUp && isRight) swipeDir = 'up-right';
      else if (isDown && isLeft) swipeDir = 'down-left';
      else if (isDown && isRight) swipeDir = 'down-right';
      else if (isUp) swipeDir = 'up';
      else if (isDown) swipeDir = 'down';
      else if (isLeft) swipeDir = 'left';
      else if (isRight) swipeDir = 'right';

      // ── Numpad detection ──
      if (key === "7") swipeDir = 'up-left';
      else if (key === "9") swipeDir = 'up-right';
      else if (key === "1") swipeDir = 'down-left';
      else if (key === "3") swipeDir = 'down-right';
      else if (key === "8") swipeDir = 'up';
      else if (key === "2") swipeDir = 'down';
      else if (key === "4") swipeDir = 'left';
      else if (key === "6") swipeDir = 'right';

      if (swipeDir) {
        // For keyboard swipes, we apply it to the currently pressed lane
        // or all lanes if no lane key is held? 
        // Beatstar usually has swipes on specific lanes.
        // We'll look for a swipe note in any lane at this time.
        const t = getT();
        const cand = notesRef.current.find(n =>
          !n.hit && !n.missed && n.note.type === 'swipe' &&
          n.note.swipeDirection === swipeDir &&
          Math.abs(n.note.time - t) < missWindow(songRef.current?.difficultyLevel ?? 5)
        );
        if (cand) {
          hitLane(cand.note.lane, swipeDir);
          return;
        }

        // If it's an arrow-only press (left/right) and we are holding a slide, move it
        if (key === "ArrowLeft" || key === "ArrowRight") {
          for (let i = 0; i < LANE_COUNT; i++) {
            if (laneRef.current[i].pressed) {
              const activeHold = notesRef.current.find(
                (n) => n.note.type === "hold" && n.holdActive && n.currentLane === i && !n.hit
              );
              let nextLane: number;
              if (activeHold && activeHold.note.targetLane !== undefined) {
                const toRight = key === "ArrowRight";
                const isTargetInDirection = toRight
                  ? activeHold.note.targetLane > i
                  : activeHold.note.targetLane < i;
                nextLane = isTargetInDirection ? activeHold.note.targetLane : (toRight ? i + 1 : i - 1);
              } else {
                nextLane = key === "ArrowLeft" ? i - 1 : i + 1;
              }

              if (nextLane >= 0 && nextLane < LANE_COUNT) {
                laneRef.current[i].pressed = false;
                laneRef.current[nextLane].pressed = true;
                laneRef.current[nextLane].isArrow = key;
                moveHold(i, nextLane);
              }
            }
          }
          return;
        }
      }

      const lane = laneKeysRef.current.indexOf(key === " " ? " " : key.toLowerCase());
      if (lane < 0) return;

      // ── Check if there is an active hold/slide note that needs to transition to this lane ──
      const activeHold = notesRef.current.find(
        (n) =>
          n.note.type === "hold" &&
          n.holdActive &&
          n.note.targetLane === lane &&
          n.currentLane !== lane &&
          !n.hit
      );
      if (activeHold) {
        const prevLaneIdx = Math.round(activeHold.currentLane);
        if (laneRef.current[prevLaneIdx]) {
          laneRef.current[prevLaneIdx].pressed = false;
        }
        laneRef.current[lane].pressed = true;
        laneRef.current[lane].isArrow = null;
        moveHold(activeHold.currentLane, lane);
        return;
      }

      laneRef.current[lane].pressed = true;
      laneRef.current[lane].isArrow = null;
      hitLane(lane);
    };
    const onUp = (e: KeyboardEvent) => {
      keysDownRef.current.delete(e.key);
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        for (let i = 0; i < LANE_COUNT; i++) {
          if (laneRef.current[i].isArrow === e.key) {
            laneRef.current[i].pressed = false;
            laneRef.current[i].isArrow = null;
            releaseLane(i);
          }
        }
        return;
      }

      const lane = laneKeysRef.current.indexOf(e.key === " " ? " " : e.key.toLowerCase());
      if (lane < 0) return;
      laneRef.current[lane].pressed = false;
      releaseLane(lane);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [hitLane, releaseLane, moveHold, getT]);

  const touchStartPos = useRef<Record<number, { x: number, y: number, lane: number }>>({});

  // ── Gesture Lock (Prevent mobile browser back/forward swipe) ──
  useEffect(() => {
    const wrapper = canvasWrapperRef.current;
    if (!wrapper) return;

    const handlePrevent = (e: TouchEvent) => {
      // Only prevent default during active gameplay to stop pull-to-refresh/swipe-nav.
      // During 'continue', 'loading', 'paused' etc., allow normal touch→click synthesis
      // so that buttons (Continue, Abandon, etc.) work on mobile.
      const p = phaseRef.current;
      if ((p === 'playing' || p === 'rewinding') && e.cancelable) {
        e.preventDefault();
      }
    };

    // Use native listener with passive: false to ensure preventDefault() works
    wrapper.addEventListener('touchstart', handlePrevent, { passive: false });
    wrapper.addEventListener('touchmove', handlePrevent, { passive: false });
    wrapper.addEventListener('touchend', handlePrevent, { passive: false });

    return () => {
      wrapper.removeEventListener('touchstart', handlePrevent);
      wrapper.removeEventListener('touchmove', handlePrevent);
      wrapper.removeEventListener('touchend', handlePrevent);
    };
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const lane = Math.floor(
          ((touch.clientX - rect.left) / rect.width) * LANE_COUNT,
        );
        if (lane >= 0 && lane < LANE_COUNT) {
          laneRef.current[lane].pressed = true;
          laneRef.current[lane].touchId = touch.identifier;
          touchStartPos.current[touch.identifier] = { x: touch.clientX, y: touch.clientY, lane };
          hitLane(lane);
        }
      }
    },
    [hitLane],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const newLane = Math.floor(
          ((touch.clientX - rect.left) / rect.width) * LANE_COUNT,
        );

        // Swipe detection while moving
        const start = touchStartPos.current[touch.identifier];
        if (start) {
          const dx = touch.clientX - start.x;
          const dy = touch.clientY - start.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 30) {
            // Determine 8-way direction
            const angle = Math.atan2(dy, dx); // -PI to PI
            const dirs: Note['swipeDirection'][] = [
              'right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right'
            ];
            // Normalize angle to 0..2PI and map to 8 buckets
            let normAngle = angle;
            if (normAngle < 0) normAngle += Math.PI * 2;
            const bucket = Math.round(normAngle / (Math.PI / 4)) % 8;
            const swipeDir = dirs[bucket];

            // Only trigger if we haven't already swiped for this touch?
            // Actually, for multiple swipes it's tricky.
            // Let's see if there's a swipe note to hit
            const t = getT();
            const cand = notesRef.current.find(n =>
              !n.hit && !n.missed && n.note.type === 'swipe' &&
              n.note.swipeDirection === swipeDir &&
              n.note.lane === start.lane &&
              Math.abs(n.note.time - t) < missWindow(songRef.current?.difficultyLevel ?? 5)
            );
            if (cand) {
              hitLane(start.lane, swipeDir);
              // Reset start pos so we don't double-trigger
              start.x = touch.clientX;
              start.y = touch.clientY;
            }
          }
        }

        if (newLane >= 0 && newLane < LANE_COUNT) {
          for (let l = 0; l < LANE_COUNT; l++) {
            if (laneRef.current[l].touchId === touch.identifier && l !== newLane) {
              laneRef.current[l].pressed = false;
              laneRef.current[l].touchId = undefined;
              laneRef.current[newLane].pressed = true;
              laneRef.current[newLane].touchId = touch.identifier;
              if (start) start.lane = newLane;
              moveHold(l, newLane);
              break;
            }
          }
        }
      }
    },
    [moveHold, getT, hitLane],
  );

  const releaseTouchById = useCallback(
    (identifier: number) => {
      delete touchStartPos.current[identifier];
      for (let lane = 0; lane < LANE_COUNT; lane++) {
        if (laneRef.current[lane].touchId === identifier) {
          laneRef.current[lane].pressed = false;
          laneRef.current[lane].touchId = undefined;
          releaseLane(lane);
        }
      }
    },
    [releaseLane],
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        releaseTouchById(e.changedTouches[i].identifier);
      }
    },
    [releaseTouchById],
  );

  const onTouchCancel = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        releaseTouchById(e.changedTouches[i].identifier);
      }
    },
    [releaseTouchById],
  );

  // ── canvas resize — useLayoutEffect so dimensions are set before first paint ──
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = canvasWrapperRef.current;
    if (!canvas || !wrapper) return;
    const sync = () => {
      const W = wrapper.clientWidth;
      const H = wrapper.clientHeight;
      // Only reassign when dimensions actually changed — setting canvas.width/height
      // always clears the canvas and resets the 2D context, causing visible flicker.
      if (W > 0 && H > 0 && (canvas.width !== W || canvas.height !== H)) {
        canvas.width = W;
        canvas.height = H;
      }
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, []);

  // ── init ──
  useEffect(() => {
    if (!songId) {
      setLocation("/songs");
      return;
    }
    let cancelled = false;
    let audio: HTMLAudioElement | null = null;

    const init = async () => {
      setLoadMsg("FETCHING TRANSMISSION...");
      phaseRef.current = "loading";
      setPhase("loading");
      const song = await getSongById(songId);
      const origin = sessionStorage.getItem(`game_origin_${songId}`) ?? '';
      const originRoute = origin === 'songs' ? '/songs' : origin ? `/${origin}` : '/campaign';
      if (cancelled || !song) {
        setLocation(originRoute);
        return;
      }
      
      // Reset pause state on new song load
      pausedRef.current = false;
      setPaused(false);
      if (isSongTimeLocked(song)) {
        setLocation(originRoute);
        return;
      }
      songRef.current = song;
      // Apply difficulty override set by SongDetail page
      const diffOverrideNum = parseInt(sessionStorage.getItem(`diff_override_${songId}`) ?? '', 10);
      if (!isNaN(diffOverrideNum) && diffOverrideNum >= 1 && diffOverrideNum <= 10) {
        songRef.current.difficultyLevel = diffOverrideNum;
      }
      // Initialize ambient particles depending on difficulty
      const diffLvl = songRef.current.difficultyLevel;
      const partCount = diffLvl <= 3 ? 8 : diffLvl <= 6 ? 12 : 18;
      const ambientParts: AmbientParticle[] = [];
      for (let i = 0; i < partCount; i++) {
        ambientParts.push({
          x: Math.random() * 800,
          y: Math.random() * 600,
          vx: (Math.random() - 0.5) * (diffLvl <= 3 ? 15 : diffLvl <= 6 ? 30 : 55),
          vy: -30 - Math.random() * (diffLvl <= 3 ? 20 : diffLvl <= 6 ? 40 : 80),
          size: 1.5 + Math.random() * 2.5,
          alpha: 0.12 + Math.random() * 0.38,
        });
      }
      ambientParticlesRef.current = ambientParts;
      // Pre-load + pre-blur cover art for background effect
      coverImgRef.current = null;
      coverBlurRef.current = null;
      scanPatternRef.current = null;
      if (song.coverArt) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          coverImgRef.current = img;
          const off = document.createElement("canvas");
          off.width = 512;
          off.height = 512;
          const offCtx = off.getContext("2d")!;
          offCtx.filter = "blur(10px) brightness(0.52) saturate(1.5)";
          offCtx.drawImage(img, -24, -24, 560, 560);
          offCtx.filter = "none";
          coverBlurRef.current = off;
        };
        img.src = song.coverArt;
      }
      notesRef.current = song.notes.map((n, idx) => {
        let note = { ...n, lane: Math.min(n.lane, LANE_COUNT - 1) };
        const diff = songRef.current?.difficultyLevel ?? 5;

        // ── Mechanic gating by difficulty ──

        // Swipe notes only at Normal+ (Level 4+)
        if (diff < 4 && note.type === 'swipe') {
          note.type = 'tap';
          note.swipeDirection = undefined;
        }

        // Lane-change holds (slides) only at Hard+ (Level 7+)
        if (diff < 7 && note.type === 'hold' && note.targetLane !== undefined) {
          note.targetLane = undefined;
          note.swipeDirection = undefined;
        }

        // Dual notes (same time, different lane) only at Level 5+
        // For lower difficulties, drop the second note of a dual pair
        if (diff < 5 && idx > 0) {
          const prev = song.notes[idx - 1];
          if (prev && Math.abs(prev.time - note.time) < 0.01 && prev.lane !== note.lane) {
            // This is the second note of a dual — skip it at low difficulty
            return null;
          }
        }

        // Shorten holds at easy difficulties so they're less punishing
        if (diff <= 3 && note.type === 'hold' && note.holdDuration) {
          note.holdDuration = Math.min(note.holdDuration, 0.8);
        }

        return {
          note,
          hit: false,
          missed: false,
          holdActive: false,
          holdProgress: 0,
          currentLane: note.lane,
          originLane: note.lane,
          visualLane: note.lane,
        };
      }).filter((ns): ns is NonNullable<typeof ns> => ns !== null);

      // ── Note thinning for easy difficulties (rhythm-aware temporal filtering) ──
      const dLevel = songRef.current?.difficultyLevel ?? 5;
      if (dLevel <= 2) {
        let lastTime = -999;
        notesRef.current = notesRef.current.filter(ns => {
          if (ns.note.time - lastTime < 0.38) {
            return false; // drop notes closer than 380ms (e.g. rapid taps)
          }
          lastTime = ns.note.time;
          return true;
        });
      } else if (dLevel === 3) {
        let lastTime = -999;
        notesRef.current = notesRef.current.filter(ns => {
          if (ns.note.time - lastTime < 0.28) {
            return false; // drop notes closer than 280ms
          }
          lastTime = ns.note.time;
          return true;
        });
      }
      gsRef.current = {
        score: 0,
        combo: 0,
        maxCombo: 0,
        perfectPlus: 0,
        perfects: 0,
        goods: 0,
        misses: 0,
        progress: 0,
      };
      puRef.current = {
        active: null,
        endTime: 0,
        startTime: 0,
        multiplier: 1,
        color: "#fff",
        label: "",
        duration: 0,
        triggered: new Set(),
      };
      shieldChargesRef.current = 0;
      lastMissTimeRef.current = 0;
      continueUsedRef.current = 0;
      missCountRef.current = 0;
      setMissCount(0);

      setLoadMsg("BUFFERING AUDIO...");
      phaseRef.current = "buffering";
      setPhase("buffering");
      audio = new Audio();
      audio.crossOrigin = "anonymous";
      audio.preload = "auto";
      audioRef.current = audio;
      audio.addEventListener("progress", () => {
        if (!audio?.duration) return;
        const buf = audio.buffered;
        if (buf.length)
          setBufferPct(
            Math.min(
              100,
              Math.round((buf.end(buf.length - 1) / audio.duration) * 100),
            ),
          );
      });
      audio.src = song.audioUrl;
      audio.load();
      await new Promise<void>((resolve) => {
        if (audio!.readyState >= 3) {
          resolve();
          return;
        }
        audio!.addEventListener("canplay", () => resolve(), { once: true });
        audio!.addEventListener("error", () => resolve(), { once: true });
        setTimeout(resolve, 15000);
      });
      if (cancelled) return;

      // ── Audio unlock (mobile autoplay policy) ─────────────────────────────
      // Browsers expire the "user gesture" freshness within ~1s. By the time
      // the 3-second countdown finishes, calling audio.play() cold will throw
      // NotAllowedError on iOS/Safari. Warm up the element NOW (still close
      // to the navigation gesture) with a silent play→pause so the element is
      // already "unlocked" when we call play() for real after the countdown.
      try {
        await audio!.play();
        audio!.pause();
        audio!.currentTime = 0;
      } catch {
        // Warm-up blocked; we'll try to play for real after countdown and
        // surface a TAP TO START recovery screen if it fails again.
      }
      if (cancelled) return;

      phaseRef.current = "countdown";
      setPhase("countdown");
      let count = 3;
      setCountdown(count);
      audioManager.playSfx('countdown', 0.7);
      await new Promise<void>((resolve) => {
        const tick = setInterval(() => {
          count--;
          if (count > 0) {
            setCountdown(count);
            audioManager.playSfx('countdown', 0.7);
          }
          else {
            clearInterval(tick);
            setCountdown(0);
            // "GO!" stinger
            audioManager.playSfx('select_start_song', 0.8);
            resolve();
          }
        }, 1000);
      });
      if (cancelled) return;

      phaseRef.current = "playing";
      setPhase("playing");

      // ── Web Audio frequency-band routing ──────────────────────
      // Lane 0 (A) → bass  · Lane 1 (S) → mids  · Lane 2 (D) → treble
      try {
        const actx = new AudioContext({ latencyHint: 'interactive' });
        audioCtxRef.current = actx;
        await actx.resume();
        const src = actx.createMediaElementSource(audio);
        const bandDefs: { type: BiquadFilterType; freq: number; Q: number }[] =
          [
            { type: "lowpass", freq: 300, Q: 0.8 },
            { type: "bandpass", freq: 1200, Q: 0.7 },
            { type: "highpass", freq: 3200, Q: 0.8 },
          ];
        laneGainsRef.current = bandDefs.map(({ type, freq, Q }) => {
          const f = actx.createBiquadFilter();
          f.type = type;
          f.frequency.value = freq;
          f.Q.value = Q;
          const g = actx.createGain();
          g.gain.value = 1.0;
          src.connect(f);
          f.connect(g);
          g.connect(actx.destination);
          return g;
        });
        laneSilenced.current = [false, false, false];
      } catch {
        // CORS or browser restriction — fall back to direct playback (no muting)
      }

      // ── Canvas dimension safety net ────────────────────────────────────────
      // useLayoutEffect sets canvas dims synchronously, but in rare cases the
      // flex layout resolves after the effect fires (e.g. first cold load on
      // mobile). Force-sync here, right before the draw loop starts, so the
      // highway is never invisible on first launch.
      {
        const c = canvasRef.current;
        const w = canvasWrapperRef.current;
        if (c && w && w.clientWidth > 0 && w.clientHeight > 0) {
          if (c.width !== w.clientWidth || c.height !== w.clientHeight) {
            c.width = w.clientWidth;
            c.height = w.clientHeight;
          }
        }
      }

      rafRef.current = requestAnimationFrame(draw);

      await audio.play();
    };

    init().catch(() => {
      if (!cancelled) {
        // audio.play() most commonly fails due to the browser's autoplay policy
        // (gesture freshness expired). Instead of silently navigating away,
        // surface a TAP TO START recovery screen — tapping is a fresh gesture
        // that will successfully unlock audio.play().
        phaseRef.current = "audioError";
        setPhase("audioError");
      }
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      if (audio) {
        audio.pause();
        audio.src = "";
      }
      audioRef.current = null;
      laneRestoreTimers.current.forEach(clearTimeout);
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
      laneGainsRef.current = [];
      laneSilenced.current = [false, false, false];
    };
  }, [songId, draw, setLocation]);

  // ── render ──
  const gs = displayGs;
  const song = songRef.current;
  const puColor = puDisplay?.color ?? "#E5B800";
  const comboColor =
    gs.combo < 10
      ? "#888"
      : gs.combo < 20
        ? opts.laneColors[2]
        : gs.combo < 40
          ? "#E5B800"
          : gs.combo < 60
            ? "#FF1493"
            : "#39FF14";
  const animatedScore = useAnimatedCount(gs.score);

  const doPause = useCallback(() => {
    if (phaseRef.current !== 'playing' || pausedRef.current) return;
    pausedRef.current = true;
    setPaused(true);
    audioRef.current?.pause();
    audioManager.playSfx('pause', 0.5);
  }, []);

  const doResume = useCallback(() => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    setPaused(false);
    audioManager.playSfx('pause_2', 0.6);
    if (phaseRef.current === 'playing') {
      audioRef.current?.play().catch(() => {});
      // Restart the loop
      rafRef.current = requestAnimationFrame(() => drawRef.current?.());
    }
  }, []);

  // Auto-pause on blur
  useEffect(() => {
    const onBlur = () => { if (phaseRef.current === 'playing') doPause(); };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [doPause]);

  // Handle manual keyboard pause (Escape)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        if (pausedRef.current) doResume();
        else doPause();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [doPause, doResume]);

  return (
    <div
      className="fixed inset-0 flex justify-center overflow-hidden"
      style={{ background: "#0c0c14" }}
    >
      {/* ── PAUSE BUTTON (Bottom Right) ── */}
      {phase === "playing" && !paused && (
        <button
          onClick={doPause}
          className="absolute bottom-6 right-6 z-50 w-12 h-12 flex items-center justify-center rounded-full glass-panel border-2 border-white/20 hover:scale-110 active:scale-95 transition-all group"
          title="Pause (Esc)"
        >
          <div className="flex gap-1">
            <div className="w-1.5 h-4 bg-white/80 group-hover:bg-white rounded-full transition-colors" />
            <div className="w-1.5 h-4 bg-white/80 group-hover:bg-white rounded-full transition-colors" />
          </div>
        </button>
      )}

      {/* ── PAUSE OVERLAY ── */}
      {paused && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="glass-panel p-8 max-w-sm w-full mx-4 text-center border-t-2 border-white/20 shadow-2xl">
            <div className="font-mono font-bold text-xs tracking-[0.5em] text-white/30 mb-6 uppercase">
              TRANSMISSION SUSPENDED
            </div>
            <h2 className="font-mono font-bold text-4xl text-white mb-8 tracking-tighter">PAUSED</h2>
            
            <div className="flex flex-col gap-4">
              <button
                onClick={doResume}
                className="w-full py-4 font-mono font-bold text-sm tracking-[0.3em] bg-[#F2F0E8] text-[#080808] rounded-lg hover:scale-[1.02] active:scale-95 transition-all shadow-lg"
              >
                RESUME TRANSMISSION
              </button>
              
              <button
                onClick={doAbandon}
                className="w-full py-4 font-mono font-bold text-xs tracking-[0.2em] bg-white/5 text-white/60 border border-white/10 rounded-lg hover:bg-white/10 hover:text-white transition-all"
              >
                ABORT MISSION
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Blurred cover art — fills the full viewport edge to edge */}
      {song?.coverArt && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <img
            src={song.coverArt}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              filter: "blur(18px) brightness(0.28) saturate(1.6)",
              transform: "scale(1.08)",
            }}
          />
        </div>
      )}
      {/* Vignette — full-screen radial dark gradient, no column boundary */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 90% 90% at 50% 42%, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.50) 55%, rgba(0,0,0,0.86) 100%)",
        }}
      />
      {/* Scanlines — full-screen CRT texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.07) 3px, rgba(0,0,0,0.07) 4px)",
          mixBlendMode: "multiply",
        }}
      />
      {/* Mood tint — subtle colour cast based on song mood */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            song?.mood === "dark"
              ? "rgba(255,20,147,0.07)"
              : "rgba(57,255,20,0.06)",
        }}
      />
      <div
        className="absolute inset-0 mx-auto flex flex-col overflow-hidden"
        style={{ maxWidth: 500 }}
      >
        {/* HUD */}
        <div
          className="flex items-center justify-between px-4 py-2.5 flex-shrink-0"
          style={{
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(12,12,20,0.55)",
            backdropFilter: "blur(20px) saturate(1.4)",
            WebkitBackdropFilter: "blur(20px) saturate(1.4)",
            borderRadius: "0 0 14px 14px",
            boxShadow: "0 4px 28px rgba(0,0,0,0.5), inset 0 -1px 0 rgba(255,255,255,0.05)",
          }}
        >
          {/* Left: QUIT + OPTIONS */}
          <div className="flex items-center gap-3">
            <button
              data-testid="button-quit"
              onClick={() => {
                audioRef.current?.pause();
                const origin = sessionStorage.getItem(`game_origin_${songId}`) ?? '';
                setLocation(origin === 'songs' ? '/songs' : origin ? `/${origin}` : '/campaign');
              }}
              className="font-mono text-xs tracking-widest transition-colors"
              style={{ color: "hsl(30 15% 30%)" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#FF1493")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(30 15% 30%)")}
            >
              ✕ QUIT
            </button>
            <button
              onClick={() => setShowOptions(o => !o)}
              className="font-mono text-xs tracking-widest transition-colors"
              style={{ color: showOptions ? "#E5B800" : "hsl(30 15% 28%)", letterSpacing: '0.1em' }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#E5B800")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = showOptions ? "#E5B800" : "hsl(30 15% 28%)")}
            >
              ⚙
            </button>
            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              style={{ color: isFullscreen ? "#39FF14" : "hsl(30 15% 28%)", lineHeight: 1, padding: "2px 3px", transition: "color 0.15s" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#39FF14")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = isFullscreen ? "#39FF14" : "hsl(30 15% 28%)")}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                {isFullscreen ? (
                  <>
                    <path d="M4 0H0v4h1.5V1.5H4V0z" opacity=".35" />
                    <path d="M8 0h4v4h-1.5V1.5H8V0z" opacity=".35" />
                    <path d="M0 8h1.5v2.5H4V12H0V8z" opacity=".35" />
                    <path d="M12 8h-1.5v2.5H8V12h4V8z" opacity=".35" />
                    <rect x="3.5" y="3.5" width="5" height="5" rx="0.5" />
                  </>
                ) : (
                  <>
                    <path d="M0 0h4v1.5H1.5V4H0V0z" />
                    <path d="M12 0H8v1.5h2.5V4H12V0z" />
                    <path d="M0 12h4v-1.5H1.5V8H0v4z" />
                    <path d="M12 12H8v-1.5h2.5V8H12v4z" />
                  </>
                )}
              </svg>
            </button>
          </div>

          {/* Center: COMBO */}
          {opts.comboDisplay ? (
            <div className="text-center">
              <div className="font-mono" style={{ fontSize: 8, color: "hsl(30 15% 32%)", letterSpacing: "0.3em" }}>COMBO</div>
              <div
                className={`font-mono font-bold leading-none${gs.combo >= 20 ? ' breathe-glow' : ''}`}
                data-testid="text-combo"
                style={{
                  fontSize: 22,
                  color: comboColor,
                  textShadow: gs.combo >= 20 ? `0 0 16px ${comboColor}, 0 0 32px ${comboColor}60` : "none",
                  '--breathe-color': `${comboColor}60`,
                  transition: 'color 0.2s, text-shadow 0.2s',
                } as React.CSSProperties}
              >
                {gs.combo > 0 ? gs.combo : "—"}
              </div>
            </div>
          ) : <div />}

          {/* Right: animated SCORE + miss pips */}
          <div className="flex flex-col items-end gap-1">
            <div className="font-mono" style={{ fontSize: 8, color: "hsl(30 15% 32%)", letterSpacing: "0.3em" }}>SCORE</div>
            <div
              className="font-mono font-bold leading-none"
              data-testid="text-score"
              style={{ fontSize: 26, color: "#F2EDE5", letterSpacing: "0.03em", textShadow: "0 0 14px rgba(242,237,229,0.25)" }}
            >
              {animatedScore.toLocaleString()}
            </div>
            {opts.hudMisses && (
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: 7, height: 7,
                      background: i < missCount ? "#FF1493" : "rgba(255,255,255,0.1)",
                      boxShadow: i < missCount ? "0 0 6px rgba(255,20,147,0.9)" : "none",
                      transition: "background 0.15s, box-shadow 0.15s",
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Options panel */}
        {showOptions && (
          <div
            className="absolute top-0 left-0 right-0 bottom-0 z-40"
            style={{ background: "rgba(0,0,0,0.55)" }}
            onClick={() => setShowOptions(false)}
          >
            <div
              className="absolute top-12 right-0 w-64"
              style={{ background: "#0c0c14", borderLeft: "2px solid rgba(255,255,255,0.08)", borderBottom: "2px solid rgba(255,255,255,0.08)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                <div className="font-mono text-xs tracking-[0.35em]" style={{ color: "rgba(255,255,255,0.3)" }}>OPTIONS</div>
              </div>
              {([
                { key: "missSystem", label: "MISS SYSTEM", sub: "3 strikes trigger SIGNAL LOST" },
                { key: "hudMisses", label: "HUD MISSES", sub: "Show miss pips in HUD" },
                { key: "comboDisplay", label: "COMBO DISPLAY", sub: "Show combo counter" },
                { key: "judgmentText", label: "JUDGMENT TEXT", sub: "Show PERFECT / GOOD popups" },
              ] as const).map(({ key, label, sub }) => {
                const on = opts[key];
                return (
                  <div key={key} className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                    <div>
                      <div className="font-mono text-xs" style={{ color: on ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.3)", letterSpacing: "0.15em" }}>{label}</div>
                      <div className="font-mono mt-0.5" style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em" }}>{sub}</div>
                    </div>
                    <button
                      onClick={() => {
                        const nv = !on;
                        localStorage.setItem(`opt_${key}`, String(nv));
                        setOpts(o => ({ ...o, [key]: nv }));
                      }}
                      style={{
                        width: 38, height: 20, position: "relative", flexShrink: 0,
                        background: on ? "#FF1493" : "rgba(255,255,255,0.1)",
                        border: on ? "1px solid #FF1493" : "1px solid rgba(255,255,255,0.15)",
                        transition: "background 0.15s",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{
                        width: 13, height: 13, background: "#fff", position: "absolute",
                        top: 2.5, left: on ? 21 : 3, transition: "left 0.15s",
                      }} />
                    </button>
                  </div>
                );
              })}

              {/* Audio offset slider */}
              <div className="px-5 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.75)", letterSpacing: "0.15em" }}>AUDIO OFFSET</div>
                    <div className="font-mono mt-0.5" style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em" }}>Sync to your speaker delay</div>
                  </div>
                  <div className="font-mono text-xs font-bold" style={{ color: opts.audioOffset === 0 ? "#39FF14" : "#FF1493", letterSpacing: "0.1em", minWidth: 52, textAlign: "right" }}>
                    {opts.audioOffset === 0 ? "SYNCED" : opts.audioOffset > 0 ? `+${opts.audioOffset}ms` : `${opts.audioOffset}ms`}
                  </div>
                </div>
                <input
                  type="range"
                  min={-150}
                  max={150}
                  step={5}
                  value={opts.audioOffset}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    localStorage.setItem("opt_audioOffset", String(v));
                    setOpts(o => ({ ...o, audioOffset: v }));
                  }}
                  style={{ width: "100%", accentColor: "#FF1493", cursor: "pointer" }}
                />
                <div className="flex justify-between font-mono" style={{ fontSize: 8, color: "rgba(255,255,255,0.18)", letterSpacing: "0.08em", marginTop: 2 }}>
                  <span>-150ms</span><span>0</span><span>+150ms</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Progress bar — rounded pill with glow */}
        <div
          className="flex-shrink-0 mx-2 my-1"
          style={{ height: 4, borderRadius: 999, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}
        >
          <div
            style={{
              height: "100%",
              borderRadius: 999,
              width: `${(gs.progress || 0) * 100}%`,
              background: "linear-gradient(90deg, #FF1493, #00E5FF, #39FF14)",
              boxShadow: "0 0 8px rgba(255,20,147,0.3), 0 0 16px rgba(57,255,20,0.15)",
              transition: "width 0.2s linear",
            }}
          />
        </div>

        {/* Canvas */}
        <div 
          ref={canvasWrapperRef} 
          className="relative flex-1 min-h-0 overflow-hidden"
          style={{ touchAction: 'none' }}
        >
          <canvas
            ref={canvasRef}
            className="absolute inset-0"
            style={{ touchAction: 'none' }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchCancel}
            data-testid="canvas-game"
          />

          {/* Power-up banner */}
          {puDisplay && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 pointer-events-none">
              <div
                className="font-mono font-bold text-base px-5 py-2 tracking-[0.3em]"
                style={{
                  color: puColor,
                  border: `2px solid ${puColor}`,
                  background: `${puColor}18`,
                  textShadow: `0 0 20px ${puColor}`,
                  boxShadow: `0 0 30px ${puColor}40`,
                  clipPath:
                    "polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)",
                }}
              >
                {puDisplay.label} ×{puDisplay.multiplier}
              </div>
              <div
                className="w-36 h-1"
                style={{ background: "rgba(255,255,255,0.08)" }}
              >
                <div
                  className="h-full"
                  style={{
                    width: `${puDisplay.progress * 100}%`,
                    background: puColor,
                  }}
                />
              </div>
            </div>
          )}

          {/* Judgment text — per-lane, moved up above the hit zone */}
          {opts.judgmentText && displayJudge.map((j) => {
            if (Date.now() - j.ts > 600) return null;
            const pct = (j.lane / LANE_COUNT + 1 / (LANE_COUNT * 2)) * 100;
            const color =
              j.type === "PERFECT+"
                ? "#E5B800"
                : j.type === "PERFECT"
                  ? "#39FF14"
                  : j.type === "GOOD"
                    ? "#00E5FF"
                    : j.type === "SHIELDED"
                      ? "#00FFDD"
                      : "#FF1493";
            return (
              <div
                key={j.id}
                className="absolute font-mono font-bold pointer-events-none judgment-pop"
                style={{
                  left: `${pct}%`,
                  top: "55%",
                  transform: "translateX(-50%)",
                  color,
                  textShadow: `0 0 18px ${color}`,
                  letterSpacing: "0.12em",
                  fontSize: j.type === "PERFECT+" ? 15 : 12,
                }}
              >
                {j.type}
              </div>
            );
          })}

          {/* Secondary judgment banner — top of screen, always visible above fingers */}
          {opts.judgmentText && (() => {
            const latest = displayJudge.filter(j => Date.now() - j.ts < 400).sort((a, b) => b.ts - a.ts)[0];
            if (!latest) return null;
            const age = (Date.now() - latest.ts) / 400;
            const color =
              latest.type === "PERFECT+" ? "#E5B800"
                : latest.type === "PERFECT" ? "#39FF14"
                : latest.type === "GOOD" ? "#00E5FF"
                : latest.type === "SHIELDED" ? "#00FFDD"
                : latest.type === "MISS" ? "#FF1493"
                : "#444";
            return (
              <div
                className="absolute left-1/2 font-mono font-bold pointer-events-none"
                style={{
                  top: "12%",
                  transform: `translateX(-50%) scale(${1 + (1 - age) * 0.15})`,
                  color,
                  textShadow: `0 0 24px ${color}, 0 0 48px ${color}40`,
                  letterSpacing: "0.25em",
                  fontSize: latest.type === "PERFECT+" ? 20 : latest.type === "MISS" ? 18 : 16,
                  opacity: 1 - age * 0.6,
                  transition: "opacity 0.1s",
                }}
              >
                {latest.type}
              </div>
            );
          })()}

          {/* Loading overlay */}
          {(phase === "loading" || phase === "buffering") && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-5"
              style={{ background: "rgba(12,12,20,0.92)", backdropFilter: "blur(12px)" }}
            >
              <div
                className="font-mono text-xs tracking-[0.3em]"
                style={{ color: "#39FF14", textShadow: "0 0 10px rgba(57,255,20,0.3)" }}
              >
                {loadMsg}
              </div>
              {song && (
                <div className="glass-panel text-center p-6" style={{ borderRadius: 16 }}>
                  {song.coverArt && (
                    <img
                      src={song.coverArt}
                      alt={song.title}
                      className="w-24 h-24 object-cover mx-auto mb-3 opacity-70"
                      style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}
                    />
                  )}
                  <div
                    className="font-mono font-bold text-lg"
                    style={{ color: "#F2EDE5" }}
                  >
                    {song.title}
                  </div>
                  <div
                    className="font-mono text-xs mt-1"
                    style={{ color: "rgba(255,255,255,0.35)" }}
                  >
                    DAY {song.day} · {song.bpm} BPM · {song.notes.length} NOTES
                  </div>
                </div>
              )}
              {phase === "buffering" && bufferPct > 0 && (
                <div className="w-48">
                  <div
                    style={{ height: 4, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}
                  >
                    <div
                      style={{ height: "100%", borderRadius: 999, width: `${bufferPct}%`, background: "linear-gradient(90deg, #FF1493, #FF7A33)", boxShadow: "0 0 8px rgba(255,20,147,0.3)" }}
                    />
                  </div>
                  <div
                    className="font-mono text-xs text-center mt-1"
                    style={{ color: "rgba(255,255,255,0.3)" }}
                  >
                    {bufferPct}%
                  </div>
                </div>
              )}
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="rounded-full animate-pulse"
                    style={{
                      width: 6, height: 6,
                      background: opts.laneColors[i],
                      boxShadow: `0 0 8px ${opts.laneColors[i]}60`,
                      animationDelay: `${i * 0.15}s`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Audio error recovery — tap to unlock audio.play() with a fresh gesture */}
          {phase === "audioError" && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-6"
              style={{ background: "rgba(12,12,20,0.97)" }}
              onClick={async () => {
                const audio = audioRef.current;
                if (!audio) return;
                try {
                  audio.currentTime = 0;
                  // Canvas safety net on recovery too
                  const c = canvasRef.current;
                  const w = canvasWrapperRef.current;
                  if (c && w && w.clientWidth > 0 && w.clientHeight > 0) {
                    if (c.width !== w.clientWidth || c.height !== w.clientHeight) {
                      c.width = w.clientWidth;
                      c.height = w.clientHeight;
                    }
                  }
                  // Resume AudioContext during user gesture!
                  if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
                    await audioCtxRef.current.resume();
                  }
                  await audioManager.ensureReady();

                  phaseRef.current = "playing";
                  setPhase("playing");
                  rafRef.current = requestAnimationFrame(() => drawRef.current?.());

                  await audio.play();
                } catch {
                  phaseRef.current = "audioError";
                  setPhase("audioError");
                  cancelAnimationFrame(rafRef.current);
                }
              }}
            >
              <div
                className="font-mono font-bold tracking-[0.3em]"
                style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: "0.35em" }}
              >
                AUDIO BLOCKED
              </div>
              <div
                className="font-mono font-bold tracking-[0.2em] text-center"
                style={{ fontSize: 28, color: "#FF1493", textShadow: "0 0 40px rgba(255,20,147,0.7)" }}
              >
                TAP TO START
              </div>
              <div
                className="font-mono text-center"
                style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", letterSpacing: "0.2em", maxWidth: 220, lineHeight: 1.8 }}
              >
                YOUR BROWSER NEEDS A TAP<br />TO ALLOW AUDIO PLAYBACK
              </div>
            </div>
          )}

          {/* Countdown */}
          {phase === "countdown" && (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{
                background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(14,16,40,0.85) 0%, rgba(12,12,20,0.95) 70%)",
                backdropFilter: "blur(6px)",
              }}
            >
              <div
                className="font-mono font-bold text-center"
                style={{
                  fontSize: 120,
                  lineHeight: 1,
                  background:
                    "linear-gradient(135deg, #FF1493, #00E5FF, #39FF14)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  filter: "drop-shadow(0 0 40px rgba(0,229,255,0.6))",
                  animation: "slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both",
                }}
              >
                {countdown > 0 ? countdown : "GO!"}
              </div>
            </div>
          )}

          {/* Continue overlay */}
          {phase === "continue" && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-7"
              style={{
                background: "rgba(8,8,14,0.96)",
                backdropFilter: "blur(6px)",
              }}
            >
              {/* Header */}
              <div className="flex flex-col items-center gap-2">
                <div
                  className="font-mono font-bold tracking-[0.35em]"
                  style={{
                    fontSize: 28,
                    color: "#FF1493",
                    textShadow: "0 0 40px rgba(255,20,147,0.9)",
                  }}
                >
                  SIGNAL LOST
                </div>
                <div
                  className="font-mono text-xs tracking-[0.25em]"
                  style={{ color: "rgba(255,255,255,0.35)" }}
                >
                  {3 - continueUsedRef.current} CONTINUE{3 - continueUsedRef.current !== 1 ? "S" : ""} REMAINING
                </div>
              </div>

              {/* 3 miss pips — all lit */}
              <div className="flex flex-col items-center gap-2">
                <div
                  className="font-mono text-xs tracking-[0.25em]"
                  style={{ color: "rgba(255,255,255,0.28)" }}
                >
                  3 STRIKES
                </div>
                <div className="flex gap-3">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      style={{
                        width: 16,
                        height: 16,
                        background: "#FF1493",
                        boxShadow: "0 0 14px rgba(255,20,147,0.75)",
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Continue bank — shows how many are used/remaining */}
              <div className="flex flex-col items-center gap-2">
                <div
                  className="font-mono text-xs tracking-[0.25em]"
                  style={{ color: "rgba(255,255,255,0.28)" }}
                >
                  CONTINUES
                </div>
                <div className="flex gap-3">
                  {[0, 1, 2].map((i) => {
                    const used = continueUsedRef.current;
                    // Slots 0..used-1 are spent, current one is being used (pulse), rest available
                    const isSpent = i < used;
                    const isCurrent = i === used;
                    return (
                      <div
                        key={i}
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: "50%",
                          background: isSpent
                            ? "rgba(255,255,255,0.08)"
                            : isCurrent
                            ? "#FF1493"
                            : "rgba(255,20,147,0.35)",
                          border: isSpent
                            ? "1.5px solid rgba(255,255,255,0.12)"
                            : `1.5px solid #FF1493`,
                          boxShadow: isCurrent
                            ? "0 0 12px rgba(255,20,147,0.9)"
                            : "none",
                          transition: "all 0.3s ease",
                        }}
                      />
                    );
                  })}
                </div>
                {continueUsedRef.current >= 2 && (
                  <div
                    className="font-mono text-xs tracking-[0.2em]"
                    style={{ color: "rgba(255,80,80,0.8)" }}
                  >
                    LAST CHANCE
                  </div>
                )}
              </div>

              {/* Continue button */}
              <button
                onClick={doReturn}
                className="font-mono font-bold tracking-[0.3em] px-10 py-3"
                style={{
                  background: "rgba(255,20,147,0.12)",
                  border: "2px solid #FF1493",
                  color: "#FF1493",
                  textShadow: "0 0 20px rgba(255,20,147,0.7)",
                  boxShadow: "0 0 30px rgba(255,20,147,0.2)",
                  clipPath:
                    "polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)",
                }}
              >
                ▶ CONTINUE
              </button>

              {/* Countdown + abandon */}
              <div className="flex flex-col items-center gap-2">
                <div
                  className="font-mono text-xs"
                  style={{
                    color: "rgba(255,255,255,0.22)",
                    letterSpacing: "0.2em",
                  }}
                >
                  AUTO-ABANDON IN {continueCountdown}s
                </div>
                <button
                  onClick={doAbandon}
                  className="font-mono text-xs tracking-[0.25em]"
                  style={{
                    color: "rgba(255,255,255,0.22)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  ABANDON RUN
                </button>
              </div>
            </div>
          )}


          {/* Rewinding overlay — VHS tape rewind visual */}
          {phase === "rewinding" && (
            <div
              className="absolute inset-0 overflow-hidden rewind-overlay"
              style={{ background: "rgba(6,6,12,0.15)", pointerEvents: "none" }}
            >
              {/* CRT scan lines */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.28) 3px,rgba(0,0,0,0.28) 6px)",
                }}
              />
              {/* Glitch bands */}
              <div className="absolute inset-0 rewind-glitch pointer-events-none" />
              {/* Center text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
                <div
                  className="font-mono font-bold rewind-flicker"
                  style={{
                    fontSize: 34,
                    color: "#39FF14",
                    textShadow: "0 0 40px rgba(57,255,20,0.9)",
                    letterSpacing: "0.28em",
                  }}
                >
                  ◀◀ REWINDING
                </div>
                <div
                  className="font-mono text-xs"
                  style={{
                    color: "rgba(57,255,20,0.4)",
                    letterSpacing: "0.2em",
                  }}
                >
                  BACKING UP 2.5 SECONDS
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  KEY NOTE DRAWING — ivory piano key with colored center stripe
// ═══════════════════════════════════════════════════════════════
function drawKey(
  ctx: CanvasRenderingContext2D,
  noteX: number,
  noteY: number,
  noteW: number,
  noteH: number,
  r: number,
  lc: string,
  prog: number,
  _isHold: boolean,
  swipeDirection?: Note['swipeDirection'],
) {
  const centerX = noteX + noteW / 2;
  const centerY = noteY;

  ctx.save();
  ctx.translate(centerX, centerY);

  // ── Rotations ──
  const rotations: Record<string, number> = {
    'right': 0,
    'down-right': Math.PI / 4,
    'down': Math.PI / 2,
    'down-left': 3 * Math.PI / 4,
    'left': Math.PI,
    'up-left': -3 * Math.PI / 4,
    'up': -Math.PI / 2,
    'up-right': -Math.PI / 4,
  };

  if (swipeDirection) {
    ctx.rotate(rotations[swipeDirection] || 0);
  }

  // ── 1. Define Key Body Path ──
  ctx.beginPath();
  if (swipeDirection) {
    const w = noteW / 2;
    const h = noteH / 2;
    const br = 8; // body corner radius
    // Rounded chevron pointing right
    ctx.moveTo(-w + br, -h);
    ctx.arcTo(w * 0.2, -h, w, 0, br);
    ctx.arcTo(w, 0, w * 0.2, h, br);
    ctx.arcTo(w * 0.2, h, -w, h, br);
    ctx.arcTo(-w, h, -w * 0.35, 0, br);
    ctx.arcTo(-w * 0.35, 0, -w, -h, br);
    ctx.arcTo(-w, -h, -w + br, -h, br);
    ctx.closePath();
  } else {
    ctx.roundRect(-noteW / 2, -noteH / 2, noteW, noteH, r);
  }

  // ── 2. Render Ivory Body ──
  ctx.shadowColor = "rgba(0,0,0,0.65)";
  ctx.shadowBlur = lerp(4, 14, prog);
  ctx.shadowOffsetY = lerp(2, 5, prog);

  const bodyGrad = ctx.createLinearGradient(0, -noteH / 2, 0, noteH / 2);
  bodyGrad.addColorStop(0, "rgba(255, 252, 243, 0.98)");
  bodyGrad.addColorStop(0.22, "rgba(252, 248, 238, 0.97)");
  bodyGrad.addColorStop(0.75, "rgba(242, 236, 220, 0.97)");
  bodyGrad.addColorStop(1, "rgba(228, 220, 204, 0.96)");
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  // ── 3. Subtle edge border ──
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = "rgba(160, 150, 132, 0.45)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // ── 4. COLORED CENTER STRIPE ──
  const stripeH = Math.max(6, noteH * 0.26);
  ctx.shadowColor = lc;
  ctx.shadowBlur = lerp(20, 42, prog);
  ctx.fillStyle = lc;
  ctx.globalAlpha = 0.9;

  ctx.beginPath();
  if (swipeDirection) {
    const sw = noteW / 2 - 4;
    const sh = stripeH / 2;
    const sr = 4; // stripe radius
    ctx.moveTo(-sw + sr, -sh);
    ctx.arcTo(sw * 0.2, -sh, sw, 0, sr);
    ctx.arcTo(sw, 0, sw * 0.2, sh, sr);
    ctx.arcTo(sw * 0.2, sh, -sw, sh, sr);
    ctx.arcTo(-sw, sh, -sw * 0.35, 0, sr);
    ctx.arcTo(-sw * 0.35, 0, -sw, -sh, sr);
    ctx.arcTo(-sw, -sh, -sw + sr, -sh, sr);
    ctx.closePath();
  } else {
    ctx.roundRect(-noteW / 2 + 2, -stripeH / 2, noteW - 4, stripeH, stripeH * 0.35);
  }
  ctx.fill();

  // ── 5. Bright inner core of stripe ──
  const coreH = stripeH * 0.48;
  const coreGrad = ctx.createLinearGradient(0, -coreH / 2, 0, coreH / 2);
  coreGrad.addColorStop(0, "rgba(255,255,255,0.5)");
  coreGrad.addColorStop(0.4, "rgba(255,255,255,0.85)");
  coreGrad.addColorStop(1, "rgba(255,255,255,0.2)");
  ctx.fillStyle = coreGrad;
  ctx.globalAlpha = 0.75;

  ctx.beginPath();
  if (swipeDirection) {
    const cw = noteW / 2 - 10;
    const ch = coreH / 2;
    const cr = 2; // core radius
    ctx.moveTo(-cw + cr, -ch);
    ctx.arcTo(cw * 0.2, -ch, cw, 0, cr);
    ctx.arcTo(cw, 0, cw * 0.2, ch, cr);
    ctx.arcTo(cw * 0.2, ch, -cw, ch, cr);
    ctx.arcTo(-cw, ch, -cw * 0.35, 0, cr);
    ctx.arcTo(-cw * 0.35, 0, -cw, -ch, cr);
    ctx.arcTo(-cw, -ch, -cw + cr, -ch, cr);
    ctx.closePath();
  } else {
    ctx.roundRect(-noteW / 2 + 5, -coreH / 2, noteW - 10, coreH, stripeH * 0.2);
  }
  ctx.fill();

  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
}
