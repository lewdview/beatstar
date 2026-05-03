import { useLocation } from "wouter";
import { useState, useEffect, useMemo } from "react";
import { loadCatalog, getHighScore, isSongTimeLocked } from "@/game/api";
import type { GameSong } from "@/game/api";

const LANE_COLORS = ['#E53A00', '#48E5C2', '#E5B800', '#8B48E5'];

function DiffBars({ level }: { level: number }) {
  return (
    <div className="flex gap-px items-end" style={{ height: 14 }}>
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 4,
            height: `${30 + i * 7}%`,
            background: i < level ? LANE_COLORS[Math.min(i, 3)] : 'rgba(255,255,255,0.07)',
          }}
        />
      ))}
    </div>
  );
}

function CoverArt({ src, title }: { src: string | null; title: string }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div
        className="flex-shrink-0 flex items-center justify-center font-mono text-xs font-bold"
        style={{
          width: 56, height: 56,
          background: 'hsl(18 35% 8%)',
          border: '1px solid hsl(20 25% 14%)',
          color: 'hsl(30 15% 35%)',
        }}
      >
        {title.substring(0, 2).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={title}
      onError={() => setErr(true)}
      className="flex-shrink-0 object-cover"
      style={{ width: 56, height: 56 }}
    />
  );
}

function SongRow({ song, selected, onClick }: {
  song: GameSong;
  selected: boolean;
  onClick: () => void;
}) {
  const hs = getHighScore(song.id);
  const moodColor = song.mood === 'light' ? '#48E5C2' : '#E53A00';
  const durMin = Math.floor(song.duration / 60);
  const durSec = String(Math.round(song.duration % 60)).padStart(2, '0');

  return (
    <button
      data-testid={`card-song-${song.id}`}
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 px-3 py-2 transition-all duration-150"
      style={{
        background: selected ? 'hsl(18 35% 8%)' : 'transparent',
        borderLeft: `2px solid ${selected ? moodColor : 'transparent'}`,
        borderBottom: '1px solid hsl(20 25% 8%)',
      }}
    >
      <CoverArt src={song.coverArt} title={song.title} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className="font-mono text-xs font-bold"
            style={{ color: 'hsl(30 15% 35%)' }}
          >
            {String(song.day).padStart(3, '0')}
          </span>
          <span
            className="font-mono text-xs px-1.5 py-px"
            style={{
              color: moodColor,
              border: `1px solid ${moodColor}40`,
              background: `${moodColor}10`,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            {song.mood}
          </span>
        </div>

        <div
          className="font-mono font-bold text-sm truncate leading-tight"
          style={{ color: selected ? '#F2EDE5' : 'hsl(30 20% 75%)' }}
        >
          {song.title}
        </div>

        <div className="flex items-center gap-3 mt-0.5">
          <span className="font-mono text-xs" style={{ color: 'hsl(30 15% 40%)' }}>
            {song.bpm} BPM
          </span>
          <span className="font-mono text-xs" style={{ color: 'hsl(30 15% 35%)' }}>
            {durMin}:{durSec}
          </span>
          {song.key && (
            <span className="font-mono text-xs" style={{ color: 'hsl(30 15% 30%)' }}>
              {song.key}
            </span>
          )}
          <DiffBars level={song.difficultyLevel} />
          {hs > 0 && (
            <span className="font-mono text-xs ml-auto" style={{ color: '#48E5C2' }}>
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
    <div className="min-h-screen w-full flex flex-col" style={{ background: 'hsl(15 40% 4%)' }}>
      {/* Header */}
      <header
        className="flex items-center justify-between px-4 py-3 flex-shrink-0 border-b"
        style={{ borderColor: 'hsl(20 25% 10%)' }}
      >
        <button
          data-testid="button-back"
          onClick={() => setLocation('/')}
          className="font-mono text-xs tracking-widest transition-colors"
          style={{ color: 'hsl(30 15% 45%)' }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#E53A00')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'hsl(30 15% 45%)')}
        >
          ← BACK
        </button>
        <div className="font-mono text-xs tracking-widest" style={{ color: 'hsl(168 72% 59%)' }}>
          {loading ? 'LOADING TRANSMISSIONS...' : `${songs.length} TRANSMISSIONS`}
        </div>
        <div className="font-mono text-xs" style={{ color: 'hsl(30 15% 35%)' }}>
          TH3SCR1B3
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Song list */}
        <div className="flex flex-col w-full lg:w-1/2 overflow-hidden border-r" style={{ borderColor: 'hsl(20 25% 10%)' }}>
          {/* Search + filters */}
          <div className="flex-shrink-0 p-3 space-y-2 border-b" style={{ borderColor: 'hsl(20 25% 10%)' }}>
            <input
              data-testid="input-search"
              type="text"
              placeholder="SEARCH TRANSMISSIONS..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setShowCount(50); }}
              className="w-full font-mono text-xs tracking-widest px-3 py-2 outline-none"
              style={{
                background: 'hsl(18 35% 6%)',
                border: '1px solid hsl(20 25% 14%)',
                color: '#F2EDE5',
              }}
            />
            <div className="flex gap-2">
              {(['all', 'light', 'dark'] as const).map((m) => (
                <button
                  key={m}
                  data-testid={`filter-mood-${m}`}
                  onClick={() => { setMoodFilter(m); setShowCount(50); }}
                  className="font-mono text-xs px-3 py-1 tracking-widest transition-all"
                  style={{
                    background: moodFilter === m ? 'hsl(14 100% 48%)' : 'hsl(18 35% 7%)',
                    color: moodFilter === m ? '#fff' : 'hsl(30 15% 50%)',
                    border: `1px solid ${moodFilter === m ? 'transparent' : 'hsl(20 25% 12%)'}`,
                  }}
                >
                  {m.toUpperCase()}
                </button>
              ))}
              <div className="flex-1" />
              <button
                data-testid="sort-bpm"
                onClick={() => setSortBy(sortBy === 'day' ? 'bpm' : 'day')}
                className="font-mono text-xs px-3 py-1 tracking-widest"
                style={{
                  background: 'hsl(18 35% 7%)',
                  color: 'hsl(30 15% 50%)',
                  border: '1px solid hsl(20 25% 12%)',
                }}
              >
                ↕ {sortBy === 'day' ? 'DAY' : 'BPM'}
              </button>
            </div>
            {!loading && (
              <div className="font-mono text-xs" style={{ color: 'hsl(30 15% 35%)' }}>
                {filtered.length} RESULTS
              </div>
            )}
          </div>

          {/* Song list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-48 gap-3">
                <div className="font-mono text-xs tracking-widest" style={{ color: 'hsl(30 15% 40%)' }}>
                  RECEIVING SIGNAL...
                </div>
                <div className="flex gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full animate-pulse"
                      style={{
                        background: LANE_COLORS[i],
                        animationDelay: `${i * 0.15}s`,
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <>
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
                    className="w-full py-4 font-mono text-xs tracking-widest border-t transition-colors"
                    style={{
                      borderColor: 'hsl(20 25% 10%)',
                      color: 'hsl(30 15% 45%)',
                      background: 'transparent',
                    }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#E53A00')}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'hsl(30 15% 45%)')}
                  >
                    LOAD MORE ({filtered.length - showCount} remaining)
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right: Detail panel */}
        <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-8">
          {selected ? (
            <>
              <div>
                {/* Cover art */}
                <div className="mb-6 relative">
                  {selected.coverArt ? (
                    <img
                      src={selected.coverArt}
                      alt={selected.title}
                      className="w-48 h-48 object-cover"
                      style={{ border: '1px solid hsl(20 25% 14%)' }}
                    />
                  ) : (
                    <div
                      className="w-48 h-48 flex items-center justify-center font-mono font-bold text-4xl"
                      style={{ background: 'hsl(18 35% 7%)', border: '1px solid hsl(20 25% 14%)', color: 'hsl(30 15% 25%)' }}
                    >
                      {selected.day}
                    </div>
                  )}
                  <div
                    className="absolute top-2 left-2 font-mono text-xs px-2 py-0.5 font-bold"
                    style={{
                      background: selected.mood === 'light' ? '#48E5C2' : '#E53A00',
                      color: '#000',
                    }}
                  >
                    DAY {selected.day}
                  </div>
                </div>

                <div className="font-mono text-xs mb-1" style={{ color: 'hsl(30 15% 45%)' }}>
                  {selected.date} · {selected.key}
                </div>

                <h2
                  className="font-mono font-bold mb-2 leading-tight"
                  style={{ fontSize: 'clamp(20px, 3vw, 32px)', color: '#F2EDE5' }}
                >
                  {selected.title}
                </h2>

                <div className="font-mono text-sm mb-4" style={{ color: 'hsl(30 15% 50%)' }}>
                  {selected.artist}
                </div>

                {selected.description && (
                  <p className="text-sm leading-relaxed mb-4" style={{ color: 'hsl(30 15% 50%)', maxWidth: 340 }}>
                    {selected.description}
                  </p>
                )}

                {selected.moodTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {selected.moodTags.map((tag) => (
                      <span
                        key={tag}
                        className="font-mono text-xs px-2 py-0.5"
                        style={{
                          border: '1px solid hsl(20 25% 14%)',
                          color: 'hsl(30 15% 50%)',
                          background: 'hsl(18 35% 6%)',
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-4 gap-2 mb-6">
                  {[
                    { label: 'BPM', value: selected.bpm },
                    { label: 'NOTES', value: selected.notes.length },
                    {
                      label: 'LENGTH',
                      value: `${Math.floor(selected.duration / 60)}:${String(Math.round(selected.duration % 60)).padStart(2, '0')}`,
                    },
                    { label: 'VALENCE', value: `${Math.round(selected.valence * 100)}%` },
                  ].map(({ label, value }) => (
                    <div key={label} className="border p-2" style={{ borderColor: 'hsl(20 25% 12%)' }}>
                      <div className="font-mono text-xs mb-0.5" style={{ color: 'hsl(30 15% 40%)' }}>{label}</div>
                      <div className="font-mono font-bold text-base" style={{ color: '#F2EDE5' }}>{value}</div>
                    </div>
                  ))}
                </div>

                <DiffBars level={selected.difficultyLevel} />
                {getHighScore(selected.id) > 0 && (
                  <div className="font-mono text-sm mt-2" style={{ color: '#48E5C2' }}>
                    BEST: {getHighScore(selected.id).toLocaleString()}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 mt-6">
                <button
                  data-testid="button-play"
                  onClick={() => {
                    sessionStorage.setItem(`game_origin_${selected.id}`, 'songs');
                    sessionStorage.setItem(`diff_override_${selected.id}`, String(selected.difficultyLevel));
                    setLocation(`/play/${selected.id}`);
                  }}
                  className="w-full py-5 font-mono font-bold text-sm tracking-[0.4em] uppercase transition-all duration-200"
                  style={{
                    background: 'hsl(14 100% 48%)',
                    color: '#fff',
                    clipPath: 'polygon(12px 0%, 100% 0%, calc(100% - 12px) 100%, 0% 100%)',
                    boxShadow: '0 0 40px rgba(229,58,0,0.3)',
                  }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.boxShadow = '0 0 60px rgba(229,58,0,0.6)')}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.boxShadow = '0 0 40px rgba(229,58,0,0.3)')}
                >
                  ▶ START TRANSMISSION
                </button>
                <button
                  onClick={() => setLocation(`/song/${selected.id}?from=songs`)}
                  className="w-full py-3 font-mono font-bold text-xs tracking-[0.35em] uppercase transition-all duration-150"
                  style={{
                    border: '1px solid hsl(20 25% 18%)',
                    color: 'hsl(30 15% 50%)',
                    background: 'transparent',
                  }}
                  onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.borderColor = '#A855F7'; el.style.color = '#A855F7'; }}
                  onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'hsl(20 25% 18%)'; el.style.color = 'hsl(30 15% 50%)'; }}
                >
                  ◆ TRACK STATS · CHANGE DIFFICULTY
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full font-mono text-xs tracking-widest" style={{ color: 'hsl(30 15% 30%)' }}>
              SELECT A TRANSMISSION
            </div>
          )}
        </div>
      </div>

      {/* Mobile play button */}
      {selected && (
        <div
          className="lg:hidden flex-shrink-0 p-4 border-t"
          style={{ borderColor: 'hsl(20 25% 10%)' }}
        >
          <div className="flex gap-2">
            <button
              data-testid="button-play-mobile"
              onClick={() => {
                sessionStorage.setItem(`game_origin_${selected.id}`, 'songs');
                sessionStorage.setItem(`diff_override_${selected.id}`, String(selected.difficultyLevel));
                setLocation(`/play/${selected.id}`);
              }}
              className="flex-1 py-4 font-mono font-bold text-sm tracking-[0.3em]"
              style={{
                background: 'hsl(14 100% 48%)',
                color: '#fff',
                clipPath: 'polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)',
              }}
            >
              ▶ START: {selected.title.substring(0, 16)}
            </button>
            <button
              onClick={() => setLocation(`/song/${selected.id}?from=songs`)}
              className="py-4 px-4 font-mono font-bold text-xs tracking-widest"
              style={{ border: '1px solid hsl(20 25% 18%)', color: 'hsl(30 15% 50%)', background: 'transparent' }}
            >
              STATS
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
