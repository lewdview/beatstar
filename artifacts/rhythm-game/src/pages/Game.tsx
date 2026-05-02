import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { getSongById, saveHighScore } from "@/game/api";
import type { GameSong } from "@/game/api";
import type { Note, JudgmentDisplay, GameState } from "@/game/types";

const APPROACH_TIME = 2.0;
const PERFECT_WINDOW = 0.065;
const GOOD_WINDOW = 0.130;
const MISS_WINDOW = 0.180;
const LANE_KEYS = ['a', 's', 'd', 'f'];
const LANE_COLORS = ['#E53A00', '#48E5C2', '#E5B800', '#8B48E5'];

interface NoteState {
  note: Note;
  hit: boolean;
  missed: boolean;
  holdActive: boolean;
  holdProgress: number;
}

interface LanePress {
  pressed: boolean;
  touchId?: number;
}

function calcScore(combo: number, j: 'PERFECT' | 'GOOD'): number {
  const base = j === 'PERFECT' ? 300 : 150;
  const mul = combo < 10 ? 1 : combo < 25 ? 2 : combo < 50 ? 3 : 4;
  return base * mul;
}

function getRank(p: number, g: number, m: number): string {
  const total = p + g + m;
  if (total === 0) return 'D';
  if (m === 0 && g === 0) return 'S';
  if (m === 0 && p / total >= 0.9) return 'A';
  if (p / total >= 0.8) return 'B';
  if (p / total >= 0.6) return 'C';
  return 'D';
}

export default function Game() {
  const { songId } = useParams<{ songId: string }>();
  const [, setLocation] = useLocation();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
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
  const songRef = useRef<GameSong | null>(null);
  const phaseRef = useRef<'loading' | 'buffering' | 'countdown' | 'playing' | 'finished'>('loading');

  const [phase, setPhase] = useState<'loading' | 'buffering' | 'countdown' | 'playing' | 'finished'>('loading');
  const [countdown, setCountdown] = useState(3);
  const [displayState, setDisplayState] = useState<GameState>(gameStateRef.current);
  const [displayJudgments, setDisplayJudgments] = useState<JudgmentDisplay[]>([]);
  const [loadingMsg, setLoadingMsg] = useState('FETCHING TRANSMISSION...');
  const [bufferPct, setBufferPct] = useState(0);

  const syncDisplay = useCallback(() => {
    setDisplayState({ ...gameStateRef.current });
    setDisplayJudgments([...judgmentsRef.current]);
  }, []);

  const getGameTime = useCallback((): number => {
    return audioRef.current?.currentTime ?? 0;
  }, []);

  const hitLane = useCallback((lane: number) => {
    if (phaseRef.current !== 'playing') return;
    const t = getGameTime();

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

    if (ns.note.type === 'hold') ns.holdActive = true;
    else ns.hit = true;

    const gs = gameStateRef.current;
    gs.score += calcScore(gs.combo, judgment);
    gs.combo++;
    gs.maxCombo = Math.max(gs.maxCombo, gs.combo);
    if (judgment === 'PERFECT') gs.perfects++;
    else gs.goods++;

    const jid = ++judgeCounterRef.current;
    judgmentsRef.current = [
      ...judgmentsRef.current.filter((j) => Date.now() - j.ts < 550),
      { type: judgment, lane, id: jid, ts: Date.now() },
    ];
    syncDisplay();
  }, [getGameTime, syncDisplay]);

  const releaseLane = useCallback((lane: number) => {
    if (phaseRef.current !== 'playing') return;
    const ns = notesRef.current.find(
      (n) => n.note.lane === lane && n.note.type === 'hold' && n.holdActive && !n.hit
    );
    if (!ns) return;
    ns.hit = true;
    ns.holdActive = false;
    const gs = gameStateRef.current;
    if (ns.holdProgress > 0.65) {
      gs.score += calcScore(gs.combo, 'PERFECT');
      gs.combo++;
      gs.maxCombo = Math.max(gs.maxCombo, gs.combo);
      gs.perfects++;
      const jid = ++judgeCounterRef.current;
      judgmentsRef.current = [
        ...judgmentsRef.current.filter((j) => Date.now() - j.ts < 550),
        { type: 'PERFECT', lane, id: jid, ts: Date.now() },
      ];
    }
    syncDisplay();
  }, [syncDisplay]);

  const finishGame = useCallback(() => {
    if (phaseRef.current === 'finished') return;
    phaseRef.current = 'finished';
    setPhase('finished');
    cancelAnimationFrame(rafRef.current);
    audioRef.current?.pause();
    const gs = gameStateRef.current;
    const song = songRef.current;
    if (song) saveHighScore(song.id, gs.score);
    const rank = getRank(gs.perfects, gs.goods, gs.misses);
    const total = gs.perfects + gs.goods + gs.misses;
    sessionStorage.setItem(`result_${songId}`, JSON.stringify({
      score: gs.score, maxCombo: gs.maxCombo,
      perfects: gs.perfects, goods: gs.goods, misses: gs.misses,
      rank, total,
    }));
    setTimeout(() => setLocation(`/results/${songId}`), 800);
  }, [songId, setLocation]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || phaseRef.current !== 'playing') return;
    const song = songRef.current;
    if (!song) return;

    const t = getGameTime();
    const W = canvas.width;
    const H = canvas.height;
    const laneW = W / 4;
    const hitY = H * 0.82;
    const gs = gameStateRef.current;

    gs.progress = Math.min(1, t / song.duration);

    ctx.fillStyle = '#080604';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    for (let i = 0; i < 4; i++) {
      const x = i * laneW;
      ctx.fillStyle = laneRef.current[i].pressed
        ? `${LANE_COLORS[i]}18`
        : i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.1)';
      ctx.fillRect(x, 0, laneW, H);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(i * laneW, 0); ctx.lineTo(i * laneW, H); ctx.stroke();
    }

    const hzGrad = ctx.createLinearGradient(0, hitY - 1, 0, hitY + 2);
    hzGrad.addColorStop(0, 'rgba(255,255,255,0.5)');
    hzGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = hzGrad;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, hitY); ctx.lineTo(W, hitY); ctx.stroke();

    let dirty = false;

    for (const ns of notesRef.current) {
      if (ns.hit || ns.missed) continue;
      const { note } = ns;
      const lc = LANE_COLORS[note.lane];
      const x = note.lane * laneW;
      const noteW = laneW - 4;
      const noteX = x + 2;

      if (ns.holdActive) {
        ns.holdProgress = Math.min(1, (t - note.time) / (note.holdDuration || 0.5));
      }

      const spawnT = note.time - APPROACH_TIME;
      const progress = (t - spawnT) / APPROACH_TIME;
      const noteY = progress * hitY;

      if (!ns.holdActive && note.type === 'tap' && t > note.time + MISS_WINDOW) {
        ns.missed = true;
        const g = gameStateRef.current;
        g.combo = 0; g.misses++;
        const jid = ++judgeCounterRef.current;
        judgmentsRef.current = [
          ...judgmentsRef.current.filter((j) => Date.now() - j.ts < 550),
          { type: 'MISS', lane: note.lane, id: jid, ts: Date.now() },
        ];
        dirty = true;
        continue;
      }
      if (note.type === 'hold' && !ns.holdActive && t > note.time + MISS_WINDOW) {
        ns.missed = true;
        const g = gameStateRef.current;
        g.combo = 0; g.misses++;
        dirty = true;
        continue;
      }
      if (noteY < -80) continue;

      if (note.type === 'tap') {
        const noteH = 22;
        if (noteY > -20 && noteY < hitY + 20) {
          ctx.shadowColor = lc; ctx.shadowBlur = 18;
        }
        ctx.fillStyle = lc;
        ctx.beginPath();
        ctx.roundRect(noteX, noteY - noteH / 2, noteW, noteH, 6);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.roundRect(noteX + 4, noteY - noteH / 2 + 3, noteW - 8, 4, 2);
        ctx.fill();
        ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
      } else {
        const holdDur = note.holdDuration || 0.5;
        const holdPx = (holdDur / APPROACH_TIME) * hitY;
        const tailY = noteY;
        const headY = noteY - holdPx;
        const noteH = 22;
        if (ns.holdActive) {
          const activeH = tailY - Math.max(headY, hitY - holdPx * (1 - ns.holdProgress)) + noteH / 2;
          if (activeH > 0) {
            ctx.fillStyle = `${lc}55`;
            ctx.beginPath();
            ctx.roundRect(noteX + noteW * 0.3, Math.max(headY, hitY - holdPx * (1 - ns.holdProgress)), noteW * 0.4, activeH, 3);
            ctx.fill();
          }
        } else {
          ctx.fillStyle = `${lc}35`;
          ctx.beginPath();
          ctx.roundRect(noteX + noteW * 0.3, headY, noteW * 0.4, tailY - headY + noteH / 2, 3);
          ctx.fill();
        }
        ctx.shadowColor = lc; ctx.shadowBlur = 18;
        ctx.fillStyle = lc;
        ctx.beginPath();
        ctx.roundRect(noteX, tailY - noteH / 2, noteW, noteH, 8);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.roundRect(noteX + 4, tailY - noteH / 2 + 3, noteW - 8, 4, 2);
        ctx.fill();
        ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
      }
    }

    const btnH = H - hitY;
    for (let i = 0; i < 4; i++) {
      const x = i * laneW;
      const pressed = laneRef.current[i].pressed;
      const lc = LANE_COLORS[i];
      ctx.fillStyle = pressed ? `${lc}45` : `${lc}15`;
      ctx.fillRect(x + 1, hitY + 1, laneW - 2, btnH - 1);
      ctx.strokeStyle = pressed ? lc : `${lc}55`;
      ctx.lineWidth = pressed ? 3 : 2;
      ctx.beginPath(); ctx.moveTo(x + 1, hitY + 1); ctx.lineTo(x + laneW - 1, hitY + 1); ctx.stroke();
      if (pressed) {
        ctx.shadowColor = lc; ctx.shadowBlur = 28;
        ctx.fillStyle = `${lc}25`;
        ctx.fillRect(x + 1, hitY + 1, laneW - 2, btnH - 1);
        ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
      }
      ctx.fillStyle = pressed ? lc : `${lc}80`;
      ctx.font = `bold 14px "Space Mono", monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(LANE_KEYS[i].toUpperCase(), x + laneW / 2, hitY + btnH / 2);
    }

    if (dirty) syncDisplay();

    const allDone = notesRef.current.every((ns) => ns.hit || ns.missed);
    const lastNoteTime = notesRef.current.length > 0
      ? Math.max(...notesRef.current.map((ns) => ns.note.time))
      : 0;
    if (allDone && t > lastNoteTime + 1.5 && t > 3) {
      finishGame(); return;
    }
    if (t >= song.duration) { finishGame(); return; }

    rafRef.current = requestAnimationFrame(draw);
  }, [getGameTime, syncDisplay, finishGame]);

  // Keyboard
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const lane = LANE_KEYS.indexOf(e.key.toLowerCase());
      if (lane === -1) return;
      laneRef.current[lane].pressed = true;
      hitLane(lane);
    };
    const onUp = (e: KeyboardEvent) => {
      const lane = LANE_KEYS.indexOf(e.key.toLowerCase());
      if (lane === -1) return;
      laneRef.current[lane].pressed = false;
      releaseLane(lane);
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
  }, [hitLane, releaseLane]);

  // Touch
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const lane = Math.floor(((touch.clientX - rect.left) / rect.width) * 4);
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
      const p = canvas.parentElement;
      if (!p) return;
      canvas.width = p.clientWidth;
      canvas.height = p.clientHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Main init
  useEffect(() => {
    if (!songId) { setLocation('/songs'); return; }

    let cancelled = false;
    let audio: HTMLAudioElement | null = null;

    const init = async () => {
      setLoadingMsg('FETCHING TRANSMISSION...');
      phaseRef.current = 'loading';
      setPhase('loading');

      const song = await getSongById(songId);
      if (cancelled || !song) { setLocation('/songs'); return; }

      songRef.current = song;
      notesRef.current = song.notes.map((n) => ({
        note: n, hit: false, missed: false, holdActive: false, holdProgress: 0,
      }));
      gameStateRef.current = {
        score: 0, combo: 0, maxCombo: 0,
        perfects: 0, goods: 0, misses: 0, progress: 0,
      };

      setLoadingMsg('BUFFERING AUDIO...');
      phaseRef.current = 'buffering';
      setPhase('buffering');

      audio = new Audio();
      audio.crossOrigin = 'anonymous';
      audio.preload = 'auto';
      audioRef.current = audio;

      audio.addEventListener('progress', () => {
        if (!audio?.duration || audio.duration === 0) return;
        const buffered = audio.buffered;
        if (buffered.length > 0) {
          setBufferPct(Math.min(100, Math.round((buffered.end(buffered.length - 1) / audio.duration) * 100)));
        }
      });

      // Set src after adding listener
      audio.src = song.audioUrl;
      audio.load();

      await new Promise<void>((resolve, reject) => {
        const onReady = () => { resolve(); };
        const onErr = () => reject(new Error('audio load failed'));
        audio!.addEventListener('canplay', onReady, { once: true });
        audio!.addEventListener('error', onErr, { once: true });
        // Timeout fallback after 15s
        setTimeout(resolve, 15000);
      });

      if (cancelled) return;

      // Countdown
      phaseRef.current = 'countdown';
      setPhase('countdown');
      let count = 3;
      setCountdown(count);

      await new Promise<void>((resolve) => {
        const tick = setInterval(() => {
          count--;
          if (count > 0) {
            setCountdown(count);
          } else {
            clearInterval(tick);
            setCountdown(0);
            resolve();
          }
        }, 1000);
      });

      if (cancelled) return;

      phaseRef.current = 'playing';
      setPhase('playing');
      await audio.play();
      rafRef.current = requestAnimationFrame(draw);
    };

    init().catch((err) => {
      console.error('Game init failed:', err);
      if (!cancelled) setLocation('/songs');
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      if (audio) { audio.pause(); audio.src = ''; }
      audioRef.current = null;
    };
  }, [songId, draw, setLocation]);

  const gs = displayState;
  const comboColor = gs.combo < 10 ? '#888' : gs.combo < 25 ? '#48E5C2' : gs.combo < 50 ? '#E5B800' : '#E53A00';
  const multiStr = gs.combo < 10 ? '' : gs.combo < 25 ? ' ×2' : gs.combo < 50 ? ' ×3' : ' ×4';
  const song = songRef.current;

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ background: '#080604' }}>
      {/* HUD */}
      <div
        className="flex items-center justify-between px-4 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      >
        <button
          data-testid="button-quit"
          onClick={() => {
            audioRef.current?.pause();
            setLocation('/songs');
          }}
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
            <div className="font-mono font-bold text-lg leading-none" data-testid="text-score" style={{ color: '#F2EDE5' }}>
              {gs.score.toLocaleString()}
            </div>
          </div>
          <div className="text-center">
            <div className="font-mono text-xs" style={{ color: 'hsl(30 15% 40%)' }}>COMBO</div>
            <div className="font-mono font-bold text-lg leading-none" data-testid="text-combo" style={{ color: gs.combo > 0 ? comboColor : 'hsl(30 15% 35%)' }}>
              {gs.combo > 0 ? `${gs.combo}${multiStr}` : '—'}
            </div>
          </div>
        </div>

        <div className="font-mono text-xs tracking-widest truncate max-w-24 text-right" style={{ color: 'hsl(30 15% 40%)' }}>
          {song?.title || ''}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 flex-shrink-0" style={{ background: 'rgba(255,255,255,0.05)' }}>
        <div
          className="h-full"
          style={{
            width: `${(gs.progress || 0) * 100}%`,
            background: 'linear-gradient(90deg, #E53A00, #E5B800)',
            transition: 'width 0.2s linear',
          }}
        />
      </div>

      {/* Canvas area */}
      <div className="relative flex-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          data-testid="canvas-game"
        />

        {/* Judgment popups */}
        {displayJudgments.map((j) => {
          if (Date.now() - j.ts > 550) return null;
          const x = (j.lane / 4 + 1 / 8) * 100;
          const color = j.type === 'PERFECT' ? '#48E5C2' : j.type === 'GOOD' ? '#E5B800' : '#555';
          return (
            <div
              key={j.id}
              className="absolute font-mono font-bold text-sm pointer-events-none judgment-pop"
              style={{
                left: `${x}%`, top: '72%',
                transform: 'translateX(-50%)',
                color, textShadow: `0 0 12px ${color}`,
                letterSpacing: '0.15em',
              }}
            >
              {j.type}
            </div>
          );
        })}

        {/* Loading / Buffering overlay */}
        {(phase === 'loading' || phase === 'buffering') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6"
            style={{ background: 'rgba(8,6,4,0.95)' }}>
            <div className="font-mono text-xs tracking-[0.3em]" style={{ color: 'hsl(168 72% 59%)' }}>
              {loadingMsg}
            </div>
            {song && (
              <div className="text-center">
                {song.coverArt && (
                  <img src={song.coverArt} alt={song.title} className="w-24 h-24 object-cover mx-auto mb-3 opacity-70" />
                )}
                <div className="font-mono font-bold text-lg" style={{ color: '#F2EDE5' }}>{song.title}</div>
                <div className="font-mono text-xs mt-1" style={{ color: 'hsl(30 15% 45%)' }}>
                  DAY {song.day} · {song.bpm} BPM · {song.notes.length} NOTES
                </div>
              </div>
            )}
            {phase === 'buffering' && bufferPct > 0 && (
              <div className="w-48">
                <div className="h-0.5 w-full" style={{ background: 'rgba(255,255,255,0.1)' }}>
                  <div
                    className="h-full transition-all duration-200"
                    style={{ width: `${bufferPct}%`, background: '#E53A00' }}
                  />
                </div>
                <div className="font-mono text-xs mt-1 text-center" style={{ color: 'hsl(30 15% 40%)' }}>
                  {bufferPct}%
                </div>
              </div>
            )}
            <div className="flex gap-1">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ background: LANE_COLORS[i], animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}

        {/* Countdown overlay */}
        {phase === 'countdown' && (
          <div className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(8,6,4,0.82)' }}>
            <div className="font-mono font-bold text-center"
              style={{ fontSize: 120, color: '#E53A00', textShadow: '0 0 60px rgba(229,58,0,0.8)', lineHeight: 1 }}>
              {countdown > 0 ? countdown : 'GO!'}
            </div>
          </div>
        )}

        {/* Mini stats */}
        {phase === 'playing' && (
          <div className="absolute top-3 left-3 font-mono text-xs space-y-0.5 pointer-events-none">
            <div style={{ color: '#48E5C2' }}>✓ {gs.perfects}</div>
            <div style={{ color: '#E5B800' }}>~ {gs.goods}</div>
            <div style={{ color: '#444' }}>✗ {gs.misses}</div>
          </div>
        )}
      </div>
    </div>
  );
}
