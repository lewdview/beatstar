import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { loadCatalog } from "@/game/api";
import type { GameSong } from "@/game/api";
import {
  getTotalScore, getTotalPlatinums, getTotalCleared,
  getChapterPlatinums, getChapterCleared, getMedalForSong,
} from "@/game/progress";

// ── chapter metadata ─────────────────────────────────────────────
const CHAPTERS = [
  { month: 1,  name: 'JANUARY',   sub: 'GATEWAY SIGNAL',   diff: 'EASY',   dc: '#48E5C2', platNeeded: 5  },
  { month: 2,  name: 'FEBRUARY',  sub: 'EMERGENCE',         diff: 'EASY',   dc: '#48E5C2', platNeeded: 5  },
  { month: 3,  name: 'MARCH',     sub: 'STATIC RISE',       diff: 'EASY',   dc: '#48E5C2', platNeeded: 6  },
  { month: 4,  name: 'APRIL',     sub: 'FREQUENCY',         diff: 'MEDIUM', dc: '#A855F7', platNeeded: 7  },
  { month: 5,  name: 'MAY',       sub: 'SIGNAL SURGE',      diff: 'MEDIUM', dc: '#A855F7', platNeeded: 7  },
  { month: 6,  name: 'JUNE',      sub: 'INTERFERENCE',      diff: 'MEDIUM', dc: '#A855F7', platNeeded: 8  },
  { month: 7,  name: 'JULY',      sub: 'WAVELENGTH',        diff: 'HARD',   dc: '#E5B800', platNeeded: 9  },
  { month: 8,  name: 'AUGUST',    sub: 'RESONANCE',         diff: 'HARD',   dc: '#E5B800', platNeeded: 10 },
  { month: 9,  name: 'SEPTEMBER', sub: 'DISTORTION',        diff: 'HARD',   dc: '#E5B800', platNeeded: 11 },
  { month: 10, name: 'OCTOBER',   sub: 'THRESHOLD',         diff: 'BRUTAL', dc: '#E53A00', platNeeded: 12 },
  { month: 11, name: 'NOVEMBER',  sub: 'FRACTURE',          diff: 'BRUTAL', dc: '#E53A00', platNeeded: 13 },
  { month: 12, name: 'DECEMBER',  sub: 'TRANSMISSION END',  diff: 'BRUTAL', dc: '#E53A00', platNeeded: 15 },
];

const DIFF_COLOR: Record<string, string> = {
  EASY: '#48E5C2', MEDIUM: '#A855F7', HARD: '#E5B800', BRUTAL: '#E53A00',
};

// ── animated score counter ───────────────────────────────────────
function useCountUp(target: number, duration = 2400, delay = 300) {
  const [value, setValue] = useState(0);
  const [done, setDone]   = useState(false);
  useEffect(() => {
    if (!target) { setDone(true); return; }
    const t0 = setTimeout(() => {
      const start = Date.now();
      const tick  = () => {
        const p    = Math.min(1, (Date.now() - start) / duration);
        const ease = 1 - Math.pow(1 - p, 3.8);
        setValue(Math.round(ease * target));
        if (p < 1) requestAnimationFrame(tick);
        else { setValue(target); setDone(true); }
      };
      requestAnimationFrame(tick);
    }, delay);
    return () => clearTimeout(t0);
  }, [target, duration, delay]);
  return { value, done };
}

// Renders each digit with a rolling-in CSS animation
function AnimatedDigit({ char, idx, done }: { char: string; idx: number; done: boolean }) {
  const isComma = char === ',';
  return (
    <span
      className={isComma ? '' : 'inline-block overflow-hidden'}
      style={{
        color: isComma ? 'rgba(242,237,229,0.3)' : '#F2EDE5',
        animation: done && !isComma ? `digitLand 0.4s ${idx * 0.04}s cubic-bezier(0.34,1.56,0.64,1) both` : 'none',
        fontSize: isComma ? '0.7em' : '1em',
        lineHeight: 1,
      }}
    >
      {char}
    </span>
  );
}

function ScoreDisplay({ total }: { total: number }) {
  const { value, done } = useCountUp(total);
  const scanRef = useRef<HTMLDivElement>(null);

  const str = value.toLocaleString();

  return (
    <div className="relative select-none">
      {/* Scan line while counting */}
      {!done && (
        <div ref={scanRef} className="absolute inset-0 pointer-events-none overflow-hidden" style={{ borderRadius: 4 }}>
          <div className="score-scanline" />
        </div>
      )}

      {/* The number */}
      <div className="font-mono font-bold flex items-end justify-center gap-px tabular-nums"
        style={{
          fontSize: 'clamp(36px, 7vw, 64px)',
          letterSpacing: '0.04em',
          textShadow: done ? '0 0 30px rgba(242,237,229,0.25)' : 'none',
          transition: 'text-shadow 0.8s ease',
        }}>
        {str.split('').map((ch, i) => (
          <AnimatedDigit key={`${i}-${ch}`} char={ch} idx={i} done={done} />
        ))}
      </div>

      {/* Completion flash */}
      {done && total > 0 && (
        <div className="absolute inset-0 pointer-events-none score-flash" style={{ borderRadius: 8 }} />
      )}
    </div>
  );
}

// ── chapter card ─────────────────────────────────────────────────
interface ChapterData {
  meta: typeof CHAPTERS[number];
  songs: GameSong[];
  regularIds: string[];
  bonusCount: number;
  platinums: number;
  cleared: number;
  bonusUnlocked: boolean;
}

function ChapterCard({ data, onClick }: { data: ChapterData; onClick: () => void }) {
  const { meta, regularIds, bonusCount, platinums, cleared, bonusUnlocked } = data;
  const total      = regularIds.length;
  const pct        = total > 0 ? (cleared / total) * 100 : 0;
  const platPct    = total > 0 ? Math.min(100, (platinums / meta.platNeeded) * 100) : 0;
  const bonusReady = platPct >= 100;

  // Last song played in this chapter (for cover art)
  const lastPlayed = data.songs
    .filter(s => getMedalForSong(s.id))
    .sort((a, b) => b.day - a.day)[0];

  return (
    <button
      onClick={onClick}
      className="w-full text-left border transition-all duration-200 overflow-hidden group"
      style={{
        borderColor: cleared > 0 ? `${meta.dc}35` : 'rgba(255,255,255,0.05)',
        background: cleared > 0 ? `${meta.dc}05` : 'rgba(255,255,255,0.015)',
        borderRadius: 8,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `${meta.dc}60`; (e.currentTarget as HTMLElement).style.background = `${meta.dc}0c`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = cleared > 0 ? `${meta.dc}35` : 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLElement).style.background = cleared > 0 ? `${meta.dc}05` : 'rgba(255,255,255,0.015)'; }}
    >
      <div className="flex gap-0">
        {/* Color accent bar */}
        <div className="w-1 flex-shrink-0" style={{ background: cleared > 0 ? `linear-gradient(180deg, ${meta.dc}, ${meta.dc}40)` : 'rgba(255,255,255,0.05)' }} />

        {/* Cover art thumbnail */}
        {lastPlayed?.coverArt && (
          <div className="w-14 h-full flex-shrink-0 overflow-hidden">
            <img src={lastPlayed.coverArt} alt="" className="w-full h-full object-cover opacity-40 group-hover:opacity-60 transition-opacity" />
          </div>
        )}

        <div className="flex-1 p-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-mono text-xs" style={{ color: `${meta.dc}90`, letterSpacing: '0.2em', fontSize: 10 }}>
                  CH {String(meta.month).padStart(2, '0')}
                </span>
                <span className="font-mono px-1.5 py-px" style={{ fontSize: 8, color: meta.dc, border: `1px solid ${meta.dc}40`, background: `${meta.dc}10` }}>
                  {meta.diff}
                </span>
              </div>
              <div className="font-mono font-bold" style={{ color: '#F2EDE5', fontSize: 15 }}>{meta.name}</div>
              <div className="font-mono text-xs" style={{ color: 'hsl(30 15% 42%)', fontSize: 10 }}>{meta.sub}</div>
            </div>

            <div className="text-right flex-shrink-0">
              <div className="font-mono font-bold text-lg" style={{ color: cleared > 0 ? meta.dc : 'hsl(30 15% 28%)' }}>
                {cleared}<span className="text-xs font-normal" style={{ color: 'hsl(30 15% 35%)' }}>/{total}</span>
              </div>
              <div className="font-mono text-xs" style={{ color: 'hsl(30 15% 38%)', fontSize: 9 }}>
                ✦ {platinums} PT
              </div>
            </div>
          </div>

          {/* Progress bars */}
          <div className="space-y-1">
            {/* Cleared */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                <div className="h-full transition-all duration-1000"
                  style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${meta.dc}70, ${meta.dc})`, borderRadius: 2 }} />
              </div>
              <span className="font-mono flex-shrink-0" style={{ fontSize: 8, color: 'hsl(30 15% 38%)', width: 28, textAlign: 'right' }}>
                {Math.round(pct)}%
              </span>
            </div>

            {/* Platinum unlock */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1" style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 2 }}>
                <div className="h-full transition-all duration-1000"
                  style={{ width: `${platPct}%`, background: bonusReady ? '#E5B800' : `#E5B80050`, borderRadius: 2 }} />
              </div>
              <span className="font-mono flex-shrink-0 flex items-center gap-1" style={{ fontSize: 8, color: bonusReady ? '#E5B800' : 'hsl(30 15% 35%)', width: 28, textAlign: 'right' }}>
                {bonusUnlocked ? '★' : `${platinums}/${meta.platNeeded}`}
              </span>
            </div>
          </div>

          {/* Bonus stages indicator */}
          {bonusCount > 0 && (
            <div className="mt-2">
              <span className="font-mono px-1.5 py-px" style={{
                fontSize: 8,
                color: bonusUnlocked ? '#E5B800' : '#2a2a2a',
                border: `1px solid ${bonusUnlocked ? '#E5B80050' : '#1a1a1a'}`,
                background: bonusUnlocked ? '#E5B80010' : 'rgba(255,255,255,0.015)',
              }}>
                {bonusUnlocked ? `★ ${bonusCount} BONUS STAGES UNLOCKED` : `🔒 ${bonusCount} BONUS STAGES LOCKED`}
              </span>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

// ── main campaign page ───────────────────────────────────────────
export default function Campaign() {
  const [, setLocation] = useLocation();
  const [chapters, setChapters] = useState<ChapterData[]>([]);
  const [totals, setTotals]     = useState({ score: 0, platinums: 0, cleared: 0 });
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const score     = getTotalScore();
    const platinums = getTotalPlatinums();
    const cleared   = getTotalCleared();
    setTotals({ score, platinums, cleared });

    loadCatalog().then(catalog => {
      const data = CHAPTERS.map(meta => {
        const songs      = catalog.filter(s => new Date(s.date).getMonth() + 1 === meta.month).sort((a, b) => a.day - b.day);
        const regularIds = songs.slice(0, -5).map(s => s.id);
        const bonusCount = Math.min(5, Math.max(0, songs.length - regularIds.length));
        const platinums  = getChapterPlatinums(regularIds);
        const cleared    = getChapterCleared(regularIds);
        return { meta, songs, regularIds, bonusCount, platinums, cleared, bonusUnlocked: platinums >= meta.platNeeded };
      });
      setChapters(data);
      setLoading(false);
    });
  }, []);

  const totalChapters  = CHAPTERS.length;
  const startedChapters = chapters.filter(c => c.cleared > 0).length;

  return (
    <div className="min-h-screen w-full relative overflow-x-hidden"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, hsl(270 40% 5%) 0%, hsl(15 30% 3%) 60%)' }}>
      {/* Grid bg */}
      <div className="fixed inset-0 pointer-events-none opacity-30"
        style={{ backgroundImage: 'linear-gradient(rgba(168,85,247,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(168,85,247,0.04) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

      {/* Top bar */}
      <div className="sticky top-0 z-20 px-4 py-3 flex items-center justify-between"
        style={{ background: 'rgba(5,3,13,0.94)', borderBottom: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(12px)' }}>
        <button onClick={() => setLocation('/')}
          className="font-mono text-xs tracking-widest transition-colors"
          style={{ color: 'hsl(30 15% 32%)' }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#48E5C2')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'hsl(30 15% 32%)')}>
          ← HOME
        </button>
        <div className="font-mono text-xs tracking-[0.5em]" style={{ color: 'hsl(30 15% 38%)' }}>365 TRANSMISSIONS</div>
        <button onClick={() => setLocation('/songs')}
          className="font-mono text-xs tracking-widest transition-colors"
          style={{ color: 'hsl(30 15% 32%)' }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#E53A00')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'hsl(30 15% 32%)')}>
          FREE PLAY →
        </button>
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-8">
        {/* ── Score display ── */}
        <div className="text-center mb-8">
          <div className="font-mono text-xs tracking-[0.5em] mb-3" style={{ color: 'hsl(30 15% 38%)' }}>
            ◈ TOTAL TRANSMISSION SCORE ◈
          </div>

          {/* Main animated score */}
          <div className="relative inline-block mb-1">
            <ScoreDisplay total={totals.score} />
          </div>

          {/* Decorative bracket lines */}
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="h-px w-16" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15))' }} />
            <div className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.1)', letterSpacing: '0.5em' }}>══</div>
            <div className="h-px w-16" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.15), transparent)' }} />
          </div>

          {/* Stats row */}
          <div className="flex items-center justify-center gap-6 flex-wrap">
            {[
              { label: 'PLATINUM', value: totals.platinums, color: '#48E5C2' },
              { label: 'CLEARED',  value: totals.cleared,   color: '#A855F7' },
              { label: 'CHAPTERS', value: `${startedChapters}/${totalChapters}`, color: '#E53A00' },
            ].map(s => (
              <div key={s.label} className="text-center">
                <div className="font-mono font-bold text-xl" style={{ color: s.color }}>{s.value}</div>
                <div className="font-mono text-xs" style={{ color: 'hsl(30 15% 38%)', fontSize: 9 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4 mb-6">
          <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(168,85,247,0.4), transparent)' }} />
          <span className="font-mono text-xs tracking-widest" style={{ color: 'hsl(30 15% 35%)' }}>CAMPAIGN</span>
          <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(229,58,0,0.3))' }} />
        </div>

        {/* ── Chapter grid ── */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex gap-1.5">
              {['#E53A00','#A855F7','#48E5C2'].map((c, i) => (
                <div key={i} className="w-2 h-2 rounded-full animate-pulse" style={{ background: c, animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {chapters.map((data, i) => (
              <div key={data.meta.month}
                className="chapter-card-in"
                style={{ animationDelay: `${i * 0.05}s` }}>
                <ChapterCard
                  data={data}
                  onClick={() => setLocation(`/chapter/${data.meta.month}`)}
                />
              </div>
            ))}
          </div>
        )}

        {/* ── Difficulty legend ── */}
        <div className="mt-8 pt-5 flex items-center justify-center gap-6"
          style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          {Object.entries(DIFF_COLOR).map(([diff, color]) => (
            <div key={diff} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: color }} />
              <span className="font-mono text-xs" style={{ color: 'hsl(30 15% 38%)', fontSize: 9 }}>{diff}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
