import { useParams, useLocation } from "wouter";
import { useEffect, useState, useRef, useCallback } from "react";
import { getSongById, loadCatalog, isSongTimeLocked } from "@/game/api";
import type { GameSong } from "@/game/api";
import { getHighScore, getChapterPlatinums } from "@/game/progress";

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

import { audioManager } from "@/game/audio";

// ── circular ring component ──────────────────────────────────
function ScoreRing({ progress, color, size = 180 }: { progress: number; color: string; size?: number }) {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(1, progress));
  return (
    <svg width={size} height={size} className="ring-pulse" style={{ '--ring-color': color } as React.CSSProperties}>
      {/* Track */}
      <circle cx={size/2} cy={size/2} r={r} fill="none"
        stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
      {/* Progress */}
      <circle cx={size/2} cy={size/2} r={r} fill="none"
        stroke={color} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.15s linear, stroke 0.4s ease', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
    </svg>
  );
}

// ── animated counter ─────────────────────────────────────────
function useCountUp(target: number, duration: number, delay: number) {
  const [value, setValue] = useState(0);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!target) { setDone(true); return; }
    const t = setTimeout(() => {
      const start = Date.now();
      const tick = () => {
        const p = Math.min(1, (Date.now() - start) / duration);
        const ease = 1 - Math.pow(1 - p, 3);
        setValue(Math.round(ease * target));
        if (p < 1) requestAnimationFrame(tick);
        else { setValue(target); setDone(true); }
      };
      requestAnimationFrame(tick);
    }, delay);
    return () => clearTimeout(t);
  }, [target, duration, delay]);
  return { value, done };
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

  // Animation phases
  const [phase, setPhase] = useState<'ring' | 'medal' | 'stats' | 'actions'>('ring');
  const [lastTierHit, setLastTierHit] = useState('');
  const [flashColor, setFlashColor] = useState<string | null>(null);
  const medalChimed = useRef(false);

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
        if (s) {
          const month = new Date(s.date).getMonth() + 1;
          setChapterMonth(month);
          const sorted = [...catalog].sort((a, b) => a.day - b.day);
          const idx = sorted.findIndex(c => c.id === s.id);
          const nextReleased = sorted.slice(idx + 1).find(c => !isSongTimeLocked(c));
          if (nextReleased) {
            const cMonth = new Date(nextReleased.date).getMonth() + 1;
            const monthSongs = sorted.filter(c => new Date(c.date).getMonth() + 1 === cMonth);
            const bonusStart = monthSongs.length - 5;
            const cidx = monthSongs.findIndex(c => c.id === nextReleased.id);
            if (cidx >= bonusStart) {
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

    // Preload SFX (most are already cached via preloadAll, but ensure these are ready)
    audioManager.loadSfx('gold_get');
    audioManager.loadSfx('silver_get');
    audioManager.loadSfx('bronxe_get');
    audioManager.loadSfx('platinum_get');
    audioManager.loadSfx('reveal');
    audioManager.loadSfx('open_chest');
    audioManager.loadSfx('bing_before_platinum');
    audioManager.loadSfx('queue_before_mythic');

    // Random results ambient music — use HTMLAudioElement directly for long loops
    // (avoids decoding 31MB WAVs into AudioBuffers)
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

  // Score count-up: 3.5s with 0.5s delay
  const { value: scoreVal, done: scoreDone } = useCountUp(result?.score ?? 0, 3500, 500);

  // Ring color transitions based on count-up progress
  const countPct = result?.score ? (scoreVal / result.score) * accuracy : 0;
  const currentRingColor = countPct >= 93 ? '#39FF14' : countPct >= 80 ? '#E5B800' : countPct >= 60 ? '#A0AABB' : countPct >= 40 ? '#C97A3A' : '#555';
  const ringFill = result?.score ? (scoreVal / result.score) * ringProgress : 0;

  // Detect tier crossings for flash effects
  const currentTier = countPct >= 93 ? 'PLATINUM' : countPct >= 80 ? 'GOLD' : countPct >= 60 ? 'SILVER' : countPct >= 40 ? 'BRONZE' : 'NONE';
  useEffect(() => {
    if (currentTier !== 'NONE' && currentTier !== lastTierHit) {
      setLastTierHit(currentTier);
      const color = MEDALS[currentTier]?.color ?? '#fff';
      setFlashColor(color);
      setTimeout(() => setFlashColor(null), 600);
      // Tier-specific chimes
      if (currentTier === 'GOLD') {
        audioManager.playSfx('bing_before_platinum', 0.7);
      } else if (currentTier === 'PLATINUM') {
        audioManager.playSfx('queue_before_mythic', 0.7);
      } else {
        audioManager.playSfx('reveal', 0.6);
      }
    }
  }, [currentTier, lastTierHit]);

  // Phase transitions
  useEffect(() => {
    if (scoreDone) {
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
      }, 1200);
      const t2 = setTimeout(() => setPhase('stats'), 2800);
      const t3 = setTimeout(() => setPhase('actions'), 3600);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }
    return undefined;
  }, [scoreDone, result]);

  if (!ready || !result) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#080808' }}>
        <div className="font-mono text-xs tracking-widest animate-pulse" style={{ color: 'rgba(255,255,255,0.3)' }}>LOADING...</div>
      </div>
    );
  }

  // ── FAILED / TRANSMISSION NOT DECODED path ───────────────────────────────
  if (result.failed) {
    const fromFreePlayFail = gameOrigin === 'songs';
    const backRouteFail = fromFreePlayFail ? '/songs' : `/chapter/${chapterMonth}`;
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
                {result.score.toLocaleString()}
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
              ← {fromFreePlayFail ? 'BACK TO FREE PLAY' : 'BACK TO CHAPTER'}
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
            TRANSMISSION COMPLETE
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
            {(result.continuesUsed ?? 0) > 0 ? (
              <>
                <div className="font-mono font-bold tracking-[0.08em]"
                  style={{ fontSize: 24, color: 'rgba(255,255,255,0.25)' }}>
                  ✕ NO MEDAL
                </div>
                <div className="font-mono text-xs mt-1" style={{ color: 'rgba(255,255,255,0.2)', letterSpacing: '0.2em' }}>
                  CONTINUES USED — COMPLETE CLEANLY TO EARN A MEDAL
                </div>
              </>
            ) : (
              <>
                <div className="font-mono font-bold tracking-[0.08em]"
                  style={{ fontSize: 32, color: mc, textShadow: `0 0 30px ${mc}80` }}>
                  ★ {result.medal} ★
                </div>
                <div className="font-mono text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '0.2em' }}>
                  {medal.message}
                </div>
              </>
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
            {nextSong ? (
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
                ← {fromFreePlay ? 'BACK TO FREE PLAY' : 'BACK TO CHAPTER'}
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
                {fromFreePlay ? '⌂ HOME' : '◈ CAMPAIGN'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
