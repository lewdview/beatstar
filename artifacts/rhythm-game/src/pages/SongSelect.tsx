import { useLocation } from "wouter";
import { useState } from "react";
import { SONGS, getHighScore } from "@/game/songs";
import type { Song } from "@/game/types";

const DIFF_COLORS: Record<string, string> = {
  LIGHT: '#48E5C2',
  DARK: '#E5B800',
  VOID: '#E53A00',
};

const LANE_COLORS = ['#E53A00', '#48E5C2', '#E5B800', '#8B48E5'];

function DiffBars({ level }: { level: number }) {
  return (
    <div className="flex gap-0.5 items-end h-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 6,
            height: `${Math.max(30, (i + 1) * 10)}%`,
            background: i < level ? LANE_COLORS[Math.min(i, 3)] : 'rgba(255,255,255,0.07)',
            transition: 'background 0.2s',
          }}
        />
      ))}
    </div>
  );
}

function SongCard({ song, selected, onClick }: { song: Song; selected: boolean; onClick: () => void }) {
  const hs = getHighScore(song.id);
  const diffColor = DIFF_COLORS[song.difficulty];

  return (
    <button
      data-testid={`card-song-${song.id}`}
      onClick={onClick}
      className="w-full text-left transition-all duration-200 relative overflow-hidden"
      style={{
        background: selected
          ? `linear-gradient(135deg, hsl(18 35% 8%), hsl(18 35% 7%))`
          : 'hsl(18 35% 6%)',
        border: `1px solid ${selected ? diffColor : 'hsl(20 25% 12%)'}`,
        padding: '20px 24px',
        clipPath: 'polygon(10px 0%, 100% 0%, calc(100% - 10px) 100%, 0% 100%)',
        boxShadow: selected ? `0 0 20px ${diffColor}30` : 'none',
      }}
    >
      {/* Left accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: selected ? diffColor : 'transparent' }}
      />

      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="font-mono text-xs tracking-widest px-2 py-0.5"
              style={{
                color: diffColor,
                border: `1px solid ${diffColor}50`,
                background: `${diffColor}10`,
              }}
            >
              {song.difficulty}
            </span>
            <span className="font-mono text-xs" style={{ color: 'hsl(30 15% 40%)' }}>
              {song.moodTag}
            </span>
          </div>

          <div
            className="font-mono font-bold text-lg tracking-wide truncate"
            style={{ color: selected ? '#F2EDE5' : 'hsl(30 20% 80%)' }}
          >
            {song.title}
          </div>
          <div className="font-mono text-xs mt-0.5" style={{ color: 'hsl(30 15% 45%)' }}>
            {song.artist} · {song.bpm} BPM · {Math.floor(song.duration / 60)}:{String(song.duration % 60).padStart(2, '0')}
          </div>

          <p className="text-xs mt-2 leading-relaxed" style={{ color: 'hsl(30 15% 40%)', fontFamily: 'Space Grotesk' }}>
            {song.description}
          </p>
        </div>

        <div className="flex-shrink-0 flex flex-col items-end gap-2">
          <DiffBars level={song.difficultyLevel} />
          {hs > 0 && (
            <div className="font-mono text-xs" style={{ color: 'hsl(168 72% 59%)' }}>
              HI: {hs.toLocaleString()}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

export default function SongSelect() {
  const [, setLocation] = useLocation();
  const [selected, setSelected] = useState<Song>(SONGS[0]);

  return (
    <div
      className="min-h-screen w-full flex flex-col"
      style={{ background: 'hsl(15 40% 4%)' }}
    >
      {/* Header */}
      <header
        className="flex items-center justify-between px-6 py-4 border-b"
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
          SELECT TRANSMISSION
        </div>
        <div className="font-mono text-xs" style={{ color: 'hsl(30 15% 35%)' }}>
          {SONGS.length} TRACKS
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Song list */}
        <div className="lg:w-1/2 flex flex-col gap-2 p-4 overflow-y-auto">
          {SONGS.map((song) => (
            <SongCard
              key={song.id}
              song={song}
              selected={selected.id === song.id}
              onClick={() => setSelected(song)}
            />
          ))}
        </div>

        {/* Detail panel */}
        <div
          className="lg:w-1/2 flex flex-col justify-between p-6 lg:p-10 border-l"
          style={{ borderColor: 'hsl(20 25% 10%)' }}
        >
          <div>
            {/* Visual rhythm bars */}
            <div className="flex gap-1 mb-8" style={{ height: 60 }}>
              {Array.from({ length: 24 }).map((_, i) => {
                const h = 20 + Math.sin(i * 0.8 + selected.bpm * 0.01) * 50 + 30;
                const lane = i % 4;
                return (
                  <div
                    key={i}
                    className="flex-1 rounded-sm transition-all duration-500"
                    style={{
                      height: `${h}%`,
                      alignSelf: 'flex-end',
                      background: LANE_COLORS[lane],
                      opacity: 0.5 + Math.sin(i * 0.5) * 0.3,
                    }}
                  />
                );
              })}
            </div>

            <div
              className="font-mono text-xs tracking-[0.4em] mb-2"
              style={{ color: DIFF_COLORS[selected.difficulty] }}
            >
              {selected.difficulty} — LEVEL {selected.difficultyLevel}
            </div>

            <h2
              className="font-mono font-bold mb-1"
              style={{ fontSize: 'clamp(24px, 4vw, 40px)', color: '#F2EDE5', lineHeight: 1.1 }}
            >
              {selected.title}
            </h2>

            <div className="font-mono text-sm mb-4" style={{ color: 'hsl(30 15% 50%)' }}>
              {selected.artist}
            </div>

            <p className="text-sm leading-relaxed mb-6" style={{ color: 'hsl(30 15% 55%)', maxWidth: 360 }}>
              {selected.description}
            </p>

            <div className="grid grid-cols-3 gap-4 mb-8">
              {[
                { label: 'BPM', value: selected.bpm },
                { label: 'NOTES', value: selected.notes.length },
                { label: 'DURATION', value: `${Math.floor(selected.duration / 60)}:${String(selected.duration % 60).padStart(2, '0')}` },
              ].map(({ label, value }) => (
                <div key={label} className="border p-3" style={{ borderColor: 'hsl(20 25% 12%)' }}>
                  <div className="font-mono text-xs mb-1" style={{ color: 'hsl(30 15% 40%)' }}>{label}</div>
                  <div className="font-mono font-bold text-lg" style={{ color: '#F2EDE5' }}>{value}</div>
                </div>
              ))}
            </div>

            {getHighScore(selected.id) > 0 && (
              <div
                className="font-mono text-sm mb-6 flex items-center gap-2"
                style={{ color: 'hsl(168 72% 59%)' }}
              >
                <span>◆</span>
                <span>PERSONAL BEST: {getHighScore(selected.id).toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* Play button */}
          <button
            data-testid="button-play"
            onClick={() => setLocation(`/play/${selected.id}`)}
            className="w-full py-5 font-mono font-bold text-sm tracking-[0.4em] uppercase transition-all duration-200 relative overflow-hidden"
            style={{
              background: 'hsl(14 100% 48%)',
              color: '#fff',
              clipPath: 'polygon(12px 0%, 100% 0%, calc(100% - 12px) 100%, 0% 100%)',
              boxShadow: '0 0 40px rgba(229,58,0,0.3)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = '0 0 60px rgba(229,58,0,0.6)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = '0 0 40px rgba(229,58,0,0.3)';
            }}
          >
            ▶ START TRANSMISSION
          </button>
        </div>
      </div>
    </div>
  );
}
