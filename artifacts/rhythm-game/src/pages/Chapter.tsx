import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { loadCatalog } from "@/game/api";
import type { GameSong } from "@/game/api";
import { getMedalForSong, getChapterPlatinums, getHighScore } from "@/game/progress";

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

const MEDAL_COLOR: Record<string, string> = {
  PLATINUM: '#48E5C2', GOLD: '#E5B800', SILVER: '#A0AABB', BRONZE: '#C97A3A', NONE: '#333', '': '#1a1a1a',
};
const MEDAL_STARS: Record<string, number> = {
  PLATINUM: 5, GOLD: 4, SILVER: 3, BRONZE: 2, NONE: 1, '': 0,
};

function StarRow({ medal, size = 10 }: { medal: string; size?: number }) {
  const stars = MEDAL_STARS[medal] ?? 0;
  const color = MEDAL_COLOR[medal] ?? '#222';
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24"
          fill={i <= stars ? color : 'none'} stroke={i <= stars ? color : '#2a2a2a'} strokeWidth={1.5}>
          <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
        </svg>
      ))}
    </div>
  );
}

// ── Stage node (compact card in the trail) ───────────────────────
interface StageNodeProps {
  song: GameSong;
  stageNum: number;
  isBonus: boolean;
  locked: boolean;
  dc: string;
  isLast: boolean;
}

function StageNode({ song, stageNum, isBonus, locked, dc, isLast }: StageNodeProps) {
  const [, setLocation] = useLocation();
  const medal = getMedalForSong(song.id);
  const score = getHighScore(song.id);
  const mc    = MEDAL_COLOR[medal] ?? '#1a1a1a';
  const cleared = !!medal && medal !== '';

  return (
    <div className="relative flex items-stretch gap-3">
      {/* Timeline spine */}
      <div className="flex flex-col items-center flex-shrink-0" style={{ width: 36 }}>
        {/* Node circle */}
        <div className="relative z-10 flex items-center justify-center rounded-full flex-shrink-0"
          style={{
            width: 36, height: 36,
            background: locked ? '#0e0e18' : cleared ? `${mc}22` : `${dc}15`,
            border: `2px solid ${locked ? '#1e1e2a' : cleared ? mc : `${dc}60`}`,
            boxShadow: cleared && medal === 'PLATINUM' ? `0 0 12px ${mc}60` : 'none',
          }}>
          {locked
            ? <span style={{ fontSize: 14, color: '#2a2a3a' }}>🔒</span>
            : cleared
              ? <div className="w-2.5 h-2.5 rounded-full" style={{ background: mc, boxShadow: `0 0 6px ${mc}` }} />
              : <span className="font-mono text-xs font-bold" style={{ color: `${dc}80`, fontSize: 10 }}>{stageNum}</span>
          }
        </div>
        {/* Connecting line */}
        {!isLast && (
          <div className="flex-1 w-px mt-1" style={{ background: cleared ? `${mc}30` : 'rgba(255,255,255,0.05)', minHeight: 16 }} />
        )}
      </div>

      {/* Song card */}
      <div className="flex-1 mb-2">
        <button
          onClick={locked ? undefined : () => setLocation(`/play/${song.id}`)}
          disabled={locked}
          className="w-full text-left transition-all duration-200 border p-3"
          style={{
            borderColor: locked ? 'rgba(255,255,255,0.04)' : cleared ? `${mc}35` : `${dc}25`,
            background: locked ? 'rgba(255,255,255,0.015)' : cleared ? `${mc}06` : `${dc}04`,
            opacity: locked ? 0.5 : 1,
            cursor: locked ? 'not-allowed' : 'pointer',
            borderRadius: 6,
          }}
          onMouseEnter={e => { if (!locked) (e.currentTarget as HTMLElement).style.borderColor = locked ? '' : `${cleared ? mc : dc}70`; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = locked ? 'rgba(255,255,255,0.04)' : cleared ? `${mc}35` : `${dc}25`; }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                {isBonus && (
                  <span className="font-mono px-1 py-px" style={{ fontSize: 8, color: '#E5B800', border: '1px solid #E5B80050', background: '#E5B80010' }}>
                    ★ BONUS
                  </span>
                )}
                <span className="font-mono text-xs truncate font-bold" style={{ color: locked ? '#333' : cleared ? '#F2EDE5' : `${dc}CC` }}>
                  {song.title}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs" style={{ color: 'hsl(30 15% 35%)', fontSize: 10 }}>
                  DAY {song.day}
                </span>
                <span className="font-mono text-xs" style={{ color: 'hsl(30 15% 35%)', fontSize: 10 }}>
                  {song.bpm} BPM
                </span>
                <span className="font-mono text-xs" style={{ color: 'hsl(30 15% 35%)', fontSize: 10 }}>
                  {song.notes.length} NOTES
                </span>
              </div>
            </div>

            <div className="flex-shrink-0 text-right">
              {cleared ? (
                <>
                  <StarRow medal={medal} size={9} />
                  {score > 0 && (
                    <div className="font-mono text-xs mt-0.5" style={{ color: 'hsl(30 15% 40%)', fontSize: 9 }}>
                      {score.toLocaleString()}
                    </div>
                  )}
                </>
              ) : !locked ? (
                <div className="font-mono text-xs px-2 py-1 transition-colors"
                  style={{ color: dc, border: `1px solid ${dc}40`, background: `${dc}10`, fontSize: 9 }}>
                  PLAY ▶
                </div>
              ) : null}
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}

// ── main component ───────────────────────────────────────────────
export default function Chapter() {
  const { month } = useParams<{ month: string }>();
  const [, setLocation] = useLocation();
  const [songs, setSongs] = useState<GameSong[]>([]);
  const [loading, setLoading] = useState(true);

  const monthNum = parseInt(month ?? '1', 10);
  const meta     = CHAPTERS.find(c => c.month === monthNum) ?? CHAPTERS[0];

  useEffect(() => {
    loadCatalog().then(catalog => {
      const ms = catalog
        .filter(s => new Date(s.date).getMonth() + 1 === monthNum)
        .sort((a, b) => a.day - b.day);
      setSongs(ms);
      setLoading(false);
    });
  }, [monthNum]);

  if (loading) {
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

  const regularSongs  = songs.slice(0, -5);
  const bonusSongs    = songs.slice(-5);
  const regularIds    = regularSongs.map(s => s.id);
  const platinums     = getChapterPlatinums(regularIds);
  const bonusUnlocked = platinums >= meta.platNeeded;

  const prev = CHAPTERS.find(c => c.month === monthNum - 1);
  const next = CHAPTERS.find(c => c.month === monthNum + 1);

  return (
    <div className="min-h-screen w-full relative overflow-x-hidden"
      style={{ background: `radial-gradient(ellipse at 50% 0%, ${meta.dc}08 0%, hsl(15 30% 3%) 60%)` }}>
      {/* Subtle grid */}
      <div className="fixed inset-0 pointer-events-none"
        style={{ backgroundImage: `linear-gradient(${meta.dc}15 1px, transparent 1px), linear-gradient(90deg, ${meta.dc}08 1px, transparent 1px)`, backgroundSize: '60px 60px', opacity: 0.4 }} />

      {/* Header */}
      <div className="sticky top-0 z-20 px-4 py-3 flex items-center justify-between"
        style={{ background: 'rgba(5,3,13,0.92)', borderBottom: `1px solid ${meta.dc}20`, backdropFilter: 'blur(12px)' }}>
        <button onClick={() => setLocation('/campaign')}
          className="font-mono text-xs tracking-widest transition-colors"
          style={{ color: 'hsl(30 15% 35%)' }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = meta.dc)}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'hsl(30 15% 35%)')}>
          ← CAMPAIGN
        </button>
        <div className="font-mono text-xs tracking-[0.4em]" style={{ color: meta.dc }}>
          CH {String(meta.month).padStart(2, '0')}
        </div>
        <div className="flex gap-3">
          {prev && (
            <button onClick={() => setLocation(`/chapter/${prev.month}`)}
              className="font-mono text-xs transition-colors" style={{ color: 'hsl(30 15% 30%)' }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = meta.dc)}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'hsl(30 15% 30%)')}>‹</button>
          )}
          {next && (
            <button onClick={() => setLocation(`/chapter/${next.month}`)}
              className="font-mono text-xs transition-colors" style={{ color: 'hsl(30 15% 30%)' }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = meta.dc)}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'hsl(30 15% 30%)')}>›</button>
          )}
        </div>
      </div>

      <div className="relative z-10 max-w-xl mx-auto px-4 py-6">
        {/* ── Chapter header ── */}
        <div className="mb-6">
          <div className="flex items-baseline gap-3 mb-1">
            <h1 className="font-mono font-bold text-3xl" style={{ color: '#F2EDE5' }}>{meta.name}</h1>
            <span className="font-mono text-xs px-2 py-0.5"
              style={{ color: meta.dc, border: `1px solid ${meta.dc}40`, background: `${meta.dc}10` }}>
              {meta.diff}
            </span>
          </div>
          <div className="font-mono text-sm" style={{ color: 'hsl(30 15% 45%)' }}>{meta.sub}</div>

          {/* Progress */}
          <div className="mt-3 flex items-center gap-4">
            <div className="flex-1 h-1" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="h-full transition-all duration-700"
                style={{ width: `${regularIds.length > 0 ? (getChapterPlatinums(regularIds.slice(0, regularIds.length)) / regularIds.length) * 100 : 0}%`, background: `linear-gradient(90deg, ${meta.dc}70, ${meta.dc})` }} />
            </div>
            <div className="font-mono text-xs flex-shrink-0" style={{ color: 'hsl(30 15% 45%)' }}>
              ✦ {platinums} / {meta.platNeeded} PT for BONUS
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-4">
          <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${meta.dc}40, transparent)` }} />
          <span className="font-mono text-xs" style={{ color: 'hsl(30 15% 38%)' }}>REGULAR STAGES</span>
          <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, transparent, ${meta.dc}20)` }} />
        </div>

        {/* ── Regular stages ── */}
        <div>
          {regularSongs.map((song, i) => (
            <StageNode
              key={song.id}
              song={song}
              stageNum={i + 1}
              isBonus={false}
              locked={false}
              dc={meta.dc}
              isLast={i === regularSongs.length - 1 && bonusSongs.length === 0}
            />
          ))}
        </div>

        {/* ── Bonus stages ── */}
        {bonusSongs.length > 0 && (
          <>
            <div className="flex items-center gap-3 my-4">
              <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${bonusUnlocked ? '#E5B800' : '#333'}50, transparent)` }} />
              <div className="font-mono text-xs px-3 py-1 flex items-center gap-2"
                style={{
                  color: bonusUnlocked ? '#E5B800' : '#444',
                  border: `1px solid ${bonusUnlocked ? '#E5B80050' : '#2a2a2a'}`,
                  background: bonusUnlocked ? '#E5B80010' : 'transparent',
                }}>
                {bonusUnlocked ? '★ BONUS STAGES' : `🔒 BONUS — ${meta.platNeeded} PLATINUM TO UNLOCK`}
              </div>
              <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, transparent, ${bonusUnlocked ? '#E5B800' : '#333'}30)` }} />
            </div>

            <div>
              {bonusSongs.map((song, i) => (
                <StageNode
                  key={song.id}
                  song={song}
                  stageNum={regularSongs.length + i + 1}
                  isBonus={true}
                  locked={!bonusUnlocked}
                  dc="#E5B800"
                  isLast={i === bonusSongs.length - 1}
                />
              ))}
            </div>
          </>
        )}

        {/* Chapter nav */}
        <div className="flex gap-3 mt-8">
          {prev && (
            <button onClick={() => setLocation(`/chapter/${prev.month}`)}
              className="flex-1 py-3 font-mono text-xs tracking-widest border transition-all"
              style={{ borderColor: 'rgba(255,255,255,0.08)', color: 'hsl(30 15% 45%)', background: 'rgba(255,255,255,0.02)' }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = meta.dc + '50')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)')}>
              ← {prev.name}
            </button>
          )}
          {next && (
            <button onClick={() => setLocation(`/chapter/${next.month}`)}
              className="flex-1 py-3 font-mono text-xs tracking-widest border transition-all"
              style={{ borderColor: 'rgba(255,255,255,0.08)', color: 'hsl(30 15% 45%)', background: 'rgba(255,255,255,0.02)' }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = meta.dc + '50')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)')}>
              {next.name} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
