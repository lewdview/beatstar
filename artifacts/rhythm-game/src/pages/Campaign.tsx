import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { loadCatalog } from "@/game/api";
import type { GameSong } from "@/game/api";
import {
  getTotalScore, getTotalPlatinums, getTotalCleared,
  getChapterPlatinums, getChapterCleared, getMedalForSong,
} from "@/game/progress";

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

// ── animated score counter ───────────────────────────────────────
function useCountUp(target: number, duration = 2200, delay = 400) {
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

function ScoreDisplay({ total }: { total: number }) {
  const { value, done } = useCountUp(total);
  const str = value.toLocaleString();

  return (
    <div className="relative">
      {/* Scan line while counting */}
      {!done && <div className="score-scanline" style={{ position: 'absolute', left: 0, right: 0 }} />}

      <div className="font-mono font-bold tabular-nums text-center"
        style={{
          fontSize: 'clamp(44px, 8vw, 72px)',
          letterSpacing: '0.03em',
          color: '#F2F0E8',
          transition: done ? 'color 0.3s' : 'none',
        }}>
        {str.split('').map((ch, i) => (
          <span key={i} className="inline-block"
            style={{
              color: ch === ',' ? 'rgba(255,255,255,0.2)' : '#F2F0E8',
              animation: done && ch !== ',' ? `digitLand 0.35s ${i * 0.035}s cubic-bezier(0.34,1.56,0.64,1) both` : 'none',
            }}>
            {ch}
          </span>
        ))}
      </div>
      {done && total > 0 && <div className="absolute inset-0 score-flash pointer-events-none" />}
    </div>
  );
}

// ── chapter card (brutalist) ─────────────────────────────────────
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
  const total    = regularIds.length;
  const pct      = total > 0 ? (cleared / total) * 100 : 0;
  const platPct  = Math.min(100, total > 0 ? (platinums / meta.platNeeded) * 100 : 0);

  return (
    <button onClick={onClick} className="brutal-chapter-card w-full text-left transition-all duration-75"
      style={{
        background: '#0e0e0e',
        border: `2px solid rgba(255,255,255,0.1)`,
        boxShadow: `4px 4px 0 rgba(255,255,255,0.05)`,
        display: 'block',
      }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = meta.dc; el.style.boxShadow = `4px 4px 0 ${meta.dc}`; el.style.transform = 'translate(-1px,-1px)'; }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'rgba(255,255,255,0.1)'; el.style.boxShadow = '4px 4px 0 rgba(255,255,255,0.05)'; el.style.transform = ''; }}
    >
      <div className="flex">
        {/* Thick left accent bar */}
        <div style={{ width: 5, flexShrink: 0, background: cleared > 0 ? meta.dc : 'rgba(255,255,255,0.08)' }} />

        <div className="flex-1 p-4">
          {/* Top row */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              {/* Chapter ID + difficulty */}
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono font-bold text-xs" style={{ color: 'rgba(255,255,255,0.3)', letterSpacing: '0.3em' }}>
                  CH {String(meta.month).padStart(2, '0')}
                </span>
                <span className="font-mono font-bold px-2 py-px text-xs"
                  style={{ color: '#080808', background: meta.dc, letterSpacing: '0.15em' }}>
                  {meta.diff}
                </span>
              </div>
              <div className="font-mono font-bold text-xl" style={{ color: '#F2F0E8', letterSpacing: '0.02em' }}>
                {meta.name}
              </div>
              <div className="font-mono text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)', letterSpacing: '0.25em' }}>
                {meta.sub}
              </div>
            </div>

            {/* Score column */}
            <div className="text-right flex-shrink-0"
              style={{ borderLeft: '2px solid rgba(255,255,255,0.07)', paddingLeft: 12 }}>
              <div className="font-mono font-bold text-2xl" style={{ color: cleared > 0 ? meta.dc : 'rgba(255,255,255,0.15)', lineHeight: 1 }}>
                {cleared}
              </div>
              <div className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>/{total}</div>
              <div className="font-mono font-bold text-sm mt-1" style={{ color: '#E5B800' }}>✦{platinums}</div>
            </div>
          </div>

          {/* Progress bars */}
          <div className="space-y-2">
            {/* Cleared bar */}
            <div className="flex items-center gap-2">
              <div className="font-mono" style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', width: 40, letterSpacing: '0.2em' }}>CLEAR</div>
              <div className="flex-1 h-2" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: meta.dc, transition: 'width 1s ease' }} />
              </div>
              <div className="font-mono" style={{ fontSize: 8, color: meta.dc, width: 28, textAlign: 'right' }}>{Math.round(pct)}%</div>
            </div>

            {/* Platinum bar */}
            <div className="flex items-center gap-2">
              <div className="font-mono" style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', width: 40, letterSpacing: '0.2em' }}>BONUS</div>
              <div className="flex-1 h-2" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ height: '100%', width: `${platPct}%`, background: bonusUnlocked ? '#E5B800' : 'rgba(229,184,0,0.45)', transition: 'width 1s ease' }} />
              </div>
              <div className="font-mono" style={{ fontSize: 8, color: bonusUnlocked ? '#E5B800' : 'rgba(255,255,255,0.2)', width: 28, textAlign: 'right' }}>
                {bonusUnlocked ? '★' : `${platinums}/${meta.platNeeded}`}
              </div>
            </div>
          </div>

          {/* Bonus stamp */}
          {bonusCount > 0 && (
            <div className="mt-2 inline-block">
              <span className="font-mono font-bold px-2 py-0.5"
                style={{
                  fontSize: 8,
                  color: bonusUnlocked ? '#080808' : 'rgba(255,255,255,0.2)',
                  background: bonusUnlocked ? '#E5B800' : 'transparent',
                  border: `1px solid ${bonusUnlocked ? '#E5B800' : 'rgba(255,255,255,0.1)'}`,
                  letterSpacing: '0.3em',
                }}>
                {bonusUnlocked ? `★ ${bonusCount} BONUS UNLOCKED` : `🔒 ${bonusCount} BONUS LOCKED`}
              </span>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

// ── main ─────────────────────────────────────────────────────────
export default function Campaign() {
  const [, setLocation] = useLocation();
  const [chapters, setChapters] = useState<ChapterData[]>([]);
  const [totals, setTotals]     = useState({ score: 0, platinums: 0, cleared: 0 });
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    setTotals({ score: getTotalScore(), platinums: getTotalPlatinums(), cleared: getTotalCleared() });
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

  const startedChapters = chapters.filter(c => c.cleared > 0).length;

  return (
    <div className="min-h-screen w-full" style={{ background: '#080808' }}>
      {/* Top nav */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3"
        style={{ background: '#080808', borderBottom: '2px solid rgba(255,255,255,0.08)' }}>
        <button onClick={() => setLocation('/')}
          className="font-mono text-xs tracking-widest transition-all"
          style={{ color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.1)', padding: '4px 10px', boxShadow: '2px 2px 0 rgba(255,255,255,0.06)' }}
          onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = '#F2F0E8'; el.style.borderColor = '#F2F0E8'; el.style.boxShadow = '2px 2px 0 #F2F0E8'; }}
          onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'rgba(255,255,255,0.35)'; el.style.borderColor = 'rgba(255,255,255,0.1)'; el.style.boxShadow = '2px 2px 0 rgba(255,255,255,0.06)'; }}>
          ← HOME
        </button>
        <div className="font-mono font-bold text-xs tracking-[0.6em]" style={{ color: 'rgba(255,255,255,0.25)' }}>
          CAMPAIGN
        </div>
        <button onClick={() => setLocation('/songs')}
          className="font-mono text-xs tracking-widest transition-all"
          style={{ color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.1)', padding: '4px 10px', boxShadow: '2px 2px 0 rgba(255,255,255,0.06)' }}
          onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = '#48E5C2'; el.style.borderColor = '#48E5C2'; el.style.boxShadow = '2px 2px 0 #48E5C2'; }}
          onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'rgba(255,255,255,0.35)'; el.style.borderColor = 'rgba(255,255,255,0.1)'; el.style.boxShadow = '2px 2px 0 rgba(255,255,255,0.06)'; }}>
          FREE PLAY →
        </button>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* ── Score panel ── */}
        <div className="mb-6" style={{ border: '2px solid rgba(255,255,255,0.12)', boxShadow: '6px 6px 0 rgba(255,255,255,0.04)' }}>
          {/* Panel header */}
          <div className="px-5 py-2 flex items-center justify-between"
            style={{ borderBottom: '2px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
            <div className="font-mono font-bold text-xs tracking-[0.4em]" style={{ color: 'rgba(255,255,255,0.3)' }}>
              TOTAL TRANSMISSION SCORE
            </div>
            <div className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.15)' }}>
              {totals.score > 0 ? '●' : '○'} LIVE
            </div>
          </div>

          {/* Score number */}
          <div className="px-5 py-5">
            <ScoreDisplay total={totals.score} />
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3" style={{ borderTop: '2px solid rgba(255,255,255,0.08)' }}>
            {[
              { label: 'PLATINUM',  value: totals.platinums,                     color: '#48E5C2' },
              { label: 'CLEARED',   value: totals.cleared,                        color: '#A855F7' },
              { label: 'CHAPTERS',  value: `${startedChapters}/${CHAPTERS.length}`, color: '#E53A00' },
            ].map((s, i) => (
              <div key={s.label} className="py-3 px-4"
                style={{ borderRight: i < 2 ? '2px solid rgba(255,255,255,0.08)' : 'none' }}>
                <div className="font-mono font-bold text-xl" style={{ color: s.color }}>{s.value}</div>
                <div className="font-mono" style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.3em' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Chapter list label ── */}
        <div className="flex items-center gap-0 mb-3">
          <div className="font-mono font-bold text-xs tracking-[0.5em] px-3 py-1.5"
            style={{ color: '#080808', background: '#F2F0E8', display: 'inline-block' }}>
            12 CHAPTERS
          </div>
          <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.1)' }} />
        </div>

        {/* ── Chapter cards ── */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="font-mono text-xs tracking-widest animate-pulse" style={{ color: 'rgba(255,255,255,0.3)' }}>
              LOADING...
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {chapters.map((data, i) => (
              <div key={data.meta.month} className="chapter-card-in" style={{ animationDelay: `${i * 0.04}s` }}>
                <ChapterCard data={data} onClick={() => setLocation(`/chapter/${data.meta.month}`)} />
              </div>
            ))}
          </div>
        )}

        {/* Legend */}
        <div className="mt-6 flex gap-0 overflow-hidden"
          style={{ border: '2px solid rgba(255,255,255,0.06)' }}>
          {[['EASY','#48E5C2'],['MEDIUM','#A855F7'],['HARD','#E5B800'],['BRUTAL','#E53A00']].map(([diff, color], i) => (
            <div key={diff} className="flex-1 text-center py-2"
              style={{ borderRight: i < 3 ? '2px solid rgba(255,255,255,0.06)' : 'none' }}>
              <div style={{ width: 8, height: 8, background: color as string, margin: '0 auto 4px' }} />
              <div className="font-mono" style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.2em' }}>{diff}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
