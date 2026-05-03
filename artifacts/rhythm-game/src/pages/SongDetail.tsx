import { useParams, useLocation, useSearch } from "wouter";
import { useState, useEffect } from "react";
import { getSongById } from "@/game/api";
import type { GameSong } from "@/game/api";
import { getMedalForSong, getHighScore, getScoreHistory } from "@/game/progress";

const MEDAL_COLOR: Record<string, string> = {
  PLATINUM: '#48E5C2', GOLD: '#E5B800', SILVER: '#A0AABB', BRONZE: '#C97A3A', NONE: '#444', '': '#1a1a1a',
};

const DIFF_COLORS = [
  '#48E5C2','#48E5C2','#48E5C2',
  '#A855F7','#A855F7','#A855F7',
  '#E5B800','#E5B800','#E5B800',
  '#E53A00',
];

function DiffBars({ level }: { level: number }) {
  return (
    <div className="flex gap-px items-end" style={{ height: 18 }}>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} style={{
          width: 6, height: `${30 + i * 7}%`,
          background: i < level ? DIFF_COLORS[i] : 'rgba(255,255,255,0.07)',
        }} />
      ))}
    </div>
  );
}

export default function SongDetail() {
  const { songId } = useParams<{ songId: string }>();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const from = new URLSearchParams(search).get('from') ?? 'campaign';
  const isFromFreePlay = from === 'songs';
  const backRoute = from === 'songs' ? '/songs' : `/${from}`;

  const [song, setSong] = useState<GameSong | null>(null);
  const [loading, setLoading] = useState(true);
  const [diffOverride, setDiffOverride] = useState<number>(5);
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    if (!songId) { setLocation('/campaign'); return; }
    getSongById(songId)
      .then(s => {
        if (!s) { setLocation(backRoute); return; }
        setSong(s);
        setDiffOverride(s.difficultyLevel);
        setHistory(getScoreHistory(songId));
        setLoading(false);
      })
      .catch(() => setLocation(backRoute));
  }, [songId]);

  const handlePlay = () => {
    if (!songId) return;
    sessionStorage.setItem(`game_origin_${songId}`, from);
    sessionStorage.setItem(`diff_override_${songId}`, String(diffOverride));
    setLocation(`/play/${songId}`);
  };

  const medal = song ? getMedalForSong(song.id) : '';
  const mc = MEDAL_COLOR[medal] ?? '#444';
  const hs = song ? getHighScore(song.id) : 0;
  const durMin = song ? Math.floor(song.duration / 60) : 0;
  const durSec = song ? String(Math.round(song.duration % 60)).padStart(2, '0') : '00';
  const diffColor = DIFF_COLORS[Math.min(diffOverride - 1, 9)];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#080808' }}>
        <div className="font-mono text-xs tracking-widest animate-pulse" style={{ color: 'rgba(255,255,255,0.3)' }}>
          LOADING TRANSMISSION...
        </div>
      </div>
    );
  }

  if (!song) return null;

  const moodColor = song.mood === 'light' ? '#48E5C2' : '#E53A00';
  const bestScore = history.length > 0 ? Math.max(...history) : 0;

  return (
    <div className="min-h-screen w-full" style={{ background: '#080808' }}>
      {/* Header */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3"
        style={{ background: '#080808', borderBottom: '2px solid rgba(255,255,255,0.08)' }}>
        <button onClick={() => setLocation(backRoute)}
          className="font-mono text-xs tracking-widest transition-all"
          style={{ color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.1)', padding: '4px 10px', boxShadow: '2px 2px 0 rgba(255,255,255,0.06)' }}
          onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = '#E53A00'; el.style.borderColor = '#E53A00'; el.style.boxShadow = '2px 2px 0 #E53A00'; }}
          onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'rgba(255,255,255,0.35)'; el.style.borderColor = 'rgba(255,255,255,0.1)'; el.style.boxShadow = '2px 2px 0 rgba(255,255,255,0.06)'; }}>
          ← {isFromFreePlay ? 'FREE PLAY' : 'CHAPTER'}
        </button>
        <div className="font-mono font-bold text-xs tracking-[0.4em]" style={{ color: 'rgba(255,255,255,0.2)' }}>
          DAY {String(song.day).padStart(3, '0')}
        </div>
        <div className="font-mono text-xs tracking-widest" style={{ color: 'rgba(255,255,255,0.15)' }}>TH3SCR1B3</div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-6 space-y-5">
        {/* Song hero */}
        <div className="flex gap-4">
          {song.coverArt ? (
            <img src={song.coverArt} alt={song.title}
              className="flex-shrink-0 object-cover"
              style={{ width: 96, height: 96, border: '1px solid rgba(255,255,255,0.1)' }} />
          ) : (
            <div className="flex-shrink-0 flex items-center justify-center font-mono font-bold text-2xl"
              style={{ width: 96, height: 96, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.15)' }}>
              {song.day}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="font-mono text-xs px-1.5 py-px font-bold flex-shrink-0"
                style={{ background: moodColor, color: '#000', letterSpacing: '0.15em' }}>
                {song.mood.toUpperCase()}
              </span>
              {medal && medal !== '' && (
                <span className="font-mono text-xs px-1.5 py-px font-bold flex-shrink-0"
                  style={{ background: mc, color: '#080808', letterSpacing: '0.15em' }}>
                  {medal}
                </span>
              )}
            </div>
            <h1 className="font-mono font-bold leading-tight mb-1"
              style={{ fontSize: 'clamp(15px, 4vw, 20px)', color: '#F2F0E8' }}>
              {song.title}
            </h1>
            <div className="font-mono text-xs truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {song.artist}
            </div>
            <div className="font-mono text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.2)' }}>
              {song.date}{song.key ? ` · ${song.key}` : ''}
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { label: 'BPM', value: song.bpm },
            { label: 'NOTES', value: song.notes.length },
            { label: 'LENGTH', value: `${durMin}:${durSec}` },
            { label: 'DIFF', value: song.difficultyLevel },
          ].map(({ label, value }) => (
            <div key={label} className="px-2 py-2"
              style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
              <div className="font-mono mb-0.5" style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.2em' }}>{label}</div>
              <div className="font-mono font-bold text-sm" style={{ color: '#F2F0E8' }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Best score banner */}
        {hs > 0 && (
          <div className="flex items-center gap-3 px-3 py-2"
            style={{ border: `1px solid ${mc}40`, background: `${mc}0C` }}>
            <div className="font-mono" style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.25em' }}>BEST SCORE</div>
            <div className="font-mono font-bold text-base ml-auto" style={{ color: mc }}>{hs.toLocaleString()}</div>
          </div>
        )}

        {/* Difficulty override — free play only */}
        {isFromFreePlay && (
          <div style={{ border: '1px solid rgba(255,255,255,0.08)', padding: '14px 16px' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="font-mono" style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.3em' }}>
                DIFFICULTY OVERRIDE
              </div>
              <div className="font-mono font-bold text-sm" style={{ color: diffColor }}>
                LVL {diffOverride}
              </div>
            </div>
            <DiffBars level={diffOverride} />
            <input
              type="range" min={1} max={10} value={diffOverride}
              onChange={e => setDiffOverride(parseInt(e.target.value, 10))}
              className="w-full mt-3"
              style={{ accentColor: diffColor, cursor: 'pointer' }}
            />
            <div className="flex justify-between mt-1">
              <span className="font-mono" style={{ fontSize: 8, color: '#48E5C2', letterSpacing: '0.15em' }}>EASY</span>
              <span className="font-mono" style={{ fontSize: 8, color: '#E53A00', letterSpacing: '0.15em' }}>BRUTAL</span>
            </div>
          </div>
        )}

        {/* Track stats / score history */}
        <div>
          <div className="font-mono flex items-center gap-3 mb-3 pb-2"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.3em' }}>
              TRACK STATS
            </span>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.12)', letterSpacing: '0.2em' }}>
              LAST {Math.min(10, history.length)} PLAYS
            </span>
          </div>

          {history.length === 0 ? (
            <div className="font-mono text-center py-8"
              style={{ fontSize: 10, color: 'rgba(255,255,255,0.12)', letterSpacing: '0.3em' }}>
              NO PLAYS RECORDED
            </div>
          ) : (
            <div className="space-y-1">
              {history.map((score, i) => {
                const isTop = score === bestScore && i === history.indexOf(bestScore);
                const pct = bestScore > 0 ? score / bestScore : 1;
                return (
                  <div key={i} className="flex items-center gap-3 px-2 py-1.5"
                    style={{
                      background: isTop ? 'rgba(229,184,0,0.05)' : 'transparent',
                      border: isTop ? '1px solid rgba(229,184,0,0.15)' : '1px solid transparent',
                    }}>
                    <div className="font-mono flex-shrink-0"
                      style={{ fontSize: 9, color: isTop ? '#E5B800' : 'rgba(255,255,255,0.2)', width: 22, letterSpacing: '0.1em' }}>
                      {isTop ? '★' : `#${i + 1}`}
                    </div>
                    <div className="flex-1 h-px relative" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <div style={{
                        height: 2, marginTop: -0.5,
                        width: `${pct * 100}%`,
                        background: isTop ? '#E5B800' : 'rgba(255,255,255,0.18)',
                        transition: 'width 0.5s ease',
                      }} />
                    </div>
                    <div className="font-mono font-bold flex-shrink-0"
                      style={{ fontSize: 11, color: isTop ? '#F2F0E8' : 'rgba(255,255,255,0.45)', minWidth: 76, textAlign: 'right' }}>
                      {score.toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Mood tags */}
        {song.moodTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {song.moodTags.map(tag => (
              <span key={tag} className="font-mono px-2 py-0.5"
                style={{ fontSize: 9, border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.02)', letterSpacing: '0.15em' }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Play button */}
        <div className="pb-4">
          <button onClick={handlePlay}
            className="w-full py-5 font-mono font-bold text-sm tracking-[0.4em] uppercase transition-all duration-200"
            style={{
              background: '#E53A00', color: '#fff',
              clipPath: 'polygon(12px 0%, 100% 0%, calc(100% - 12px) 100%, 0% 100%)',
              boxShadow: '0 0 40px rgba(229,58,0,0.3)',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.boxShadow = '0 0 60px rgba(229,58,0,0.6)')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.boxShadow = '0 0 40px rgba(229,58,0,0.3)')}>
            ▶ START TRANSMISSION{isFromFreePlay ? ` · LVL ${diffOverride}` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
