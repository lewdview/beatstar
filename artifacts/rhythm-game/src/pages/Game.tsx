import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { getSong, saveHighScore } from "@/game/songs";
import { AudioManager } from "@/game/audio";
import type { Note, JudgmentDisplay, GameState } from "@/game/types";

const APPROACH_TIME = 2.0;
const PERFECT_WINDOW = 0.065;
const GOOD_WINDOW = 0.13;
const MISS_WINDOW = 0.18;
const LANE_KEYS = ['a', 's', 'd', 'f'];
const LANE_COLORS = ['#E53A00', '#48E5C2', '#E5B800', '#8B48E5'];
const LANE_GLOW = ['rgba(229,58,0,0.6)', 'rgba(72,229,194,0.6)', 'rgba(229,184,0,0.6)', 'rgba(139,72,229,0.6)'];

interface NoteState {
  note: Note;
  hit: boolean;
  missed: boolean;
  holdActive: boolean;
  holdComplete: boolean;
  holdProgress: number;
}

interface LanePress {
  pressed: boolean;
  touchId?: number;
}

function calcScore(combo: number, judgment: 'PERFECT' | 'GOOD'): number {
  const base = judgment === 'PERFECT' ? 300 : 150;
  const multiplier = combo < 10 ? 1 : combo < 25 ? 2 : combo < 50 ? 3 : 4;
  return base * multiplier;
}

function getRank(perfects: number, goods: number, misses: number): string {
  const total = perfects + goods + misses;
  if (total === 0) return 'D';
  const pct = perfects / total;
  if (misses === 0 && goods === 0) return 'S';
  if (misses === 0 && pct >= 0.9) return 'A';
  if (pct >= 0.8) return 'B';
  if (pct >= 0.6) return 'C';
  return 'D';
}

export default function Game() {
  const { songId } = useParams<{ songId: string }>();
  const [, setLocation] = useLocation();
  const song = getSong(songId || '');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<AudioManager | null>(null);
  const rafRef = useRef<number>(0);
  const notesRef = useRef<NoteState[]>([]);
  const laneRef = useRef<LanePress[]>([
    { pressed: false }, { pressed: false }, { pressed: false }, { pressed: false },
  ]);
  const gameStateRef = useRef<GameState>({
    score: 0, combo: 0, maxCombo: 0,
    perfects: 0, goods: 0, misses: 0, progress: 0,
  });
  const judgmentsRef = useRef<JudgmentDisplay[]>([]);
  const judgeCounterRef = useRef(0);

  const [phase, setPhase] = useState<'countdown' | 'playing' | 'paused' | 'finished'>('countdown');
  const [countdown, setCountdown] = useState(3);
  const [displayState, setDisplayState] = useState<GameState>(gameStateRef.current);
  const [displayJudgments, setDisplayJudgments] = useState<JudgmentDisplay[]>([]);

  const phaseRef = useRef<'countdown' | 'playing' | 'paused' | 'finished'>('countdown');

  const syncDisplay = useCallback(() => {
    setDisplayState({ ...gameStateRef.current });
    setDisplayJudgments([...judgmentsRef.current]);
  }, []);

  const hitLane = useCallback((lane: number) => {
    if (phaseRef.current !== 'playing') return;
    const audio = audioRef.current;
    if (!audio) return;
    const t = audio.getGameTime();

    const candidates = notesRef.current.filter(
      (ns) => ns.note.lane === lane && !ns.hit && !ns.missed
    );
    if (candidates.length === 0) return;

    const ns = candidates.reduce((best, cur) =>
      Math.abs(cur.note.time - t) < Math.abs(best.note.time - t) ? cur : best
    );

    const diff = Math.abs(ns.note.time - t);

    if (diff > MISS_WINDOW) return;

    let judgment: 'PERFECT' | 'GOOD' | null = null;
    if (diff <= PERFECT_WINDOW) judgment = 'PERFECT';
    else if (diff <= GOOD_WINDOW) judgment = 'GOOD';

    if (!judgment) return;

    if (ns.note.type === 'hold') {
      ns.holdActive = true;
    } else {
      ns.hit = true;
    }

    const gs = gameStateRef.current;
    gs.score += calcScore(gs.combo, judgment);
    gs.combo += 1;
    gs.maxCombo = Math.max(gs.maxCombo, gs.combo);
    if (judgment === 'PERFECT') gs.perfects++;
    else gs.goods++;

    const jid = ++judgeCounterRef.current;
    judgmentsRef.current = [
      ...judgmentsRef.current.filter((j) => Date.now() - j.ts < 600),
      { type: judgment, lane, id: jid, ts: Date.now() },
    ];
    syncDisplay();
  }, [syncDisplay]);

  const releaseLane = useCallback((lane: number) => {
    if (phaseRef.current !== 'playing') return;
    const audio = audioRef.current;
    if (!audio) return;
    const t = audio.getGameTime();

    const active = notesRef.current.find(
      (ns) => ns.note.lane === lane && ns.note.type === 'hold' && ns.holdActive && !ns.hit
    );
    if (!active) return;

    const expectedEnd = active.note.time + (active.note.holdDuration || 0.5);
    const diff = Math.abs(t - expectedEnd);
    const progress = active.holdProgress;

    active.hit = true;
    active.holdActive = false;

    const gs = gameStateRef.current;
    if (progress > 0.7 || diff < GOOD_WINDOW) {
      gs.score += calcScore(gs.combo, 'PERFECT');
      gs.combo += 1;
      gs.maxCombo = Math.max(gs.maxCombo, gs.combo);
      gs.perfects++;
      const jid = ++judgeCounterRef.current;
      judgmentsRef.current = [
        ...judgmentsRef.current.filter((j) => Date.now() - j.ts < 600),
        { type: 'PERFECT', lane, id: jid, ts: Date.now() },
      ];
    }
    syncDisplay();
  }, [syncDisplay]);

  // Draw loop
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const audio = audioRef.current;
    if (!audio || phaseRef.current !== 'playing') return;

    const t = audio.getGameTime();
    const W = canvas.width;
    const H = canvas.height;
    const laneW = W / 4;
    const hitY = H * 0.82;
    const gs = gameStateRef.current;

    // Update progress
    gs.progress = song ? Math.min(1, t / song.duration) : 0;

    // Background
    ctx.fillStyle = '#080604';
    ctx.fillRect(0, 0, W, H);

    // Background grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Lane backgrounds
    for (let i = 0; i < 4; i++) {
      const x = i * laneW;
      const isPressed = laneRef.current[i].pressed;
      ctx.fillStyle = isPressed
        ? `${LANE_COLORS[i]}18`
        : i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.1)';
      ctx.fillRect(x, 0, laneW, H);
    }

    // Lane dividers
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * laneW, 0);
      ctx.lineTo(i * laneW, H);
      ctx.stroke();
    }

    // Hit zone line
    const grad = ctx.createLinearGradient(0, hitY - 1, 0, hitY + 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, hitY);
    ctx.lineTo(W, hitY);
    ctx.stroke();

    // Process notes
    let checkMissed = false;
    for (const ns of notesRef.current) {
      if (ns.hit || ns.missed) continue;

      const { note } = ns;
      const lc = LANE_COLORS[note.lane];
      const x = note.lane * laneW;
      const noteW = laneW - 4;
      const noteX = x + 2;

      if (note.type === 'hold' && ns.holdActive) {
        // Update hold progress
        const elapsed = t - note.time;
        ns.holdProgress = Math.min(1, elapsed / (note.holdDuration || 0.5));
      }

      const spawnT = note.time - APPROACH_TIME;
      const progress = (t - spawnT) / APPROACH_TIME;
      const noteY = progress * hitY;

      // Miss detection for taps
      if (!ns.holdActive && note.type === 'tap' && t > note.time + MISS_WINDOW) {
        ns.missed = true;
        const g = gameStateRef.current;
        g.combo = 0;
        g.misses++;
        checkMissed = true;
        const jid = ++judgeCounterRef.current;
        judgmentsRef.current = [
          ...judgmentsRef.current.filter((j) => Date.now() - j.ts < 600),
          { type: 'MISS', lane: note.lane, id: jid, ts: Date.now() },
        ];
        continue;
      }

      // Miss detection for hold not activated
      if (note.type === 'hold' && !ns.holdActive && t > note.time + MISS_WINDOW) {
        ns.missed = true;
        const g = gameStateRef.current;
        g.combo = 0;
        g.misses++;
        checkMissed = true;
        continue;
      }

      // Skip notes not yet visible
      if (noteY < -60) continue;

      if (note.type === 'tap') {
        const noteH = 22;
        const radius = 6;

        // Glow
        if (noteY > -20 && noteY < hitY + 20) {
          ctx.shadowColor = lc;
          ctx.shadowBlur = 20;
        }

        // Note body
        ctx.fillStyle = lc;
        ctx.beginPath();
        ctx.roundRect(noteX, noteY - noteH / 2, noteW, noteH, radius);
        ctx.fill();

        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.roundRect(noteX + 4, noteY - noteH / 2 + 3, noteW - 8, 4, 2);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
      } else {
        // Hold note
        const holdDur = note.holdDuration || 0.5;
        const holdPx = (holdDur / APPROACH_TIME) * hitY;
        const tailY = noteY;
        const headY = noteY - holdPx;
        const noteH = 22;
        const radius = 8;

        if (ns.holdActive) {
          // Shrink from top as it's held
          const activeHeadY = Math.max(headY, hitY - holdPx * (1 - ns.holdProgress));
          const activeH = tailY - activeHeadY + noteH / 2;
          if (activeH > 0) {
            ctx.fillStyle = `${lc}60`;
            ctx.beginPath();
            ctx.roundRect(noteX + noteW * 0.3, activeHeadY, noteW * 0.4, activeH, 4);
            ctx.fill();
          }
        } else {
          // Full hold body
          ctx.fillStyle = `${lc}40`;
          ctx.beginPath();
          ctx.roundRect(noteX + noteW * 0.3, headY, noteW * 0.4, tailY - headY + noteH / 2, 4);
          ctx.fill();
        }

        // Head
        ctx.shadowColor = lc;
        ctx.shadowBlur = 20;
        ctx.fillStyle = lc;
        ctx.beginPath();
        ctx.roundRect(noteX, tailY - noteH / 2, noteW, noteH, radius);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.roundRect(noteX + 4, tailY - noteH / 2 + 3, noteW - 8, 4, 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
      }
    }

    // Hit zone buttons
    const btnH = H - hitY;
    for (let i = 0; i < 4; i++) {
      const x = i * laneW;
      const isPressed = laneRef.current[i].pressed;
      const lc = LANE_COLORS[i];

      ctx.fillStyle = isPressed ? `${lc}50` : `${lc}18`;
      ctx.fillRect(x + 1, hitY + 1, laneW - 2, btnH - 1);

      // Bottom border
      ctx.strokeStyle = isPressed ? lc : `${lc}60`;
      ctx.lineWidth = isPressed ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(x + 1, hitY + 1);
      ctx.lineTo(x + laneW - 1, hitY + 1);
      ctx.stroke();

      if (isPressed) {
        ctx.shadowColor = lc;
        ctx.shadowBlur = 30;
        ctx.fillStyle = `${lc}30`;
        ctx.fillRect(x + 1, hitY + 1, laneW - 2, btnH - 1);
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
      }

      // Key label
      ctx.fillStyle = isPressed ? lc : `${lc}80`;
      ctx.font = `bold 14px "Space Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(LANE_KEYS[i].toUpperCase(), x + laneW / 2, hitY + btnH / 2);
    }

    if (checkMissed) syncDisplay();

    // Check finished
    const allDone = notesRef.current.every((ns) => ns.hit || ns.missed);
    if (allDone && song && t > 2) {
      const lastNoteTime = Math.max(...notesRef.current.map((ns) => ns.note.time));
      if (t > lastNoteTime + 1.5) {
        finishGame();
        return;
      }
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [song, syncDisplay]);

  const finishGame = useCallback(() => {
    phaseRef.current = 'finished';
    setPhase('finished');
    cancelAnimationFrame(rafRef.current);
    audioRef.current?.stop();

    const gs = gameStateRef.current;
    if (song) {
      saveHighScore(song.id, gs.score);
    }

    const rank = getRank(gs.perfects, gs.goods, gs.misses);
    const total = gs.perfects + gs.goods + gs.misses;

    sessionStorage.setItem(`result_${songId}`, JSON.stringify({
      score: gs.score,
      maxCombo: gs.maxCombo,
      perfects: gs.perfects,
      goods: gs.goods,
      misses: gs.misses,
      rank,
      total,
    }));

    setTimeout(() => setLocation(`/results/${songId}`), 1000);
  }, [song, songId, setLocation]);

  // Keyboard handlers
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const lane = LANE_KEYS.indexOf(e.key.toLowerCase());
      if (lane === -1) return;
      laneRef.current[lane].pressed = true;
      hitLane(lane);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const lane = LANE_KEYS.indexOf(e.key.toLowerCase());
      if (lane === -1) return;
      laneRef.current[lane].pressed = false;
      releaseLane(lane);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [hitLane, releaseLane]);

  // Touch handlers
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const laneW = rect.width / 4;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const x = touch.clientX - rect.left;
      const lane = Math.floor(x / laneW);
      if (lane >= 0 && lane < 4) {
        laneRef.current[lane].pressed = true;
        laneRef.current[lane].touchId = touch.identifier;
        hitLane(lane);
      }
    }
  }, [hitLane]);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      for (let lane = 0; lane < 4; lane++) {
        if (laneRef.current[lane].touchId === touch.identifier) {
          laneRef.current[lane].pressed = false;
          laneRef.current[lane].touchId = undefined;
          releaseLane(lane);
        }
      }
    }
  }, [releaseLane]);

  // Canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Countdown + game start
  useEffect(() => {
    if (!song) { setLocation('/songs'); return; }

    notesRef.current = song.notes.map((n) => ({
      note: n,
      hit: false,
      missed: false,
      holdActive: false,
      holdComplete: false,
      holdProgress: 0,
    }));

    gameStateRef.current = {
      score: 0, combo: 0, maxCombo: 0,
      perfects: 0, goods: 0, misses: 0, progress: 0,
    };

    let count = 3;
    setCountdown(count);

    const interval = setInterval(() => {
      count--;
      if (count > 0) {
        setCountdown(count);
      } else {
        clearInterval(interval);
        setCountdown(0);

        // Start game
        const startGame = async () => {
          const am = new AudioManager();
          await am.init();
          audioRef.current = am;
          am.markStart();
          am.scheduleSong(song.id, song.bpm, song.duration);
          phaseRef.current = 'playing';
          setPhase('playing');
          rafRef.current = requestAnimationFrame(draw);
        };
        startGame();
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      cancelAnimationFrame(rafRef.current);
      audioRef.current?.stop();
    };
  }, [song, draw, setLocation]);

  if (!song) return null;

  const gs = displayState;
  const multiStr = gs.combo < 10 ? '×1' : gs.combo < 25 ? '×2' : gs.combo < 50 ? '×3' : '×4';
  const multiColor = gs.combo < 10 ? '#888' : gs.combo < 25 ? '#48E5C2' : gs.combo < 50 ? '#E5B800' : '#E53A00';

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden"
      style={{ background: '#080604' }}
    >
      {/* Top HUD */}
      <div
        className="flex items-center justify-between px-4 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <button
          data-testid="button-quit"
          onClick={() => { audioRef.current?.stop(); setLocation('/songs'); }}
          className="font-mono text-xs tracking-widest transition-colors"
          style={{ color: 'hsl(30 15% 35%)' }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#E53A00')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'hsl(30 15% 35%)')}
        >
          ✕ QUIT
        </button>

        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className="font-mono text-xs" style={{ color: 'hsl(30 15% 40%)' }}>SCORE</div>
            <div
              className="font-mono font-bold text-lg leading-none"
              data-testid="text-score"
              style={{ color: '#F2EDE5', letterSpacing: '0.05em' }}
            >
              {gs.score.toLocaleString()}
            </div>
          </div>

          <div className="text-center">
            <div className="font-mono text-xs" style={{ color: 'hsl(30 15% 40%)' }}>COMBO</div>
            <div
              className="font-mono font-bold text-lg leading-none"
              data-testid="text-combo"
              style={{ color: gs.combo > 0 ? multiColor : 'hsl(30 15% 35%)' }}
            >
              {gs.combo > 0 ? `${gs.combo}` : '—'}
              {gs.combo >= 10 && (
                <span className="text-xs ml-1">{multiStr}</span>
              )}
            </div>
          </div>
        </div>

        <div className="font-mono text-xs tracking-widest" style={{ color: 'hsl(30 15% 40%)' }}>
          {song.title}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div
          className="h-full transition-none"
          style={{
            width: `${(gs.progress || 0) * 100}%`,
            background: 'linear-gradient(90deg, #E53A00, #E5B800)',
          }}
        />
      </div>

      {/* Game canvas area */}
      <div className="relative flex-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          data-testid="canvas-game"
        />

        {/* Judgment displays */}
        {displayJudgments.map((j) => {
          const now = Date.now();
          if (now - j.ts > 600) return null;
          const x = (j.lane / 4 + 1 / 8) * 100;
          const color = j.type === 'PERFECT' ? '#48E5C2' : j.type === 'GOOD' ? '#E5B800' : '#888';
          return (
            <div
              key={j.id}
              className="absolute font-mono font-bold text-sm pointer-events-none judgment-pop"
              style={{
                left: `${x}%`,
                top: '70%',
                transform: 'translateX(-50%)',
                color,
                textShadow: `0 0 10px ${color}`,
                letterSpacing: '0.15em',
              }}
            >
              {j.type}
            </div>
          );
        })}

        {/* Countdown overlay */}
        {phase === 'countdown' && (
          <div className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(8,6,4,0.85)' }}>
            <div
              className="font-mono font-bold text-center"
              style={{
                fontSize: '120px',
                color: '#E53A00',
                textShadow: '0 0 60px rgba(229,58,0,0.8)',
                lineHeight: 1,
              }}
            >
              {countdown > 0 ? countdown : 'GO!'}
            </div>
          </div>
        )}

        {/* Stats overlay (top left mini) */}
        {phase === 'playing' && (
          <div
            className="absolute top-3 left-3 font-mono text-xs space-y-0.5 pointer-events-none"
            style={{ color: 'hsl(30 15% 35%)' }}
          >
            <div style={{ color: '#48E5C2' }}>✓ {gs.perfects}</div>
            <div style={{ color: '#E5B800' }}>~ {gs.goods}</div>
            <div style={{ color: '#444' }}>✗ {gs.misses}</div>
          </div>
        )}
      </div>
    </div>
  );
}
