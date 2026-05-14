import { useLocation } from "wouter";
import { useState, useEffect, useMemo } from "react";
import { loadCatalog, getHighScore, isSongTimeLocked } from "@/game/api";
import type { GameSong } from "@/game/api";
import { audioManager } from "@/game/audio";

const LANE_COLORS = ['#FF5400', '#ACE894', '#E5B800', '#8B48E5'];

function DiffBars({ level }: { level: number }) {
  return (
    <div className="flex gap-px items-end" style={{ height: 14 }}>
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="rounded-sm"
          style={{
            width: 4,
            height: `${30 + i * 7}%`,
            background: i < level ? LANE_COLORS[Math.min(i, 3)] : 'rgba(255,255,255,0.07)',
            boxShadow: i < level ? `0 0 4px ${LANE_COLORS[Math.min(i, 3)]}40` : 'none',
          }}
        />
      ))}
    </div>
  );
}

function CoverArt({ src, title, mood }: { src: string | null; title: string; mood: 'light' | 'dark' }) {
  const [err, setErr] = useState(false);
  const moodColor = mood === 'light' ? '#ACE894' : '#FF5400';
  
  if (!src || err) {
    return (
      <div
        className="flex-shrink-0 flex items-center justify-center font-mono text-[10px] font-black rounded-lg relative overflow-hidden"
        style={{
          width: 56, height: 56,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: 'rgba(255,255,255,0.2)',
        }}
      >
        <div className="absolute inset-0 opacity-10" style={{ background: moodColor }} />
        {title.substring(0, 2).toUpperCase()}
      </div>
    );
  }
  return (
    <div className="relative group/cover flex-shrink-0">
      <img
        src={src}
        alt={title}
        onError={() => setErr(true)}
        className="object-cover rounded-lg transition-transform duration-500 group-hover/cover:scale-105"
        style={{ width: 56, height: 56, boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}
      />
      <div className="absolute inset-0 rounded-lg opacity-0 group-hover/cover:opacity-20 transition-opacity duration-300 pointer-events-none"
        style={{ background: `radial-gradient(circle at center, ${moodColor}, transparent)` }} />
    </div>
  );
}

function SongRow({ song, selected, onClick }: {
  song: GameSong;
  selected: boolean;
  onClick: () => void;
}) {
  const hs = getHighScore(song.id);
  const moodColor = song.mood === 'light' ? '#ACE894' : '#FF5400';
  const durMin = Math.floor(song.duration / 60);
  const durSec = String(Math.round(song.duration % 60)).padStart(2, '0');

  return (
    <button
      data-testid={`card-song-${song.id}`}
      onClick={onClick}
      className="w-full text-left flex items-center gap-4 px-3 py-3 transition-all duration-300 rounded-xl group"
      style={{
        background: selected ? 'rgba(255,255,255,0.05)' : 'transparent',
        borderLeft: `4px solid ${selected ? moodColor : 'transparent'}`,
        boxShadow: selected ? `0 10px 30px -10px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.05)` : 'none',
        marginBottom: 4,
      }}
    >
      <CoverArt src={song.coverArt} title={song.title} mood={song.mood} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="font-mono text-[9px] font-black tracking-widest"
            style={{ color: 'rgba(255,255,255,0.2)' }}
          >
            #{String(song.day).padStart(3, '0')}
          </span>
          <span className="pill-badge font-black text-[8px] py-0.5"
            style={{
              color: moodColor,
              border: `1px solid ${moodColor}30`,
              background: `${moodColor}05`,
              boxShadow: `0 0 10px ${moodColor}10`,
            }}
          >
            {song.mood}
          </span>
        </div>

        <div
          className="font-mono font-black text-sm truncate leading-tight uppercase tracking-tight"
          style={{ color: selected ? '#fff' : 'rgba(255,255,255,0.6)' }}
        >
          {song.title}
        </div>

        <div className="flex items-center gap-3 mt-1 opacity-40 group-hover:opacity-100 transition-opacity">
          <span className="font-mono text-[9px] font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {song.bpm} BPM
          </span>
          <span className="font-mono text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {durMin}:{durSec}
          </span>
          <DiffBars level={song.difficultyLevel} />
          {hs > 0 && (
            <span className="font-mono text-[10px] font-black ml-auto" style={{ color: '#ACE894', textShadow: '0 0 8px rgba(172,232,148,0.4)' }}>
              {hs.toLocaleString()}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export default function SongSelect() {
  const [, setLocation] = useLocation();
  const [songs, setSongs] = useState<GameSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<GameSong | null>(null);
  const [search, setSearch] = useState('');
  const [moodFilter, setMoodFilter] = useState<'all' | 'light' | 'dark'>('all');
  const [sortBy, setSortBy] = useState<'day' | 'bpm'>('day');
  const [showCount, setShowCount] = useState(50);

  useEffect(() => {
    audioManager.loadSfx("back");
    loadCatalog().then((catalog) => {
      const released = catalog.filter(s => !isSongTimeLocked(s)).sort((a, b) => a.day - b.day);
      setSongs(released);
      if (released.length > 0) setSelected(released[released.length - 1]); // default to most recent
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    let list = songs;
    if (moodFilter !== 'all') list = list.filter((s) => s.mood === moodFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.title.toLowerCase().includes(q) || String(s.day).includes(q));
    }
    if (sortBy === 'bpm') list = [...list].sort((a, b) => b.bpm - a.bpm);
    return list;
  }, [songs, moodFilter, search, sortBy]);

  const visible = filtered.slice(0, showCount);

  return (
    <div className="min-h-dvh w-full flex flex-col" style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 10%, #0e1028 0%, #080808 50%)' }}>
      {/* Header */}
      <header
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(8,8,12,0.7)', backdropFilter: 'blur(16px)' }}
      >
        <button
          data-testid="button-back"
          onClick={() => {
            audioManager.playSfx("back", 0.5);
            setLocation("/");
          }}
          className="neon-btn-outline text-xs px-3 py-1.5 tracking-widest"
        >
          ← BACK
        </button>
        <div className="font-mono text-xs tracking-widest" style={{ color: '#ACE894', textShadow: '0 0 8px rgba(172,232,148,0.3)' }}>
          {loading ? 'LOADING TRANSMISSIONS...' : `${songs.length} TRANSMISSIONS`}
        </div>
        <div className="font-mono text-xs" style={{ color: 'hsl(30 15% 35%)' }}>
          TH3SCR1B3
        </div>
      </header>

      <div className="flex-1 flex overflow-visible lg:overflow-hidden">
        {/* Left: Song list */}
        <div className="flex flex-col w-full lg:w-1/2 lg:overflow-hidden border-r" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          {/* Search + filters */}
          <div className="flex-shrink-0 p-4 space-y-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)' }}>
            <div className="relative group">
              <input
                data-testid="input-search"
                type="text"
                placeholder="SEARCH ARCHIVES..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setShowCount(50); }}
                className="w-full font-mono text-xs tracking-widest px-10 py-3 outline-none rounded-xl transition-all duration-300"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#F2EDE5',
                }}
                onFocus={(e) => { 
                  (e.target as HTMLElement).style.borderColor = 'rgba(255,84,0,0.5)'; 
                  (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
                  (e.target as HTMLElement).style.boxShadow = '0 0 20px rgba(255,84,0,0.1)'; 
                }}
                onBlur={(e) => { 
                  (e.target as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)'; 
                  (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.03)';
                  (e.target as HTMLElement).style.boxShadow = 'none'; 
                }}
              />
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 opacity-30 group-focus-within:opacity-60 transition-opacity">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </div>
            </div>

            <div className="flex gap-2 items-center">
              {(['all', 'light', 'dark'] as const).map((m) => (
                <button
                  key={m}
                  data-testid={`filter-mood-${m}`}
                  onClick={() => { setMoodFilter(m); setShowCount(50); }}
                  className="font-mono text-[10px] font-bold px-4 py-2 tracking-widest transition-all duration-200 rounded-full uppercase"
                  style={{
                    background: moodFilter === m ? 'linear-gradient(135deg, #FF5400, #FF8A00)' : 'rgba(255,255,255,0.04)',
                    color: moodFilter === m ? '#fff' : 'rgba(255,255,255,0.4)',
                    border: `1px solid ${moodFilter === m ? 'transparent' : 'rgba(255,255,255,0.08)'}`,
                    boxShadow: moodFilter === m ? '0 5px 15px rgba(255,84,0,0.25)' : 'none',
                  }}
                >
                  {m}
                </button>
              ))}
              <div className="flex-1" />
              <button
                data-testid="sort-bpm"
                onClick={() => setSortBy(sortBy === 'day' ? 'bpm' : 'day')}
                className="font-mono text-[10px] font-bold px-3 py-2 tracking-widest rounded-full transition-all duration-200 uppercase"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  color: 'rgba(255,255,255,0.4)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.2)'; (e.currentTarget as HTMLElement).style.color = '#fff'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.4)'; }}
              >
                ↕ {sortBy === 'day' ? 'CHRONO' : 'BPM'}
              </button>
            </div>
            {!loading && (
              <div className="font-mono text-[9px] font-bold tracking-[0.2em] opacity-30 uppercase">
                {filtered.length} FRAGMENTS RECOVERED
              </div>
            )}
          </div>

          {/* Song list */}
          <div className="flex-1 overflow-y-auto px-2 py-2 scroll-smooth">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-48 gap-4">
                <div className="font-mono text-[10px] font-bold tracking-[0.4em] text-glow uppercase" style={{ color: '#FF5400' }}>
                  SYNCHRONIZING ARCHIVES...
                </div>
                <div className="flex gap-2">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full animate-pulse"
                      style={{
                        background: LANE_COLORS[i],
                        animationDelay: `${i * 0.15}s`,
                        boxShadow: `0 0 10px ${LANE_COLORS[i]}`
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                {visible.map((song) => (
                  <SongRow
                    key={song.id}
                    song={song}
                    selected={selected?.id === song.id}
                    onClick={() => setLocation(`/song/${song.id}?from=songs`)}
                  />
                ))}
                {showCount < filtered.length && (
                  <button
                    data-testid="button-load-more"
                    onClick={() => setShowCount((n) => n + 50)}
                    className="w-full py-5 font-mono text-[10px] font-bold tracking-[0.3em] transition-all rounded-xl mt-4 uppercase glass-panel"
                    style={{
                      color: 'rgba(255,255,255,0.4)',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#ACE894'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(172,232,148,0.3)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.4)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)'; }}
                  >
                    LOAD MORE ({filtered.length - showCount} REMAINING)
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Detail panel */}
        <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-10 bg-[rgba(255,255,255,0.01)]">
          {selected ? (
            <div className="fade-in-up">
              <div>
                {/* Cover art with floating effect */}
                <div className="mb-8 relative group max-w-xs">
                  {selected.coverArt ? (
                    <div className="relative overflow-hidden rounded-2xl">
                      <img
                        src={selected.coverArt}
                        alt={selected.title}
                        className="w-64 h-64 object-cover transition-transform duration-700 group-hover:scale-110"
                        style={{ boxShadow: `0 20px 40px rgba(0,0,0,0.6), 0 0 30px ${selected.mood === 'light' ? 'rgba(172,232,148,0.15)' : 'rgba(255,84,0,0.15)'}` }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    </div>
                  ) : (
                    <div
                      className="w-64 h-64 flex items-center justify-center font-mono font-black text-6xl rounded-2xl glass-card"
                      style={{ color: 'rgba(255,255,255,0.05)' }}
                    >
                      {selected.day}
                    </div>
                  )}
                  <div className="absolute -top-3 -left-3 pill-badge font-black text-[11px]"
                    style={{
                      background: selected.mood === 'light' ? '#ACE894' : '#FF5400',
                      color: '#000',
                      boxShadow: `0 10px 20px -5px ${selected.mood === 'light' ? 'rgba(172,232,148,0.5)' : 'rgba(255,84,0,0.5)'}`
                    }}
                  >
                    DAY {selected.day}
                  </div>
                </div>

                <div className="font-mono text-[10px] font-bold mb-2 tracking-[0.2em] uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {selected.date} // {selected.key || 'UNKNOWN KEY'}
                </div>

                <h2
                  className="font-mono font-black mb-2 leading-[1.1] text-glow uppercase"
                  style={{ fontSize: 'clamp(28px, 4vw, 44px)', color: '#F2F0E8', letterSpacing: '-0.02em' }}
                >
                  {selected.title}
                </h2>

                <div className="font-mono font-bold text-base mb-6 tracking-[0.1em]" style={{ color: selected.mood === 'light' ? '#ACE894' : '#FF5400' }}>
                  {selected.artist}
                </div>

                {selected.description && (
                  <p className="text-sm leading-relaxed mb-6 font-medium italic" style={{ color: 'rgba(255,255,255,0.4)', maxWidth: 400 }}>
                    "{selected.description}"
                  </p>
                )}

                {selected.moodTags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-8">
                    {selected.moodTags.map((tag) => (
                      <span key={tag} className="pill-badge font-bold text-[9px]"
                        style={{
                          border: '1px solid rgba(255,255,255,0.08)',
                          color: 'rgba(255,255,255,0.5)',
                          background: 'rgba(255,255,255,0.03)',
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-4 gap-3 mb-8">
                  {[
                    { label: 'BPM', value: selected.bpm },
                    { label: 'NODES', value: selected.notes.length },
                    {
                      label: 'DUR',
                      value: `${Math.floor(selected.duration / 60)}:${String(Math.round(selected.duration % 60)).padStart(2, '0')}`,
                    },
                    { label: 'VAL', value: `${Math.round(selected.valence * 100)}%` },
                  ].map(({ label, value }) => (
                    <div key={label} className="glass-panel p-3 text-center">
                      <div className="font-mono text-[9px] font-bold mb-1 tracking-wider uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>{label}</div>
                      <div className="font-mono font-black text-lg" style={{ color: '#F2F0E8' }}>{value}</div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-6">
                  <div className="flex-1">
                    <div className="font-mono text-[9px] font-bold mb-2 tracking-wider uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>THREAT LEVEL</div>
                    <DiffBars level={selected.difficultyLevel} />
                  </div>
                  {getHighScore(selected.id) > 0 && (
                    <div className="text-right">
                      <div className="font-mono text-[9px] font-bold mb-1 tracking-wider uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>MAX SCORE</div>
                      <div className="font-mono font-black text-xl text-glow" style={{ color: '#ACE894' }}>
                        {getHighScore(selected.id).toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-3 mt-12">
                <button
                  data-testid="button-play"
                  onClick={() => {
                    sessionStorage.setItem(`game_origin_${selected.id}`, 'songs');
                    sessionStorage.setItem(`diff_override_${selected.id}`, String(selected.difficultyLevel));
                    setLocation(`/play/${selected.id}`);
                  }}
                  className="neon-btn w-full py-6 text-base tracking-[0.5em] font-black uppercase"
                >
                  ▶ INITIATE TRANSMISSION
                </button>
                <button
                  onClick={() => setLocation(`/song/${selected.id}?from=songs`)}
                  className="neon-btn-outline w-full py-4 text-[10px] font-bold tracking-[0.3em] uppercase"
                >
                  ◆ ANALYSIS &amp; CALIBRATION
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4 opacity-20">
              <div className="w-12 h-12 border-2 border-dashed border-white/20 rounded-full animate-[spin_10s_linear_infinite]" />
              <div className="font-mono text-[10px] font-bold tracking-[0.4em] uppercase">
                SELECT A SIGNAL TO DECODE
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile play button */}
      {selected && (
        <div
          className="lg:hidden flex-shrink-0 p-4 border-t"
          style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(8,8,12,0.7)', backdropFilter: 'blur(12px)' }}
        >
          <div className="flex gap-2">
            <button
              data-testid="button-play-mobile"
              onClick={() => {
                sessionStorage.setItem(`game_origin_${selected.id}`, 'songs');
                sessionStorage.setItem(`diff_override_${selected.id}`, String(selected.difficultyLevel));
                setLocation(`/play/${selected.id}`);
              }}
              className="neon-btn flex-1 py-4 text-sm tracking-[0.3em]"
            >
              ▶ START: {selected.title.substring(0, 16)}
            </button>
            <button
              onClick={() => setLocation(`/song/${selected.id}?from=songs`)}
              className="neon-btn-outline py-4 px-4 text-xs tracking-widest"
            >
              STATS
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
