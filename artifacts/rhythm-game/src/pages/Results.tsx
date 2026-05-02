import { useParams, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { getSongById } from "@/game/api";
import type { GameSong } from "@/game/api";
import { getHighScore } from "@/game/songs";

interface ResultData {
  score: number;
  maxCombo: number;
  perfectPlus: number;
  perfects: number;
  goods: number;
  misses: number;
  medal: string;
  total: number;
}

// ── medal config ──────────────────────────────────────────────────
const MEDALS: Record<string, { color: string; stars: number; glow: string; message: string }> = {
  PLATINUM: {
    color:   '#48E5C2',
    glow:    'rgba(72,229,194,0.35)',
    stars:   5,
    message: 'PERFECT SIGNAL // ALL TRANSMISSIONS LOCKED',
  },
  GOLD: {
    color:   '#E5B800',
    glow:    'rgba(229,184,0,0.35)',
    stars:   4,
    message: 'STRONG SIGNAL // MINIMAL INTERFERENCE',
  },
  SILVER: {
    color:   '#A0AABB',
    glow:    'rgba(160,170,187,0.3)',
    stars:   3,
    message: 'SIGNAL STABLE // SOME STATIC DETECTED',
  },
  BRONZE: {
    color:   '#C97A3A',
    glow:    'rgba(201,122,58,0.3)',
    stars:   2,
    message: 'WEAK SIGNAL // SIGNIFICANT NOISE',
  },
  NONE: {
    color:   '#444',
    glow:    'rgba(60,60,60,0.2)',
    stars:   1,
    message: 'SIGNAL LOST // RECONNECT AND RETRY',
  },
};

function Star({ filled, color, size = 28 }: { filled: boolean; color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={filled ? color : '#333'} strokeWidth={1.5}>
      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
    </svg>
  );
}

function Counter({ target, duration = 1400 }: { target: number; duration?: number }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const raf = () => {
      const pct  = Math.min(1, (Date.now() - start) / duration);
      const ease = 1 - Math.pow(1 - pct, 3);
      setValue(Math.floor(ease * target));
      if (pct < 1) requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }, [target, duration]);
  return <>{value.toLocaleString()}</>;
}

export default function Results() {
  const { songId } = useParams<{ songId: string }>();
  const [, setLocation] = useLocation();
  const [song, setSong]   = useState<GameSong | null>(null);
  const [result, setResult] = useState<ResultData | null>(null);
  const [isNew, setIsNew]   = useState(false);
  const [ready, setReady]   = useState(false);

  useEffect(() => {
    if (!songId) { setLocation('/songs'); return; }

    // Read result from sessionStorage
    const raw = sessionStorage.getItem(`result_${songId}`);
    if (!raw) { setLocation('/songs'); return; }

    const data = JSON.parse(raw) as ResultData;
    // Back-compat: if no medal stored, assign NONE
    if (!data.medal) data.medal = 'NONE';
    if (data.perfectPlus === undefined) data.perfectPlus = 0;
    setResult(data);

    const prev = getHighScore(songId);
    if (data.score >= prev) setIsNew(true);

    // Load song info async
    getSongById(songId).then(s => {
      setSong(s);
      setReady(true);
    });
  }, [songId, setLocation]);

  if (!ready || !result) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#05030d' }}>
        <div className="flex gap-1.5">
          {['#E53A00','#A855F7','#48E5C2'].map((c, i) => (
            <div key={i} className="w-2 h-2 rounded-full animate-pulse" style={{ background: c, animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    );
  }

  const medal    = MEDALS[result.medal] ?? MEDALS.NONE;
  const mc       = medal.color;
  const total    = result.total || 1;
  const accuracy = total > 0
    ? Math.round(((result.perfectPlus * 1.0 + result.perfects * 0.9 + result.goods * 0.5) / total) * 100)
    : 0;

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center relative overflow-hidden px-4 py-8"
      style={{ background: `radial-gradient(ellipse at 50% 35%, hsl(14 50% 6%) 0%, hsl(270 30% 4%) 70%)` }}
    >
      {/* Grid */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: 'linear-gradient(rgba(229,58,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(229,58,0,0.04) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

      {/* Medal glow */}
      <div className="absolute pointer-events-none"
        style={{ top: '12%', left: '50%', transform: 'translateX(-50%)', width: 360, height: 360, background: `radial-gradient(circle, ${medal.glow} 0%, transparent 70%)` }} />

      <div className="relative z-10 w-full max-w-md fade-in-up">
        {/* Song info */}
        <div className="text-center mb-5">
          <div className="font-mono text-xs tracking-[0.3em] mb-1" style={{ color: 'hsl(30 15% 38%)' }}>
            TRANSMISSION COMPLETE
          </div>
          {song?.coverArt && (
            <img src={song.coverArt} alt={song.title}
              className="w-16 h-16 object-cover mx-auto mb-2 rounded"
              style={{ border: `2px solid ${mc}40` }} />
          )}
          <div className="font-mono font-bold text-xl" style={{ color: '#F2EDE5' }}>
            {song?.title ?? `TRANSMISSION ${songId}`}
          </div>
          <div className="font-mono text-xs mt-0.5" style={{ color: 'hsl(30 15% 45%)' }}>
            {song ? `TH3SCR1B3 · DAY ${song.day} · ${song.bpm} BPM` : ''}
          </div>
        </div>

        {/* Medal + stars */}
        <div className="flex flex-col items-center mb-4">
          {/* Stars row */}
          <div className="flex items-center gap-1 mb-3">
            {[1,2,3,4,5].map(i => (
              <Star key={i} filled={i <= medal.stars} color={mc} size={32} />
            ))}
          </div>

          {/* Medal name badge */}
          <div className="relative inline-flex items-center justify-center">
            <div className="font-mono font-bold tracking-[0.4em] px-8 py-2"
              style={{
                fontSize: 28,
                color: mc,
                border: `2px solid ${mc}`,
                background: `${mc}12`,
                textShadow: `0 0 30px ${mc}CC, 0 0 60px ${mc}60`,
                boxShadow: `0 0 40px ${mc}30, inset 0 0 20px ${mc}08`,
                clipPath: 'polygon(12px 0%, 100% 0%, calc(100% - 12px) 100%, 0% 100%)',
              }}>
              {result.medal}
            </div>
            {isNew && (
              <div className="absolute -top-3 -right-4 font-mono text-xs font-bold px-2 py-0.5"
                style={{ background: '#E5B800', color: '#000', clipPath: 'polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)' }}>
                NEW BEST
              </div>
            )}
          </div>

          <div className="font-mono text-xs text-center tracking-widest mt-3" style={{ color: 'hsl(30 15% 43%)' }}>
            {medal.message}
          </div>
        </div>

        {/* Score */}
        <div className="text-center mb-4 py-4 border" style={{ borderColor: `${mc}30`, background: `${mc}07` }}>
          <div className="font-mono text-xs tracking-widest mb-1" style={{ color: 'hsl(30 15% 45%)' }}>FINAL SCORE</div>
          <div className="font-mono font-bold" data-testid="text-final-score"
            style={{ fontSize: '44px', color: '#F2EDE5', letterSpacing: '0.05em' }}>
            <Counter target={result.score} duration={1500} />
          </div>
          <div className="font-mono text-sm mt-0.5" style={{ color: mc }}>
            MAX COMBO: {result.maxCombo}
          </div>
        </div>

        {/* Stats grid — 5 columns */}
        <div className="grid grid-cols-5 gap-1.5 mb-4">
          {[
            { label: 'PERFECT+', value: result.perfectPlus, color: '#E5B800' },
            { label: 'PERFECT',  value: result.perfects,    color: '#48E5C2' },
            { label: 'GOOD',     value: result.goods,       color: '#A855F7' },
            { label: 'MISS',     value: result.misses,      color: '#555'    },
            { label: 'ACCURACY', value: `${accuracy}%`,     color: mc        },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center py-2.5 border"
              style={{ borderColor: 'hsl(20 25% 12%)', background: 'hsl(18 35% 6%)' }}>
              <div className="font-mono text-xs mb-1 leading-none" style={{ color: 'hsl(30 15% 38%)', fontSize: 9 }}>{label}</div>
              <div className="font-mono font-bold text-base leading-none" style={{ color }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Bar chart */}
        <div className="mb-6 space-y-1.5">
          {[
            { label: 'PERFECT+', count: result.perfectPlus, color: '#E5B800' },
            { label: 'PERFECT',  count: result.perfects,    color: '#48E5C2' },
            { label: 'GOOD',     count: result.goods,       color: '#A855F7' },
            { label: 'MISS',     count: result.misses,      color: '#444'    },
          ].map(({ label, count, color }) => (
            <div key={label} className="flex items-center gap-2">
              <div className="font-mono text-xs w-16 text-right flex-shrink-0" style={{ color: 'hsl(30 15% 42%)', fontSize: 10 }}>{label}</div>
              <div className="flex-1 h-2" style={{ background: 'hsl(18 25% 9%)' }}>
                <div className="h-full transition-all"
                  style={{ width: `${total > 0 ? (count / total) * 100 : 0}%`, background: color, transition: 'width 1.2s ease' }} />
              </div>
              <div className="font-mono text-xs w-7 text-right flex-shrink-0" style={{ color, fontSize: 10 }}>{count}</div>
            </div>
          ))}
        </div>

        {/* Medal tier key */}
        <div className="flex justify-center gap-3 mb-5">
          {(['BRONZE','SILVER','GOLD','PLATINUM'] as const).map(m => {
            const cfg = MEDALS[m];
            const active = result.medal === m;
            return (
              <div key={m} className="flex flex-col items-center gap-0.5">
                <div className="flex gap-0.5">
                  {[1,2,3,4,5].map(i => <Star key={i} filled={i <= cfg.stars} color={cfg.color} size={10} />)}
                </div>
                <div className="font-mono text-xs" style={{ color: active ? cfg.color : 'hsl(30 15% 28%)', fontSize: 8 }}>{m}</div>
              </div>
            );
          })}
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button data-testid="button-retry" onClick={() => setLocation(`/play/${songId}`)}
            className="flex-1 py-4 font-mono font-bold text-sm tracking-[0.3em] border transition-all"
            style={{ borderColor: 'hsl(20 25% 18%)', color: '#F2EDE5', background: 'hsl(18 35% 7%)', clipPath: 'polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = '#E53A00')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = 'hsl(20 25% 18%)')}>
            ↺ RETRY
          </button>
          <button data-testid="button-select-song" onClick={() => setLocation('/songs')}
            className="flex-1 py-4 font-mono font-bold text-sm tracking-[0.3em] transition-all"
            style={{ background: 'linear-gradient(135deg, #E53A00, #A855F7)', color: '#fff', clipPath: 'polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)', boxShadow: '0 0 30px rgba(229,58,0,0.3)' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.boxShadow = '0 0 50px rgba(229,58,0,0.6)')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.boxShadow = '0 0 30px rgba(229,58,0,0.3)')}>
            ◈ SONG SELECT
          </button>
        </div>
      </div>
    </div>
  );
}
