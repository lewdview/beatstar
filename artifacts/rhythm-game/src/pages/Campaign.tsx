import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { loadCatalog } from "@/game/api";
import type { GameSong } from "@/game/api";
import {
  getTotalScore, getTotalPlatinums, getTotalCleared,
  getChapterPlatinums, getChapterCleared, getMedalForSong,
} from "@/game/progress";

import { CHAPTERS } from "@/game/campaign";


// ── animated score counter ───────────────────────────────────────
function useCountUp(target: number, duration = 2200, delay = 400) {
  const [value, setValue] = useState(0);
  const [done, setDone]   = useState(false);
  useEffect(() => {
    if (!target) {
      setValue(0);
      setDone(true);
      return;
    }
    
    // Reset state for new count-up
    setValue(0);
    setDone(false);

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
    <div className="relative flex flex-col items-center">
      {/* Scan line while counting */}
      {!done && <div className="score-scanline" style={{ position: 'absolute', left: -20, right: -20, zIndex: 10 }} />}

      <div className="font-mono font-bold tabular-nums text-center whitespace-nowrap flex items-center justify-center"
        style={{
          fontSize: 'clamp(32px, 12vw, 72px)',
          lineHeight: 1,
          letterSpacing: '-0.02em',
          filter: 'drop-shadow(0 0 30px rgba(242,232,232,0.15))',
        }}>
        {str.split('').map((ch, i) => (
          <span key={i} className="inline-block"
            style={{
              minWidth: ch === ',' ? '0.2em' : '0.55em',
              background: ch === ',' ? 'none' : 'linear-gradient(180deg, #F2F0E8 0%, #C8B88A 100%)',
              WebkitBackgroundClip: ch === ',' ? 'none' : 'text',
              WebkitTextFillColor: ch === ',' ? 'initial' : 'transparent',
              color: ch === ',' ? 'rgba(255,255,255,0.2)' : '#F2F0E8',
              animation: done && ch !== ',' ? `digitLand 0.4s ${i * 0.03}s cubic-bezier(0.34,1.56,0.64,1) both` : 'none',
              opacity: done || ch === ',' ? 1 : 0, // ensure visible even if animation hasn't started
            }}>
            {ch}
          </span>
        ))}
      </div>
      {done && total > 0 && <div className="absolute inset-0 score-flash pointer-events-none" style={{ filter: 'blur(20px)' }} />}
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
  const total    = regularIds.length;
  const pct      = total > 0 ? (cleared / total) * 100 : 0;
  const platPct  = Math.min(100, total > 0 ? (platinums / meta.platNeeded) * 100 : 0);

  return (
    <button onClick={onClick} className="glass-panel w-full text-left transition-all duration-200 group"
      style={{
        borderLeft: `3px solid ${cleared > 0 ? meta.dc : 'rgba(255,255,255,0.06)'}`,
        display: 'block',
        '--breathe-color': `${meta.dc}50`,
      } as React.CSSProperties}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderLeftColor = meta.dc;
        el.style.boxShadow = `0 8px 32px rgba(0,0,0,0.5), 0 0 20px ${meta.dc}20, inset 0 1px 0 rgba(255,255,255,0.06)`;
        el.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderLeftColor = cleared > 0 ? meta.dc : 'rgba(255,255,255,0.06)';
        el.style.boxShadow = '';
        el.style.transform = '';
      }}
    >
      <div className="p-4">
        {/* Top row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            {/* Chapter ID + difficulty */}
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono font-bold text-xs" style={{ color: 'rgba(255,255,255,0.3)', letterSpacing: '0.3em' }}>
                CH {String(meta.month).padStart(2, '0')}
              </span>
              <span className="pill-badge"
                style={{ color: '#080808', background: meta.dc, boxShadow: `0 0 10px ${meta.dc}40` }}>
                {meta.diff}
              </span>
            </div>
            <div className="font-mono font-bold text-xl" style={{ color: '#F2F0E8', letterSpacing: '0.02em' }}>
              {meta.name}
            </div>
            <div className="font-mono text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.25)', letterSpacing: '0.25em' }}>
              {meta.sub}
            </div>
          </div>

          {/* Score column */}
          <div className="text-right flex-shrink-0"
            style={{ borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: 12 }}>
            <div className="font-mono font-bold text-2xl" style={{ color: cleared > 0 ? meta.dc : 'rgba(255,255,255,0.15)', lineHeight: 1, textShadow: cleared > 0 ? `0 0 12px ${meta.dc}40` : 'none' }}>
              {cleared}
            </div>
            <div className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>/{total}</div>
            <div className="font-mono font-bold text-sm mt-1" style={{ color: '#E5B800', textShadow: '0 0 8px rgba(229,184,0,0.3)' }}>✦{platinums}</div>
          </div>
        </div>

        {/* Progress bars */}
        <div className="space-y-2">
          {/* Cleared bar */}
          <div className="flex items-center gap-2">
            <div className="font-mono" style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', width: 40, letterSpacing: '0.2em' }}>CLEAR</div>
            <div className="progress-pill flex-1">
              <div style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${meta.dc}80, ${meta.dc})`, boxShadow: `0 0 6px ${meta.dc}40` }} />
            </div>
            <div className="font-mono" style={{ fontSize: 8, color: meta.dc, width: 28, textAlign: 'right' }}>{Math.round(pct)}%</div>
          </div>

          {/* Platinum bar */}
          <div className="flex items-center gap-2">
            <div className="font-mono" style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', width: 40, letterSpacing: '0.2em' }}>BONUS</div>
            <div className="progress-pill flex-1">
              <div style={{ width: `${platPct}%`, background: bonusUnlocked ? 'linear-gradient(90deg, #E5B80080, #E5B800)' : 'rgba(229,184,0,0.35)' }} />
            </div>
            <div className="font-mono" style={{ fontSize: 8, color: bonusUnlocked ? '#E5B800' : 'rgba(255,255,255,0.2)', width: 28, textAlign: 'right' }}>
              {bonusUnlocked ? '★' : `${platinums}/${meta.platNeeded}`}
            </div>
          </div>
        </div>

        {/* Bonus stamp */}
        {bonusCount > 0 && (
          <div className="mt-2 inline-block">
            <span className="pill-badge"
              style={{
                color: bonusUnlocked ? '#080808' : 'rgba(255,255,255,0.2)',
                background: bonusUnlocked ? '#E5B800' : 'transparent',
                border: `1px solid ${bonusUnlocked ? '#E5B800' : 'rgba(255,255,255,0.1)'}`,
                boxShadow: bonusUnlocked ? '0 0 10px rgba(229,184,0,0.3)' : 'none',
              }}>
              {bonusUnlocked ? `★ ${bonusCount} BONUS UNLOCKED` : `🔒 ${bonusCount} BONUS LOCKED`}
            </span>
          </div>
        )}
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
    <div className="min-h-dvh w-full" style={{ background: 'radial-gradient(ellipse 80% 50% at 50% 20%, #0e1028 0%, #080808 60%)' }}>
      {/* Top nav */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3"
        style={{ background: 'rgba(8,8,12,0.7)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={() => setLocation('/')}
          className="neon-btn-outline text-xs px-3 py-1.5 tracking-widest">
          ← HOME
        </button>
        <div className="font-mono font-bold text-xs tracking-[0.6em]" style={{ color: 'rgba(255,255,255,0.25)' }}>
          CAMPAIGN
        </div>
        <button onClick={() => setLocation('/songs')}
          className="neon-btn-outline text-xs px-3 py-1.5 tracking-widest">
          FREE PLAY →
        </button>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 slide-up">
        {/* ── Score panel ── */}
        <div className="mb-6 glass-panel breathe-glow"
          style={{ '--breathe-color': 'rgba(255,84,0,0.15)' } as React.CSSProperties}>
          {/* Panel header */}
          <div className="px-5 py-2.5 flex items-center justify-between"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="font-mono font-bold text-xs tracking-[0.4em]" style={{ color: 'rgba(255,255,255,0.3)' }}>
              TOTAL TRANSMISSION SCORE
            </div>
            <div className="font-mono text-xs" style={{ color: totals.score > 0 ? '#ACE894' : 'rgba(255,255,255,0.15)' }}>
              {totals.score > 0 ? '●' : '○'} LIVE
            </div>
          </div>

          {/* Score number */}
          <div className="px-5 py-5">
            <ScoreDisplay total={totals.score} />
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            {[
              { label: 'PLATINUM',  value: totals.platinums,                     color: '#ACE894' },
              { label: 'CLEARED',   value: totals.cleared,                        color: '#4A314D' },
              { label: 'CHAPTERS',  value: `${startedChapters}/${CHAPTERS.length}`, color: '#FF5400' },
            ].map((s, i) => (
              <div key={s.label} className="py-3 px-4"
                style={{ borderRight: i < 2 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                <div className="font-mono font-bold text-xl" style={{ color: s.color, textShadow: `0 0 10px ${s.color}30` }}>{s.value}</div>
                <div className="font-mono" style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.3em' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Chapter list label ── */}
        <div className="flex items-center gap-3 mb-3">
          <div className="pill-badge px-4 py-1.5"
            style={{ color: '#080808', background: '#F2F0E8', letterSpacing: '0.4em' }}>
            12 CHAPTERS
          </div>
          <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.1), transparent)' }} />
        </div>

        {/* ── Chapter cards ── */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="font-mono text-xs tracking-widest animate-pulse" style={{ color: 'rgba(255,255,255,0.3)' }}>
              LOADING...
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {chapters.map((data, i) => (
              <div key={data.meta.month} className="chapter-card-in" style={{ animationDelay: `${i * 0.04}s` }}>
                <ChapterCard data={data} onClick={() => setLocation(`/chapter/${data.meta.month}`)} />
              </div>
            ))}
          </div>
        )}

        {/* Legend */}
        <div className="mt-6 flex gap-3 justify-center">
          {[['EASY','#ACE894'],['MEDIUM','#4A314D'],['HARD','#E5B800'],['BRUTAL','#FF5400']].map(([diff, color]) => (
            <div key={diff} className="flex items-center gap-1.5">
              <div className="rounded-full" style={{ width: 8, height: 8, background: color as string, boxShadow: `0 0 6px ${color}40` }} />
              <div className="font-mono" style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.2em' }}>{diff}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
