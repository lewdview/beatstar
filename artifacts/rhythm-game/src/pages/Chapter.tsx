import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { loadCatalog, isSongTimeLocked } from "@/game/api";
import type { GameSong } from "@/game/api";
import { getMedalForSong, getChapterPlatinums, getHighScore } from "@/game/progress";

const CHAPTERS = [
  { month: 1,  name: 'JANUARY',   sub: 'GATEWAY SIGNAL',   diff: 'EASY',   dc: '#ACE894', platNeeded: 2  },
  { month: 2,  name: 'FEBRUARY',  sub: 'EMERGENCE',         diff: 'EASY',   dc: '#ACE894', platNeeded: 2  },
  { month: 3,  name: 'MARCH',     sub: 'STATIC RISE',       diff: 'EASY',   dc: '#ACE894', platNeeded: 3  },
  { month: 4,  name: 'APRIL',     sub: 'FREQUENCY',         diff: 'MEDIUM', dc: '#4A314D', platNeeded: 3  },
  { month: 5,  name: 'MAY',       sub: 'SIGNAL SURGE',      diff: 'MEDIUM', dc: '#4A314D', platNeeded: 3  },
  { month: 6,  name: 'JUNE',      sub: 'INTERFERENCE',      diff: 'MEDIUM', dc: '#4A314D', platNeeded: 4  },
  { month: 7,  name: 'JULY',      sub: 'WAVELENGTH',        diff: 'HARD',   dc: '#E5B800', platNeeded: 4  },
  { month: 8,  name: 'AUGUST',    sub: 'RESONANCE',         diff: 'HARD',   dc: '#E5B800', platNeeded: 5  },
  { month: 9,  name: 'SEPTEMBER', sub: 'DISTORTION',        diff: 'HARD',   dc: '#E5B800', platNeeded: 5  },
  { month: 10, name: 'OCTOBER',   sub: 'THRESHOLD',         diff: 'BRUTAL', dc: '#FF5400', platNeeded: 5  },
  { month: 11, name: 'NOVEMBER',  sub: 'FRACTURE',          diff: 'BRUTAL', dc: '#FF5400', platNeeded: 6  },
  { month: 12, name: 'DECEMBER',  sub: 'TRANSMISSION END',  diff: 'BRUTAL', dc: '#FF5400', platNeeded: 7  },
];

const MEDAL_COLOR: Record<string, string> = {
  PLATINUM: '#ACE894', GOLD: '#E5B800', SILVER: '#A0AABB', BRONZE: '#C97A3A', NONE: '#333', '': '#1a1a1a',
};
const MEDAL_ABBR: Record<string, string> = {
  PLATINUM: 'PT', GOLD: 'GO', SILVER: 'SI', BRONZE: 'BR', NONE: '—', '': '?',
};

// ── Stage row ────────────────────────────────────────────────────
function StageRow({ song, stageNum, isBonus, locked, lockReason, dc, from }: {
  song: GameSong; stageNum: number; isBonus: boolean;
  locked: boolean; lockReason?: 'time' | 'bonus'; dc: string; from: string;
}) {
  const [, setLocation] = useLocation();
  const medal    = getMedalForSong(song.id);
  const score    = getHighScore(song.id);
  const cleared  = !!medal && medal !== '';
  const mc       = MEDAL_COLOR[medal] ?? '#1a1a1a';
  const timeLock = locked && lockReason === 'time';

  const unlockLabel = timeLock ? (() => {
    const d = new Date(song.date + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).toUpperCase();
  })() : '';

  const goToDetail = () => {
    if (locked) return;
    setLocation(`/song/${song.id}?from=${from}`);
  };

  const goToPlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (locked) return;
    sessionStorage.setItem(`game_origin_${song.id}`, from);
    sessionStorage.setItem(`diff_override_${song.id}`, String(song.difficultyLevel));
    setLocation(`/play/${song.id}`);
  };

  return (
    <div className="flex items-stretch"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', opacity: timeLock ? 0.45 : locked ? 0.4 : 1 }}>

      {/* Number block */}
      <div className="flex-shrink-0 flex items-center justify-center font-mono font-bold text-sm"
        style={{
          width: 40, flexShrink: 0,
          background: cleared ? `${mc}18` : 'rgba(255,255,255,0.02)',
          borderRight: `2px solid ${cleared ? mc : 'rgba(255,255,255,0.07)'}`,
          color: cleared ? mc : 'rgba(255,255,255,0.2)',
        }}>
        {String(stageNum).padStart(2, '0')}
      </div>

      {/* Content — click to song detail */}
      <div
        onClick={goToDetail}
        className="flex-1 min-w-0 px-3 py-2.5 transition-all duration-75 overflow-hidden"
        style={{ cursor: locked ? 'not-allowed' : 'pointer', background: 'transparent' }}
        onMouseEnter={e => { if (!locked) (e.currentTarget as HTMLElement).style.background = `${dc}08`; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <div className="flex items-center gap-1.5 mb-0.5 overflow-hidden">
          {isBonus && (
            <span className="font-mono font-bold px-1.5 py-px flex-shrink-0"
              style={{ fontSize: 7, color: '#080808', background: '#E5B800', letterSpacing: '0.2em' }}>
              ★BONUS
            </span>
          )}
          <span className="font-mono font-bold flex-1 min-w-0 truncate block"
            style={{ fontSize: 13, color: locked ? 'rgba(255,255,255,0.2)' : cleared ? '#F2F0E8' : 'rgba(255,255,255,0.6)' }}>
            {timeLock ? '— — —' : song.title}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="font-mono" style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.15em' }}>DAY {song.day}</span>
          {!timeLock && <>
            <span className="font-mono" style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.15em' }}>{song.bpm}BPM</span>
            <span className="font-mono" style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.15em' }}>{song.notes.length}N</span>
          </>}
        </div>
      </div>

      {/* Right action area */}
      <div className="flex-shrink-0 flex flex-col items-end justify-center gap-1 px-2 py-1.5">
        {timeLock ? (
          <div className="font-mono font-bold"
            style={{ fontSize: 9, color: 'rgba(255,255,255,0.18)', letterSpacing: '0.2em', border: '1px solid rgba(255,255,255,0.1)', padding: '3px 8px' }}>
            ◷ {unlockLabel}
          </div>
        ) : locked ? (
          <div className="font-mono font-bold px-2 py-1"
            style={{ fontSize: 9, color: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.08)', letterSpacing: '0.2em' }}>
            🔒 LOCK
          </div>
        ) : (
          <>
            {cleared ? (
              <>
                <div className="font-mono font-bold px-2 py-0.5"
                  style={{ fontSize: 10, color: '#080808', background: mc, letterSpacing: '0.2em' }}>
                  {MEDAL_ABBR[medal]}
                </div>
                {score > 0 && (
                  <div className="font-mono" style={{ fontSize: 8, color: 'rgba(255,255,255,0.22)' }}>
                    {score.toLocaleString()}
                  </div>
                )}
              </>
            ) : (
              <button onClick={goToPlay}
                className="font-mono font-bold px-2.5 py-1 transition-all"
                style={{ fontSize: 9, color: dc, border: `1px solid ${dc}`, boxShadow: `2px 2px 0 ${dc}`, letterSpacing: '0.15em' }}>
                PLAY ▶
              </button>
            )}
            <button onClick={goToDetail}
              className="font-mono transition-all"
              style={{ fontSize: 7, color: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.08)', padding: '2px 6px', letterSpacing: '0.15em' }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = dc; el.style.borderColor = dc; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'rgba(255,255,255,0.25)'; el.style.borderColor = 'rgba(255,255,255,0.08)'; }}>
              STATS
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── main ─────────────────────────────────────────────────────────
export default function Chapter() {
  const { month } = useParams<{ month: string }>();
  const [, setLocation] = useLocation();
  const [songs, setSongs] = useState<GameSong[]>([]);
  const [loading, setLoading] = useState(true);

  const monthNum = parseInt(month ?? '1', 10);
  const meta     = CHAPTERS.find(c => c.month === monthNum) ?? CHAPTERS[0];
  const prev     = CHAPTERS.find(c => c.month === monthNum - 1);
  const next     = CHAPTERS.find(c => c.month === monthNum + 1);

  useEffect(() => {
    loadCatalog().then(catalog => {
      setSongs(catalog.filter(s => new Date(s.date).getMonth() + 1 === monthNum).sort((a, b) => a.day - b.day));
      setLoading(false);
    });
  }, [monthNum]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#080808' }}>
        <div className="font-mono text-xs tracking-widest animate-pulse" style={{ color: 'rgba(255,255,255,0.3)' }}>LOADING...</div>
      </div>
    );
  }

  const regularSongs  = songs.slice(0, -5);
  const bonusSongs    = songs.slice(-5);
  const platinums     = getChapterPlatinums(regularSongs.map(s => s.id));
  const bonusUnlocked = platinums >= meta.platNeeded;

  return (
    <div className="min-h-screen w-full" style={{ background: '#080808' }}>
      {/* Top nav */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3"
        style={{ background: '#080808', borderBottom: '2px solid rgba(255,255,255,0.08)' }}>
        <button onClick={() => setLocation('/campaign')}
          className="font-mono text-xs tracking-widest transition-all"
          style={{ color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.1)', padding: '4px 10px', boxShadow: '2px 2px 0 rgba(255,255,255,0.06)' }}
          onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = meta.dc; el.style.borderColor = meta.dc; el.style.boxShadow = `2px 2px 0 ${meta.dc}`; }}
          onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'rgba(255,255,255,0.35)'; el.style.borderColor = 'rgba(255,255,255,0.1)'; el.style.boxShadow = '2px 2px 0 rgba(255,255,255,0.06)'; }}>
          ← CAMPAIGN
        </button>
        <div className="font-mono font-bold text-xs tracking-[0.6em]" style={{ color: 'rgba(255,255,255,0.25)' }}>
          CH {String(meta.month).padStart(2, '0')}
        </div>
        <div className="flex gap-2">
          {prev && <button onClick={() => setLocation(`/chapter/${prev.month}`)} className="font-mono text-xs px-3 py-1" style={{ color: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.08)' }} onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = meta.dc)} onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.25)')}>‹</button>}
          {next && <button onClick={() => setLocation(`/chapter/${next.month}`)} className="font-mono text-xs px-3 py-1" style={{ color: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.08)' }} onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = meta.dc)} onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.25)')}>›</button>}
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-6">
        {/* Chapter header */}
        <div className="mb-4">
          {/* Title block */}
          <div className="flex items-baseline gap-3 mb-1">
            <h1 className="font-mono font-bold" style={{ fontSize: 'clamp(28px, 6vw, 40px)', color: '#F2F0E8', letterSpacing: '-0.01em' }}>
              {meta.name}
            </h1>
            <span className="font-mono font-bold px-2 py-0.5 text-xs"
              style={{ color: '#080808', background: meta.dc, letterSpacing: '0.2em', flexShrink: 0 }}>
              {meta.diff}
            </span>
          </div>
          <div className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.3)', letterSpacing: '0.3em' }}>
            {meta.sub}
          </div>

          {/* Platinum progress */}
          <div className="flex items-center gap-3 mt-3">
            <div className="flex-1 h-2" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ height: '100%', width: `${Math.min(100, (platinums / meta.platNeeded) * 100)}%`, background: bonusUnlocked ? '#E5B800' : 'rgba(229,184,0,0.5)', transition: 'width 0.8s ease' }} />
            </div>
            <div className="font-mono text-xs flex-shrink-0" style={{ color: bonusUnlocked ? '#E5B800' : 'rgba(255,255,255,0.3)', letterSpacing: '0.2em' }}>
              ✦ {platinums}/{meta.platNeeded} PT FOR BONUS
            </div>
          </div>
        </div>

        {/* Stage table */}
        <div style={{ border: '2px solid rgba(255,255,255,0.1)', boxShadow: '4px 4px 0 rgba(255,255,255,0.04)' }}>
          {/* Header */}
          <div className="flex items-center px-4 py-2"
            style={{ borderBottom: '2px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
            <div className="font-mono font-bold px-2 py-0.5 mr-3"
              style={{ fontSize: 9, color: '#080808', background: meta.dc, letterSpacing: '0.3em' }}>
              REGULAR STAGES
            </div>
            <div className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
              {regularSongs.length} TRACKS
            </div>
          </div>

          {regularSongs.map((song, i) => {
            const timeLocked = isSongTimeLocked(song);
            return <StageRow key={song.id} song={song} stageNum={i + 1} isBonus={false}
              locked={timeLocked} lockReason={timeLocked ? 'time' : undefined} dc={meta.dc} from={`chapter/${monthNum}`} />;
          })}

          {/* Bonus section */}
          {bonusSongs.length > 0 && (
            <>
              <div className="flex items-center px-4 py-2"
                style={{ borderTop: '2px solid rgba(255,255,255,0.08)', background: bonusUnlocked ? 'rgba(229,184,0,0.08)' : 'rgba(255,255,255,0.02)' }}>
                <div className="font-mono font-bold px-2 py-0.5 mr-3"
                  style={{ fontSize: 9, color: '#080808', background: bonusUnlocked ? '#E5B800' : 'rgba(255,255,255,0.15)', letterSpacing: '0.3em' }}>
                  {bonusUnlocked ? '★ BONUS STAGES' : '🔒 BONUS LOCKED'}
                </div>
                {!bonusUnlocked && (
                  <div className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
                    {meta.platNeeded - platinums} MORE PLATINUM TO UNLOCK
                  </div>
                )}
              </div>
              {bonusSongs.map((song, i) => {
                const timeLocked = isSongTimeLocked(song);
                const bonusLocked = !bonusUnlocked;
                const isLocked = timeLocked || bonusLocked;
                return <StageRow key={song.id} song={song} stageNum={regularSongs.length + i + 1} isBonus
                  locked={isLocked} lockReason={timeLocked ? 'time' : bonusLocked ? 'bonus' : undefined} dc="#E5B800" from={`chapter/${monthNum}`} />;
              })}
            </>
          )}
        </div>

        {/* Chapter navigation */}
        <div className="flex gap-2 mt-4">
          {prev && (
            <button onClick={() => setLocation(`/chapter/${prev.month}`)}
              className="flex-1 py-3 font-mono text-xs tracking-widest transition-all duration-75"
              style={{ border: '2px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.35)', background: 'transparent', boxShadow: '3px 3px 0 rgba(255,255,255,0.04)' }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = meta.dc; el.style.borderColor = meta.dc; el.style.boxShadow = `3px 3px 0 ${meta.dc}`; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'rgba(255,255,255,0.35)'; el.style.borderColor = 'rgba(255,255,255,0.1)'; el.style.boxShadow = '3px 3px 0 rgba(255,255,255,0.04)'; }}>
              ← {prev.name}
            </button>
          )}
          {next && (
            <button onClick={() => setLocation(`/chapter/${next.month}`)}
              className="flex-1 py-3 font-mono text-xs tracking-widest transition-all duration-75"
              style={{ border: '2px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.35)', background: 'transparent', boxShadow: '3px 3px 0 rgba(255,255,255,0.04)' }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = meta.dc; el.style.borderColor = meta.dc; el.style.boxShadow = `3px 3px 0 ${meta.dc}`; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'rgba(255,255,255,0.35)'; el.style.borderColor = 'rgba(255,255,255,0.1)'; el.style.boxShadow = '3px 3px 0 rgba(255,255,255,0.04)'; }}>
              {next.name} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
