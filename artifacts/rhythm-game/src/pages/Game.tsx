import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { getSongById, saveHighScore, isSongTimeLocked } from "@/game/api";
import { saveMedal } from "@/game/progress";
import type { GameSong } from "@/game/api";
import type { Note, JudgmentDisplay, GameState } from "@/game/types";

// ── constants ────────────────────────────────────────────────────
const LANE_COUNT  = 3;
const LANE_KEYS   = ['a', 's', 'd'];
const LANE_COLORS = ['#E53A00', '#A855F7', '#48E5C2'];

const APPROACH_TIME       = 2.0;
const HIT_RATIO           = 0.70;
const PERFECT_PLUS_WINDOW = 0.030;
const PERFECT_WINDOW      = 0.065;
const GOOD_WINDOW         = 0.130;
const MISS_WINDOW         = 0.250;

// Perspective highway geometry
const HW_TOP = 0.54;
const HW_BOT = 0.97;

const POWER_UPS = [
  { threshold: 20, type: 'FEVER',       duration: 9,  multiplier: 2, color: '#E5B800', label: 'FEVER'       },
  { threshold: 40, type: 'SURGE',       duration: 11, multiplier: 3, color: '#E53A00', label: 'SURGE'       },
  { threshold: 60, type: 'SIGNAL_LOCK', duration: 14, multiplier: 4, color: '#48E5C2', label: 'SIGNAL LOCK' },
] as const;
type PUType = typeof POWER_UPS[number]['type'];

// ── helpers ──────────────────────────────────────────────────────
function lerp(a: number, b: number, t: number) { return a + (b - a) * Math.max(0, Math.min(1, t)); }

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
  return a >= 93 ? 'PLATINUM' : a >= 80 ? 'GOLD' : a >= 60 ? 'SILVER' : a >= 40 ? 'BRONZE' : 'NONE';
}

// ── interfaces ───────────────────────────────────────────────────
interface NoteState { note: Note; hit: boolean; missed: boolean; holdActive: boolean; holdProgress: number; }
interface LanePress { pressed: boolean; touchId?: number; }
interface PUState   { active: PUType | null; endTime: number; startTime: number; multiplier: number; color: string; label: string; duration: number; triggered: Set<number>; }
interface HitParticle { vx: number; vy: number; size: number; }
interface HitEffect {
  lane: number; startMs: number; cx: number; cy: number; color: string;
  kind: 'PERFECT+' | 'PERFECT' | 'GOOD';
  particles: HitParticle[];
}

// ── component ────────────────────────────────────────────────────
export default function Game() {
  const { songId } = useParams<{ songId: string }>();
  const [, setLocation] = useLocation();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef  = useRef<HTMLAudioElement | null>(null);
  const rafRef    = useRef<number>(0);
  const notesRef  = useRef<NoteState[]>([]);
  const laneRef   = useRef<LanePress[]>(Array.from({ length: 3 }, () => ({ pressed: false })));
  const gsRef     = useRef<GameState>({ score: 0, combo: 0, maxCombo: 0, perfectPlus: 0, perfects: 0, goods: 0, misses: 0, progress: 0 });
  const jRef      = useRef<JudgmentDisplay[]>([]);
  const jCounter  = useRef(0);
  const songRef   = useRef<GameSong | null>(null);
  const phaseRef  = useRef<'loading'|'buffering'|'countdown'|'playing'|'finished'>('loading');
  const puRef     = useRef<PUState>({ active: null, endTime: 0, startTime: 0, multiplier: 1, color: '#fff', label: '', duration: 0, triggered: new Set() });
  const hitFxRef       = useRef<HitEffect[]>([]);
  const coverImgRef    = useRef<HTMLImageElement | null>(null);
  const coverBlurRef   = useRef<HTMLCanvasElement | null>(null);
  const scanPatternRef  = useRef<CanvasPattern | null>(null);
  const lastMedalRef    = useRef<string>('NONE');
  const medalStampRef   = useRef<{ medal: string; startT: number } | null>(null);
  const audioCtxRef     = useRef<AudioContext | null>(null);
  const laneGainsRef      = useRef<GainNode[]>([]);
  const laneSilenced      = useRef<boolean[]>([false, false, false]);
  const laneRestoreTimers = useRef<ReturnType<typeof setTimeout>[]>([] as ReturnType<typeof setTimeout>[]);

  const [phase, setPhase]               = useState<typeof phaseRef.current>('loading');
  const [countdown, setCountdown]       = useState(3);
  const [displayGs, setDisplayGs]       = useState<GameState>(gsRef.current);
  const [displayJudge, setDisplayJudge] = useState<JudgmentDisplay[]>([]);
  const [bufferPct, setBufferPct]       = useState(0);
  const [loadMsg, setLoadMsg]           = useState('FETCHING TRANSMISSION...');
  const [puDisplay, setPuDisplay]       = useState<{ label: string; color: string; multiplier: number; progress: number } | null>(null);

  const syncDisplay = useCallback(() => {
    setDisplayGs({ ...gsRef.current });
    setDisplayJudge([...jRef.current]);
  }, []);
  const getT = useCallback(() => audioRef.current?.currentTime ?? 0, []);

  const calcScore = useCallback((combo: number, j: 'PERFECT+' | 'PERFECT' | 'GOOD') => {
    const pu = puRef.current;
    const puMul    = (pu.active && getT() < pu.endTime) ? pu.multiplier : 1;
    const comboMul = combo < 10 ? 1 : combo < 25 ? 1.5 : combo < 50 ? 2 : 3;
    const base     = j === 'PERFECT+' ? 500 : j === 'PERFECT' ? 300 : 150;
    return Math.round(base * puMul * comboMul);
  }, [getT]);

  const checkPowerUps = useCallback((combo: number) => {
    const pu = puRef.current; const t = getT();
    for (const pw of POWER_UPS) {
      if (combo >= pw.threshold && !pu.triggered.has(pw.threshold)) {
        pu.triggered.add(pw.threshold);
        Object.assign(pu, { active: pw.type, endTime: t + pw.duration, startTime: t, multiplier: pw.multiplier, color: pw.color, label: pw.label, duration: pw.duration });
        setPuDisplay({ label: pw.label, color: pw.color, multiplier: pw.multiplier, progress: 1 });
        break;
      }
    }
  }, [getT]);

  const muteLane = useCallback((lane: number) => {
    const ctx = audioCtxRef.current; const gain = laneGainsRef.current[lane];
    if (!ctx || !gain || laneSilenced.current[lane]) return;
    laneSilenced.current[lane] = true;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 0.12);
    clearTimeout(laneRestoreTimers.current[lane]);
    laneRestoreTimers.current[lane] = setTimeout(() => {
      laneSilenced.current[lane] = false;
      const c = audioCtxRef.current; const g = laneGainsRef.current[lane];
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
    const ctx = audioCtxRef.current; const gain = laneGainsRef.current[lane];
    if (!ctx || !gain) return;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1.0, ctx.currentTime + 0.25);
  }, []);

  const hitLane = useCallback((lane: number) => {
    if (phaseRef.current !== 'playing') return;
    restoreLane(lane);
    const t = getT();
    const candidates = notesRef.current.filter(ns => ns.note.lane === lane && !ns.hit && !ns.missed);
    if (!candidates.length) return;
    const ns   = candidates.reduce((b, c) => Math.abs(c.note.time - t) < Math.abs(b.note.time - t) ? c : b);
    const diff = Math.abs(ns.note.time - t);
    if (diff > MISS_WINDOW) return;
    const j: 'PERFECT+' | 'PERFECT' | 'GOOD' | null =
      diff <= PERFECT_PLUS_WINDOW ? 'PERFECT+' :
      diff <= PERFECT_WINDOW      ? 'PERFECT'  :
      diff <= GOOD_WINDOW         ? 'GOOD'      : null;
    if (!j) return;

    if (ns.note.type === 'hold') ns.holdActive = true; else ns.hit = true;

    const gs = gsRef.current;
    gs.score += calcScore(gs.combo, j);
    gs.combo++; gs.maxCombo = Math.max(gs.maxCombo, gs.combo);
    if (j === 'PERFECT+') gs.perfectPlus++;
    else if (j === 'PERFECT') gs.perfects++;
    else gs.goods++;
    checkPowerUps(gs.combo);

    jRef.current = [...jRef.current.filter(x => Date.now() - x.ts < 600), { type: j, lane, id: ++jCounter.current, ts: Date.now() }];

    // ── Hit explosion effect ──
    const canvas = canvasRef.current;
    if (canvas) {
      const W = canvas.width; const H = canvas.height;
      const hitY = H * HIT_RATIO;
      const { x: lx, w: lw } = laneAt(lane, 1, W);
      const cx = lx + lw / 2;
      const lc = LANE_COLORS[lane];
      const count = j === 'PERFECT+' ? 18 : j === 'PERFECT' ? 13 : 9;
      const particles: HitParticle[] = [];
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
        const speed = 90 + Math.random() * 160;
        particles.push({ vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 80, size: 2.5 + Math.random() * 4.5 });
      }
      hitFxRef.current.push({ lane, startMs: Date.now(), cx, cy: hitY, color: lc, kind: j, particles });
    }

    syncDisplay();
  }, [getT, calcScore, checkPowerUps, syncDisplay, restoreLane]);

  const releaseLane = useCallback((lane: number) => {
    if (phaseRef.current !== 'playing') return;
    const ns = notesRef.current.find(n => n.note.lane === lane && n.note.type === 'hold' && n.holdActive && !n.hit);
    if (!ns) return;
    ns.hit = true; ns.holdActive = false;
    if (ns.holdProgress > 0.6) {
      const gs = gsRef.current;
      gs.score += calcScore(gs.combo, 'PERFECT+');
      gs.combo++; gs.maxCombo = Math.max(gs.maxCombo, gs.combo); gs.perfectPlus++;
      checkPowerUps(gs.combo);
      jRef.current = [...jRef.current.filter(x => Date.now() - x.ts < 600), { type: 'PERFECT+', lane, id: ++jCounter.current, ts: Date.now() }];
    }
    syncDisplay();
  }, [calcScore, checkPowerUps, syncDisplay]);

  const finishGame = useCallback(() => {
    if (phaseRef.current === 'finished') return;
    phaseRef.current = 'finished'; setPhase('finished');
    cancelAnimationFrame(rafRef.current);
    audioRef.current?.pause();
    const gs = gsRef.current;
    const medal = getMedal(gs.perfectPlus, gs.perfects, gs.goods, gs.misses);
    if (songRef.current) {
      saveHighScore(songRef.current.id, gs.score);
      saveMedal(songRef.current.id, medal);
    }
    sessionStorage.setItem(`result_${songId}`, JSON.stringify({
      score: gs.score, maxCombo: gs.maxCombo,
      perfectPlus: gs.perfectPlus, perfects: gs.perfects, goods: gs.goods, misses: gs.misses,
      medal: getMedal(gs.perfectPlus, gs.perfects, gs.goods, gs.misses),
      total: gs.perfectPlus + gs.perfects + gs.goods + gs.misses,
    }));
    setTimeout(() => setLocation(`/results/${songId}`), 800);
  }, [songId, setLocation]);

  // ═══════════════════════════════════════════════════════════════
  //  DRAW LOOP
  // ═══════════════════════════════════════════════════════════════
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || phaseRef.current !== 'playing') return;
    const ctx = canvas.getContext('2d');
    if (!ctx || !songRef.current) return;
    const song = songRef.current;
    const t = getT(); const W = canvas.width; const H = canvas.height;
    const hitY = H * HIT_RATIO;
    const gs = gsRef.current; const pu = puRef.current;
    gs.progress = Math.min(1, t / song.duration);

    // Power-up display sync
    if (pu.active && t < pu.endTime) {
      setPuDisplay({ label: pu.label, color: pu.color, multiplier: pu.multiplier, progress: (pu.endTime - t) / pu.duration });
    } else if (pu.active && t >= pu.endTime) { pu.active = null; setPuDisplay(null); }

    const puActive = !!(pu.active && t < pu.endTime);
    const puColor  = puActive ? pu.color : null;

    // ── 1. BACKGROUND ──────────────────────────────────────────
    ctx.fillStyle = '#0c0c14';
    ctx.fillRect(0, 0, W, H);

    const coverBlur = coverBlurRef.current;
    if (coverBlur) {
      // Ken-burns: very slow zoom + drift across the image
      const kp    = (t % 34) / 34;
      const zoom  = 1.04 + 0.07 * Math.sin(kp * Math.PI * 2);
      const panX  = Math.sin(kp * Math.PI * 2 * 0.6) * W * 0.025;
      const panY  = Math.cos(kp * Math.PI * 2 * 0.4) * H * 0.018;
      const scale = Math.max(W, H) / 512 * zoom;
      const cw = 512 * scale; const ch = 512 * scale;
      const ox = (W - cw) / 2 + panX; const oy = (H - ch) / 2 + panY;

      // Chromatic aberration fringe (RGB offset layers)
      const aberr = 4 + Math.sin(t * 0.28) * 1.8;
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.11;
      ctx.drawImage(coverBlur, ox - aberr, oy, cw, ch);          // R shift left
      ctx.drawImage(coverBlur, ox + aberr, oy, cw, ch);          // B shift right
      ctx.globalAlpha = 0.14;
      ctx.drawImage(coverBlur, ox, oy + aberr * 0.5, cw, ch);   // G shift down
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.75;
      ctx.drawImage(coverBlur, ox, oy, cw, ch);                  // main layer
      ctx.globalAlpha = 1;
    }

    // Vignette — dark edges keep game elements readable
    const vig = ctx.createRadialGradient(W / 2, H * 0.42, H * 0.08, W / 2, H * 0.42, H * 0.9);
    vig.addColorStop(0,   'rgba(0,0,0,0.22)');
    vig.addColorStop(0.5, 'rgba(0,0,0,0.50)');
    vig.addColorStop(1,   'rgba(0,0,0,0.84)');
    ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);

    // Mood color pulse (dark = orange-red, light = teal)
    const moodPulse = 0.5 + 0.5 * Math.sin(t * 0.75);
    ctx.fillStyle = song.mood === 'dark'
      ? `rgba(229,58,0,${0.06 + moodPulse * 0.035})`
      : `rgba(72,229,194,${0.05 + moodPulse * 0.028})`;
    ctx.fillRect(0, 0, W, H);

    // Scanlines (lazy-cached repeating pattern)
    if (!scanPatternRef.current) {
      const sc = document.createElement('canvas'); sc.width = 2; sc.height = 4;
      const sc2 = sc.getContext('2d')!;
      sc2.fillStyle = 'rgba(0,0,0,0.075)'; sc2.fillRect(0, 0, 2, 2);
      const pat = ctx.createPattern(sc, 'repeat');
      if (pat) scanPatternRef.current = pat;
    }
    if (scanPatternRef.current) { ctx.fillStyle = scanPatternRef.current; ctx.fillRect(0, 0, W, H); }

    const hwTop = hwAtProgress(0, W);
    const hwBot = hwAtProgress(1, W);

    // ── 2. LANE TRACK SURFACE ───────────────────────────────────
    // Hill crest: the top edge of the highway arcs upward (above screen) like cresting a hill.
    const hillCx = W / 2;
    const hillCy = -hitY * 0.09; // control point above the viewport
    const hillBow = W * 0.032;   // how far rails bow outward at the shoulder
    const bowY    = hitY * 0.28; // where the shoulder bow peaks

    ctx.save();
    ctx.beginPath();
    // Top edge as upward arc (hill crest silhouette)
    ctx.moveTo(hwTop.left, 0);
    ctx.quadraticCurveTo(hillCx, hillCy, hwTop.right, 0);
    ctx.lineTo(hwBot.right, hitY); ctx.lineTo(hwBot.left, hitY);
    ctx.closePath(); ctx.clip();

    // Track surface: very dark, slightly warm
    ctx.fillStyle = '#10101a'; ctx.fillRect(0, 0, W, hitY);

    // Scrolling road dashes — drive-forward feel (dashes travel from vanishing point toward player)
    const dashCycle = hitY * 0.13;
    const scrollOff = (t * 0.60 * hitY) % dashCycle;
    const dashLen   = dashCycle * 0.42;
    for (let row = -1; row < 10; row++) {
      const dy1 = scrollOff + row * dashCycle;
      const dy2 = dy1 + dashLen;
      if (dy2 < 0 || dy1 > hitY) continue;
      const p1 = Math.max(0, Math.min(1, dy1 / hitY));
      const p2 = Math.max(0, Math.min(1, dy2 / hitY));
      const { left: l1, right: r1 } = hwAtProgress(p1, W);
      const { left: l2, right: r2 } = hwAtProgress(p2, W);
      ctx.fillStyle = `rgba(255,248,235,${0.018 + p1 * 0.032})`;
      ctx.beginPath();
      ctx.moveTo(l1, dy1); ctx.lineTo(r1, dy1);
      ctx.lineTo(r2, dy2); ctx.lineTo(l2, dy2);
      ctx.closePath(); ctx.fill();
    }

    // Subtle perspective horizontal lines
    for (let row = 0; row <= 14; row++) {
      const ry = (row / 14) * hitY; const rp = ry / hitY;
      const { left, right } = hwAtProgress(rp, W);
      ctx.strokeStyle = `rgba(255,248,235,${0.015 + rp * 0.03})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(left, ry); ctx.lineTo(right, ry); ctx.stroke();
    }

    // Lane groove lines
    for (let l = 1; l < LANE_COUNT; l++) {
      const topPos = laneAt(l, 0, W);
      const botPos = laneAt(l, 1, W);
      ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(topPos.x, 0); ctx.lineTo(botPos.x, hitY); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(topPos.x + 2, 0); ctx.lineTo(botPos.x + 2, hitY); ctx.stroke();
    }

    ctx.restore();

    // ── 3. TRACK EDGE RAILS ─────────────────────────────────────
    // Bezier curves that bow outward at the shoulder, reinforcing the hill-crest perspective.
    const railColor = puColor ?? 'rgba(255,248,235,0.35)';
    const railGlow  = puColor ? `${puColor}AA` : 'rgba(255,248,235,0.15)';

    const railGrad = ctx.createLinearGradient(0, 0, 0, hitY);
    railGrad.addColorStop(0, 'rgba(255,255,255,0.0)');
    railGrad.addColorStop(0.4, railGlow);
    railGrad.addColorStop(1, railColor);
    ctx.strokeStyle = railGrad; ctx.lineWidth = 2;
    // Left rail — bows left
    ctx.beginPath();
    ctx.moveTo(hwTop.left, 0);
    ctx.quadraticCurveTo(hwTop.left - hillBow, bowY, hwBot.left, hitY);
    ctx.stroke();
    // Right rail — bows right
    ctx.beginPath();
    ctx.moveTo(hwTop.right, 0);
    ctx.quadraticCurveTo(hwTop.right + hillBow, bowY, hwBot.right, hitY);
    ctx.stroke();

    // ── 4. POWER-UP SCREEN EDGE GLOW ───────────────────────────
    if (puActive && puColor) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 7);
      const ei    = Math.min(1, (pu.endTime - t) / 2) * pulse * 0.7;
      const hex   = Math.round(ei * 200).toString(16).padStart(2, '0');
      const eg1   = ctx.createLinearGradient(0, 0, 80, 0);
      eg1.addColorStop(0, `${puColor}${hex}`); eg1.addColorStop(1, 'transparent');
      ctx.fillStyle = eg1; ctx.fillRect(0, 0, 80, H);
      const eg2 = ctx.createLinearGradient(W, 0, W - 80, 0);
      eg2.addColorStop(0, `${puColor}${hex}`); eg2.addColorStop(1, 'transparent');
      ctx.fillStyle = eg2; ctx.fillRect(W - 80, 0, 80, H);
    }

    // ── 4.5. HIT ZONE BUTTONS (behind notes, semi-transparent) ──
    // Original height (space below hit line), centered so baseline bisects each button.
    const btnH = H - hitY;
    const btnY = hitY - btnH / 2;       // baseline runs through the exact center
    for (let i = 0; i < LANE_COUNT; i++) {
      const { x, w } = laneAt(i, 1, W);
      const pressed  = laneRef.current[i].pressed;
      const lc       = LANE_COLORS[i];
      const silenced = laneSilenced.current[i];
      const bx = x + 4; const bw = w - 8;
      const bTop = btnY + (pressed ? 2 : 0);

      // Key body — semi-transparent ivory
      const kGrad = ctx.createLinearGradient(bx, bTop, bx, bTop + btnH);
      if (pressed) {
        kGrad.addColorStop(0,   'rgba(210,203,191,0.52)');
        kGrad.addColorStop(1,   'rgba(195,188,175,0.56)');
      } else {
        kGrad.addColorStop(0,   'rgba(255,252,245,0.32)');
        kGrad.addColorStop(0.3, 'rgba(252,248,238,0.28)');
        kGrad.addColorStop(1,   'rgba(230,223,208,0.22)');
      }
      ctx.fillStyle = kGrad;
      ctx.beginPath(); ctx.roundRect(bx, bTop, bw, btnH, 10); ctx.fill();

      // Subtle border
      ctx.strokeStyle = pressed ? 'rgba(120,114,102,0.35)' : 'rgba(200,193,178,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(bx, bTop, bw, btnH, 10); ctx.stroke();

      // Colored stripe — centered exactly on hitY
      const stripeH   = Math.max(5, btnH * 0.06);
      const stripeTop = hitY - stripeH / 2 + (pressed ? 1 : 0);
      const stripeCol = silenced ? 'rgba(70,68,65,0.55)' : lc;
      ctx.shadowColor = silenced ? 'transparent' : lc;
      ctx.shadowBlur  = pressed ? 18 : 10;
      ctx.fillStyle   = stripeCol;
      ctx.globalAlpha = pressed ? 0.95 : (silenced ? 0.35 : 0.78);
      ctx.beginPath(); ctx.roundRect(bx + 4, stripeTop, bw - 8, stripeH, stripeH * 0.4); ctx.fill();
      // Bright core
      ctx.fillStyle = silenced ? 'rgba(50,48,45,0.3)' : 'rgba(255,255,255,0.5)';
      ctx.globalAlpha = pressed ? 0.75 : 0.55;
      ctx.beginPath(); ctx.roundRect(bx + 7, stripeTop + stripeH * 0.15, bw - 14, stripeH * 0.38, stripeH * 0.2); ctx.fill();
      ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';

      // Key label — below the baseline (lower half of key)
      const fs = Math.max(12, Math.floor(btnH * 0.13));
      ctx.fillStyle = pressed ? 'rgba(50,45,40,0.7)' : 'rgba(42,37,32,0.45)';
      ctx.font = `bold ${fs}px "Space Mono", monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(LANE_KEYS[i].toUpperCase(), x + w / 2, hitY + (H - hitY) * 0.42 + (pressed ? 2 : 0));

      // Muted overlay + ⊘ icon
      if (silenced) {
        ctx.fillStyle = 'rgba(0,0,0,0.32)';
        ctx.beginPath(); ctx.roundRect(bx, bTop, bw, btnH, 10); ctx.fill();
        const iconR = Math.min(bw, btnH) * 0.07;
        const iconX = bx + bw * 0.78; const iconY = hitY + (H - hitY) * 0.22;
        ctx.strokeStyle = 'rgba(180,70,70,0.65)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(iconX, iconY, iconR, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(iconX - iconR * 0.7, iconY + iconR * 0.7);
        ctx.lineTo(iconX + iconR * 0.7, iconY - iconR * 0.7); ctx.stroke();
      }
    }

    // ── 5. NOTES ────────────────────────────────────────────────
    let dirty = false;
    for (const ns of notesRef.current) {
      if (ns.hit || ns.missed) continue;
      const { note } = ns;
      const lc = LANE_COLORS[note.lane];
      const spawnT = note.time - APPROACH_TIME;
      const prog   = (t - spawnT) / APPROACH_TIME;
      const noteY  = prog * hitY;

      if (ns.holdActive) ns.holdProgress = Math.min(1, (t - note.time) / (note.holdDuration || 0.5));

      // Miss detection
      if (!ns.holdActive && note.type === 'tap' && t > note.time + MISS_WINDOW) {
        ns.missed = true; const gsx = gsRef.current; gsx.combo = 0; gsx.misses++;
        jRef.current = [...jRef.current.filter(x => Date.now() - x.ts < 600), { type: 'MISS', lane: note.lane, id: ++jCounter.current, ts: Date.now() }];
        muteLane(note.lane);
        dirty = true; continue;
      }
      if (note.type === 'hold' && !ns.holdActive && t > note.time + MISS_WINDOW) {
        ns.missed = true; const gsx = gsRef.current; gsx.combo = 0; gsx.misses++;
        muteLane(note.lane);
        dirty = true; continue;
      }
      if (noteY < -80) continue;

      const { x: lx, w: lw } = laneAt(note.lane, prog, W);
      const noteH = lerp(22, 54, prog);   // perspective scale — bigger closer
      const noteX = lx + 7; const noteW = lw - 14;
      const r     = noteH * 0.32;

      if (note.type === 'tap') {
        drawKey(ctx, noteX, noteY, noteW, noteH, r, lc, prog, false);
      } else {
        // Hold trail — ivory ribbon with colored stripe
        const holdDur = note.holdDuration || 0.5;
        const headP   = Math.max(0, prog - holdDur / APPROACH_TIME);
        const headY   = headP * hitY;

        if (ns.holdActive) {
          const top = lerp(headY, hitY, ns.holdProgress);
          if (noteY > top) {
            const { x: ax, w: aw } = laneAt(note.lane, Math.min(prog, 1), W);
            // Trail body (ivory semi-transparent)
            ctx.fillStyle = 'rgba(245,240,228,0.18)';
            ctx.beginPath(); ctx.roundRect(ax + aw * 0.25, top, aw * 0.5, noteY - top + noteH / 2, 4); ctx.fill();
            // Colored stripe through the trail
            ctx.fillStyle = lc; ctx.globalAlpha = 0.55;
            ctx.shadowColor = lc; ctx.shadowBlur = 8;
            ctx.beginPath(); ctx.roundRect(ax + aw * 0.38, top, aw * 0.24, noteY - top + noteH / 2, 2); ctx.fill();
            ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
          }
        } else if (headY < noteY) {
          const { x: hx, w: hw } = laneAt(note.lane, headP, W);
          ctx.fillStyle = 'rgba(245,240,228,0.15)';
          ctx.beginPath();
          ctx.moveTo(hx + hw * 0.25, headY); ctx.lineTo(hx + hw * 0.75, headY);
          ctx.lineTo(lx + lw * 0.75, noteY + noteH / 2); ctx.lineTo(lx + lw * 0.25, noteY + noteH / 2);
          ctx.closePath(); ctx.fill();
          // Colored center ribbon
          ctx.fillStyle = lc; ctx.globalAlpha = 0.45;
          ctx.shadowColor = lc; ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.moveTo(hx + hw * 0.40, headY); ctx.lineTo(hx + hw * 0.60, headY);
          ctx.lineTo(lx + lw * 0.60, noteY + noteH / 2); ctx.lineTo(lx + lw * 0.40, noteY + noteH / 2);
          ctx.closePath(); ctx.fill();
          ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
        }
        drawKey(ctx, noteX, noteY, noteW, noteH, r, lc, prog, true);
      }
    }

    // ── 5b. HIT EXPLOSION EFFECTS ───────────────────────────────
    const FX_DURATION = 520;
    const nowMs = Date.now();
    hitFxRef.current = hitFxRef.current.filter(e => nowMs - e.startMs < FX_DURATION);
    for (const e of hitFxRef.current) {
      const t01 = (nowMs - e.startMs) / FX_DURATION; // 0→1
      const dt  = (nowMs - e.startMs) / 1000;        // seconds
      const easeOut = 1 - t01;

      // ─ Lane flash: bright overlay on the key area fading fast ─
      if (t01 < 0.18) {
        const flashAlpha = (1 - t01 / 0.18) * (e.kind === 'PERFECT+' ? 0.55 : 0.35);
        const { x: fx, w: fw } = laneAt(e.lane, 1, W);
        const flashGrad = ctx.createLinearGradient(fx, e.cy - 60, fx, e.cy + 40);
        flashGrad.addColorStop(0, `${e.color}00`);
        flashGrad.addColorStop(0.4, `${e.color}${Math.round(flashAlpha * 255).toString(16).padStart(2, '0')}`);
        flashGrad.addColorStop(1, `${e.color}${Math.round(flashAlpha * 0.5 * 255).toString(16).padStart(2, '0')}`);
        ctx.fillStyle = flashGrad;
        ctx.fillRect(fx + 4, e.cy - 60, fw - 8, 100);
      }

      // ─ Expanding rings ─
      const rings = e.kind === 'PERFECT+' ? 2 : 1;
      for (let r = 0; r < rings; r++) {
        const delay = r * 0.08;
        const rt = Math.max(0, (t01 - delay) / (1 - delay));
        if (rt <= 0) continue;
        const maxR = e.kind === 'PERFECT+' ? (r === 0 ? 60 : 85) : 52;
        const ringR = rt * maxR;
        const ringAlpha = Math.pow(1 - rt, 1.6) * (r === 0 ? 0.9 : 0.55);
        const ringW = lerp(r === 0 ? 5 : 3, 0.5, rt);
        ctx.save();
        ctx.shadowColor = e.color; ctx.shadowBlur = 10;
        ctx.strokeStyle = e.color + Math.round(ringAlpha * 255).toString(16).padStart(2, '0');
        ctx.lineWidth = ringW;
        ctx.beginPath(); ctx.arc(e.cx, e.cy, ringR, 0, Math.PI * 2); ctx.stroke();
        // White inner core ring (only first ring, very brief)
        if (r === 0 && t01 < 0.2) {
          const coreAlpha = (1 - t01 / 0.2) * 0.6;
          ctx.strokeStyle = `rgba(255,255,255,${coreAlpha})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(e.cx, e.cy, ringR * 0.45, 0, Math.PI * 2); ctx.stroke();
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
        ctx.shadowColor = e.color; ctx.shadowBlur = size * 2.5;
        ctx.fillStyle = e.color + Math.round(life * 255).toString(16).padStart(2, '0');
        ctx.beginPath(); ctx.arc(px, py, size, 0, Math.PI * 2); ctx.fill();
      }
      ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';

      // ─ PERFECT+ sparkle stars ─
      if (e.kind === 'PERFECT+' && t01 < 0.6) {
        const starCount = 5;
        for (let s = 0; s < starCount; s++) {
          const angle = (s / starCount) * Math.PI * 2 + t01 * 2.5;
          const dist  = 30 + t01 * 55;
          const sx = e.cx + Math.cos(angle) * dist;
          const sy = e.cy + Math.sin(angle) * dist;
          const starAlpha = Math.pow(1 - t01 / 0.6, 1.4) * 0.85;
          const starSize  = lerp(5, 1.5, t01 / 0.6);
          ctx.strokeStyle = '#fff' + Math.round(starAlpha * 255).toString(16).padStart(2, '0');
          ctx.lineWidth = 1.5; ctx.shadowColor = '#fff'; ctx.shadowBlur = 6;
          // 4-point star (two crossed lines)
          ctx.beginPath();
          ctx.moveTo(sx - starSize, sy); ctx.lineTo(sx + starSize, sy); ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(sx, sy - starSize); ctx.lineTo(sx, sy + starSize); ctx.stroke();
        }
      }
      ctx.restore();
      void easeOut; // suppress unused warning
    }

    // ── 6. HIT ZONE BASELINE ────────────────────────────────────
    // Thick white glowing baseline — the stripe on the note must line up with this
    ctx.shadowColor = 'rgba(255,255,255,0.8)'; ctx.shadowBlur = 18;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(hwBot.left - 16, hitY); ctx.lineTo(hwBot.right + 16, hitY); ctx.stroke();
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    // Subtle glow bloom below baseline
    const baseGlow = ctx.createLinearGradient(0, hitY, 0, hitY + 20);
    baseGlow.addColorStop(0, 'rgba(255,255,255,0.08)');
    baseGlow.addColorStop(1, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = baseGlow; ctx.fillRect(hwBot.left - 16, hitY, hwBot.width + 32, 20);

    // ── 7. MEDAL PROGRESS METER ─────────────────────────────────
    const MEDAL_STOPS = [
      { name: 'BRONZE',   acc: 40, color: '#CD7F32' },
      { name: 'SILVER',   acc: 60, color: '#C0C0C0' },
      { name: 'GOLD',     acc: 80, color: '#FFD700' },
      { name: 'PLATINUM', acc: 93, color: '#E0E0FF' },
    ];
    const MEDAL_COLOR_MAP: Record<string, string> = {
      BRONZE: '#CD7F32', SILVER: '#C0C0C0', GOLD: '#FFD700', PLATINUM: '#E0E0FF', NONE: '#444',
    };
    const { perfectPlus: pp, perfects: pfp, goods: gd, misses: ms } = gs;
    const tot = pp + pfp + gd + ms;
    const acc = tot > 0 ? ((pp + pfp * 0.9 + gd * 0.5) / tot) * 100 : 0;
    const curMedal =
      acc >= 93 ? 'PLATINUM' : acc >= 80 ? 'GOLD' : acc >= 60 ? 'SILVER' : acc >= 40 ? 'BRONZE' : 'NONE';

    // Trigger stamp on new medal
    if (curMedal !== 'NONE' && curMedal !== lastMedalRef.current) {
      lastMedalRef.current = curMedal;
      medalStampRef.current = { medal: curMedal, startT: t };
    }

    // Bar geometry — thin strip at very bottom
    const bPad = 14; const bH = 7; const bY = H - bH - 8;
    const bX = bPad; const bW = W - bPad * 2;

    // Track bg
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.roundRect(bX, bY, bW, bH, bH / 2); ctx.fill();

    // Filled portion
    const fillFrac = Math.min(acc / 93, 1);
    if (fillFrac > 0) {
      const fW = bW * fillFrac;
      const fg = ctx.createLinearGradient(bX, 0, bX + bW, 0);
      fg.addColorStop(0,    '#CD7F32');
      fg.addColorStop(0.43, '#C0C0C0');
      fg.addColorStop(0.72, '#FFD700');
      fg.addColorStop(1,    '#E0E0FF');
      ctx.shadowColor = MEDAL_COLOR_MAP[curMedal]; ctx.shadowBlur = 10;
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.roundRect(bX, bY, fW, bH, bH / 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
      // Sheen highlight
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath(); ctx.roundRect(bX, bY, fW, bH * 0.45, [bH / 2, bH / 2, 0, 0]); ctx.fill();
    }

    // Medal threshold ticks + labels
    for (const ms2 of MEDAL_STOPS) {
      const mx = bX + bW * (ms2.acc / 93);
      const achieved = fillFrac >= ms2.acc / 93;
      ctx.strokeStyle = achieved ? ms2.color : 'rgba(100,100,100,0.5)';
      ctx.lineWidth = achieved ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(mx, bY - 5); ctx.lineTo(mx, bY + bH + 5); ctx.stroke();
      ctx.font = `bold 7px "Space Mono", monospace`;
      ctx.fillStyle = achieved ? ms2.color : 'rgba(100,100,100,0.5)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
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
        let scale: number; let alpha: number;
        if (t01 < 0.18) {
          // Smash in: huge → normal
          const inT = t01 / 0.18;
          scale = 2.6 - 1.6 * (1 - Math.pow(1 - inT, 2.5));
          alpha = 1;
        } else if (t01 < 0.72) {
          // Hold with triple bounce
          scale = 1 + 0.08 * Math.abs(Math.sin((t01 - 0.18) / 0.54 * Math.PI * 3));
          alpha = 1;
        } else {
          // Fade out
          scale = 1;
          alpha = 1 - (t01 - 0.72) / 0.28;
        }
        const mc = MEDAL_COLOR_MAP[stamp.medal] ?? '#fff';
        const scx = W / 2; const scy = H * 0.36;
        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.translate(scx, scy); ctx.scale(scale, scale);
        // Glow halo
        ctx.shadowColor = mc; ctx.shadowBlur = 36;
        const sw = 230; const sh = 68;
        ctx.fillStyle = 'rgba(8,8,12,0.82)';
        ctx.beginPath(); ctx.roundRect(-sw / 2, -sh / 2, sw, sh, 10); ctx.fill();
        ctx.shadowBlur = 0;
        // Border
        ctx.strokeStyle = mc; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.roundRect(-sw / 2, -sh / 2, sw, sh, 10); ctx.stroke();
        // ★ MEDAL NAME ★
        ctx.fillStyle = mc;
        ctx.font = `bold 26px "Space Mono", monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`★ ${stamp.medal} ★`, 0, -8);
        // Sub-label
        ctx.font = `bold 10px "Space Mono", monospace`;
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.fillText('MEDAL UNLOCKED', 0, 18);
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }

    if (dirty) syncDisplay();

    // ── end check ──
    const allDone = notesRef.current.every(ns => ns.hit || ns.missed);
    const lastT   = notesRef.current.length ? Math.max(...notesRef.current.map(ns => ns.note.time)) : 0;
    if ((allDone && t > lastT + 1.5 && t > 2) || t >= song.duration) { finishGame(); return; }

    rafRef.current = requestAnimationFrame(draw);
  }, [getT, syncDisplay, finishGame, muteLane]);

  // ── keyboard ──
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const lane = LANE_KEYS.indexOf(e.key.toLowerCase()); if (lane < 0) return;
      laneRef.current[lane].pressed = true; hitLane(lane);
    };
    const onUp = (e: KeyboardEvent) => {
      const lane = LANE_KEYS.indexOf(e.key.toLowerCase()); if (lane < 0) return;
      laneRef.current[lane].pressed = false; releaseLane(lane);
    };
    window.addEventListener('keydown', onDown); window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
  }, [hitLane, releaseLane]);

  // ── touch ──
  const onTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const lane = Math.floor(((touch.clientX - rect.left) / rect.width) * LANE_COUNT);
      if (lane >= 0 && lane < LANE_COUNT) { laneRef.current[lane].pressed = true; laneRef.current[lane].touchId = touch.identifier; hitLane(lane); }
    }
  }, [hitLane]);

  const onTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      for (let lane = 0; lane < LANE_COUNT; lane++) {
        if (laneRef.current[lane].touchId === touch.identifier) { laneRef.current[lane].pressed = false; laneRef.current[lane].touchId = undefined; releaseLane(lane); }
      }
    }
  }, [releaseLane]);

  // ── canvas resize ──
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const resize = () => { const p = canvas.parentElement; if (!p) return; canvas.width = p.clientWidth; canvas.height = p.clientHeight; };
    resize(); window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // ── init ──
  useEffect(() => {
    if (!songId) { setLocation('/songs'); return; }
    let cancelled = false; let audio: HTMLAudioElement | null = null;

    const init = async () => {
      setLoadMsg('FETCHING TRANSMISSION...'); phaseRef.current = 'loading'; setPhase('loading');
      const song = await getSongById(songId);
      if (cancelled || !song) { setLocation('/songs'); return; }
      if (isSongTimeLocked(song)) { setLocation('/campaign'); return; }
      songRef.current = song;
      // Pre-load + pre-blur cover art for background effect
      coverImgRef.current = null; coverBlurRef.current = null; scanPatternRef.current = null;
      if (song.coverArt) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          coverImgRef.current = img;
          const off = document.createElement('canvas');
          off.width = 512; off.height = 512;
          const offCtx = off.getContext('2d')!;
          offCtx.filter = 'blur(10px) brightness(0.52) saturate(1.5)';
          offCtx.drawImage(img, -24, -24, 560, 560);
          offCtx.filter = 'none';
          coverBlurRef.current = off;
        };
        img.src = song.coverArt;
      }
      notesRef.current = song.notes.map(n => ({ note: { ...n, lane: Math.min(n.lane, LANE_COUNT - 1) }, hit: false, missed: false, holdActive: false, holdProgress: 0 }));
      gsRef.current = { score: 0, combo: 0, maxCombo: 0, perfectPlus: 0, perfects: 0, goods: 0, misses: 0, progress: 0 };
      puRef.current  = { active: null, endTime: 0, startTime: 0, multiplier: 1, color: '#fff', label: '', duration: 0, triggered: new Set() };

      setLoadMsg('BUFFERING AUDIO...'); phaseRef.current = 'buffering'; setPhase('buffering');
      audio = new Audio(); audio.crossOrigin = 'anonymous'; audio.preload = 'auto'; audioRef.current = audio;
      audio.addEventListener('progress', () => {
        if (!audio?.duration) return; const buf = audio.buffered;
        if (buf.length) setBufferPct(Math.min(100, Math.round((buf.end(buf.length - 1) / audio.duration) * 100)));
      });
      audio.src = song.audioUrl; audio.load();
      await new Promise<void>(resolve => {
        audio!.addEventListener('canplay', () => resolve(), { once: true });
        audio!.addEventListener('error',   () => resolve(), { once: true });
        setTimeout(resolve, 15000);
      });
      if (cancelled) return;

      phaseRef.current = 'countdown'; setPhase('countdown');
      let count = 3; setCountdown(count);
      await new Promise<void>(resolve => {
        const tick = setInterval(() => { count--; if (count > 0) setCountdown(count); else { clearInterval(tick); setCountdown(0); resolve(); } }, 1000);
      });
      if (cancelled) return;

      phaseRef.current = 'playing'; setPhase('playing');

      // ── Web Audio frequency-band routing ──────────────────────
      // Lane 0 (A) → bass  · Lane 1 (S) → mids  · Lane 2 (D) → treble
      try {
        const actx = new AudioContext();
        audioCtxRef.current = actx;
        await actx.resume();
        const src = actx.createMediaElementSource(audio);
        const bandDefs: { type: BiquadFilterType; freq: number; Q: number }[] = [
          { type: 'lowpass',  freq: 300,  Q: 0.8 },
          { type: 'bandpass', freq: 1200, Q: 0.7 },
          { type: 'highpass', freq: 3200, Q: 0.8 },
        ];
        laneGainsRef.current = bandDefs.map(({ type, freq, Q }) => {
          const f = actx.createBiquadFilter();
          f.type = type; f.frequency.value = freq; f.Q.value = Q;
          const g = actx.createGain(); g.gain.value = 1.0;
          src.connect(f); f.connect(g); g.connect(actx.destination);
          return g;
        });
        laneSilenced.current = [false, false, false];
      } catch {
        // CORS or browser restriction — fall back to direct playback (no muting)
      }

      await audio.play();
      rafRef.current = requestAnimationFrame(draw);
    };

    init().catch(() => { if (!cancelled) setLocation('/songs'); });
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      if (audio) { audio.pause(); audio.src = ''; }
      audioRef.current = null;
      laneRestoreTimers.current.forEach(clearTimeout);
      if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }
      laneGainsRef.current = [];
      laneSilenced.current = [false, false, false];
    };
  }, [songId, draw, setLocation]);

  // ── render ──
  const gs = displayGs; const song = songRef.current;
  const puColor = puDisplay?.color ?? '#E5B800';
  const comboColor = gs.combo < 10 ? '#888' : gs.combo < 20 ? LANE_COLORS[2] : gs.combo < 40 ? '#E5B800' : gs.combo < 60 ? '#E53A00' : '#48E5C2';

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ background: '#0c0c14' }}>
      {/* HUD */}
      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button data-testid="button-quit" onClick={() => { audioRef.current?.pause(); setLocation('/songs'); }}
          className="font-mono text-xs tracking-widest transition-colors" style={{ color: 'hsl(30 15% 30%)' }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#E53A00')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'hsl(30 15% 30%)')}>
          ✕ QUIT
        </button>
        <div className="flex items-center gap-8">
          <div className="text-center">
            <div className="font-mono text-xs" style={{ color: 'hsl(30 15% 38%)' }}>SCORE</div>
            <div className="font-mono font-bold text-xl leading-none" data-testid="text-score" style={{ color: '#F2EDE5', letterSpacing: '0.05em' }}>
              {gs.score.toLocaleString()}
            </div>
          </div>
          <div className="text-center">
            <div className="font-mono text-xs" style={{ color: 'hsl(30 15% 38%)' }}>COMBO</div>
            <div className="font-mono font-bold text-xl leading-none" data-testid="text-combo"
              style={{ color: comboColor, textShadow: gs.combo >= 20 ? `0 0 12px ${comboColor}` : 'none' }}>
              {gs.combo > 0 ? gs.combo : '—'}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-xs truncate max-w-28" style={{ color: 'hsl(30 15% 38%)' }}>{song?.title ?? ''}</div>
          <div className="flex gap-2 justify-end mt-0.5">
            <span className="font-mono text-xs" style={{ color: '#E5B800' }}>✦{gs.perfectPlus}</span>
            <span className="font-mono text-xs" style={{ color: '#48E5C2' }}>✓{gs.perfects}</span>
            <span className="font-mono text-xs" style={{ color: '#A855F7' }}>~{gs.goods}</span>
            <span className="font-mono text-xs" style={{ color: '#444' }}>✗{gs.misses}</span>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 flex-shrink-0" style={{ background: 'rgba(255,255,255,0.04)' }}>
        <div className="h-full" style={{ width: `${(gs.progress || 0) * 100}%`, background: 'linear-gradient(90deg, #E53A00, #A855F7, #48E5C2)', transition: 'width 0.2s linear' }} />
      </div>

      {/* Canvas */}
      <div className="relative flex-1 overflow-hidden">
        <canvas ref={canvasRef} className="w-full h-full block" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} data-testid="canvas-game" />

        {/* Power-up banner */}
        {puDisplay && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 pointer-events-none">
            <div className="font-mono font-bold text-base px-5 py-2 tracking-[0.3em]"
              style={{ color: puColor, border: `2px solid ${puColor}`, background: `${puColor}18`, textShadow: `0 0 20px ${puColor}`, boxShadow: `0 0 30px ${puColor}40`, clipPath: 'polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)' }}>
              {puDisplay.label} ×{puDisplay.multiplier}
            </div>
            <div className="w-36 h-1" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div className="h-full" style={{ width: `${puDisplay.progress * 100}%`, background: puColor }} />
            </div>
          </div>
        )}

        {/* Judgment text */}
        {displayJudge.map(j => {
          if (Date.now() - j.ts > 600) return null;
          const pct   = (j.lane / LANE_COUNT + 1 / (LANE_COUNT * 2)) * 100;
          const color = j.type === 'PERFECT+' ? '#E5B800' : j.type === 'PERFECT' ? '#48E5C2' : j.type === 'GOOD' ? '#A855F7' : '#444';
          return (
            <div key={j.id} className="absolute font-mono font-bold pointer-events-none judgment-pop"
              style={{ left: `${pct}%`, top: '72%', transform: 'translateX(-50%)', color, textShadow: `0 0 18px ${color}`, letterSpacing: '0.12em', fontSize: j.type === 'PERFECT+' ? 15 : 12 }}>
              {j.type}
            </div>
          );
        })}

        {/* Loading overlay */}
        {(phase === 'loading' || phase === 'buffering') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5" style={{ background: 'rgba(12,12,20,0.97)' }}>
            <div className="font-mono text-xs tracking-[0.3em]" style={{ color: '#48E5C2' }}>{loadMsg}</div>
            {song && (
              <div className="text-center">
                {song.coverArt && <img src={song.coverArt} alt={song.title} className="w-24 h-24 object-cover mx-auto mb-3 opacity-60" style={{ border: '1px solid rgba(255,255,255,0.1)' }} />}
                <div className="font-mono font-bold text-lg" style={{ color: '#F2EDE5' }}>{song.title}</div>
                <div className="font-mono text-xs mt-1" style={{ color: 'hsl(30 15% 45%)' }}>DAY {song.day} · {song.bpm} BPM · {song.notes.length} NOTES</div>
              </div>
            )}
            {phase === 'buffering' && bufferPct > 0 && (
              <div className="w-48">
                <div className="h-0.5 w-full mb-1" style={{ background: 'rgba(255,255,255,0.08)' }}><div className="h-full" style={{ width: `${bufferPct}%`, background: '#E53A00' }} /></div>
                <div className="font-mono text-xs text-center" style={{ color: 'hsl(30 15% 40%)' }}>{bufferPct}%</div>
              </div>
            )}
            <div className="flex gap-1">{[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: LANE_COLORS[i], animationDelay: `${i * 0.15}s` }} />)}</div>
          </div>
        )}

        {/* Countdown */}
        {phase === 'countdown' && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(12,12,20,0.82)' }}>
            <div className="font-mono font-bold text-center" style={{ fontSize: 120, lineHeight: 1, background: 'linear-gradient(135deg, #E53A00, #A855F7, #48E5C2)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 30px rgba(168,85,247,0.5))' }}>
              {countdown > 0 ? countdown : 'GO!'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  KEY NOTE DRAWING — ivory piano key with colored center stripe
// ═══════════════════════════════════════════════════════════════
function drawKey(
  ctx: CanvasRenderingContext2D,
  noteX: number, noteY: number,
  noteW: number, noteH: number,
  r: number, lc: string, prog: number,
  _isHold: boolean
) {
  // ── Drop shadow ──
  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur  = lerp(4, 14, prog);
  ctx.shadowOffsetY = lerp(2, 5, prog);

  // ── Ivory body ──
  const bodyGrad = ctx.createLinearGradient(noteX, noteY - noteH / 2, noteX, noteY + noteH / 2);
  bodyGrad.addColorStop(0,    'rgba(255, 252, 243, 0.98)');
  bodyGrad.addColorStop(0.22, 'rgba(252, 248, 238, 0.97)');
  bodyGrad.addColorStop(0.75, 'rgba(242, 236, 220, 0.97)');
  bodyGrad.addColorStop(1,    'rgba(228, 220, 204, 0.96)');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath(); ctx.roundRect(noteX, noteY - noteH / 2, noteW, noteH, r); ctx.fill();

  // ── Subtle edge border ──
  ctx.shadowColor   = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.strokeStyle   = 'rgba(160, 150, 132, 0.45)';
  ctx.lineWidth     = 1;
  ctx.beginPath(); ctx.roundRect(noteX, noteY - noteH / 2, noteW, noteH, r); ctx.stroke();

  // ── Top highlight (3D key bevel) ──
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.beginPath();
  ctx.roundRect(noteX + 3, noteY - noteH / 2 + 2, noteW - 6, noteH * 0.18, [r, r, 0, 0]);
  ctx.fill();

  // ── COLORED CENTER STRIPE ── (this is the PERFECT+ target line)
  const stripeH = Math.max(6, noteH * 0.26);
  const stripeY = noteY - stripeH / 2;

  // Outer glow
  ctx.shadowColor = lc; ctx.shadowBlur = lerp(14, 30, prog);
  ctx.fillStyle   = lc; ctx.globalAlpha = 0.9;
  ctx.beginPath(); ctx.roundRect(noteX + 2, stripeY, noteW - 4, stripeH, stripeH * 0.35); ctx.fill();

  // Bright inner core of stripe
  const coreGrad = ctx.createLinearGradient(noteX, stripeY, noteX, stripeY + stripeH);
  coreGrad.addColorStop(0,   'rgba(255,255,255,0.5)');
  coreGrad.addColorStop(0.4, 'rgba(255,255,255,0.85)');
  coreGrad.addColorStop(1,   'rgba(255,255,255,0.2)');
  ctx.fillStyle = coreGrad; ctx.globalAlpha = 0.75;
  ctx.beginPath();
  ctx.roundRect(noteX + 5, stripeY + stripeH * 0.08, noteW - 10, stripeH * 0.48, stripeH * 0.2);
  ctx.fill();

  ctx.globalAlpha  = 1;
  ctx.shadowBlur   = 0;
  ctx.shadowColor  = 'transparent';
}
