import { useParams, useLocation, useSearch } from "wouter";
import { useState, useEffect, useRef } from "react";
import { getSongById } from "@/game/api";
import type { GameSong } from "@/game/api";
import { getMedalForSong, getHighScore, getScoreHistory } from "@/game/progress";
import { audioManager } from "@/game/audio";
import { getActiveTheme } from "@/lib/options";

const MEDAL_COLOR: Record<string, string> = {
  PLATINUM: '#39FF14', GOLD: '#E5B800', SILVER: '#A0AABB', BRONZE: '#C97A3A', NONE: '#444', '': '#1a1a1a',
};

const DIFF_COLORS = [
  '#39FF14','#39FF14','#39FF14',
  '#00E5FF','#00E5FF','#00E5FF',
  '#E5B800','#E5B800','#E5B800',
  '#FF1493',
];

function DiffBars({ level }: { level: number }) {
  return (
    <div className="flex gap-px items-end" style={{ height: 18 }}>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="rounded-sm" style={{
          width: 6, height: `${30 + i * 7}%`,
          background: i < level ? DIFF_COLORS[i] : 'rgba(255,255,255,0.07)',
          boxShadow: i < level ? `0 0 4px ${DIFF_COLORS[i]}40` : 'none',
          transition: 'background 0.3s ease, box-shadow 0.3s ease',
        }} />
      ))}
    </div>
  );
}

/** Mini waveform visualizer for the audio preview */
function WaveformBars({ playing }: { playing: boolean }) {
  return (
    <div className="flex items-end gap-px" style={{ height: 16 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-sm" style={{
          width: 3,
          height: playing ? `${40 + Math.sin(Date.now() / 200 + i) * 30}%` : '30%',
          background: playing ? '#39FF14' : 'rgba(255,255,255,0.2)',
          transition: 'height 0.15s ease, background 0.3s',
          animation: playing ? `waveBar 0.6s ${i * 0.1}s ease-in-out infinite alternate` : 'none',
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
  const backRoute = from.startsWith('chapter') ? `/${from}` : from === 'songs' ? '/songs' : '/campaign';

  const [song, setSong] = useState<GameSong | null>(null);
  const [loading, setLoading] = useState(true);
  const [diffOverride, setDiffOverride] = useState<number>(5);
  const [history, setHistory] = useState<number[]>([]);

  // Audio preview
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewProg, setPreviewProg] = useState(0);

  const isAvant = getActiveTheme() === 'avant-garde';

  useEffect(() => {
    if (!songId) { setLocation('/campaign'); return; }
    audioManager.loadSfx('back');
    audioManager.loadSfx('tap_nav');
    getSongById(songId)
      .then(s => {
        if (!s) { setLocation(backRoute); return; }
        setSong(s);
        const savedOverride = sessionStorage.getItem(`diff_override_${songId}`);
        if (savedOverride) {
          setDiffOverride(parseInt(savedOverride, 10));
        } else {
          setDiffOverride(s.difficultyLevel);
        }
        setHistory(getScoreHistory(songId));
        setLoading(false);
      })
      .catch(() => setLocation(backRoute));
  }, [songId]);

  // Cleanup audio preview on unmount
  useEffect(() => {
    return () => {
      if (previewRef.current) {
        previewRef.current.pause();
        previewRef.current.src = '';
        previewRef.current = null;
      }
    };
  }, []);

  const togglePreview = () => {
    if (!song) return;
    if (isAvant) audioManager.playSfx('tap_nav', 0.12);
    if (previewing && previewRef.current) {
      previewRef.current.pause();
      setPreviewing(false);
      return;
    }
    if (!previewRef.current) {
      const audio = new Audio(song.audioUrl);
      audio.volume = 0.5;
      audio.addEventListener('timeupdate', () => {
        if (audio.duration) setPreviewProg(audio.currentTime / audio.duration);
      });
      audio.addEventListener('ended', () => { setPreviewing(false); setPreviewProg(0); });
      previewRef.current = audio;
    }
    // Start 15% into the track for a more interesting preview
    if (previewRef.current.currentTime < 1) {
      previewRef.current.currentTime = (song.duration * 0.15);
    }
    previewRef.current.play().catch(() => {});
    setPreviewing(true);
  };

  const handlePlay = () => {
    if (!songId) return;
    // Stop preview if playing
    if (previewRef.current) { previewRef.current.pause(); setPreviewing(false); }
    audioManager.playSfx('tap_nav', 0.4);
    sessionStorage.setItem(`game_origin_${songId}`, from);
    sessionStorage.setItem(`diff_override_${songId}`, String(diffOverride));
    setLocation(`/play/${songId}`);
  };

  const handleBack = () => {
    if (previewRef.current) { previewRef.current.pause(); setPreviewing(false); }
    audioManager.playSfx('back', 0.5);
    setLocation(backRoute);
  };

  const medal = song ? getMedalForSong(song.id) : '';
  const mc = MEDAL_COLOR[medal] ?? '#444';
  const hs = song ? getHighScore(song.id) : 0;
  const durMin = song ? Math.floor(song.duration / 60) : 0;
  const durSec = song ? String(Math.round(song.duration % 60)).padStart(2, '0') : '00';
  const diffColor = DIFF_COLORS[Math.min(diffOverride - 1, 9)];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: isAvant ? '#050505' : 'radial-gradient(ellipse at 50% 40%, #0e1028, #080808)' }}>
        <div className="font-mono text-xs tracking-widest animate-pulse" style={{ color: isAvant ? '#39FF14' : 'rgba(255,255,255,0.3)' }}>
          LOADING TRANSMISSION...
        </div>
      </div>
    );
  }

  if (!song) return null;

  const moodColor = song.mood === 'light' ? '#39FF14' : '#FF1493';
  const bestScore = history.length > 0 ? Math.max(...history) : 0;

  if (isAvant) {
    return (
      <div className="min-h-screen w-full relative overflow-hidden" style={{ background: '#050505' }}>
        {/* Green scanning grids */}
        <div className="absolute inset-0 pointer-events-none z-0"
          style={{
            backgroundImage: "linear-gradient(rgba(57,255,20,0.015) 1px,transparent 1px),linear-gradient(90deg,rgba(57,255,20,0.015) 1px,transparent 1px)",
            backgroundSize: "64px 64px"
          }} />

        {/* Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3.5"
          style={{ background: 'rgba(5,5,5,0.9)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(57,255,20,0.2)' }}>
          <button onClick={handleBack}
            onMouseEnter={() => audioManager.playSfx('tap_nav', 0.08)}
            className="font-mono text-xs px-4 py-1.5 tracking-widest border border-[#39FF14]/30 text-[#39FF14] bg-transparent cursor-pointer">
            ← {isFromFreePlay ? 'ARCHIVES' : from.startsWith('chapter') ? 'STAGES' : 'CAMPAIGN'}
          </button>
          <div className="font-mono font-bold text-xs tracking-[0.2em] text-[#39FF14]">
            SIGNAL // DAY {String(song.day).padStart(3, '0')}
          </div>
          <div className="font-mono text-xs tracking-widest text-white/30">PIM // ANALYZER</div>
        </div>

        <div className="relative z-10 max-w-xl mx-auto px-4 py-8 space-y-6 slide-up">
          {/* Song hero */}
          <div className="flex gap-5 items-center">
            <div className="relative flex-shrink-0 group">
              {/* Tech corner borders */}
              <div className="absolute -top-2 -left-2 w-4 h-4 border-t-2 border-l-2 border-[#39FF14]" />
              <div className="absolute -top-2 -right-2 w-4 h-4 border-t-2 border-r-2 border-[#39FF14]" />
              <div className="absolute -bottom-2 -left-2 w-4 h-4 border-b-2 border-l-2 border-[#39FF14]" />
              <div className="absolute -bottom-2 -right-2 w-4 h-4 border-b-2 border-r-2 border-[#39FF14]" />
              <div className="absolute -inset-1 border border-white/5 pointer-events-none" />

              {song.coverArt ? (
                <img src={song.coverArt} alt={song.title}
                  className="flex-shrink-0 object-cover"
                  style={{ width: 88, height: 88, border: '1px solid rgba(57,255,20,0.2)', filter: 'grayscale(15%)' }} />
              ) : (
                <div className="flex-shrink-0 flex items-center justify-center font-mono font-bold text-xl"
                  style={{ width: 88, height: 88, background: 'rgba(57,255,20,0.02)', border: '1px solid rgba(57,255,20,0.2)', color: 'rgba(255,255,255,0.3)' }}>
                  {song.day}
                </div>
              )}
              
              {/* Audio preview button overlaid on cover */}
              <button
                onClick={togglePreview}
                onMouseEnter={() => audioManager.playSfx('tap_nav', 0.08)}
                className="absolute inset-0 flex items-center justify-center transition-all duration-200"
                style={{
                  background: previewing ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.2)',
                  opacity: previewing ? 1 : 0.6,
                }}
              >
                <div className="font-mono font-bold text-base text-white">
                  {previewing ? '❚❚' : '▶'}
                </div>
              </button>
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="font-mono text-[8px] px-1.5 py-[2px] border font-black uppercase"
                  style={{ borderColor: moodColor, color: moodColor, background: `${moodColor}10` }}>
                  {song.mood.toUpperCase()}
                </span>
                {medal && medal !== '' && (
                  <span className="font-mono text-[8px] px-1.5 py-[2px] border font-black uppercase"
                    style={{ borderColor: mc, color: mc, background: `${mc}10` }}>
                    {medal}
                  </span>
                )}
              </div>
              <h1 className="font-mono font-black leading-tight uppercase tracking-tight text-[18px]"
                style={{ color: '#F2F0E8' }}>
                {song.title}
              </h1>
              <div className="font-mono text-xs truncate uppercase text-white/40">
                {song.artist}
              </div>
              <div className="font-mono text-[9px] mt-0.5 uppercase text-white/20">
                {song.date}{song.key ? ` // KEY: ${song.key}` : ''}
              </div>
            </div>
          </div>

          {/* Audio preview progress bar */}
          {previewing && (
            <div className="results-fade-in" style={{ animationDuration: '0.3s' }}>
              <div className="flex items-center gap-3 border border-[#39FF14]/25 bg-black/50 px-3 py-2.5">
                <WaveformBars playing={previewing} />
                <div className="flex-1 h-1" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div className="h-full transition-all duration-200" style={{
                    width: `${previewProg * 100}%`,
                    background: moodColor,
                    boxShadow: `0 0 6px ${moodColor}40`,
                  }} />
                </div>
                <button onClick={togglePreview}
                  onMouseEnter={() => audioManager.playSfx('tap_nav', 0.05)}
                  className="font-mono text-xs text-white/40 hover:text-white cursor-pointer bg-transparent border-none">
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'BPM', value: song.bpm },
              { label: 'NODES', value: song.notes.length },
              { label: 'LENGTH', value: `${durMin}:${durSec}` },
              { label: 'CALIB', value: song.difficultyLevel },
            ].map(({ label, value }) => (
              <div key={label} className="border border-[#39FF14]/15 bg-black/40 px-2 py-3 text-center">
                <div className="font-mono mb-1 text-[8px] uppercase tracking-wider text-white/30">{label}</div>
                <div className="font-mono font-bold text-sm text-[#39FF14]">{value}</div>
              </div>
            ))}
          </div>

          {/* Best score banner */}
          {hs > 0 && (
            <div className="border border-[#39FF14]/15 bg-black/40 flex items-center justify-between px-4 py-3">
              <div className="font-mono text-[8px] tracking-[0.25em] text-white/30">// HIGH INTEGRITY DISPATCH SCORE</div>
              <div className="font-mono font-black text-base text-[#39FF14]">{hs.toLocaleString()}</div>
            </div>
          )}

          {/* Description */}
          {song.description && (
            <div className="border border-[#39FF14]/15 bg-black/30 px-4 py-3">
              <div className="font-mono text-[8px] tracking-widest text-[#39FF14] mb-1.5 uppercase">// DISPATCH NOTE</div>
              <p className="text-xs leading-relaxed font-mono italic" style={{ color: 'rgba(255,255,255,0.45)' }}>
                "{song.description.toUpperCase()}"
              </p>
            </div>
          )}

          {/* Difficulty override — award play only */}
          {isFromFreePlay && (
            <div className="border border-[#39FF14]/25 bg-black/40" style={{ padding: '14px 16px' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="font-mono text-[8px] uppercase tracking-wider text-white/30">
                  // CALIBRATION COEFFICIENT OVERRIDE
                </div>
                <div className="font-mono font-bold text-xs" style={{ color: diffColor }}>
                  LVL {diffOverride}
                </div>
              </div>
              
              {/* Visualizer bars */}
              <div className="flex gap-px items-end mb-3" style={{ height: 14 }}>
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="flex-1" style={{
                    height: `${30 + i * 7}%`,
                    background: i < diffOverride ? diffColor : 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }} />
                ))}
              </div>

              <input
                type="range" min={1} max={10} value={diffOverride}
                onChange={e => {
                  audioManager.playSfx('tap_nav', 0.05);
                  setDiffOverride(parseInt(e.target.value, 10));
                }}
                className="w-full mt-3 cursor-pointer"
                style={{ accentColor: diffColor }}
              />
              <div className="flex justify-between mt-1">
                <span className="font-mono text-[8px] text-[#39FF14]" style={{ letterSpacing: '0.15em' }}>MINIMUM</span>
                <span className="font-mono text-[8px] text-[#FF1493]" style={{ letterSpacing: '0.15em' }}>MAXIMUM</span>
              </div>
            </div>
          )}

          {/* Track stats / score history */}
          <div>
            <div className="font-mono flex items-center gap-3 mb-3 pb-2 border-b border-[#39FF14]/10">
              <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.25em' }}>
                // TELEMETRY HISTORY LOG
              </span>
              <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.15em' }}>
                LAST {Math.min(10, history.length)} TRANSMISSIONS
              </span>
            </div>

            {history.length === 0 ? (
              <div className="font-mono text-center py-6 border border-[#39FF14]/10 bg-black/20"
                style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.25em' }}>
                NO RECORDS DETECTED IN STORAGE
              </div>
            ) : (
              <div className="space-y-1">
                {history.map((score, i) => {
                  const isTop = score === bestScore && i === history.indexOf(bestScore);
                  const pct = bestScore > 0 ? score / bestScore : 1;
                  return (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 border bg-black/30"
                      style={{
                        borderColor: isTop ? '#39FF14' : 'rgba(57,255,20,0.15)',
                      }}>
                      <div className="font-mono flex-shrink-0"
                        style={{ fontSize: 8, color: isTop ? '#39FF14' : 'rgba(255,255,255,0.3)', width: 22 }}>
                        {isTop ? '★' : `#${String(i + 1).padStart(2, '0')}`}
                      </div>
                      <div className="flex-1 h-1 bg-white/5 relative">
                        <div style={{
                          height: '100%',
                          width: `${pct * 100}%`,
                          background: isTop ? '#39FF14' : 'rgba(255,255,255,0.2)',
                          transition: 'width 0.5s ease',
                        }} />
                      </div>
                      <div className="font-mono font-bold flex-shrink-0 text-[10px]"
                        style={{ color: isTop ? '#39FF14' : 'rgba(255,255,255,0.5)', minWidth: 70, textAlign: 'right' }}>
                        {score.toLocaleString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Play button */}
          <div className="pb-8 flex flex-col gap-2">
            <button onClick={handlePlay}
              onMouseEnter={() => audioManager.playSfx('tap_nav', 0.08)}
              className="w-full py-4 text-xs tracking-[0.4em] font-black border border-[#39FF14] bg-[#39FF14] text-black hover:bg-[#39FF14]/90 transition-colors uppercase">
              ▶ START TRANSMISSION{isFromFreePlay ? ` · LVL ${diffOverride}` : ''}
            </button>
            {song.audioUrl && !previewing && (
              <button onClick={togglePreview}
                onMouseEnter={() => audioManager.playSfx('tap_nav', 0.08)}
                className="w-full py-3 text-[9px] font-bold tracking-[0.3em] border border-[#39FF14]/30 text-[#39FF14] hover:bg-[#39FF14]/10 transition-colors uppercase bg-transparent">
                <span>♪</span> PREVIEW TRACK
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full" style={{ background: 'radial-gradient(ellipse 80% 50% at 50% 20%, #0e1028 0%, #080808 60%)' }}>
      {/* Blurred cover art background */}
      {song.coverArt && (
        <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
          <img src={song.coverArt} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(50px) brightness(0.1) saturate(1.8)', transform: 'scale(1.3)' }} />
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3"
        style={{ background: 'rgba(8,8,12,0.7)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={handleBack}
          className="neon-btn-outline text-xs px-3 py-1.5 tracking-widest">
          ← {isFromFreePlay ? 'AWARD PLAY' : from.startsWith('chapter') ? 'CHAPTER' : 'CAMPAIGN'}
        </button>
        <div className="font-mono font-bold text-xs tracking-[0.4em]" style={{ color: 'rgba(255,255,255,0.2)' }}>
          DAY {String(song.day).padStart(3, '0')}
        </div>
        <div className="font-mono text-xs tracking-widest" style={{ color: 'rgba(255,255,255,0.15)' }}>TH3SCR1B3</div>
      </div>

      <div className="relative z-10 max-w-xl mx-auto px-4 py-6 space-y-5 slide-up">
        {/* Song hero */}
        <div className="flex gap-4">
          <div className="relative flex-shrink-0 group">
            {song.coverArt ? (
              <img src={song.coverArt} alt={song.title}
                className="flex-shrink-0 object-cover rounded-xl transition-transform duration-500 group-hover:scale-105"
                style={{ width: 96, height: 96, boxShadow: `0 8px 28px rgba(0,0,0,0.5), 0 0 16px ${moodColor}15` }} />
            ) : (
              <div className="flex-shrink-0 flex items-center justify-center font-mono font-bold text-2xl rounded-xl"
                style={{ width: 96, height: 96, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.15)' }}>
                {song.day}
              </div>
            )}
            {/* Audio preview button overlaid on cover */}
            <button
              onClick={togglePreview}
              className="absolute inset-0 flex items-center justify-center rounded-xl transition-all duration-200"
              style={{
                background: previewing ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.0)',
                opacity: previewing ? 1 : 0,
              }}
              onMouseEnter={e => { if (!previewing) (e.currentTarget as HTMLElement).style.opacity = '1'; (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.45)'; }}
              onMouseLeave={e => { if (!previewing) (e.currentTarget as HTMLElement).style.opacity = '0'; (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.0)'; }}
            >
              <div className="font-mono font-bold text-lg" style={{ color: '#fff', textShadow: '0 0 12px rgba(255,255,255,0.5)' }}>
                {previewing ? '❚❚' : '▶'}
              </div>
            </button>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="pill-badge"
                style={{ background: moodColor, color: '#000', boxShadow: `0 0 8px ${moodColor}40` }}>
                {song.mood.toUpperCase()}
              </span>
              {medal && medal !== '' && (
                <span className="pill-badge"
                  style={{ background: mc, color: '#080808', boxShadow: `0 0 8px ${mc}40` }}>
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

        {/* Audio preview progress bar */}
        {previewing && (
          <div className="results-fade-in" style={{ animationDuration: '0.3s' }}>
            <div className="flex items-center gap-3 glass-panel px-3 py-2.5" style={{ borderRadius: 10, borderColor: `${moodColor}30` }}>
              <WaveformBars playing={previewing} />
              <div className="flex-1 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div className="h-full rounded-full transition-all duration-200" style={{
                  width: `${previewProg * 100}%`,
                  background: `linear-gradient(90deg, ${moodColor}80, ${moodColor})`,
                  boxShadow: `0 0 6px ${moodColor}40`,
                }} />
              </div>
              <button onClick={togglePreview} className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'BPM', value: song.bpm },
            { label: 'NOTES', value: song.notes.length },
            { label: 'LENGTH', value: `${durMin}:${durSec}` },
            { label: 'DIFF', value: song.difficultyLevel },
          ].map(({ label, value }) => (
            <div key={label} className="glass-panel px-2.5 py-2.5 text-center" style={{ borderRadius: 10 }}>
              <div className="font-mono mb-0.5" style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.2em' }}>{label}</div>
              <div className="font-mono font-bold text-sm" style={{ color: '#F2F0E8' }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Best score banner */}
        {hs > 0 && (
          <div className="glass-panel flex items-center gap-3 px-4 py-3" style={{ borderRadius: 10, borderColor: `${mc}30` }}>
            <div className="font-mono" style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.25em' }}>BEST SCORE</div>
            <div className="font-mono font-bold text-base ml-auto" style={{ color: mc, textShadow: `0 0 10px ${mc}40` }}>{hs.toLocaleString()}</div>
          </div>
        )}

        {/* Description */}
        {song.description && (
          <div className="glass-panel px-4 py-3" style={{ borderRadius: 10 }}>
            <div className="font-mono" style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.3em', marginBottom: 6 }}>INTEL</div>
            <p className="text-sm leading-relaxed font-medium italic" style={{ color: 'rgba(255,255,255,0.45)' }}>
              "{song.description}"
            </p>
          </div>
        )}

        {/* Difficulty override — award play only */}
        {isFromFreePlay && (
          <div className="glass-panel" style={{ padding: '14px 16px', borderRadius: 10 }}>
            <div className="flex items-center justify-between mb-3">
              <div className="font-mono" style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.3em' }}>
                DIFFICULTY OVERRIDE
              </div>
              <div className="font-mono font-bold text-sm" style={{ color: diffColor, textShadow: `0 0 8px ${diffColor}40` }}>
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
              <span className="font-mono" style={{ fontSize: 8, color: '#39FF14', letterSpacing: '0.15em' }}>EASY</span>
              <span className="font-mono" style={{ fontSize: 8, color: '#FF1493', letterSpacing: '0.15em' }}>BRUTAL</span>
            </div>
          </div>
        )}

        {/* Track stats / score history */}
        <div>
          <div className="font-mono flex items-center gap-3 mb-3 pb-2"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
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
            <div className="space-y-1.5">
              {history.map((score, i) => {
                const isTop = score === bestScore && i === history.indexOf(bestScore);
                const pct = bestScore > 0 ? score / bestScore : 1;
                return (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg"
                    style={{
                      background: isTop ? 'rgba(229,184,0,0.06)' : 'rgba(255,255,255,0.02)',
                      border: isTop ? '1px solid rgba(229,184,0,0.15)' : '1px solid transparent',
                    }}>
                    <div className="font-mono flex-shrink-0"
                      style={{ fontSize: 9, color: isTop ? '#E5B800' : 'rgba(255,255,255,0.2)', width: 22, letterSpacing: '0.1em' }}>
                      {isTop ? '★' : `#${i + 1}`}
                    </div>
                    <div className="flex-1 h-1 relative rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <div className="rounded-full" style={{
                        height: '100%',
                        width: `${pct * 100}%`,
                        background: isTop ? 'linear-gradient(90deg, #E5B80060, #E5B800)' : 'rgba(255,255,255,0.15)',
                        boxShadow: isTop ? '0 0 6px rgba(229,184,0,0.3)' : 'none',
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
              <span key={tag} className="pill-badge"
                style={{ border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.02)' }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Play button */}
        <div className="pb-4 flex flex-col gap-2">
          <button onClick={handlePlay}
            className="neon-btn w-full py-5 text-sm tracking-[0.4em] uppercase">
            ▶ START TRANSMISSION{isFromFreePlay ? ` · LVL ${diffOverride}` : ''}
          </button>
          {/* Preview button (below CTA for discoverability on mobile) */}
          {song.audioUrl && !previewing && (
            <button onClick={togglePreview}
              className="neon-btn-outline w-full py-3 text-[10px] tracking-[0.3em] uppercase flex items-center justify-center gap-2">
              <span>♪</span> PREVIEW TRACK
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
