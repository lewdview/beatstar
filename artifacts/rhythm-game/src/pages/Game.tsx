import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { getSongById, saveHighScore } from "@/game/api";
import type { GameSong } from "@/game/api";
import type { Note, JudgmentDisplay, GameState } from "@/game/types";

// ── constants ────────────────────────────────────────────────────
const LANE_COUNT    = 3;
const LANE_KEYS     = ['a', 's', 'd'];
const LANE_COLORS   = ['#E53A00', '#A855F7', '#48E5C2'];
const LANE_GLOW     = ['rgba(229,58,0,0.7)', 'rgba(168,85,247,0.7)', 'rgba(72,229,194,0.7)'];

const APPROACH_TIME   = 2.0;
const HIT_RATIO       = 0.80;   // hit zone at 80% of canvas height
const PERFECT_WINDOW  = 0.065;
const GOOD_WINDOW     = 0.130;
const MISS_WINDOW     = 0.185;

// Perspective highway: top is 58% wide, bottom is 97%
const HW_TOP  = 0.58;
const HW_BOT  = 0.97;

const POWER_UPS = [
  { threshold: 20, type: 'FEVER',       duration: 9,  multiplier: 2, color: '#E5B800', label: 'FEVER'       },
  { threshold: 40, type: 'SURGE',       duration: 11, multiplier: 3, color: '#E53A00', label: 'SURGE'       },
  { threshold: 60, type: 'SIGNAL_LOCK', duration: 14, multiplier: 4, color: '#48E5C2', label: 'SIGNAL LOCK' },
] as const;
type PUType = typeof POWER_UPS[number]['type'];

// ── helpers ──────────────────────────────────────────────────────
function lerp(a: number, b: number, t: number) { return a + (b - a) * Math.max(0, Math.min(1, t)); }

/** Returns left edge and width of lane at a given y (0=top, hitY=hit zone) */
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

function calcBase(j: 'PERFECT' | 'GOOD') { return j === 'PERFECT' ? 300 : 150; }
function getRank(p: number, g: number, m: number) {
  const tot = p + g + m;
  if (!tot) return 'D';
  if (!m && !g) return 'S';
  if (!m && p / tot >= 0.9) return 'A';
  if (p / tot >= 0.8) return 'B';
  if (p / tot >= 0.6) return 'C';
  return 'D';
}

// ── interfaces ───────────────────────────────────────────────────
interface NoteState {
  note: Note; hit: boolean; missed: boolean;
  holdActive: boolean; holdProgress: number;
}
interface LanePress { pressed: boolean; touchId?: number; }
interface PUState {
  active: PUType | null; endTime: number; startTime: number;
  multiplier: number; color: string; label: string; duration: number;
  triggered: Set<number>;
}

// ── component ────────────────────────────────────────────────────
export default function Game() {
  const { songId } = useParams<{ songId: string }>();
  const [, setLocation] = useLocation();

  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const audioRef   = useRef<HTMLAudioElement | null>(null);
  const rafRef     = useRef<number>(0);
  const notesRef   = useRef<NoteState[]>([]);
  const laneRef    = useRef<LanePress[]>(Array.from({ length: 3 }, () => ({ pressed: false })));
  const gsRef      = useRef<GameState>({ score: 0, combo: 0, maxCombo: 0, perfects: 0, goods: 0, misses: 0, progress: 0 });
  const jRef       = useRef<JudgmentDisplay[]>([]);
  const jCounter   = useRef(0);
  const songRef    = useRef<GameSong | null>(null);
  const phaseRef   = useRef<'loading'|'buffering'|'countdown'|'playing'|'finished'>('loading');
  const puRef      = useRef<PUState>({ active: null, endTime: 0, startTime: 0, multiplier: 1, color: '#fff', label: '', duration: 0, triggered: new Set() });

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

  // ── score with power-up multiplier ──
  const calcScore = useCallback((combo: number, j: 'PERFECT' | 'GOOD') => {
    const pu = puRef.current;
    const t  = getT();
    const puMul = (pu.active && t < pu.endTime) ? pu.multiplier : 1;
    const comboMul = combo < 10 ? 1 : combo < 25 ? 1.5 : combo < 50 ? 2 : 3;
    return Math.round(calcBase(j) * puMul * comboMul);
  }, [getT]);

  // ── check & activate power-ups ──
  const checkPowerUps = useCallback((combo: number) => {
    const pu = puRef.current;
    const t  = getT();
    for (const pw of POWER_UPS) {
      if (combo >= pw.threshold && !pu.triggered.has(pw.threshold)) {
        pu.triggered.add(pw.threshold);
        pu.active      = pw.type;
        pu.endTime     = t + pw.duration;
        pu.startTime   = t;
        pu.multiplier  = pw.multiplier;
        pu.color       = pw.color;
        pu.label       = pw.label;
        pu.duration    = pw.duration;
        setPuDisplay({ label: pw.label, color: pw.color, multiplier: pw.multiplier, progress: 1 });
        break;
      }
    }
  }, [getT]);

  // ── hit detection ──
  const hitLane = useCallback((lane: number) => {
    if (phaseRef.current !== 'playing') return;
    const t = getT();
    const candidates = notesRef.current.filter(ns => ns.note.lane === lane && !ns.hit && !ns.missed);
    if (!candidates.length) return;
    const ns = candidates.reduce((b, c) => Math.abs(c.note.time - t) < Math.abs(b.note.time - t) ? c : b);
    const diff = Math.abs(ns.note.time - t);
    if (diff > MISS_WINDOW) return;
    const j: 'PERFECT' | 'GOOD' | null = diff <= PERFECT_WINDOW ? 'PERFECT' : diff <= GOOD_WINDOW ? 'GOOD' : null;
    if (!j) return;

    if (ns.note.type === 'hold') ns.holdActive = true;
    else ns.hit = true;

    const gs = gsRef.current;
    gs.score += calcScore(gs.combo, j);
    gs.combo++;
    gs.maxCombo = Math.max(gs.maxCombo, gs.combo);
    if (j === 'PERFECT') gs.perfects++; else gs.goods++;
    checkPowerUps(gs.combo);

    const jid = ++jCounter.current;
    jRef.current = [...jRef.current.filter(x => Date.now() - x.ts < 550), { type: j, lane, id: jid, ts: Date.now() }];
    syncDisplay();
  }, [getT, calcScore, checkPowerUps, syncDisplay]);

  const releaseLane = useCallback((lane: number) => {
    if (phaseRef.current !== 'playing') return;
    const ns = notesRef.current.find(n => n.note.lane === lane && n.note.type === 'hold' && n.holdActive && !n.hit);
    if (!ns) return;
    ns.hit = true; ns.holdActive = false;
    if (ns.holdProgress > 0.6) {
      const gs = gsRef.current;
      gs.score += calcScore(gs.combo, 'PERFECT');
      gs.combo++; gs.maxCombo = Math.max(gs.maxCombo, gs.combo); gs.perfects++;
      checkPowerUps(gs.combo);
      const jid = ++jCounter.current;
      jRef.current = [...jRef.current.filter(x => Date.now() - x.ts < 550), { type: 'PERFECT', lane, id: jid, ts: Date.now() }];
    }
    syncDisplay();
  }, [calcScore, checkPowerUps, syncDisplay]);

  // ── finish ──
  const finishGame = useCallback(() => {
    if (phaseRef.current === 'finished') return;
    phaseRef.current = 'finished'; setPhase('finished');
    cancelAnimationFrame(rafRef.current);
    audioRef.current?.pause();
    const gs = gsRef.current;
    if (songRef.current) saveHighScore(songRef.current.id, gs.score);
    sessionStorage.setItem(`result_${songId}`, JSON.stringify({
      score: gs.score, maxCombo: gs.maxCombo,
      perfects: gs.perfects, goods: gs.goods, misses: gs.misses,
      rank: getRank(gs.perfects, gs.goods, gs.misses),
      total: gs.perfects + gs.goods + gs.misses,
    }));
    setTimeout(() => setLocation(`/results/${songId}`), 800);
  }, [songId, setLocation]);

  // ── draw loop ──
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || phaseRef.current !== 'playing') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const song = songRef.current;
    if (!song) return;

    const t   = getT();
    const W   = canvas.width;
    const H   = canvas.height;
    const hitY = H * HIT_RATIO;
    const gs  = gsRef.current;
    const pu  = puRef.current;

    gs.progress = Math.min(1, t / song.duration);

    // Update power-up display
    if (pu.active && t < pu.endTime) {
      setPuDisplay({ label: pu.label, color: pu.color, multiplier: pu.multiplier, progress: (pu.endTime - t) / pu.duration });
    } else if (pu.active && t >= pu.endTime) {
      pu.active = null;
      setPuDisplay(null);
    }

    // ── background ──
    ctx.fillStyle = '#05030d';
    ctx.fillRect(0, 0, W, H);

    // Vanishing point radial gradient
    const vpGrad = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, H * 0.7);
    vpGrad.addColorStop(0, 'rgba(120,60,220,0.12)');
    vpGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = vpGrad;
    ctx.fillRect(0, 0, W, H);

    // ── highway floor grid ──
    const hwTop = hwAtProgress(0, W);
    const hwBot = hwAtProgress(1, W);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(hwTop.left, 0);
    ctx.lineTo(hwTop.right, 0);
    ctx.lineTo(hwBot.right, hitY);
    ctx.lineTo(hwBot.left, hitY);
    ctx.closePath();
    ctx.clip();

    // Perspective horizontal lines
    for (let row = 0; row <= 10; row++) {
      const ry = (row / 10) * hitY;
      const rp = ry / hitY;
      const { left, right } = hwAtProgress(rp, W);
      ctx.strokeStyle = `rgba(80,40,160,${0.08 + rp * 0.12})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(left, ry); ctx.lineTo(right, ry); ctx.stroke();
    }
    // Lane divider vertical lines (converging)
    for (let lane = 1; lane < LANE_COUNT; lane++) {
      const top = laneAt(lane, 0, W);
      const bot = laneAt(lane, 1, W);
      const lineGrad = ctx.createLinearGradient(0, 0, 0, hitY);
      lineGrad.addColorStop(0, 'rgba(255,255,255,0.0)');
      lineGrad.addColorStop(1, 'rgba(255,255,255,0.15)');
      ctx.strokeStyle = lineGrad;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(top.x, 0); ctx.lineTo(bot.x, hitY); ctx.stroke();
    }
    ctx.restore();

    // ── neon corridor walls ──
    // Left wall
    const puColor = (pu.active && t < pu.endTime) ? pu.color : '#48E5C2';
    const wallW = W * 0.055;
    const lWallGrad = ctx.createLinearGradient(hwBot.left, 0, hwBot.left - wallW, 0);
    lWallGrad.addColorStop(0, `${puColor}90`);
    lWallGrad.addColorStop(0.4, `${puColor}30`);
    lWallGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.moveTo(hwTop.left, 0); ctx.lineTo(hwBot.left, hitY);
    ctx.lineTo(hwBot.left - wallW, hitY); ctx.lineTo(hwTop.left - 4, 0);
    ctx.closePath();
    ctx.fillStyle = lWallGrad; ctx.fill();

    // Right wall
    const rWallGrad = ctx.createLinearGradient(hwBot.right, 0, hwBot.right + wallW, 0);
    rWallGrad.addColorStop(0, `${puColor}90`);
    rWallGrad.addColorStop(0.4, `${puColor}30`);
    rWallGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.moveTo(hwTop.right, 0); ctx.lineTo(hwBot.right, hitY);
    ctx.lineTo(hwBot.right + wallW, hitY); ctx.lineTo(hwTop.right + 4, 0);
    ctx.closePath();
    ctx.fillStyle = rWallGrad; ctx.fill();

    // Neon edge line on walls
    const edgeGrad = ctx.createLinearGradient(0, 0, 0, hitY);
    edgeGrad.addColorStop(0, 'rgba(255,255,255,0)');
    edgeGrad.addColorStop(0.5, `${puColor}CC`);
    edgeGrad.addColorStop(1, `${puColor}FF`);
    ctx.strokeStyle = edgeGrad; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(hwTop.left, 0); ctx.lineTo(hwBot.left, hitY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hwTop.right, 0); ctx.lineTo(hwBot.right, hitY); ctx.stroke();

    // ── power-up screen edge glow ──
    if (pu.active && t < pu.endTime) {
      const pulse = 0.55 + 0.45 * Math.sin(t * 7);
      const edgeIntensity = Math.min(1, (pu.endTime - t) / 2) * pulse;
      const eg1 = ctx.createLinearGradient(0, 0, 80, 0);
      eg1.addColorStop(0, `${pu.color}${Math.round(edgeIntensity * 160).toString(16).padStart(2, '0')}`);
      eg1.addColorStop(1, 'transparent');
      ctx.fillStyle = eg1; ctx.fillRect(0, 0, 80, H);
      const eg2 = ctx.createLinearGradient(W, 0, W - 80, 0);
      eg2.addColorStop(0, `${pu.color}${Math.round(edgeIntensity * 160).toString(16).padStart(2, '0')}`);
      eg2.addColorStop(1, 'transparent');
      ctx.fillStyle = eg2; ctx.fillRect(W - 80, 0, 80, H);
    }

    // ── hit zone line ──
    const hzGrad = ctx.createLinearGradient(0, hitY - 2, 0, hitY + 2);
    hzGrad.addColorStop(0, 'rgba(255,255,255,0.7)');
    hzGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = hzGrad; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(hwBot.left - 10, hitY); ctx.lineTo(hwBot.right + 10, hitY); ctx.stroke();

    // ── notes ──
    let dirty = false;
    for (const ns of notesRef.current) {
      if (ns.hit || ns.missed) continue;
      const { note } = ns;
      const lc = LANE_COLORS[note.lane];
      const spawnT = note.time - APPROACH_TIME;
      const prog = (t - spawnT) / APPROACH_TIME;
      const noteY = prog * hitY;

      if (ns.holdActive) {
        ns.holdProgress = Math.min(1, (t - note.time) / (note.holdDuration || 0.5));
      }

      // Miss detection
      if (!ns.holdActive && note.type === 'tap' && t > note.time + MISS_WINDOW) {
        ns.missed = true;
        const gsx = gsRef.current; gsx.combo = 0; gsx.misses++;
        const jid = ++jCounter.current;
        jRef.current = [...jRef.current.filter(x => Date.now() - x.ts < 550), { type: 'MISS', lane: note.lane, id: jid, ts: Date.now() }];
        dirty = true; continue;
      }
      if (note.type === 'hold' && !ns.holdActive && t > note.time + MISS_WINDOW) {
        ns.missed = true;
        const gsx = gsRef.current; gsx.combo = 0; gsx.misses++;
        dirty = true; continue;
      }
      if (noteY < -60) continue;

      const { x: lx, w: lw } = laneAt(note.lane, prog, W);
      const noteH = lerp(10, 28, prog); // perspective scaling
      const noteX = lx + 6;
      const noteW = lw - 12;

      if (note.type === 'tap') {
        // Glow
        ctx.shadowColor = lc; ctx.shadowBlur = lerp(8, 24, prog);
        // Dark body
        ctx.fillStyle = 'rgba(8, 4, 16, 0.88)';
        ctx.beginPath(); ctx.roundRect(noteX, noteY - noteH / 2, noteW, noteH, noteH * 0.4); ctx.fill();
        // Colored border
        ctx.strokeStyle = lc; ctx.lineWidth = lerp(1.5, 3, prog);
        ctx.beginPath(); ctx.roundRect(noteX, noteY - noteH / 2, noteW, noteH, noteH * 0.4); ctx.stroke();
        // Bright bottom strip
        ctx.fillStyle = lc; ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.roundRect(noteX + 2, noteY + noteH / 2 - noteH * 0.35, noteW - 4, noteH * 0.35, [0, 0, noteH * 0.35, noteH * 0.35]); ctx.fill();
        // Top highlight
        ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.roundRect(noteX + 4, noteY - noteH / 2 + 2, noteW - 8, noteH * 0.25, noteH * 0.2); ctx.fill();
        ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
      } else {
        // Hold note
        const holdDur = note.holdDuration || 0.5;
        const holdPx  = (holdDur / APPROACH_TIME) * hitY;
        const tailY   = noteY;
        const headP   = Math.max(0, prog - holdDur / APPROACH_TIME);
        const headY   = headP * hitY;

        if (ns.holdActive) {
          const activeProg = Math.min(prog, 1);
          const activeTop = lerp(headY, hitY, ns.holdProgress);
          if (tailY > activeTop) {
            const { x: ax1, w: aw1 } = laneAt(note.lane, activeProg, W);
            ctx.fillStyle = `${lc}40`;
            ctx.beginPath();
            ctx.roundRect(ax1 + lw * 0.28, activeTop, aw1 * 0.44, tailY - activeTop + noteH / 2, 3);
            ctx.fill();
          }
        } else if (holdPx > 0) {
          const { x: hx1, w: hw1 } = laneAt(note.lane, headP, W);
          ctx.fillStyle = `${lc}30`;
          ctx.beginPath();
          ctx.moveTo(hx1 + hw1 * 0.28, headY);
          ctx.lineTo(hx1 + hw1 * 0.72, headY);
          ctx.lineTo(lx + lw * 0.72, tailY + noteH / 2);
          ctx.lineTo(lx + lw * 0.28, tailY + noteH / 2);
          ctx.closePath(); ctx.fill();
        }

        // Note head (same as tap)
        ctx.shadowColor = lc; ctx.shadowBlur = lerp(8, 24, prog);
        ctx.fillStyle = 'rgba(8, 4, 16, 0.88)';
        ctx.beginPath(); ctx.roundRect(noteX, tailY - noteH / 2, noteW, noteH, noteH * 0.4); ctx.fill();
        ctx.strokeStyle = lc; ctx.lineWidth = lerp(1.5, 3, prog);
        ctx.beginPath(); ctx.roundRect(noteX, tailY - noteH / 2, noteW, noteH, noteH * 0.4); ctx.stroke();
        ctx.fillStyle = lc; ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.roundRect(noteX + 2, tailY + noteH / 2 - noteH * 0.35, noteW - 4, noteH * 0.35, [0, 0, noteH * 0.35, noteH * 0.35]); ctx.fill();
        ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
      }
    }

    // ── hit zone buttons (Beatstar style) ──
    const btnY  = hitY + 2;
    const btnH  = H - btnY - 4;
    for (let i = 0; i < LANE_COUNT; i++) {
      const { x, w } = laneAt(i, 1, W);
      const pressed = laneRef.current[i].pressed;
      const lc = LANE_COLORS[i];
      const bx = x + 6; const bw = w - 12;

      ctx.shadowColor = pressed ? lc : 'transparent';
      ctx.shadowBlur  = pressed ? 30 : 0;
      // body
      const btnFill = ctx.createLinearGradient(bx, btnY, bx, btnY + btnH);
      btnFill.addColorStop(0, pressed ? `${lc}35` : 'rgba(14,8,28,0.9)');
      btnFill.addColorStop(1, pressed ? `${lc}20` : 'rgba(8,4,16,0.9)');
      ctx.fillStyle = btnFill;
      ctx.beginPath(); ctx.roundRect(bx, btnY, bw, btnH, 14); ctx.fill();
      // border
      ctx.strokeStyle = pressed ? lc : `${lc}70`;
      ctx.lineWidth   = pressed ? 2.5 : 1.5;
      ctx.beginPath(); ctx.roundRect(bx, btnY, bw, btnH, 14); ctx.stroke();
      // bottom accent strip
      ctx.fillStyle = pressed ? lc : `${lc}55`;
      ctx.globalAlpha = pressed ? 0.9 : 0.5;
      ctx.beginPath(); ctx.roundRect(bx + 4, btnY + btnH - 6, bw - 8, 6, [0, 0, 10, 10]); ctx.fill();
      ctx.globalAlpha = 1;
      // key label
      const fontSize = Math.max(14, Math.floor(btnH * 0.32));
      ctx.fillStyle = pressed ? '#fff' : `${lc}CC`;
      ctx.font = `bold ${fontSize}px "Space Mono", monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(LANE_KEYS[i].toUpperCase(), x + w / 2, btnY + btnH / 2);
      ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    }

    if (dirty) syncDisplay();

    // ── end check ──
    const allDone = notesRef.current.every(ns => ns.hit || ns.missed);
    const lastT   = notesRef.current.length ? Math.max(...notesRef.current.map(ns => ns.note.time)) : 0;
    if ((allDone && t > lastT + 1.5 && t > 2) || t >= song.duration) { finishGame(); return; }

    rafRef.current = requestAnimationFrame(draw);
  }, [getT, syncDisplay, finishGame]);

  // ── keyboard ──
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const lane = LANE_KEYS.indexOf(e.key.toLowerCase());
      if (lane < 0) return;
      laneRef.current[lane].pressed = true; hitLane(lane);
    };
    const onUp = (e: KeyboardEvent) => {
      const lane = LANE_KEYS.indexOf(e.key.toLowerCase());
      if (lane < 0) return;
      laneRef.current[lane].pressed = false; releaseLane(lane);
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
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
      if (lane >= 0 && lane < LANE_COUNT) {
        laneRef.current[lane].pressed = true;
        laneRef.current[lane].touchId = touch.identifier;
        hitLane(lane);
      }
    }
  }, [hitLane]);

  const onTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      for (let lane = 0; lane < LANE_COUNT; lane++) {
        if (laneRef.current[lane].touchId === touch.identifier) {
          laneRef.current[lane].pressed = false;
          laneRef.current[lane].touchId = undefined;
          releaseLane(lane);
        }
      }
    }
  }, [releaseLane]);

  // ── canvas resize ──
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const resize = () => {
      const p = canvas.parentElement; if (!p) return;
      canvas.width = p.clientWidth; canvas.height = p.clientHeight;
    };
    resize(); window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // ── main init ──
  useEffect(() => {
    if (!songId) { setLocation('/songs'); return; }
    let cancelled = false;
    let audio: HTMLAudioElement | null = null;

    const init = async () => {
      setLoadMsg('FETCHING TRANSMISSION...'); phaseRef.current = 'loading'; setPhase('loading');
      const song = await getSongById(songId);
      if (cancelled || !song) { setLocation('/songs'); return; }

      songRef.current = song;
      // clamp lane indices to [0, LANE_COUNT-1]
      notesRef.current = song.notes.map(n => ({
        note: { ...n, lane: Math.min(n.lane, LANE_COUNT - 1) },
        hit: false, missed: false, holdActive: false, holdProgress: 0,
      }));
      gsRef.current = { score: 0, combo: 0, maxCombo: 0, perfects: 0, goods: 0, misses: 0, progress: 0 };
      puRef.current  = { active: null, endTime: 0, startTime: 0, multiplier: 1, color: '#fff', label: '', duration: 0, triggered: new Set() };

      setLoadMsg('BUFFERING AUDIO...'); phaseRef.current = 'buffering'; setPhase('buffering');

      audio = new Audio();
      audio.crossOrigin = 'anonymous';
      audio.preload = 'auto';
      audioRef.current = audio;

      audio.addEventListener('progress', () => {
        if (!audio?.duration) return;
        const buf = audio.buffered;
        if (buf.length) setBufferPct(Math.min(100, Math.round((buf.end(buf.length - 1) / audio.duration) * 100)));
      });

      audio.src = song.audioUrl;
      audio.load();

      await new Promise<void>(resolve => {
        audio!.addEventListener('canplay', () => resolve(), { once: true });
        audio!.addEventListener('error',   () => resolve(), { once: true });
        setTimeout(resolve, 15000);
      });
      if (cancelled) return;

      phaseRef.current = 'countdown'; setPhase('countdown');
      let count = 3; setCountdown(count);

      await new Promise<void>(resolve => {
        const tick = setInterval(() => {
          count--;
          if (count > 0) setCountdown(count);
          else { clearInterval(tick); setCountdown(0); resolve(); }
        }, 1000);
      });
      if (cancelled) return;

      phaseRef.current = 'playing'; setPhase('playing');
      await audio.play();
      rafRef.current = requestAnimationFrame(draw);
    };

    init().catch(() => { if (!cancelled) setLocation('/songs'); });
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      if (audio) { audio.pause(); audio.src = ''; }
      audioRef.current = null;
    };
  }, [songId, draw, setLocation]);

  // ── render ──
  const gs   = displayGs;
  const song = songRef.current;
  const puColor = puDisplay?.color ?? '#E5B800';

  const comboColor = gs.combo < 10 ? 'hsl(30 15% 45%)'
    : gs.combo < 20 ? LANE_COLORS[2]
    : gs.combo < 40 ? '#E5B800'
    : gs.combo < 60 ? '#E53A00'
    : '#48E5C2';

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ background: '#05030d' }}>
      {/* HUD */}
      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <button data-testid="button-quit"
          onClick={() => { audioRef.current?.pause(); setLocation('/songs'); }}
          className="font-mono text-xs tracking-widest transition-colors"
          style={{ color: 'hsl(30 15% 30%)' }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#E53A00')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'hsl(30 15% 30%)')}>
          ✕ QUIT
        </button>

        <div className="flex items-center gap-8">
          <div className="text-center">
            <div className="font-mono text-xs" style={{ color: 'hsl(30 15% 38%)' }}>SCORE</div>
            <div className="font-mono font-bold text-xl leading-none" data-testid="text-score"
              style={{ color: '#F2EDE5', letterSpacing: '0.05em' }}>
              {gs.score.toLocaleString()}
            </div>
          </div>
          <div className="text-center">
            <div className="font-mono text-xs" style={{ color: 'hsl(30 15% 38%)' }}>COMBO</div>
            <div className="font-mono font-bold text-xl leading-none" data-testid="text-combo"
              style={{ color: comboColor, textShadow: gs.combo >= 20 ? `0 0 15px ${comboColor}` : 'none' }}>
              {gs.combo > 0 ? gs.combo : '—'}
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="font-mono text-xs truncate max-w-28" style={{ color: 'hsl(30 15% 38%)' }}>
            {song?.title ?? ''}
          </div>
          <div className="flex gap-2 justify-end mt-0.5">
            <span className="font-mono text-xs" style={{ color: '#48E5C2' }}>✓{gs.perfects}</span>
            <span className="font-mono text-xs" style={{ color: '#E5B800' }}>~{gs.goods}</span>
            <span className="font-mono text-xs" style={{ color: '#444' }}>✗{gs.misses}</span>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 flex-shrink-0" style={{ background: 'rgba(255,255,255,0.04)' }}>
        <div className="h-full" style={{
          width: `${(gs.progress || 0) * 100}%`,
          background: `linear-gradient(90deg, #E53A00, #A855F7, #48E5C2)`,
          transition: 'width 0.2s linear',
        }} />
      </div>

      {/* Canvas */}
      <div className="relative flex-1 overflow-hidden">
        <canvas ref={canvasRef} className="w-full h-full block"
          onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} data-testid="canvas-game" />

        {/* Power-up banner */}
        {puDisplay && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 pointer-events-none">
            <div className="font-mono font-bold text-base px-5 py-2 tracking-[0.3em]"
              style={{
                color: puColor, border: `2px solid ${puColor}`,
                background: `${puColor}15`,
                textShadow: `0 0 20px ${puColor}`,
                boxShadow: `0 0 30px ${puColor}40`,
                clipPath: 'polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)',
              }}>
              {puDisplay.label} ×{puDisplay.multiplier}
            </div>
            <div className="w-36 h-1" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <div className="h-full transition-none"
                style={{ width: `${puDisplay.progress * 100}%`, background: puColor }} />
            </div>
          </div>
        )}

        {/* Judgment text */}
        {displayJudge.map(j => {
          if (Date.now() - j.ts > 550) return null;
          const p = (j.lane / LANE_COUNT + 1 / (LANE_COUNT * 2)) * 100;
          const color = j.type === 'PERFECT' ? '#48E5C2' : j.type === 'GOOD' ? '#E5B800' : '#555';
          return (
            <div key={j.id}
              className="absolute font-mono font-bold text-sm pointer-events-none judgment-pop"
              style={{
                left: `${p}%`, top: '74%',
                transform: 'translateX(-50%)',
                color, textShadow: `0 0 14px ${color}`,
                letterSpacing: '0.15em',
              }}>
              {j.type}
            </div>
          );
        })}

        {/* Loading overlay */}
        {(phase === 'loading' || phase === 'buffering') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5"
            style={{ background: 'rgba(5,3,13,0.96)' }}>
            <div className="font-mono text-xs tracking-[0.3em]" style={{ color: '#48E5C2' }}>
              {loadMsg}
            </div>
            {song && (
              <div className="text-center">
                {song.coverArt && (
                  <img src={song.coverArt} alt={song.title}
                    className="w-24 h-24 object-cover mx-auto mb-3 opacity-60"
                    style={{ border: '1px solid rgba(255,255,255,0.1)' }} />
                )}
                <div className="font-mono font-bold text-lg" style={{ color: '#F2EDE5' }}>{song.title}</div>
                <div className="font-mono text-xs mt-1" style={{ color: 'hsl(30 15% 45%)' }}>
                  DAY {song.day} · {song.bpm} BPM · {song.notes.length} NOTES
                </div>
              </div>
            )}
            {phase === 'buffering' && bufferPct > 0 && (
              <div className="w-48">
                <div className="h-0.5 w-full mb-1" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div className="h-full" style={{ width: `${bufferPct}%`, background: '#E53A00' }} />
                </div>
                <div className="font-mono text-xs text-center" style={{ color: 'hsl(30 15% 40%)' }}>{bufferPct}%</div>
              </div>
            )}
            <div className="flex gap-1">
              {[0,1,2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ background: LANE_COLORS[i], animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}

        {/* Countdown */}
        {phase === 'countdown' && (
          <div className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(5,3,13,0.80)' }}>
            <div className="font-mono font-bold text-center"
              style={{
                fontSize: 120, lineHeight: 1,
                background: 'linear-gradient(135deg, #E53A00, #A855F7, #48E5C2)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                filter: 'drop-shadow(0 0 30px rgba(168,85,247,0.6))',
              }}>
              {countdown > 0 ? countdown : 'GO!'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
