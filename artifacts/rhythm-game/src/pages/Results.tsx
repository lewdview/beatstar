import { useParams, useLocation } from "wouter";
import { useEffect, useState, useRef } from "react";
import { getSongById, loadCatalog, isSongTimeLocked } from "@/game/api";
import type { GameSong } from "@/game/api";
import { getHighScore, getChapterPlatinums } from "@/game/progress";
import { getActiveTheme } from "@/lib/options";
import { audioManager } from "@/game/audio";

interface ResultData {
  score: number; maxCombo: number; perfectPlus: number;
  perfects: number; goods: number; misses: number; medal: string; total: number;
  failed?: boolean; continuesUsed?: number;
}

const MEDALS: Record<string, { color: string; message: string }> = {
  PLATINUM: { color: '#39FF14', message: 'PERFECT SIGNAL — ALL TRANSMISSIONS LOCKED' },
  GOLD:     { color: '#E5B800', message: 'STRONG SIGNAL — MINIMAL INTERFERENCE' },
  SILVER:   { color: '#A0AABB', message: 'SIGNAL STABLE — SOME STATIC DETECTED' },
  BRONZE:   { color: '#C97A3A', message: 'WEAK SIGNAL — SIGNIFICANT NOISE' },
  NONE:     { color: '#555',    message: 'SIGNAL LOST — RECONNECT AND RETRY' },
};

const MEDAL_ORDER = ['NONE','BRONZE','SILVER','GOLD','PLATINUM'];
const MEDAL_THRESHOLDS = [
  { name: 'BRONZE',   acc: 40, color: '#C97A3A' },
  { name: 'SILVER',   acc: 60, color: '#A0AABB' },
  { name: 'GOLD',     acc: 80, color: '#E5B800' },
  { name: 'PLATINUM', acc: 93, color: '#39FF14' },
];

const CHAPTER_PLAT_NEEDED: Record<number, number> = {
  1:2, 2:2, 3:3, 4:3, 5:3, 6:4, 7:4, 8:5, 9:5, 10:5, 11:6, 12:7,
};

// ── circular ring component (Classic & Avant-Garde) ──────────────────
function ScoreRing({ progress, color, size = 180, isAvant }: { progress: number; color: string; size?: number; isAvant?: boolean }) {
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(1, progress));

  if (isAvant) {
    return (
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="ring-pulse" style={{ '--ring-color': color } as React.CSSProperties}>
          {/* Outer dashed ring */}
          <circle cx={size/2} cy={size/2} r={r + 6} fill="none"
            stroke={`${color}15`} strokeWidth="1" strokeDasharray="4 8"
            style={{ animation: 'spin-slow 20s linear infinite', transformOrigin: '50% 50%' }} />

          {/* Diagnostic ticks */}
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = i * 30;
            return (
              <line
                key={i}
                x1={size/2 + (r + 2) * Math.cos((angle * Math.PI) / 180)}
                y1={size/2 + (r + 2) * Math.sin((angle * Math.PI) / 180)}
                x2={size/2 + (r + 7) * Math.cos((angle * Math.PI) / 180)}
                y2={size/2 + (r + 7) * Math.sin((angle * Math.PI) / 180)}
                stroke={`${color}40`}
                strokeWidth="1"
              />
            );
          })}

          {/* Track */}
          <circle cx={size/2} cy={size/2} r={r} fill="none"
            stroke="rgba(255,255,255,0.02)" strokeWidth="3" />

          {/* Progress */}
          <circle cx={size/2} cy={size/2} r={r} fill="none"
            stroke={color} strokeWidth="3"
            strokeDasharray={circ} strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.15s linear, stroke 0.4s ease', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
        </svg>
        <style>{`
          @keyframes spin-slow {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Classic ring
  const rClassic = (size - 12) / 2;
  const circClassic = 2 * Math.PI * rClassic;
  const offsetClassic = circClassic * (1 - Math.min(1, progress));
  return (
    <svg width={size} height={size} className="ring-pulse" style={{ '--ring-color': color } as React.CSSProperties}>
      {/* Track */}
      <circle cx={size/2} cy={size/2} r={rClassic} fill="none"
        stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
      {/* Progress */}
      <circle cx={size/2} cy={size/2} r={rClassic} fill="none"
        stroke={color} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={circClassic} strokeDashoffset={offsetClassic}
        style={{ transition: 'stroke-dashoffset 0.15s linear, stroke 0.4s ease', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
    </svg>
  );
}

// ── main component ───────────────────────────────────────────
export default function Results() {
  const { songId } = useParams<{ songId: string }>();
  const [, setLocation] = useLocation();
  const [song, setSong] = useState<GameSong | null>(null);
  const [result, setResult] = useState<ResultData | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [ready, setReady] = useState(false);
  const [nextSong, setNextSong] = useState<GameSong | null>(null);
  const [chapterMonth, setChapterMonth] = useState<number>(1);
  const [gameOrigin, setGameOrigin] = useState<string>('');

  // Theme support
  const isAvant = getActiveTheme() === 'avant-garde';

  // Animation phases
  const [phase, setPhase] = useState<'ring' | 'medal' | 'stats' | 'actions'>('ring');
  const [lastTierHit, setLastTierHit] = useState('');
  const [flashColor, setFlashColor] = useState<string | null>(null);
  const medalChimed = useRef(false);

  // Staggered animation states
  const [animAcc, setAnimAcc] = useState(0);
  const [animScore, setAnimScore] = useState(0);
  const [animDone, setAnimDone] = useState(false);

  useEffect(() => {
    const originFallback = (() => {
      const o = songId ? (sessionStorage.getItem(`game_origin_${songId}`) ?? '') : '';
      return o === 'songs' ? '/songs' : o ? `/${o}` : '/campaign';
    })();
    if (!songId) { setLocation(originFallback); return; }
    const raw = sessionStorage.getItem(`result_${songId}`);
    if (!raw) { setLocation(originFallback); return; }
    const data = JSON.parse(raw) as ResultData;
    if (!data.medal) data.medal = 'NONE';
    if (data.perfectPlus === undefined) data.perfectPlus = 0;
    setResult(data);
    setGameOrigin(sessionStorage.getItem(`game_origin_${songId}`) ?? '');
    const prev = getHighScore(songId);
    if (data.score >= prev) setIsNew(true);

    Promise.all([getSongById(songId), loadCatalog()])
      .then(([s, catalog]) => {
        setSong(s);
        if (s && s.date) {
          const month = parseInt(s.date.split('-')[1], 10);
          setChapterMonth(month);
          const sorted = [...catalog].sort((a, b) => a.day - b.day);
          const idx = sorted.findIndex(c => c.id === s.id);
          const nextReleased = sorted.slice(idx + 1).find(c => !isSongTimeLocked(c));
          if (nextReleased && nextReleased.date) {
            const cMonth = parseInt(nextReleased.date.split('-')[1], 10);
            const monthSongs = sorted.filter(c => c.date && parseInt(c.date.split('-')[1], 10) === cMonth);
            const bonusStart = monthSongs.length - 5;
            const cidx = monthSongs.findIndex(c => c.id === nextReleased.id);
            if (monthSongs.length > 5 && cidx >= bonusStart) {
              const regularIds = monthSongs.slice(0, bonusStart).map(c => c.id);
              if (getChapterPlatinums(regularIds) >= (CHAPTER_PLAT_NEEDED[cMonth] ?? 5))
                setNextSong(nextReleased);
            } else {
              setNextSong(nextReleased);
            }
          }
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));

    // Preload SFX
    audioManager.loadSfx('gold_get');
    audioManager.loadSfx('silver_get');
    audioManager.loadSfx('bronxe_get');
    audioManager.loadSfx('platinum_get');
    audioManager.loadSfx('reveal');
    audioManager.loadSfx('open_chest');
    audioManager.loadSfx('bing_before_platinum');
    audioManager.loadSfx('queue_before_mythic');

    // Random results ambient music
    const ambientTracks = ['results', 'resuts2'];
    const pick = ambientTracks[Math.floor(Math.random() * ambientTracks.length)];
    const ambientAudio = new Audio(`/audio/sfx/${encodeURIComponent(pick)}.wav`);
    ambientAudio.loop = true;
    ambientAudio.volume = 0;

    let mounted = true;
    const playPromise = ambientAudio.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        if (!mounted) {
          ambientAudio.pause();
          ambientAudio.src = '';
        }
      }).catch(() => {});
    }

    // Fade in gently
    const fadeIn = setInterval(() => {
      if (ambientAudio.volume < 0.14) ambientAudio.volume += 0.02;
      else { ambientAudio.volume = 0.15; clearInterval(fadeIn); }
    }, 60);

    return () => {
      mounted = false;
      clearInterval(fadeIn);
      ambientAudio.pause();
      ambientAudio.src = '';
    };
  }, [songId, setLocation]);

  // Compute accuracy for ring progress
  const total = result?.total || 1;
  const accuracy = result
    ? ((result.perfectPlus * 1.0 + result.perfects * 0.9 + result.goods * 0.5) / total) * 100
    : 0;
  const ringProgress = Math.min(accuracy / 100, 1);

  // Staggered animation controller
  useEffect(() => {
    if (!result) return;

    const targetAcc = accuracy;
    const targetScore = result.score;

    const checkpoints: { acc: number; name: string; isMilestone: boolean }[] = [];
    if (targetAcc >= 40) checkpoints.push({ acc: 40, name: 'BRONZE', isMilestone: true });
    if (targetAcc >= 60) checkpoints.push({ acc: 60, name: 'SILVER', isMilestone: true });
    if (targetAcc >= 80) checkpoints.push({ acc: 80, name: 'GOLD', isMilestone: true });
    if (targetAcc >= 93) checkpoints.push({ acc: 93, name: 'PLATINUM', isMilestone: true });

    if (checkpoints.length === 0 || checkpoints[checkpoints.length - 1].acc !== targetAcc) {
      checkpoints.push({ acc: targetAcc, name: 'FINAL', isMilestone: false });
    }

    let currentCheckpointIdx = 0;
    let startAcc = 0;
    let segmentStartTime = Date.now() + 500; // 500ms initial delay before starting
    let segmentDuration = Math.max(400, checkpoints[0].acc * 20);
    let isHanging = false;
    let hangEndTime = 0;

    let animFrameId: number;

    const tick = () => {
      const now = Date.now();

      if (isHanging) {
        if (now >= hangEndTime) {
          isHanging = false;
          // Start next segment
          startAcc = checkpoints[currentCheckpointIdx].acc;
          currentCheckpointIdx++;

          if (currentCheckpointIdx < checkpoints.length) {
            const nextCheckpoint = checkpoints[currentCheckpointIdx];
            segmentStartTime = now;
            segmentDuration = Math.max(400, (nextCheckpoint.acc - startAcc) * 20);
          } else {
            // Reached the end!
            setAnimDone(true);
            return;
          }
        }
        animFrameId = requestAnimationFrame(tick);
        return;
      }

      // We are in a segment transition
      const targetCheckpoint = checkpoints[currentCheckpointIdx];
      const elapsed = now - segmentStartTime;
      const progress = Math.min(1, elapsed / segmentDuration);

      // Cubic ease-out for each segment
      const ease = 1 - Math.pow(1 - progress, 3);
      const curAcc = startAcc + ease * (targetCheckpoint.acc - startAcc);
      setAnimAcc(curAcc);

      // Proportional score
      const curScore = targetAcc > 0 ? Math.round((curAcc / targetAcc) * targetScore) : 0;
      setAnimScore(curScore);

      if (progress >= 1) {
        // Arrived at checkpoint
        setAnimAcc(targetCheckpoint.acc);
        const finalScore = targetAcc > 0 ? Math.round((targetCheckpoint.acc / targetAcc) * targetScore) : 0;
        setAnimScore(finalScore);

        if (targetCheckpoint.isMilestone) {
          // Trigger milestone effects
          const color = MEDALS[targetCheckpoint.name]?.color ?? '#fff';
          setFlashColor(color);
          setTimeout(() => setFlashColor(null), 500);
          setLastTierHit(targetCheckpoint.name);

          // Chime
          if (targetCheckpoint.name === 'GOLD') {
            audioManager.playSfx('bing_before_platinum', 0.7);
          } else if (targetCheckpoint.name === 'PLATINUM') {
            audioManager.playSfx('queue_before_mythic', 0.7);
          } else {
            audioManager.playSfx('reveal', 0.6);
          }

          isHanging = true;
          hangEndTime = now + 650; // 650ms hang time
        } else {
          // Final non-milestone checkpoint reached
          startAcc = targetCheckpoint.acc;
          currentCheckpointIdx++;
          if (currentCheckpointIdx < checkpoints.length) {
            segmentStartTime = now;
            segmentDuration = Math.max(400, (checkpoints[currentCheckpointIdx].acc - startAcc) * 20);
          } else {
            setAnimDone(true);
            return;
          }
        }
      }

      animFrameId = requestAnimationFrame(tick);
    };

    const startTimeout = setTimeout(() => {
      animFrameId = requestAnimationFrame(tick);
    }, 500);

    return () => {
      clearTimeout(startTimeout);
      cancelAnimationFrame(animFrameId);
    };
  }, [result, accuracy]);

  // Derived values for styling
  const currentRingColor = animAcc >= 93 ? '#39FF14' : animAcc >= 80 ? '#E5B800' : animAcc >= 60 ? '#A0AABB' : animAcc >= 40 ? '#C97A3A' : '#555';
  const ringFill = animAcc / 100;
  const scoreVal = animScore;
  const countPct = animAcc;
  const scoreDone = animDone;

  // Phase transitions after animation finishes
  useEffect(() => {
    if (animDone) {
      const t1 = setTimeout(() => {
        setPhase('medal');
        if (!medalChimed.current && result) {
          medalChimed.current = true;
          audioManager.playSfx('open_chest', 0.7);
          setTimeout(() => {
            if (result.goods === 0 && result.misses === 0) {
              audioManager.playSfx('perfect', 0.9);
            }
            if (result.medal === 'PLATINUM') audioManager.playSfx('platinum_get', 0.8);
            else if (result.medal === 'GOLD') audioManager.playSfx('gold_get', 0.8);
            else if (result.medal === 'SILVER') audioManager.playSfx('silver_get', 0.8);
            else if (result.medal === 'BRONZE') audioManager.playSfx('bronxe_get', 0.8);
            else audioManager.playSfx('reveal', 0.8);
          }, 300);
        }
      }, 800);
      const t2 = setTimeout(() => setPhase('stats'), 2400);
      const t3 = setTimeout(() => setPhase('actions'), 3200);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }
    return undefined;
  }, [animDone, result]);

  if (!ready || !result) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: isAvant ? '#050505' : '#080808' }}>
        <div className="font-mono text-xs tracking-widest animate-pulse" style={{ color: isAvant ? '#39FF14' : 'rgba(255,255,255,0.3)' }}>LOADING...</div>
      </div>
    );
  }

  // ── FAILED / TRANSMISSION NOT DECODED path ───────────────────────────────
  if (result.failed) {
    const fromFreePlayFail = gameOrigin === 'songs';
    const backRouteFail = fromFreePlayFail ? '/songs' : `/chapter/${chapterMonth}`;

    if (isAvant) {
      return (
        <div className="relative w-full flex flex-col items-center" style={{ background: '#050505', minHeight: '100dvh', overflow: 'hidden' }}>
          {/* Cover Art Blur Backdrop */}
          {song?.coverArt && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <img src={song.coverArt} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(50px) brightness(0.05) saturate(0.2) hue-rotate(320deg)', transform: 'scale(1.2)' }} />
            </div>
          )}

          {/* Neon Alert Grid Backdrops */}
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: "linear-gradient(rgba(255,20,147,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,20,147,0.015) 1px, transparent 1px)",
            backgroundSize: "40px 40px"
          }} />
          <div className="absolute inset-0 pointer-events-none" style={{
            background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,20,147,0.05) 2px,rgba(255,20,147,0.05) 4px)',
            zIndex: 1
          }} />

          {/* Telemetry Corner Indicators */}
          <div className="absolute top-5 left-5 pointer-events-none font-mono text-[9px] text-[#FF1493]/35" style={{ letterSpacing: '0.15em' }}>
            SYS_ALERT // DECODING_CRITICAL_FAIL
          </div>
          <div className="absolute top-5 right-5 pointer-events-none font-mono text-[9px] text-[#FF1493]/35" style={{ letterSpacing: '0.15em' }}>
            CODE: 0x800F02
          </div>
          <div className="absolute bottom-5 left-5 pointer-events-none font-mono text-[9px] text-[#FF1493]/35" style={{ letterSpacing: '0.15em' }}>
            AUTH_FAIL // DATA_CORRUPT
          </div>
          <div className="absolute bottom-5 right-5 pointer-events-none font-mono text-[9px] text-[#FF1493]/35" style={{ letterSpacing: '0.15em' }}>
            SIGNAL // TIMEOUT
          </div>

          <div className="relative z-10 w-full max-w-md px-5 py-10 flex flex-col items-center gap-10">
            {/* Top diagnostic header */}
            <div className="w-full flex items-center justify-between">
              <span className="font-mono text-[10px] text-[#FF1493] tracking-[0.25em] font-bold">
                [ SIGNAL_LOST_STATE ]
              </span>
              <div className="flex-1 h-px bg-[#FF1493]/30 mx-4" />
              <span className="font-mono text-[8px] text-[#FF1493]/60 tracking-wider">
                REV_1.03
              </span>
            </div>

            {/* Visualizer Hero Block */}
            <div className="flex flex-col items-center gap-5">
              <div className="relative" style={{ width: 170, height: 170 }}>
                {/* Tech corner accents */}
                <div className="absolute -top-2 -left-2 w-4 h-4 border-t-2 border-l-2 border-[#FF1493]" />
                <div className="absolute -top-2 -right-2 w-4 h-4 border-t-2 border-r-2 border-[#FF1493]" />
                <div className="absolute -bottom-2 -left-2 w-4 h-4 border-b-2 border-l-2 border-[#FF1493]" />
                <div className="absolute -bottom-2 -right-2 w-4 h-4 border-b-2 border-r-2 border-[#FF1493]" />

                {song?.coverArt ? (
                  <img src={song.coverArt} alt={song?.title ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(0.9) brightness(0.4) contrast(1.2)', border: '1px solid rgba(255,20,147,0.3)' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', background: 'rgba(255,20,147,0.03)', border: '1px solid rgba(255,20,147,0.2)' }} />
                )}

                {/* Overlaid red diagnostic scanning lines */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{
                  background: 'linear-gradient(rgba(255,20,147,0.1) 50%, rgba(255,20,147,0) 50%)',
                  backgroundSize: '100% 8px',
                  animation: 'scan-line 3s linear infinite'
                }} />

                {/* Corrupted X overlay */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="font-mono font-bold" style={{ fontSize: 64, color: '#FF1493', textShadow: '0 0 25px rgba(255,20,147,0.85)', lineHeight: 1 }}>✕</div>
                </div>
              </div>

              {/* Title & score */}
              <div className="text-center mt-2">
                <div className="font-mono font-bold" style={{ fontSize: 'clamp(28px,8vw,36px)', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.05em', textDecoration: 'line-through' }}>
                  {(result?.score ?? 0).toLocaleString()}
                </div>
                <div className="font-mono text-xs text-[#FF1493] mt-2 tracking-[0.2em] uppercase font-bold">
                  {song?.title ?? `TRANSMISSION ${songId}`}
                </div>
              </div>
            </div>

            {/* Error metadata checklist */}
            <div className="w-full p-4 border border-[#FF1493]/20 bg-zinc-950/40 relative">
              <div className="absolute top-0 right-3 transform -translate-y-1/2 bg-[#050505] px-2 font-mono text-[7px] text-[#FF1493]">DIAGNOSTICS</div>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between font-mono text-[10px] text-zinc-400">
                  <span>DECRYPT_STATUS:</span>
                  <span className="text-[#FF1493] font-bold">FAIL_DEGRADED</span>
                </div>
                <div className="flex justify-between font-mono text-[10px] text-zinc-400">
                  <span>STABILITY_LOSS:</span>
                  <span className="text-[#FF1493]">100%</span>
                </div>
                <div className="flex justify-between font-mono text-[10px] text-zinc-400">
                  <span>RECOVERY_KEYS:</span>
                  <span className="text-[#FF1493]">EXHAUSTED (3/3)</span>
                </div>
              </div>
            </div>

            {/* Accuracy stats row */}
            <div className="w-full flex flex-col gap-3">
              <div className="flex gap-2">
                <div className="flex-1 text-center py-3 border border-[#FF1493]/35 bg-[#FF1493]/05">
                  <div className="font-mono font-bold text-lg text-zinc-300">{Math.round(accuracy)}%</div>
                  <div className="font-mono text-[7px] text-zinc-500 tracking-[0.2em] mt-0.5">ACCURACY</div>
                </div>
                <div className="flex-1 text-center py-3 border border-zinc-900 bg-zinc-950/45">
                  <div className="font-mono font-bold text-lg text-zinc-300">{result.maxCombo}</div>
                  <div className="font-mono text-[7px] text-zinc-500 tracking-[0.2em] mt-0.5">MAX COMBO</div>
                </div>
              </div>
              <div className="flex gap-2">
                {[
                  { label: 'P+', value: result.perfectPlus, color: 'rgba(255,20,147,0.3)' },
                  { label: 'P',  value: result.perfects,    color: 'rgba(255,20,147,0.3)' },
                  { label: 'G',  value: result.goods,       color: 'rgba(255,20,147,0.3)' },
                  { label: 'M',  value: result.misses,      color: 'rgba(255,20,147,0.6)' },
                ].map(s => (
                  <div key={s.label} className="flex-1 text-center py-2.5 bg-zinc-950/50 border border-zinc-900">
                    <div className="font-mono font-bold text-sm text-[#FF1493]">{s.value}</div>
                    <div className="font-mono text-[8px] text-zinc-500 mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions buttons */}
            <div className="w-full flex flex-col gap-3">
              <button onClick={() => {
                audioManager.playSfx('tap_nav', 0.15);
                setLocation(`/play/${songId}`);
              }}
                className="w-full py-4 font-mono font-bold text-sm tracking-[0.3em] transition-all bg-zinc-950 border border-[#FF1493] text-[#FF1493] hover:bg-[#FF1493]/12 hover:shadow-[0_0_20px_rgba(255,20,147,0.3)]"
                onMouseEnter={() => audioManager.playSfx('tap_nav', 0.08)}>
                [ RE-RUN CALIBRATION ]
              </button>
              <button onClick={() => {
                audioManager.playSfx('tap_nav', 0.15);
                setLocation(backRouteFail);
              }}
                className="w-full py-3.5 font-mono font-bold text-xs tracking-[0.2em] transition-all bg-transparent border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
                onMouseEnter={() => audioManager.playSfx('tap_nav', 0.08)}>
                ← {fromFreePlayFail ? 'BACK TO AWARD PLAY' : 'BACK TO LEVEL PATH'}
              </button>
            </div>
          </div>
          <style>{`
            @keyframes scan-line {
              0% { transform: translateY(-100%); }
              100% { transform: translateY(100%); }
            }
          `}</style>
        </div>
      );
    }

    // Classic failed layout
    return (
      <div className="relative w-full flex flex-col items-center" style={{ background: '#080808', minHeight: '100dvh', overflow: 'hidden' }}>
        {/* Dark red ambient */}
        {song?.coverArt && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <img src={song.coverArt} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(40px) brightness(0.08) saturate(0.3) hue-rotate(320deg)', transform: 'scale(1.2)' }} />
          </div>
        )}
        {/* Scanlines */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.18) 3px,rgba(0,0,0,0.18) 6px)', zIndex: 1 }} />

        <div className="relative z-10 w-full max-w-md px-4 py-10 flex flex-col items-center gap-8">
          {/* Top label */}
          <div className="w-full flex items-center gap-0">
            <div className="font-mono font-bold text-xs px-3 py-1.5 tracking-[0.4em]" style={{ color: '#FF1493', background: 'rgba(255,20,147,0.12)', border: '1px solid rgba(255,20,147,0.35)' }}>
              TRANSMISSION NOT DECODED
            </div>
            <div className="flex-1 h-px" style={{ background: 'rgba(255,20,147,0.15)' }} />
          </div>

          {/* Corrupted icon */}
          <div className="flex flex-col items-center gap-4">
            <div style={{ position: 'relative', width: 160, height: 160 }}>
              {song?.coverArt ? (
                <img src={song.coverArt} alt={song?.title ?? ''} style={{ width: 160, height: 160, objectFit: 'cover', borderRadius: '50%', filter: 'grayscale(0.8) brightness(0.5)', border: '3px solid rgba(255,20,147,0.4)' }} />
              ) : (
                <div style={{ width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,20,147,0.05)', border: '3px solid rgba(255,20,147,0.3)' }} />
              )}
              {/* Corrupted X overlay */}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="font-mono font-bold" style={{ fontSize: 56, color: 'rgba(255,20,147,0.75)', textShadow: '0 0 30px rgba(255,20,147,0.5)', lineHeight: 1 }}>✕</div>
              </div>
            </div>
            <div className="text-center">
              <div className="font-mono font-bold" style={{ fontSize: 'clamp(28px,8vw,40px)', color: 'rgba(255,255,255,0.15)', letterSpacing: '0.03em', textDecoration: 'line-through' }}>
                {(result?.score ?? 0).toLocaleString()}
              </div>
              <div className="font-mono text-xs mt-1" style={{ color: 'rgba(255,255,255,0.25)', letterSpacing: '0.2em' }}>
                {song?.title ?? `TRANSMISSION ${songId}`}
              </div>
            </div>
          </div>

          {/* Error message */}
          <div className="text-center flex flex-col gap-2">
            <div className="font-mono font-bold tracking-[0.25em]" style={{ fontSize: 18, color: '#FF1493', textShadow: '0 0 20px rgba(255,20,147,0.6)' }}>
              NO MEDAL AWARDED
            </div>
            <div className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.25)', letterSpacing: '0.18em' }}>
              ALL 3 CONTINUES EXHAUSTED
            </div>
            <div className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.2)', letterSpacing: '0.15em', marginTop: 4 }}>
              COMPLETE THE FULL TRANSMISSION TO EARN A MEDAL
            </div>
          </div>

          {/* Stats — still show what was scored */}
          <div className="w-full">
            <div className="flex gap-2 mb-2">
              <div className="flex-1 text-center py-2" style={{ border: '1px solid rgba(255,20,147,0.15)', background: 'rgba(255,20,147,0.04)' }}>
                <div className="font-mono font-bold text-lg" style={{ color: 'rgba(255,255,255,0.35)' }}>{Math.round(accuracy)}%</div>
                <div className="font-mono" style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.2em' }}>ACCURACY</div>
              </div>
              <div className="flex-1 text-center py-2" style={{ border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                <div className="font-mono font-bold text-lg" style={{ color: 'rgba(255,255,255,0.35)' }}>{result.maxCombo}</div>
                <div className="font-mono" style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.2em' }}>MAX COMBO</div>
              </div>
            </div>
            <div className="flex gap-1.5">
              {[
                { label: 'P+', value: result.perfectPlus, color: 'rgba(229,184,0,0.4)' },
                { label: 'P',  value: result.perfects,    color: 'rgba(57,255,20,0.4)' },
                { label: 'G',  value: result.goods,       color: 'rgba(157,141,241,0.4)' },
                { label: 'M',  value: result.misses,      color: 'rgba(255,20,147,0.5)' },
              ].map(s => (
                <div key={s.label} className="flex-1 text-center py-2" style={{ background: `${s.color}18`, border: `1px solid ${s.color}` }}>
                  <div className="font-mono font-bold" style={{ fontSize: 16, color: s.color }}>{s.value}</div>
                  <div className="font-mono" style={{ fontSize: 7, color: s.color, letterSpacing: '0.15em' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="w-full flex flex-col gap-2">
            <button onClick={() => setLocation(`/play/${songId}`)}
              className="w-full py-4 font-mono font-bold text-sm tracking-[0.35em] transition-all duration-75"
              style={{ border: '3px solid #FF1493', color: '#FF1493', background: 'rgba(255,20,147,0.08)', boxShadow: '6px 6px 0 rgba(255,20,147,0.2)', minHeight: 48 }}
              onMouseEnter={e => { const el = e.currentTarget; el.style.boxShadow = '3px 3px 0 rgba(255,20,147,0.2)'; el.style.transform = 'translate(3px,3px)'; }}
              onMouseLeave={e => { const el = e.currentTarget; el.style.boxShadow = '6px 6px 0 rgba(255,20,147,0.2)'; el.style.transform = ''; }}>
              ↺ RETRY TRANSMISSION
            </button>
            <button onClick={() => setLocation(backRouteFail)}
              className="w-full py-3 font-mono font-bold text-sm tracking-[0.25em] transition-all"
              style={{ border: '2px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.35)', background: 'transparent', minHeight: 48 }}
              onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}>
              ← {fromFreePlayFail ? 'BACK TO AWARD PLAY' : 'BACK TO LEVEL PATH'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const medal = MEDALS[result.medal] ?? MEDALS.NONE;
  const mc = medal.color;
  const acc = Math.round(accuracy);
  const fromFreePlay = gameOrigin === 'songs';
  const backRoute = fromFreePlay ? '/songs' : `/chapter/${chapterMonth}`;

  // ── CLEARED path (Avant-Garde) ───────────────────────────────
  if (isAvant) {
    return (
      <div className="relative w-full flex flex-col items-center" style={{ background: '#050505', minHeight: '100dvh', overflowX: 'hidden' }}>
        {/* Blur Cover Backdrop */}
        {song?.coverArt && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <img src={song.coverArt} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(50px) brightness(0.1) saturate(1.2)', transform: 'scale(1.2)' }} />
          </div>
        )}

        {/* Cyber Grid Backdrops */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: `linear-gradient(rgba(57,255,20,0.012) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.012) 1px, transparent 1px)`,
          backgroundSize: '40px 40px'
        }} />
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.3) 2px,rgba(0,0,0,0.3) 4px)'
        }} />

        {/* Telemetry Corner Indicators */}
        <div className="absolute top-5 left-5 pointer-events-none font-mono text-[9px] text-[#39FF14]/30" style={{ letterSpacing: '0.15em' }}>
          DECODED // SUCCESS
        </div>
        <div className="absolute top-5 right-5 pointer-events-none font-mono text-[9px] text-[#39FF14]/30" style={{ letterSpacing: '0.15em' }}>
          SIGNAL_STRENGTH // {acc}%
        </div>
        <div className="absolute bottom-5 left-5 pointer-events-none font-mono text-[9px] text-[#39FF14]/30" style={{ letterSpacing: '0.15em' }}>
          SYS_SEC_VERIFICATION // STABLE
        </div>
        <div className="absolute bottom-5 right-5 pointer-events-none font-mono text-[9px] text-[#39FF14]/30" style={{ letterSpacing: '0.15em' }}>
          DAY_RELEASE // {song?.day ?? 'N/A'}
        </div>

        {/* Radial flash on tier transition */}
        {flashColor && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 30 }}>
            <div className="radial-flash rounded-full animate-ping" style={{ width: 250, height: 250, background: `radial-gradient(circle, ${flashColor}50 0%, transparent 70%)` }} />
          </div>
        )}

        <div className="relative z-10 w-full max-w-md px-5 py-6 flex flex-col items-center">
          {/* Top telemetry bar */}
          <div className="w-full flex items-center justify-between mb-8 results-fade-in">
            <span className="font-mono text-[10px] text-[#39FF14] tracking-[0.3em] font-bold">
              {fromFreePlay ? '[ TRANSMISSION_DECODED ]' : '[ CAMPAIGN_MISSION_ACQUIRED ]'}
            </span>
            <div className="flex-1 h-px bg-[#39FF14]/20 mx-4" />
            {isNew && (phase === 'stats' || phase === 'actions') && (
              <span className="font-mono text-[9px] px-2 py-0.5 bg-[#E5B800] text-black font-bold tracking-widest animate-pulse">
                SYS_RECORD_NEW
              </span>
            )}
          </div>

          {/* Hero: Concentric Ring + Cover Art with Plus indicators */}
          <div className="relative mb-6 results-fade-in" style={{ animationDelay: '0.2s' }}>
            {/* Corner wireframes behind the ring */}
            <div className="absolute top-2 left-2 w-3.5 h-3.5 border-t border-l border-[#39FF14]/40" />
            <div className="absolute top-2 right-2 w-3.5 h-3.5 border-t border-r border-[#39FF14]/40" />
            <div className="absolute bottom-2 left-2 w-3.5 h-3.5 border-b border-l border-[#39FF14]/40" />
            <div className="absolute bottom-2 right-2 w-3.5 h-3.5 border-b border-r border-[#39FF14]/40" />

            <ScoreRing progress={ringFill} color={currentRingColor} size={210} isAvant={true} />

            {/* Cover art container */}
            <div className="absolute inset-0 flex items-center justify-center">
              {song?.coverArt ? (
                <img src={song.coverArt} alt={song?.title ?? ''}
                  className={`border border-[#39FF14]/30 ${scoreDone && lastTierHit ? 'cover-bounce' : ''}`}
                  style={{ width: 132, height: 132, objectFit: 'cover', borderRadius: '50%', padding: '2px', background: '#050505' }} />
              ) : (
                <div className="flex items-center justify-center font-mono font-bold text-3xl border border-zinc-800"
                  style={{ width: 132, height: 132, borderRadius: '50%', background: 'rgba(255,255,255,0.02)', color: 'rgba(255,255,255,0.1)' }}>
                  {song?.day ?? '?'}
                </div>
              )}
            </div>
          </div>

          {/* Score Counter Dashboard */}
          <div className="text-center mb-5 results-fade-in w-full" style={{ animationDelay: '0.3s' }}>
            <div className="font-mono text-[9px] text-[#39FF14]/50 tracking-[0.35em] mb-1">
              {fromFreePlay ? 'SIGNAL_OUTPUT_VAL' : 'CAMPAIGN_DISPATCH_VAL'}
            </div>
            <div className="font-mono font-bold tabular-nums text-[#39FF14]" data-testid="text-final-score"
              style={{ fontSize: 'clamp(38px, 10vw, 50px)', lineHeight: 1.1, textShadow: '0 0 15px rgba(57,255,20,0.2)' }}>
              {scoreVal.toLocaleString()}
            </div>
            <div className="font-mono text-xs text-white mt-3 tracking-[0.2em] font-bold uppercase">
              {song?.title ?? `TRANSMISSION ${songId}`}
            </div>
            <div className="font-mono mt-1.5 text-[8px] text-zinc-500 tracking-[0.18em]">
              TH3SCR1B3{song ? ` // SYSTEM_DAY_${song.day} // ${song.bpm}_BPM` : ''}
            </div>
          </div>

          {/* Medal tiers status blocks */}
          <div className="flex items-center gap-4 mb-6 results-fade-in" style={{ animationDelay: '0.4s' }}>
            {MEDAL_THRESHOLDS.map(t => {
              const achieved = countPct >= t.acc;
              return (
                <div key={t.name} className="flex flex-col items-center gap-1.5">
                  <div style={{
                    width: 12,
                    height: 12,
                    background: achieved ? t.color : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${achieved ? t.color : 'rgba(255,255,255,0.08)'}`,
                    transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                    boxShadow: achieved ? `0 0 8px ${t.color}` : 'none'
                  }} />
                  <div className="font-mono" style={{ fontSize: 6, color: achieved ? t.color : 'rgba(255,255,255,0.2)', letterSpacing: '0.1em' }}>
                    {t.name}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Medal Stamp Reveal */}
          {(phase === 'medal' || phase === 'stats' || phase === 'actions') && (
            <div className="text-center mb-6 p-4 border border-[#39FF14]/30 bg-black/45 relative min-w-[280px]">
              <div className="absolute top-0 left-3 transform -translate-y-1/2 bg-[#050505] px-1.5 font-mono text-[7px] text-[#39FF14]">AUTHENTICATOR</div>
              <div className="font-mono font-bold tracking-[0.12em] text-2xl"
                style={{ color: mc, textShadow: `0 0 20px ${mc}50` }}>
                ★ {result.medal} ★
              </div>
              <div className="font-mono text-[9px] mt-2 text-zinc-400 tracking-[0.15em] uppercase">
                {medal.message}
              </div>
              {(result.continuesUsed ?? 0) > 0 && (
                <div className="font-mono text-[7px] mt-2 text-[#FF1493] tracking-widest font-bold">
                  ⚠️ RECOVERY ACTIVE // CONTINUES: {result.continuesUsed}
                </div>
              )}
            </div>
          )}

          {/* Accuracy Stats Panel */}
          {(phase === 'stats' || phase === 'actions') && (
            <div className="w-full mb-6 stats-slide-up flex flex-col gap-3">
              <div className="flex gap-2">
                <div className="flex-1 text-center py-3 border border-[#39FF14]/25 bg-[#39FF14]/02">
                  <div className="font-mono font-bold text-lg text-[#39FF14]">{acc}%</div>
                  <div className="font-mono text-[7px] text-zinc-500 tracking-[0.18em] mt-0.5">SYS_ACCURACY</div>
                </div>
                <div className="flex-1 text-center py-3 border border-zinc-900 bg-zinc-950/20">
                  <div className="font-mono font-bold text-lg text-white">{result.maxCombo}</div>
                  <div className="font-mono text-[7px] text-zinc-500 tracking-[0.18em] mt-0.5">MAX_COMBO</div>
                </div>
              </div>
              <div className="flex gap-1.5">
                {[
                  { label: 'P+', value: result.perfectPlus, color: '#E5B800' },
                  { label: 'P',  value: result.perfects,    color: '#39FF14' },
                  { label: 'G',  value: result.goods,       color: '#00E5FF' },
                  { label: 'M',  value: result.misses,      color: '#FF1493' },
                ].map(s => (
                  <div key={s.label} className="flex-1 text-center py-2 bg-zinc-950/50 border border-zinc-900">
                    <div className="font-mono font-bold text-base" style={{ color: s.color }}>{s.value}</div>
                    <div className="font-mono text-[7px] mt-0.5" style={{ color: `${s.color}b0` }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          {phase === 'actions' && (
            <div className="w-full stats-slide-up flex flex-col gap-2.5" style={{ animationDelay: '0.15s' }}>
              {fromFreePlay && nextSong ? (
                <div className="mb-2">
                  <div className="font-mono text-[9px] mb-1 px-1 text-zinc-500 tracking-[0.25em]">
                    QUEUE_NEXT // DAY_{nextSong.day}
                  </div>
                  <button onClick={() => {
                    audioManager.playSfx('tap_nav', 0.15);
                    setLocation(`/play/${nextSong.id}`);
                  }}
                    className="w-full py-4 font-mono font-bold text-sm tracking-[0.3em] transition-all bg-[#39FF14] text-black hover:bg-[#39FF14]/90 hover:shadow-[0_0_20px_rgba(57,255,20,0.35)]"
                    onMouseEnter={() => audioManager.playSfx('tap_nav', 0.08)}>
                    ▶ DEPLOY: {nextSong.title.length > 20 ? nextSong.title.slice(0, 20) + '…' : nextSong.title}
                  </button>
                </div>
              ) : (
                <button onClick={() => {
                  audioManager.playSfx('tap_nav', 0.15);
                  setLocation(backRoute);
                }}
                  className="w-full py-4 mb-1 font-mono font-bold text-sm tracking-[0.3em] transition-all bg-zinc-950 border border-[#39FF14] text-[#39FF14] hover:bg-[#39FF14]/10 hover:shadow-[0_0_15px_rgba(57,255,20,0.2)]"
                  onMouseEnter={() => audioManager.playSfx('tap_nav', 0.08)}>
                  ← {fromFreePlay ? '[ RETURN TO AWARD PLAY ]' : '[ CONTINUE TO LEVEL PATH ]'}
                </button>
              )}
              <div className="flex gap-2">
                <button data-testid="button-retry" onClick={() => {
                  audioManager.playSfx('tap_nav', 0.15);
                  setLocation(`/play/${songId}`);
                }}
                  className="flex-1 py-3 font-mono font-bold text-xs tracking-[0.2em] transition-all bg-transparent border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600"
                  onMouseEnter={() => audioManager.playSfx('tap_nav', 0.08)}>
                  ↺ RETRY
                </button>
                <button data-testid="button-select-song"
                  onClick={() => {
                    audioManager.playSfx('tap_nav', 0.15);
                    setLocation(fromFreePlay ? '/songs' : '/campaign');
                  }}
                  className="flex-1 py-3 font-mono font-bold text-xs tracking-[0.2em] transition-all bg-transparent border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600"
                  onMouseEnter={() => audioManager.playSfx('tap_nav', 0.08)}>
                  {fromFreePlay ? '⌂ AWARD PLAY' : '◈ CAMPAIGN_INDEX'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Classic design path (exact original content)
  return (
    <div className="relative w-full flex flex-col items-center" style={{ background: '#080808', minHeight: '100dvh', overflow: 'hidden' }}>
      {/* Blurred cover art background */}
      {song?.coverArt && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <img src={song.coverArt} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(40px) brightness(0.15) saturate(1.5)', transform: 'scale(1.2)' }} />
        </div>
      )}

      {/* Radial flash on tier transition */}
      {flashColor && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 30 }}>
          <div className="radial-flash rounded-full" style={{ width: 300, height: 300, background: `radial-gradient(circle, ${flashColor}60 0%, transparent 70%)` }} />
        </div>
      )}

      <div className="relative z-10 w-full max-w-md px-4 py-6 flex flex-col items-center">
        {/* ── Top label ── */}
        <div className="w-full flex items-center gap-0 mb-6 results-fade-in">
          <div className="font-mono font-bold text-xs px-3 py-1.5 tracking-[0.4em]"
            style={{ color: '#080808', background: '#F2F0E8' }}>
            {fromFreePlay ? 'TRANSMISSION COMPLETE' : 'CAMPAIGN MISSION COMPLETED'}
          </div>
          <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.1)' }} />
          {isNew && (phase === 'stats' || phase === 'actions') && (
            <div className="font-mono font-bold text-xs px-3 py-1.5 tracking-[0.3em] new-best-fly"
              style={{ color: '#080808', background: '#E5B800' }}>
              NEW BEST
            </div>
          )}
        </div>

        {/* ── Hero: Cover Art + Score Ring ── */}
        <div className="relative mb-4 results-fade-in" style={{ animationDelay: '0.2s' }}>
          <ScoreRing progress={ringFill} color={currentRingColor} size={200} />
          {/* Cover art centered inside ring */}
          <div className="absolute inset-0 flex items-center justify-center">
            {song?.coverArt ? (
              <img src={song.coverArt} alt={song?.title ?? ''}
                className={scoreDone && lastTierHit ? 'cover-bounce' : ''}
                style={{ width: 140, height: 140, objectFit: 'cover', borderRadius: '50%', border: `3px solid ${currentRingColor}40` }} />
            ) : (
              <div className="flex items-center justify-center font-mono font-bold text-3xl"
                style={{ width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.2)', border: `3px solid ${currentRingColor}40` }}>
                {song?.day ?? '?'}
              </div>
            )}
          </div>
        </div>

        {/* ── Animated Score ── */}
        <div className="text-center mb-1 results-fade-in" style={{ animationDelay: '0.3s' }}>
          <div className="font-mono font-bold tabular-nums" data-testid="text-final-score"
            style={{ fontSize: 'clamp(36px, 10vw, 56px)', lineHeight: 1, color: '#F2F0E8', letterSpacing: '0.03em' }}>
            {scoreVal.toLocaleString()}
          </div>
          <div className="font-mono text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)', letterSpacing: '0.2em' }}>
            {song?.title ?? `TRANSMISSION ${songId}`}
          </div>
          <div className="font-mono mt-1" style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.15em' }}>
            TH3SCR1B3{song ? ` · DAY ${song.day} · ${song.bpm}BPM` : ''}
          </div>
        </div>

        {/* ── Medal tier ladder (always visible, lights up as ring fills) ── */}
        <div className="flex items-center gap-3 mb-5 results-fade-in" style={{ animationDelay: '0.4s' }}>
          {MEDAL_THRESHOLDS.map(t => {
            const achieved = countPct >= t.acc;
            return (
              <div key={t.name} className="flex flex-col items-center gap-1">
                <div style={{ width: 10, height: 10, background: achieved ? t.color : 'rgba(255,255,255,0.08)', border: `1.5px solid ${achieved ? t.color : 'rgba(255,255,255,0.12)'}`, transition: 'all 0.4s ease', boxShadow: achieved ? `0 0 8px ${t.color}60` : 'none' }} />
                <div className="font-mono" style={{ fontSize: 7, color: achieved ? t.color : 'rgba(255,255,255,0.15)', letterSpacing: '0.15em', transition: 'color 0.4s' }}>
                  {t.name[0]}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Medal Reveal ── */}
        {(phase === 'medal' || phase === 'stats' || phase === 'actions') && (
          <div className="text-center mb-4 medal-stamp">
            <div className="font-mono font-bold tracking-[0.08em]"
              style={{ fontSize: 32, color: mc, textShadow: `0 0 30px ${mc}80` }}>
              ★ {result.medal} ★
            </div>
            <div className="font-mono text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '0.2em' }}>
              {medal.message}
            </div>
            {(result.continuesUsed ?? 0) > 0 && (
              <div className="font-mono text-[9px] mt-1.5" style={{ color: 'rgba(255,255,255,0.2)', letterSpacing: '0.15em' }}>
                RECOVERY SIGNAL ACTIVE ({result.continuesUsed} {result.continuesUsed === 1 ? 'CONTINUE' : 'CONTINUES'} USED)
              </div>
            )}
          </div>
        )}

        {/* ── Stats ── */}
        {(phase === 'stats' || phase === 'actions') && (
          <div className="w-full mb-4 stats-slide-up">
            {/* Accuracy + Combo row */}
            <div className="flex gap-2 mb-2">
              <div className="flex-1 text-center py-2" style={{ border: `1px solid ${mc}30`, background: `${mc}08` }}>
                <div className="font-mono font-bold text-lg" style={{ color: mc }}>{acc}%</div>
                <div className="font-mono" style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.2em' }}>ACCURACY</div>
              </div>
              <div className="flex-1 text-center py-2" style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                <div className="font-mono font-bold text-lg" style={{ color: '#F2F0E8' }}>{result.maxCombo}</div>
                <div className="font-mono" style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.2em' }}>MAX COMBO</div>
              </div>
            </div>
            {/* Judgment pills */}
            <div className="flex gap-1.5">
              {[
                { label: 'P+', value: result.perfectPlus, color: '#E5B800' },
                { label: 'P',  value: result.perfects,    color: '#39FF14' },
                { label: 'G',  value: result.goods,       color: '#9D8DF1' },
                { label: 'M',  value: result.misses,      color: '#555' },
              ].map(s => (
                <div key={s.label} className="flex-1 text-center py-2" style={{ background: `${s.color}12`, border: `1px solid ${s.color}25` }}>
                  <div className="font-mono font-bold" style={{ fontSize: 16, color: s.color }}>{s.value}</div>
                  <div className="font-mono" style={{ fontSize: 7, color: `${s.color}90`, letterSpacing: '0.15em' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Action Buttons ── */}
        {phase === 'actions' && (
          <div className="w-full stats-slide-up" style={{ animationDelay: '0.15s' }}>
            {fromFreePlay && nextSong ? (
              <div className="mb-2">
                <div className="font-mono text-xs mb-1.5 px-1" style={{ color: 'rgba(255,255,255,0.2)', letterSpacing: '0.3em' }}>
                  NEXT — DAY {nextSong.day}
                </div>
                <button onClick={() => setLocation(`/play/${nextSong.id}`)}
                  className="w-full py-4 font-mono font-bold text-sm tracking-[0.35em] transition-all duration-75"
                  style={{ border: '3px solid #F2F0E8', color: '#080808', background: '#F2F0E8', boxShadow: `6px 6px 0 ${mc}`, minHeight: 48 }}
                  onMouseEnter={e => { const el = e.currentTarget; el.style.boxShadow = `3px 3px 0 ${mc}`; el.style.transform = 'translate(3px,3px)'; }}
                  onMouseLeave={e => { const el = e.currentTarget; el.style.boxShadow = `6px 6px 0 ${mc}`; el.style.transform = ''; }}>
                  ▶ NEXT — {nextSong.title.length > 20 ? nextSong.title.slice(0, 20) + '…' : nextSong.title}
                </button>
              </div>
            ) : (
              <button onClick={() => setLocation(backRoute)}
                className="w-full py-4 mb-2 font-mono font-bold text-sm tracking-[0.35em] transition-all duration-75"
                style={{ border: '3px solid #F2F0E8', color: '#080808', background: '#F2F0E8', boxShadow: '6px 6px 0 rgba(255,255,255,0.15)', minHeight: 48 }}
                onMouseEnter={e => { const el = e.currentTarget; el.style.boxShadow = '3px 3px 0 rgba(255,255,255,0.15)'; el.style.transform = 'translate(3px,3px)'; }}
                onMouseLeave={e => { const el = e.currentTarget; el.style.boxShadow = '6px 6px 0 rgba(255,255,255,0.15)'; el.style.transform = ''; }}>
                ← {fromFreePlay ? 'BACK TO AWARD PLAY' : 'CONTINUE TO LEVEL PATH'}
              </button>
            )}
            <div className="flex gap-2">
              <button data-testid="button-retry" onClick={() => setLocation(`/play/${songId}`)}
                className="flex-1 py-3 font-mono font-bold text-sm tracking-[0.25em] transition-all"
                style={{ border: '2px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)', background: 'transparent', minHeight: 48 }}
                onMouseEnter={e => { e.currentTarget.style.color = '#FF1493'; e.currentTarget.style.borderColor = '#FF1493'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }}>
                ↺ RETRY
              </button>
              <button data-testid="button-select-song"
                onClick={() => setLocation(fromFreePlay ? '/songs' : '/campaign')}
                className="flex-1 py-3 font-mono font-bold text-sm tracking-[0.25em] transition-all"
                style={{ border: '2px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)', background: 'transparent', minHeight: 48 }}
                onMouseEnter={e => { e.currentTarget.style.color = '#39FF14'; e.currentTarget.style.borderColor = '#39FF14'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }}>
                {fromFreePlay ? '⌂ AWARD PLAY' : '◈ CAMPAIGN INDEX'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
