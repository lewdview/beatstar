import { useParams, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { getSong, getHighScore } from "@/game/songs";

interface ResultData {
  score: number;
  maxCombo: number;
  perfects: number;
  goods: number;
  misses: number;
  rank: string;
  total: number;
}

const RANK_COLORS: Record<string, string> = {
  S: '#48E5C2',
  A: '#E5B800',
  B: '#8B48E5',
  C: '#E53A00',
  D: '#555',
};

const RANK_MESSAGES: Record<string, string> = {
  S: 'SIGNAL PERFECT // ALL TRANSMISSIONS RECEIVED',
  A: 'STRONG SIGNAL // MINIMAL INTERFERENCE',
  B: 'SIGNAL STABLE // SOME STATIC DETECTED',
  C: 'WEAK SIGNAL // SIGNIFICANT NOISE',
  D: 'SIGNAL LOST // RECONNECT AND RETRY',
};

function Counter({ target, duration = 1200 }: { target: number; duration?: number }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const raf = () => {
      const elapsed = Date.now() - start;
      const pct = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - pct, 3);
      setValue(Math.floor(eased * target));
      if (pct < 1) requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }, [target, duration]);
  return <>{value.toLocaleString()}</>;
}

export default function Results() {
  const { songId } = useParams<{ songId: string }>();
  const [, setLocation] = useLocation();
  const song = getSong(songId || '');
  const [result, setResult] = useState<ResultData | null>(null);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem(`result_${songId}`);
    if (!raw) {
      setLocation('/songs');
      return;
    }
    const data = JSON.parse(raw) as ResultData;
    setResult(data);

    const prev = getHighScore(songId || '');
    if (data.score >= prev) setIsNew(true);
  }, [songId, setLocation]);

  if (!song || !result) return null;

  const rank = result.rank;
  const rankColor = RANK_COLORS[rank] || '#555';
  const total = result.total || 1;
  const accuracy = total > 0 ? Math.round(((result.perfects * 1 + result.goods * 0.5) / total) * 100) : 0;

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center relative overflow-hidden px-4"
      style={{ background: 'radial-gradient(ellipse at 50% 40%, hsl(14 60% 6%) 0%, hsl(15 40% 3%) 70%)' }}
    >
      {/* Background grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(229,58,0,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(229,58,0,0.04) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Glow behind rank */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: '20%', left: '50%', transform: 'translateX(-50%)',
          width: 300, height: 300,
          background: `radial-gradient(circle, ${rankColor}20 0%, transparent 70%)`,
        }}
      />

      <div className="relative z-10 w-full max-w-lg fade-in-up">
        {/* Song info */}
        <div className="text-center mb-6">
          <div className="font-mono text-xs tracking-[0.3em] mb-1" style={{ color: 'hsl(30 15% 40%)' }}>
            TRANSMISSION COMPLETE
          </div>
          <div className="font-mono font-bold text-xl" style={{ color: '#F2EDE5' }}>
            {song.title}
          </div>
          <div className="font-mono text-xs mt-1" style={{ color: 'hsl(30 15% 45%)' }}>
            {song.artist} · {song.bpm} BPM
          </div>
        </div>

        {/* Rank */}
        <div className="flex items-center justify-center mb-6">
          <div className="relative">
            <div
              className="font-mono font-bold text-center"
              style={{
                fontSize: '100px',
                color: rankColor,
                textShadow: `0 0 40px ${rankColor}80, 0 0 80px ${rankColor}40`,
                lineHeight: 1,
              }}
            >
              {rank}
            </div>
            {isNew && (
              <div
                className="absolute -top-3 -right-8 font-mono text-xs font-bold px-2 py-0.5"
                style={{
                  background: '#E5B800',
                  color: '#000',
                  clipPath: 'polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)',
                }}
              >
                NEW BEST
              </div>
            )}
          </div>
        </div>

        <div className="font-mono text-xs text-center tracking-widest mb-8" style={{ color: 'hsl(30 15% 45%)' }}>
          {RANK_MESSAGES[rank]}
        </div>

        {/* Score */}
        <div
          className="text-center mb-6 py-4 border"
          style={{ borderColor: `${rankColor}30`, background: `${rankColor}08` }}
        >
          <div className="font-mono text-xs tracking-widest mb-1" style={{ color: 'hsl(30 15% 45%)' }}>
            FINAL SCORE
          </div>
          <div
            className="font-mono font-bold"
            data-testid="text-final-score"
            style={{ fontSize: '42px', color: '#F2EDE5', letterSpacing: '0.05em' }}
          >
            <Counter target={result.score} duration={1500} />
          </div>
          <div className="font-mono text-sm mt-1" style={{ color: rankColor }}>
            MAX COMBO: {result.maxCombo}
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-4 gap-2 mb-6">
          {[
            { label: 'PERFECT', value: result.perfects, color: '#48E5C2' },
            { label: 'GOOD', value: result.goods, color: '#E5B800' },
            { label: 'MISS', value: result.misses, color: '#555' },
            { label: 'ACCURACY', value: `${accuracy}%`, color: rankColor },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              className="text-center py-3 border"
              style={{ borderColor: 'hsl(20 25% 12%)', background: 'hsl(18 35% 6%)' }}
            >
              <div className="font-mono text-xs mb-1" style={{ color: 'hsl(30 15% 40%)' }}>{label}</div>
              <div className="font-mono font-bold text-lg" style={{ color }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Bar chart */}
        <div className="mb-8 space-y-2">
          {[
            { label: 'PERFECT', count: result.perfects, color: '#48E5C2' },
            { label: 'GOOD', count: result.goods, color: '#E5B800' },
            { label: 'MISS', count: result.misses, color: '#444' },
          ].map(({ label, count, color }) => (
            <div key={label} className="flex items-center gap-3">
              <div className="font-mono text-xs w-14 text-right flex-shrink-0" style={{ color: 'hsl(30 15% 45%)' }}>
                {label}
              </div>
              <div className="flex-1 h-2" style={{ background: 'hsl(18 25% 9%)' }}>
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${total > 0 ? (count / total) * 100 : 0}%`,
                    background: color,
                    transition: 'width 1.2s ease',
                  }}
                />
              </div>
              <div className="font-mono text-xs w-8 flex-shrink-0" style={{ color }}>
                {count}
              </div>
            </div>
          ))}
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            data-testid="button-retry"
            onClick={() => setLocation(`/play/${songId}`)}
            className="flex-1 py-4 font-mono font-bold text-sm tracking-[0.3em] border transition-all"
            style={{
              borderColor: 'hsl(20 25% 18%)',
              color: '#F2EDE5',
              background: 'hsl(18 35% 7%)',
              clipPath: 'polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = '#E53A00')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = 'hsl(20 25% 18%)')}
          >
            ↺ RETRY
          </button>
          <button
            data-testid="button-select-song"
            onClick={() => setLocation('/songs')}
            className="flex-1 py-4 font-mono font-bold text-sm tracking-[0.3em] transition-all"
            style={{
              background: 'hsl(14 100% 48%)',
              color: '#fff',
              clipPath: 'polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)',
              boxShadow: '0 0 30px rgba(229,58,0,0.3)',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.boxShadow = '0 0 50px rgba(229,58,0,0.6)')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.boxShadow = '0 0 30px rgba(229,58,0,0.3)')}
          >
            ◈ SONG SELECT
          </button>
        </div>
      </div>
    </div>
  );
}
