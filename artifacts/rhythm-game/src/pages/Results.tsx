import { useParams, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { getSongById, loadCatalog, isSongTimeLocked } from "@/game/api";
import type { GameSong } from "@/game/api";
import { getHighScore, getChapterPlatinums } from "@/game/progress";

interface ResultData {
  score: number; maxCombo: number; perfectPlus: number;
  perfects: number; goods: number; misses: number; medal: string; total: number;
}

const MEDALS: Record<string, { color: string; abbr: string; message: string }> = {
  PLATINUM: { color: '#ACE894', abbr: 'PT', message: 'PERFECT SIGNAL — ALL TRANSMISSIONS LOCKED' },
  GOLD:     { color: '#E5B800', abbr: 'GO', message: 'STRONG SIGNAL — MINIMAL INTERFERENCE'       },
  SILVER:   { color: '#A0AABB', abbr: 'SI', message: 'SIGNAL STABLE — SOME STATIC DETECTED'       },
  BRONZE:   { color: '#C97A3A', abbr: 'BR', message: 'WEAK SIGNAL — SIGNIFICANT NOISE'            },
  NONE:     { color: '#444',    abbr: '—',  message: 'SIGNAL LOST — RECONNECT AND RETRY'          },
};

const MEDAL_ORDER = ['NONE','BRONZE','SILVER','GOLD','PLATINUM'];

const CHAPTER_PLAT_NEEDED: Record<number, number> = {
  1:2, 2:2, 3:3, 4:3, 5:3, 6:4, 7:4, 8:5, 9:5, 10:5, 11:6, 12:7,
};

function Counter({ target, duration = 1400 }: { target: number; duration?: number }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const raf = () => {
      const pct = Math.min(1, (Date.now() - start) / duration);
      const ease = 1 - Math.pow(1 - pct, 3);
      setValue(Math.floor(ease * target));
      if (pct < 1) requestAnimationFrame(raf);
      else setValue(target);
    };
    requestAnimationFrame(raf);
  }, [target, duration]);
  return <>{value.toLocaleString()}</>;
}

export default function Results() {
  const { songId } = useParams<{ songId: string }>();
  const [, setLocation] = useLocation();
  const [song, setSong]         = useState<GameSong | null>(null);
  const [result, setResult]     = useState<ResultData | null>(null);
  const [isNew, setIsNew]       = useState(false);
  const [ready, setReady]       = useState(false);
  const [nextSong, setNextSong] = useState<GameSong | null>(null);
  const [chapterMonth, setChapterMonth] = useState<number>(1);
  const [gameOrigin, setGameOrigin]     = useState<string>('');

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

          // Sort all songs by day to find next
          const sorted = [...catalog].sort((a, b) => a.day - b.day);
          const idx = sorted.findIndex(c => c.id === s.id);

          // Find next song that is also already released (not time-locked)
          const nextReleased = sorted.slice(idx + 1).find(c => !isSongTimeLocked(c));
          if (nextReleased !== undefined) {
            const candidate = nextReleased;
            const cMonth = new Date(candidate.date).getMonth() + 1;
            const monthSongs = sorted.filter(c => new Date(c.date).getMonth() + 1 === cMonth);
            // Last 5 of the month are bonus
            const bonusStart = monthSongs.length - 5;
            const candidateIdxInMonth = monthSongs.findIndex(c => c.id === candidate.id);
            const isBonus = candidateIdxInMonth >= bonusStart;

            if (isBonus) {
              const regularIds = monthSongs.slice(0, bonusStart).map(c => c.id);
              const platinums = getChapterPlatinums(regularIds);
              const needed = CHAPTER_PLAT_NEEDED[cMonth] ?? 5;
              if (platinums >= needed) setNextSong(candidate);
              // else bonus locked — no next stage button
            } else {
              setNextSong(candidate);
            }
          }
        }
      })
      .catch(() => { /* catalog fetch failed — show results with what we have */ })
      .finally(() => { setReady(true); });
  }, [songId, setLocation]);

  if (!ready || !result) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#080808' }}>
        <div className="font-mono text-xs tracking-widest animate-pulse" style={{ color: 'rgba(255,255,255,0.3)' }}>LOADING...</div>
      </div>
    );
  }

  const medal    = MEDALS[result.medal] ?? MEDALS.NONE;
  const mc       = medal.color;
  const total    = result.total || 1;
  const accuracy = Math.round(((result.perfectPlus * 1.0 + result.perfects * 0.9 + result.goods * 0.5) / total) * 100);

  return (
    <div className="relative w-full flex flex-col items-center px-4 py-8"
      style={{ background: '#080808', minHeight: '100dvh' }}>

      {/* Structural grid */}
      <div className="fixed inset-0 pointer-events-none"
        style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.015) 1px,transparent 1px)', backgroundSize: '80px 80px', zIndex: 0 }} />

      <div className="relative z-10 w-full max-w-md">

        {/* ── Top label ── */}
        <div className="flex items-center gap-0 mb-4">
          <div className="font-mono font-bold text-xs px-3 py-1.5 tracking-[0.4em]"
            style={{ color: '#080808', background: '#F2F0E8' }}>
            TRANSMISSION COMPLETE
          </div>
          <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.1)' }} />
          {isNew && (
            <div className="font-mono font-bold text-xs px-3 py-1.5 tracking-[0.3em]"
              style={{ color: '#080808', background: '#E5B800' }}>
              NEW BEST
            </div>
          )}
        </div>

        {/* ── Song info ── */}
        <div className="mb-4 flex items-center gap-4"
          style={{ border: '2px solid rgba(255,255,255,0.08)', padding: 16, boxShadow: '4px 4px 0 rgba(255,255,255,0.03)' }}>
          {song?.coverArt && (
            <img src={song.coverArt} alt={song.title}
              className="w-14 h-14 object-cover flex-shrink-0"
              style={{ border: `2px solid ${mc}` }} />
          )}
          <div>
            <div className="font-mono font-bold text-xl" style={{ color: '#F2F0E8', lineHeight: 1.1 }}>
              {song?.title ?? `TRANSMISSION ${songId}`}
            </div>
            <div className="font-mono text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)', letterSpacing: '0.2em' }}>
              TH3SCR1B3{song ? ` · DAY ${song.day} · ${song.bpm}BPM` : ''}
            </div>
          </div>
        </div>

        {/* ── Medal stamp ── */}
        <div className="mb-4" style={{ border: `2px solid ${mc}`, boxShadow: `6px 6px 0 ${mc}` }}>
          {/* Medal bar */}
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `2px solid ${mc}40` }}>
            <div>
              <div className="font-mono font-bold" style={{ fontSize: 36, color: mc, letterSpacing: '0.05em', lineHeight: 1 }}>
                {result.medal}
              </div>
              <div className="font-mono text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)', letterSpacing: '0.2em' }}>
                {medal.message}
              </div>
            </div>
            {/* Medal tier ladder */}
            <div className="flex flex-col gap-0.5 items-end">
              {MEDAL_ORDER.slice(1).reverse().map(m => {
                const cfg = MEDALS[m]; const active = result.medal === m;
                return (
                  <div key={m} className="flex items-center gap-1.5">
                    <div className="font-mono" style={{ fontSize: 8, color: active ? cfg.color : 'rgba(255,255,255,0.15)', letterSpacing: '0.2em' }}>{m}</div>
                    <div style={{ width: 8, height: 8, background: active ? cfg.color : 'rgba(255,255,255,0.08)', border: `1px solid ${active ? cfg.color : 'rgba(255,255,255,0.12)'}` }} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Score */}
          <div className="px-5 py-4" style={{ borderBottom: `2px solid ${mc}20` }}>
            <div className="font-mono text-xs tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>FINAL SCORE</div>
            <div className="font-mono font-bold" data-testid="text-final-score"
              style={{ fontSize: 48, color: '#F2F0E8', letterSpacing: '0.04em', lineHeight: 1 }}>
              <Counter target={result.score} duration={1500} />
            </div>
            <div className="font-mono text-sm mt-1" style={{ color: mc, letterSpacing: '0.2em' }}>
              MAX COMBO: {result.maxCombo}
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-5">
            {[
              { label: 'PERFECT+', value: result.perfectPlus, color: '#E5B800' },
              { label: 'PERFECT',  value: result.perfects,    color: '#ACE894' },
              { label: 'GOOD',     value: result.goods,       color: '#4A314D' },
              { label: 'MISS',     value: result.misses,      color: '#555'    },
              { label: 'ACC',      value: `${accuracy}%`,     color: mc        },
            ].map(({ label, value, color }, i) => (
              <div key={label} className="text-center py-3"
                style={{ borderRight: i < 4 ? `2px solid ${mc}20` : 'none', background: 'rgba(0,0,0,0.2)' }}>
                <div className="font-mono font-bold" style={{ fontSize: 18, color, lineHeight: 1 }}>{value}</div>
                <div className="font-mono mt-1" style={{ fontSize: 7, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.2em' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Bar breakdown ── */}
        <div className="mb-4 space-y-2 px-1">
          {[
            { label: 'PERFECT+', count: result.perfectPlus, color: '#E5B800' },
            { label: 'PERFECT',  count: result.perfects,    color: '#ACE894' },
            { label: 'GOOD',     count: result.goods,       color: '#4A314D' },
            { label: 'MISS',     count: result.misses,      color: '#333'    },
          ].map(({ label, count, color }) => (
            <div key={label} className="flex items-center gap-3">
              <div className="font-mono w-14 text-right flex-shrink-0" style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em' }}>{label}</div>
              <div className="flex-1 h-3" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ height: '100%', width: `${total > 0 ? (count / total) * 100 : 0}%`, background: color, transition: 'width 1.2s ease' }} />
              </div>
              <div className="font-mono w-6 text-right flex-shrink-0" style={{ fontSize: 9, color, letterSpacing: '0.1em' }}>{count}</div>
            </div>
          ))}
        </div>

        {/* ── Primary action: NEXT STAGE or BACK ── */}
        {(() => {
          const fromFreePlay = gameOrigin === 'songs';
          const backLabel = fromFreePlay ? '← BACK TO FREE PLAY' : '← BACK TO CHAPTER';
          const backRoute = fromFreePlay ? '/songs' : `/chapter/${chapterMonth}`;
          return nextSong ? (
            <div className="mb-2">
              <div className="font-mono text-xs mb-1.5 px-1" style={{ color: 'rgba(255,255,255,0.2)', letterSpacing: '0.3em' }}>
                NEXT — DAY {nextSong.day}
              </div>
              <button
                onClick={() => setLocation(`/play/${nextSong.id}`)}
                className="w-full py-5 font-mono font-bold text-base tracking-[0.35em] transition-all duration-75"
                style={{ border: '3px solid #F2F0E8', color: '#080808', background: '#F2F0E8', boxShadow: `6px 6px 0 ${mc}` }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.boxShadow = `3px 3px 0 ${mc}`; el.style.transform = 'translate(3px,3px)'; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.boxShadow = `6px 6px 0 ${mc}`; el.style.transform = ''; }}
              >
                ▶ NEXT STAGE — {nextSong.title.length > 22 ? nextSong.title.slice(0, 22) + '…' : nextSong.title}
              </button>
            </div>
          ) : (
            <div className="mb-2">
              <button
                onClick={() => setLocation(backRoute)}
                className="w-full py-5 font-mono font-bold text-base tracking-[0.35em] transition-all duration-75"
                style={{ border: '3px solid #F2F0E8', color: '#080808', background: '#F2F0E8', boxShadow: '6px 6px 0 rgba(255,255,255,0.15)' }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.boxShadow = '3px 3px 0 rgba(255,255,255,0.15)'; el.style.transform = 'translate(3px,3px)'; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.boxShadow = '6px 6px 0 rgba(255,255,255,0.15)'; el.style.transform = ''; }}
              >
                {backLabel}
              </button>
            </div>
          );
        })()}

        {/* ── Secondary actions ── */}
        {(() => {
          const fromFreePlay = gameOrigin === 'songs';
          const modeRoute = fromFreePlay ? '/songs' : `/chapter/${chapterMonth}`;
          const modeLabel = fromFreePlay ? '◈ FREE PLAY' : '≡ CHAPTER';
          const homeRoute = fromFreePlay ? '/songs' : '/campaign';
          const homeLabel = fromFreePlay ? '⌂ HOME' : '◈ CAMPAIGN';
          return (
            <div className="flex gap-2">
              <button data-testid="button-retry" onClick={() => setLocation(`/play/${songId}`)}
                className="flex-1 py-3 font-mono font-bold text-sm tracking-[0.3em] transition-all duration-75"
                style={{ border: '2px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)', background: 'transparent', boxShadow: '3px 3px 0 rgba(255,255,255,0.06)' }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = '#FF5400'; el.style.borderColor = '#FF5400'; el.style.boxShadow = '3px 3px 0 #FF5400'; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'rgba(255,255,255,0.6)'; el.style.borderColor = 'rgba(255,255,255,0.15)'; el.style.boxShadow = '3px 3px 0 rgba(255,255,255,0.06)'; }}>
                ↺ RETRY
              </button>
              <button onClick={() => setLocation(modeRoute)}
                className="flex-1 py-3 font-mono font-bold text-sm tracking-[0.3em] transition-all duration-75"
                style={{ border: '2px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)', background: 'transparent', boxShadow: '3px 3px 0 rgba(255,255,255,0.06)' }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = '#4A314D'; el.style.borderColor = '#4A314D'; el.style.boxShadow = '3px 3px 0 #4A314D'; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'rgba(255,255,255,0.6)'; el.style.borderColor = 'rgba(255,255,255,0.15)'; el.style.boxShadow = '3px 3px 0 rgba(255,255,255,0.06)'; }}>
                {modeLabel}
              </button>
              <button data-testid="button-select-song" onClick={() => setLocation(homeRoute)}
                className="flex-1 py-3 font-mono font-bold text-sm tracking-[0.3em] transition-all duration-75"
                style={{ border: '2px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)', background: 'transparent', boxShadow: '3px 3px 0 rgba(255,255,255,0.06)' }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = '#ACE894'; el.style.borderColor = '#ACE894'; el.style.boxShadow = '3px 3px 0 #ACE894'; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'rgba(255,255,255,0.6)'; el.style.borderColor = 'rgba(255,255,255,0.15)'; el.style.boxShadow = '3px 3px 0 rgba(255,255,255,0.06)'; }}>
                {homeLabel}
              </button>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
