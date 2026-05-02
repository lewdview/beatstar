import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { getSongById, saveHighScore } from "@/game/api";
import type { GameSong } from "@/game/api";
import type { Note, JudgmentDisplay, GameState } from "@/game/types";

// ── constants ────────────────────────────────────────────────────
const LANE_COUNT  = 3;
const LANE_KEYS   = ['a', 's', 'd'];
const LANE_COLORS = ['#E53A00', '#A855F7', '#48E5C2'];

const APPROACH_TIME       = 2.0;
const HIT_RATIO           = 0.80;
const PERFECT_PLUS_WINDOW = 0.030;   // ≤30ms → PERFECT+
const PERFECT_WINDOW      = 0.065;
const GOOD_WINDOW         = 0.130;
const MISS_WINDOW         = 0.185;

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
  if (!tot) return 0;
  return Math.round(((pp * 1.0 + p * 0.9 + g * 0.5) / tot) * 100);
}

function getMedal(pp: number, p: number, g: number, m: number): string {
  const acc = getAccuracy(pp, p, g, m);
  if (acc >= 93) return 'PLATINUM';
  if (acc >= 80) return 'GOLD';
  if (acc >= 60) return 'SILVER';
  if (acc >= 40) return 'BRONZE';
  return 'NONE';
}

// ── interfaces ───────────────────────────────────────────────────
interface NoteState  { note: Note; hit: boolean; missed: boolean; holdActive: boolean; holdProgress: number; }
interface LanePress  { pressed: boolean; touchId?: number; }
interface PUState    { active: PUType | null; endTime: number; startTime: number; multiplier: number; color: string; label: string; duration: number; triggered: Set<number>; }

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
    const puMul = (pu.active && getT() < pu.endTime) ? pu.multiplier : 1;
    const comboMul = combo < 10 ? 1 : combo < 25 ? 1.5 : combo < 50 ? 2 : 3;
    const base = j === 'PERFECT+' ? 500 : j === 'PERFECT' ? 300 : 150;
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

  const hitLane = useCallback((lane: number) => {
    if (phaseRef.current !== 'playing') return;
    const t = getT();
    const candidates = notesRef.current.filter(ns => ns.note.lane === lane && !ns.hit && !ns.missed);
    if (!candidates.length) return;
    const ns = candidates.reduce((b, c) => Math.abs(c.note.time - t) < Math.abs(b.note.time - t) ? c : b);
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

    const jid = ++jCounter.current;
    jRef.current = [...jRef.current.filter(x => Date.now() - x.ts < 600), { type: j, lane, id: jid, ts: Date.now() }];
    syncDisplay();
  }, [getT, calcScore, checkPowerUps, syncDisplay]);

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
    if (songRef.current) saveHighScore(songRef.current.id, gs.score);
    sessionStorage.setItem(`result_${songId}`, JSON.stringify({
      score: gs.score, maxCombo: gs.maxCombo,
      perfectPlus: gs.perfectPlus, perfects: gs.perfects, goods: gs.goods, misses: gs.misses,
      medal: getMedal(gs.perfectPlus, gs.perfects, gs.goods, gs.misses),
      total: gs.perfectPlus + gs.perfects + gs.goods + gs.misses,
    }));
    setTimeout(() => setLocation(`/results/${songId}`), 800);
  }, [songId, setLocation]);

  // ── draw ─────────────────────────────────────────────────────
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

    if (pu.active && t < pu.endTime) {
      setPuDisplay({ label: pu.label, color: pu.color, multiplier: pu.multiplier, progress: (pu.endTime - t) / pu.duration });
    } else if (pu.active && t >= pu.endTime) { pu.active = null; setPuDisplay(null); }

    // ── background ──
    ctx.fillStyle = '#05030d'; ctx.fillRect(0, 0, W, H);
    const vpGrad = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, H * 0.7);
    vpGrad.addColorStop(0, 'rgba(120,60,220,0.13)'); vpGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = vpGrad; ctx.fillRect(0, 0, W, H);

    const hwTop = hwAtProgress(0, W); const hwBot = hwAtProgress(1, W);

    // ── highway clip ──
    ctx.save();
    ctx.beginPath(); ctx.moveTo(hwTop.left, 0); ctx.lineTo(hwTop.right, 0); ctx.lineTo(hwBot.right, hitY); ctx.lineTo(hwBot.left, hitY); ctx.closePath(); ctx.clip();

    // Horizontal perspective lines
    for (let row = 0; row <= 12; row++) {
      const ry = (row / 12) * hitY; const rp = ry / hitY;
      const { left, right } = hwAtProgress(rp, W);
      ctx.strokeStyle = `rgba(80,40,160,${0.06 + rp * 0.14})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(left, ry); ctx.lineTo(right, ry); ctx.stroke();
    }
    // Lane dividers
    for (let l = 1; l < LANE_COUNT; l++) {
      const top = laneAt(l, 0, W); const bot = laneAt(l, 1, W);
      const lg = ctx.createLinearGradient(0, 0, 0, hitY);
      lg.addColorStop(0, 'rgba(255,255,255,0.0)'); lg.addColorStop(1, 'rgba(255,255,255,0.13)');
      ctx.strokeStyle = lg; ctx.lineWidth = 1;
      ctx.setLineDash([6, 10]); ctx.beginPath(); ctx.moveTo(top.x, 0); ctx.lineTo(bot.x, hitY); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();

    // ── neon corridor walls ──
    const puColor = (pu.active && t < pu.endTime) ? pu.color : '#48E5C2';
    const wallW = W * 0.06;
    const lWG = ctx.createLinearGradient(hwBot.left, 0, hwBot.left - wallW, 0);
    lWG.addColorStop(0, `${puColor}95`); lWG.addColorStop(0.5, `${puColor}28`); lWG.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.moveTo(hwTop.left, 0); ctx.lineTo(hwBot.left, hitY); ctx.lineTo(hwBot.left - wallW, hitY); ctx.lineTo(hwTop.left - 3, 0); ctx.closePath();
    ctx.fillStyle = lWG; ctx.fill();
    const rWG = ctx.createLinearGradient(hwBot.right, 0, hwBot.right + wallW, 0);
    rWG.addColorStop(0, `${puColor}95`); rWG.addColorStop(0.5, `${puColor}28`); rWG.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.moveTo(hwTop.right, 0); ctx.lineTo(hwBot.right, hitY); ctx.lineTo(hwBot.right + wallW, hitY); ctx.lineTo(hwTop.right + 3, 0); ctx.closePath();
    ctx.fillStyle = rWG; ctx.fill();
    // Edge neon lines
    const edgeG = ctx.createLinearGradient(0, 0, 0, hitY);
    edgeG.addColorStop(0, 'rgba(255,255,255,0.0)'); edgeG.addColorStop(0.5, `${puColor}AA`); edgeG.addColorStop(1, `${puColor}FF`);
    ctx.strokeStyle = edgeG; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(hwTop.left, 0); ctx.lineTo(hwBot.left, hitY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hwTop.right, 0); ctx.lineTo(hwBot.right, hitY); ctx.stroke();

    // ── power-up screen edge glow ──
    if (pu.active && t < pu.endTime) {
      const pulse = 0.55 + 0.45 * Math.sin(t * 7);
      const ei = Math.min(1, (pu.endTime - t) / 2) * pulse;
      const hex = Math.round(ei * 170).toString(16).padStart(2, '0');
      const eg1 = ctx.createLinearGradient(0, 0, 90, 0); eg1.addColorStop(0, `${pu.color}${hex}`); eg1.addColorStop(1, 'transparent');
      ctx.fillStyle = eg1; ctx.fillRect(0, 0, 90, H);
      const eg2 = ctx.createLinearGradient(W, 0, W - 90, 0); eg2.addColorStop(0, `${pu.color}${hex}`); eg2.addColorStop(1, 'transparent');
      ctx.fillStyle = eg2; ctx.fillRect(W - 90, 0, 90, H);
    }

    // ── hit zone line ──
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(hwBot.left - 12, hitY); ctx.lineTo(hwBot.right + 12, hitY); ctx.stroke();

    // ── notes ──
    let dirty = false;
    for (const ns of notesRef.current) {
      if (ns.hit || ns.missed) continue;
      const { note } = ns;
      const lc = LANE_COLORS[note.lane];
      const spawnT = note.time - APPROACH_TIME;
      const prog = (t - spawnT) / APPROACH_TIME;
      const noteY = prog * hitY;

      if (ns.holdActive) ns.holdProgress = Math.min(1, (t - note.time) / (note.holdDuration || 0.5));

      // Miss detection
      if (!ns.holdActive && note.type === 'tap' && t > note.time + MISS_WINDOW) {
        ns.missed = true; const gsx = gsRef.current; gsx.combo = 0; gsx.misses++;
        jRef.current = [...jRef.current.filter(x => Date.now() - x.ts < 600), { type: 'MISS', lane: note.lane, id: ++jCounter.current, ts: Date.now() }];
        dirty = true; continue;
      }
      if (note.type === 'hold' && !ns.holdActive && t > note.time + MISS_WINDOW) {
        ns.missed = true; const gsx = gsRef.current; gsx.combo = 0; gsx.misses++; dirty = true; continue;
      }
      if (noteY < -80) continue;

      const { x: lx, w: lw } = laneAt(note.lane, prog, W);
      // Bigger notes: height lerps from 20px to 50px with perspective
      const noteH = lerp(20, 50, prog);
      const noteX = lx + 8; const noteW = lw - 16;
      const r = noteH * 0.35;

      if (note.type === 'tap') {
        drawNote(ctx, noteX, noteY, noteW, noteH, r, lc, prog);
      } else {
        // Hold trail
        const holdDur = note.holdDuration || 0.5;
        const headP   = Math.max(0, prog - holdDur / APPROACH_TIME);
        const headY   = headP * hitY;

        if (ns.holdActive) {
          const top = lerp(headY, hitY, ns.holdProgress);
          if (noteY > top) {
            const { x: ax, w: aw } = laneAt(note.lane, Math.min(prog, 1), W);
            const trailGrad = ctx.createLinearGradient(0, top, 0, noteY);
            trailGrad.addColorStop(0, `${lc}25`); trailGrad.addColorStop(1, `${lc}60`);
            ctx.fillStyle = trailGrad;
            ctx.beginPath(); ctx.roundRect(ax + aw * 0.28, top, aw * 0.44, noteY - top + noteH / 2, 4); ctx.fill();
          }
        } else if (headY < noteY) {
          const { x: hx, w: hw } = laneAt(note.lane, headP, W);
          const trailGrad = ctx.createLinearGradient(0, headY, 0, noteY);
          trailGrad.addColorStop(0, `${lc}20`); trailGrad.addColorStop(1, `${lc}55`);
          ctx.fillStyle = trailGrad;
          ctx.beginPath();
          ctx.moveTo(hx + hw * 0.28, headY); ctx.lineTo(hx + hw * 0.72, headY);
          ctx.lineTo(lx + lw * 0.72, noteY + noteH / 2); ctx.lineTo(lx + lw * 0.28, noteY + noteH / 2);
          ctx.closePath(); ctx.fill();
        }
        drawNote(ctx, noteX, noteY, noteW, noteH, r, lc, prog);
      }
    }

    // ── hit zone buttons ──
    const btnY = hitY + 2; const btnH = H - btnY - 4;
    for (let i = 0; i < LANE_COUNT; i++) {
      const { x, w } = laneAt(i, 1, W);
      const pressed = laneRef.current[i].pressed; const lc = LANE_COLORS[i];
      const bx = x + 6; const bw = w - 12;
      ctx.shadowColor = pressed ? lc : 'transparent'; ctx.shadowBlur = pressed ? 35 : 0;
      const bf = ctx.createLinearGradient(bx, btnY, bx, btnY + btnH);
      bf.addColorStop(0, pressed ? `${lc}40` : 'rgba(14,8,28,0.92)'); bf.addColorStop(1, pressed ? `${lc}22` : 'rgba(7,3,14,0.92)');
      ctx.fillStyle = bf; ctx.beginPath(); ctx.roundRect(bx, btnY, bw, btnH, 14); ctx.fill();
      ctx.strokeStyle = pressed ? lc : `${lc}65`; ctx.lineWidth = pressed ? 2.5 : 1.5;
      ctx.beginPath(); ctx.roundRect(bx, btnY, bw, btnH, 14); ctx.stroke();
      // Bottom accent strip
      ctx.fillStyle = pressed ? lc : `${lc}50`; ctx.globalAlpha = pressed ? 0.9 : 0.45;
      ctx.beginPath(); ctx.roundRect(bx + 4, btnY + btnH - 7, bw - 8, 7, [0, 0, 10, 10]); ctx.fill();
      ctx.globalAlpha = 1;
      const fs = Math.max(13, Math.floor(btnH * 0.30));
      ctx.fillStyle = pressed ? '#fff' : `${lc}CC`;
      ctx.font = `bold ${fs}px "Space Mono", monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(LANE_KEYS[i].toUpperCase(), x + w / 2, btnY + btnH / 2);
      ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    }

    if (dirty) syncDisplay();

    const allDone = notesRef.current.every(ns => ns.hit || ns.missed);
    const lastT   = notesRef.current.length ? Math.max(...notesRef.current.map(ns => ns.note.time)) : 0;
    if ((allDone && t > lastT + 1.5 && t > 2) || t >= song.duration) { finishGame(); return; }

    rafRef.current = requestAnimationFrame(draw);
  }, [getT, syncDisplay, finishGame]);

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
      songRef.current = song;
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
      await audio.play();
      rafRef.current = requestAnimationFrame(draw);
    };

    init().catch(() => { if (!cancelled) setLocation('/songs'); });
    return () => { cancelled = true; cancelAnimationFrame(rafRef.current); if (audio) { audio.pause(); audio.src = ''; } audioRef.current = null; };
  }, [songId, draw, setLocation]);

  // ── render ──
  const gs = displayGs; const song = songRef.current;
  const puColor = puDisplay?.color ?? '#E5B800';
  const comboColor = gs.combo < 10 ? 'hsl(30 15% 45%)' : gs.combo < 20 ? LANE_COLORS[2] : gs.combo < 40 ? '#E5B800' : gs.combo < 60 ? '#E53A00' : '#48E5C2';

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ background: '#05030d' }}>
      {/* HUD */}
      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
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
              style={{ color: comboColor, textShadow: gs.combo >= 20 ? `0 0 15px ${comboColor}` : 'none' }}>
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

      {/* Progress */}
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
              style={{ color: puColor, border: `2px solid ${puColor}`, background: `${puColor}15`, textShadow: `0 0 20px ${puColor}`, boxShadow: `0 0 30px ${puColor}40`, clipPath: 'polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)' }}>
              {puDisplay.label} ×{puDisplay.multiplier}
            </div>
            <div className="w-36 h-1" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <div className="h-full" style={{ width: `${puDisplay.progress * 100}%`, background: puColor }} />
            </div>
          </div>
        )}

        {/* Judgment text */}
        {displayJudge.map(j => {
          if (Date.now() - j.ts > 600) return null;
          const pct = (j.lane / LANE_COUNT + 1 / (LANE_COUNT * 2)) * 100;
          const color = j.type === 'PERFECT+' ? '#E5B800' : j.type === 'PERFECT' ? '#48E5C2' : j.type === 'GOOD' ? '#A855F7' : '#444';
          const big   = j.type === 'PERFECT+';
          return (
            <div key={j.id} className="absolute font-mono font-bold pointer-events-none judgment-pop"
              style={{ left: `${pct}%`, top: '72%', transform: 'translateX(-50%)', color, textShadow: `0 0 18px ${color}`, letterSpacing: '0.12em', fontSize: big ? 15 : 12 }}>
              {j.type}
            </div>
          );
        })}

        {/* Loading overlay */}
        {(phase === 'loading' || phase === 'buffering') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5" style={{ background: 'rgba(5,3,13,0.96)' }}>
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
                <div className="h-0.5 w-full mb-1" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div className="h-full" style={{ width: `${bufferPct}%`, background: '#E53A00' }} />
                </div>
                <div className="font-mono text-xs text-center" style={{ color: 'hsl(30 15% 40%)' }}>{bufferPct}%</div>
              </div>
            )}
            <div className="flex gap-1">{[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: LANE_COLORS[i], animationDelay: `${i * 0.15}s` }} />)}</div>
          </div>
        )}

        {/* Countdown */}
        {phase === 'countdown' && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(5,3,13,0.80)' }}>
            <div className="font-mono font-bold text-center" style={{ fontSize: 120, lineHeight: 1, background: 'linear-gradient(135deg, #E53A00, #A855F7, #48E5C2)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 30px rgba(168,85,247,0.6))' }}>
              {countdown > 0 ? countdown : 'GO!'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── note drawing helper ──────────────────────────────────────────
function drawNote(
  ctx: CanvasRenderingContext2D,
  noteX: number, noteY: number,
  noteW: number, noteH: number,
  r: number, lc: string, prog: number
) {
  ctx.shadowColor = lc; ctx.shadowBlur = lerp(10, 28, prog);

  // Dark body
  const bodyGrad = ctx.createLinearGradient(noteX, noteY - noteH / 2, noteX, noteY + noteH / 2);
  bodyGrad.addColorStop(0, 'rgba(18,8,32,0.92)'); bodyGrad.addColorStop(0.45, 'rgba(10,4,20,0.92)'); bodyGrad.addColorStop(1, 'rgba(6,2,12,0.92)');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath(); ctx.roundRect(noteX, noteY - noteH / 2, noteW, noteH, r); ctx.fill();

  // Colored border
  ctx.strokeStyle = lc; ctx.lineWidth = lerp(1.5, 3, prog);
  ctx.beginPath(); ctx.roundRect(noteX, noteY - noteH / 2, noteW, noteH, r); ctx.stroke();

  // ── CENTER LINE (PERFECT+ indicator) ──
  const clGrad = ctx.createLinearGradient(noteX, noteY, noteX + noteW, noteY);
  clGrad.addColorStop(0,   'rgba(255,255,255,0.0)');
  clGrad.addColorStop(0.1, `${lc}FF`);
  clGrad.addColorStop(0.5, 'rgba(255,255,255,0.95)');
  clGrad.addColorStop(0.9, `${lc}FF`);
  clGrad.addColorStop(1,   'rgba(255,255,255,0.0)');
  ctx.strokeStyle = clGrad; ctx.lineWidth = lerp(1, 2.5, prog);
  ctx.shadowColor = 'rgba(255,255,255,0.8)'; ctx.shadowBlur = lerp(4, 10, prog);
  ctx.beginPath(); ctx.moveTo(noteX + 4, noteY); ctx.lineTo(noteX + noteW - 4, noteY); ctx.stroke();

  ctx.shadowColor = lc; ctx.shadowBlur = lerp(10, 28, prog);

  // Bright bottom strip
  ctx.fillStyle = lc; ctx.globalAlpha = 0.9;
  ctx.beginPath(); ctx.roundRect(noteX + 2, noteY + noteH / 2 - noteH * 0.3, noteW - 4, noteH * 0.3, [0, 0, r, r]); ctx.fill();
  // Top highlight
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.roundRect(noteX + 4, noteY - noteH / 2 + 3, noteW - 8, noteH * 0.22, r * 0.6); ctx.fill();

  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
}
