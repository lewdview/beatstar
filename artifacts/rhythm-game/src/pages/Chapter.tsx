import { useEffect, useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { loadCatalog, isSongTimeLocked } from "@/game/api";
import type { GameSong } from "@/game/api";
import { getMedalForSong, getChapterPlatinums, getHighScore, getScoreHistory } from "@/game/progress";
import { CHAPTERS, calculateCampaignDifficulty } from "@/game/campaign";
import { getActiveTheme } from "@/lib/options";
import { audioManager } from "@/game/audio";

const MEDAL_COLOR: Record<string, string> = {
  PLATINUM: '#39FF14', GOLD: '#E5B800', SILVER: '#A0AABB', BRONZE: '#C97A3A', NONE: '#333', '': '#1a1a1a',
};
const MEDAL_ABBR: Record<string, string> = {
  PLATINUM: 'PT', GOLD: 'GO', SILVER: 'SI', BRONZE: 'BR', NONE: '—', '': '?',
};

export default function Chapter() {
  const { month } = useParams<{ month: string }>();
  const [, setLocation] = useLocation();
  const [songs, setSongs] = useState<GameSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);

  // Audio preview state
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewProg, setPreviewProg] = useState(0);

  const monthNum = parseInt(month ?? '1', 10);
  const meta     = CHAPTERS.find(c => c.month === monthNum) ?? CHAPTERS[0];
  const prev     = CHAPTERS.find(c => c.month === monthNum - 1);
  const next     = CHAPTERS.find(c => c.month === monthNum + 1);

  const isAvant = getActiveTheme() === 'avant-garde';

  useEffect(() => {
    loadCatalog().then(catalog => {
      const filtered = catalog
        .filter(s => s.date && parseInt(s.date.split('-')[1], 10) === monthNum)
        .sort((a, b) => a.day - b.day);
      setSongs(filtered);
      setLoading(false);

      // Stop any existing preview on song list change
      if (previewRef.current) {
        previewRef.current.pause();
        setPreviewing(false);
        setPreviewProg(0);
      }

      // Check if we have a last played stage to restore focus
      const lastSongId = sessionStorage.getItem("campaign_last_song_id");
      if (lastSongId) {
        const idx = filtered.findIndex(s => s.id === lastSongId);
        if (idx !== -1) {
          setSelectedIdx(idx);
          return;
        }
      }

      // Otherwise, default select to player's active level (first uncleared unlocked level)
      const regularSongsList = filtered.length > 5 ? filtered.slice(0, -5) : filtered;
      const bonusSongsList = filtered.length > 5 ? filtered.slice(-5) : [];
      const plats = getChapterPlatinums(regularSongsList.map(s => s.id));
      const bUnlocked = filtered.length > 5 ? (plats >= meta.platNeeded) : true;
      
      const hasClearedLocal = (song?: GameSong) => {
        if (!song) return false;
        const medalVal = getMedalForSong(song.id);
        const scoreVal = getHighScore(song.id);
        return (medalVal && medalVal !== '') || scoreVal > 0;
      };

      const isUnlockedLocal = (idx: number) => {
        if (idx < 0) return false;
        if (idx < regularSongsList.length) {
          if (idx === 0) return true;
          return hasClearedLocal(regularSongsList[idx - 1]);
        } else {
          if (!bUnlocked) return false;
          const bonusIdx = idx - regularSongsList.length;
          if (bonusIdx === 0) return true;
          return hasClearedLocal(bonusSongsList[bonusIdx - 1]);
        }
      };

      const defaultIdx = filtered.findIndex((s, idx) => isUnlockedLocal(idx) && !hasClearedLocal(s));
      setSelectedIdx(defaultIdx !== -1 ? defaultIdx : 0);
    });
  }, [monthNum]);

  useEffect(() => {
    return () => {
      if (previewRef.current) {
        previewRef.current.pause();
        previewRef.current = null;
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: isAvant ? '#050505' : '#080808' }}>
        <div className="font-mono text-xs tracking-widest animate-pulse" style={{ color: isAvant ? '#39FF14' : 'rgba(255,255,255,0.3)' }}>LOADING SIGNAL DATA...</div>
      </div>
    );
  }

  const regularSongs  = songs.length > 5 ? songs.slice(0, -5) : songs;
  const bonusSongs    = songs.length > 5 ? songs.slice(-5) : [];
  const platinums     = getChapterPlatinums(regularSongs.map(s => s.id));
  const bonusUnlocked = songs.length > 5 ? (platinums >= meta.platNeeded) : true;

  const hasCleared = (song?: GameSong) => {
    if (!song) return false;
    const medal = getMedalForSong(song.id);
    const score = getHighScore(song.id);
    return (medal && medal !== '') || score > 0;
  };

  const clearsCount = regularSongs.filter(s => hasCleared(s)).length;

  const isUnlocked = (idx: number) => {
    if (idx < 0) return false;
    if (idx < regularSongs.length) {
      if (idx === 0) return true;
      return hasCleared(regularSongs[idx - 1]);
    } else {
      if (!bonusUnlocked) return false;
      const bonusIdx = idx - regularSongs.length;
      if (bonusIdx === 0) return true;
      return hasCleared(bonusSongs[bonusIdx - 1]);
    }
  };

  const getNodeCoords = (idx: number) => {
    const x = 50 + Math.sin(idx * 0.95) * 28;
    const y = idx * 130 + 80;
    return { x, y };
  };

  const defaultIdx = songs.findIndex((s, idx) => isUnlocked(idx) && !hasCleared(s));
  const activeIdx = selectedIdx < songs.length ? selectedIdx : (defaultIdx !== -1 ? defaultIdx : 0);

  const selectedSong = songs[activeIdx];

  const medal = selectedSong ? getMedalForSong(selectedSong.id) : '';
  const mc = MEDAL_COLOR[medal] ?? '#1a1a1a';
  const score = selectedSong ? getHighScore(selectedSong.id) : 0;
  const history = selectedSong ? getScoreHistory(selectedSong.id) : [];
  const bestScore = history.length > 0 ? Math.max(...history) : 0;
  const modifierType = 'none';

  // Warnings & Locks (no card lock in standalone rhythm game)
  const isTimeLocked = selectedSong ? isSongTimeLocked(selectedSong) : false;
  const isBonusLocked = selectedSong && (songs.indexOf(selectedSong) >= regularSongs.length) && !bonusUnlocked;
  const isProgLocked = selectedSong && !isUnlocked(songs.indexOf(selectedSong));
  const isPlayLocked = isTimeLocked || isBonusLocked || isProgLocked;

  const difficultyLevel = selectedSong
    ? calculateCampaignDifficulty(
        monthNum,
        songs.indexOf(selectedSong) >= regularSongs.length ? songs.indexOf(selectedSong) - regularSongs.length : songs.indexOf(selectedSong),
        songs.indexOf(selectedSong) >= regularSongs.length ? bonusSongs.length : regularSongs.length,
        songs.indexOf(selectedSong) >= regularSongs.length
      )
    : 5;

  const togglePreview = () => {
    if (!selectedSong) return;
    if (isAvant) audioManager.playSfx('tap_nav', 0.12);
    
    if (previewing && previewRef.current) {
      previewRef.current.pause();
      setPreviewing(false);
      return;
    }

    if (!previewRef.current) {
      const audio = new Audio(selectedSong.audioUrl);
      audio.volume = 0.4;
      audio.addEventListener('timeupdate', () => {
        if (audio.duration) setPreviewProg(audio.currentTime / audio.duration);
      });
      audio.addEventListener('ended', () => {
        setPreviewing(false);
        setPreviewProg(0);
      });
      previewRef.current = audio;
    } else if (previewRef.current.src !== selectedSong.audioUrl) {
      previewRef.current.pause();
      const audio = new Audio(selectedSong.audioUrl);
      audio.volume = 0.4;
      audio.addEventListener('timeupdate', () => {
        if (audio.duration) setPreviewProg(audio.currentTime / audio.duration);
      });
      audio.addEventListener('ended', () => {
        setPreviewing(false);
        setPreviewProg(0);
      });
      previewRef.current = audio;
    }

    if (previewRef.current.currentTime < 1) {
      previewRef.current.currentTime = (selectedSong.duration * 0.15);
    }

    previewRef.current.play().catch(() => {});
    setPreviewing(true);
  };

  const handlePlay = () => {
    if (isPlayLocked || !selectedSong) return;
    if (previewRef.current) {
      previewRef.current.pause();
      setPreviewing(false);
    }
    
    audioManager.playSfx('tap_nav', 0.4);
    sessionStorage.setItem(`campaign_last_song_id`, selectedSong.id);
    sessionStorage.setItem(`game_origin_${selectedSong.id}`, `chapter/${monthNum}`);
    sessionStorage.setItem(`diff_override_${selectedSong.id}`, String(difficultyLevel));

    // Standalone rhythm game has no modifier cards equipped state, clean active modifier overrides
    sessionStorage.removeItem(`active_modifier_type_${selectedSong.id}`);

    setLocation(`/play/${selectedSong.id}`);
  };

  return (
    <div className="min-h-dvh w-full" style={{ background: isAvant ? '#050505' : '#080808', position: 'relative', overflowX: 'hidden' }}>
      {isAvant && (
        <>
          <div className="absolute inset-y-0 right-0 pointer-events-none select-none font-mono font-black text-white/5 flex items-center justify-end leading-none z-0"
            style={{ fontSize: '32vw', right: '-10vw' }}>
            CH{String(meta.month).padStart(2, '0')}
          </div>
          <div className="fixed inset-0 pointer-events-none"
            style={{
              backgroundImage: "linear-gradient(rgba(57,255,20,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(57,255,20,0.02) 1px,transparent 1px)",
              backgroundSize: "64px 64px"
            }} />
        </>
      )}

      {/* Sticky top nav */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3"
        style={{
          background: isAvant ? 'rgba(5,5,5,0.9)' : '#080808',
          borderBottom: isAvant ? '1px solid rgba(57,255,20,0.2)' : '2px solid rgba(255,255,255,0.08)',
          backdropFilter: isAvant ? 'blur(10px)' : 'none'
        }}>
        <button onClick={() => { if (isAvant) audioManager.playSfx('tap_nav', 0.12); setLocation('/campaign'); }}
          className="font-mono text-xs tracking-widest transition-all"
          style={isAvant ? {
            color: '#39FF14',
            border: '1px solid rgba(57,255,20,0.3)',
            padding: '4px 10px',
            background: 'none',
            cursor: 'pointer'
          } : {
            color: 'rgba(255,255,255,0.35)',
            border: '1px solid rgba(255,255,255,0.1)',
            padding: '4px 10px',
            boxShadow: '2px 2px 0 rgba(255,255,255,0.06)',
            background: 'none',
            cursor: 'pointer'
          }}
          onMouseEnter={e => {
            if (isAvant) {
              audioManager.playSfx('tap_nav', 0.08);
              return;
            }
            const el = e.currentTarget as HTMLElement;
            el.style.color = meta.dc;
            el.style.borderColor = meta.dc;
            el.style.boxShadow = `2px 2px 0 ${meta.dc}`;
          }}
          onMouseLeave={e => {
            if (isAvant) return;
            const el = e.currentTarget as HTMLElement;
            el.style.color = 'rgba(255,255,255,0.35)';
            el.style.borderColor = 'rgba(255,255,255,0.1)';
            el.style.boxShadow = '2px 2px 0 rgba(255,255,255,0.06)';
          }}>
          ← CAMPAIGN MAP
        </button>
        
        <div className="font-mono font-bold text-xs tracking-[0.6em]" style={{ color: isAvant ? '#39FF14' : 'rgba(255,255,255,0.25)' }}>
          CH {String(meta.month).padStart(2, '0')}
        </div>
        
        <div className="flex gap-2">
          {prev && <button onClick={() => { if (isAvant) audioManager.playSfx('tap_nav', 0.12); setLocation(`/chapter/${prev.month}`); }} className="font-mono text-xs px-3 py-1 cursor-pointer" style={{ color: isAvant ? '#39FF14' : 'rgba(255,255,255,0.25)', border: isAvant ? '1px solid rgba(57,255,20,0.3)' : '1px solid rgba(255,255,255,0.08)', background: 'none' }} onMouseEnter={() => { if (isAvant) audioManager.playSfx('tap_nav', 0.08); }} >‹</button>}
          {next && <button onClick={() => { if (isAvant) audioManager.playSfx('tap_nav', 0.12); setLocation(`/chapter/${next.month}`); }} className="font-mono text-xs px-3 py-1 cursor-pointer" style={{ color: isAvant ? '#39FF14' : 'rgba(255,255,255,0.25)', border: isAvant ? '1px solid rgba(57,255,20,0.3)' : '1px solid rgba(255,255,255,0.08)', background: 'none' }} onMouseEnter={() => { if (isAvant) audioManager.playSfx('tap_nav', 0.08); }} >›</button>}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col lg:flex-row gap-8 relative z-10">
        
        {/* Left Column: Winding Level Road */}
        <div className="w-full lg:w-[60%] flex flex-col items-center">
          {/* Header info */}
          <div className="w-full max-w-[450px] mb-4 text-left">
            <div className="flex items-baseline gap-3">
              <h1 className="font-mono font-bold" style={{ fontSize: 'clamp(24px, 5vw, 32px)', color: '#F2F0E8', letterSpacing: '-0.01em' }}>
                {meta.name.toUpperCase()}
              </h1>
              <span className="font-mono font-bold px-2 py-0.5 text-[10px]"
                style={{ color: '#080808', background: meta.dc, letterSpacing: '0.2em' }}>
                {meta.diff}
              </span>
            </div>
            <div className="font-mono text-[10px]" style={{ color: isAvant ? '#39FF14' : 'rgba(255,255,255,0.3)', letterSpacing: '0.35em' }}>
              {meta.sub.toUpperCase()}
            </div>
            
            {/* Platinum progress */}
            <div className="flex items-center gap-3 mt-3">
              <div className="flex-1 h-1.5" style={{ background: 'rgba(255,255,255,0.06)', border: isAvant ? '1px solid rgba(57,255,20,0.2)' : '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ height: '100%', width: `${Math.min(100, (platinums / meta.platNeeded) * 100)}%`, background: bonusUnlocked ? '#E5B800' : (isAvant ? '#39FF14' : 'rgba(229,184,0,0.5)'), transition: 'width 0.8s ease' }} />
              </div>
              <div className="font-mono text-[9px] flex-shrink-0" style={{ color: bonusUnlocked ? '#E5B800' : (isAvant ? '#39FF14' : 'rgba(255,255,255,0.3)'), letterSpacing: '0.15em' }}>
                ✦ {platinums}/{meta.platNeeded} PT FOR BONUS
              </div>
            </div>
          </div>

          {/* SVG & Node road */}
          <div className="w-full max-w-[450px] relative mt-4 rounded-xl border border-white/5 bg-black/20 p-4" style={{ height: songs.length * 130 + 120 }}>
            {songs.length === 0 ? (
              <div className="h-full flex items-center justify-center font-mono text-xs text-white/20">NO SECTOR STAGES FOUND</div>
            ) : (
              <>
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 100 ${songs.length * 130 + 120}`} preserveAspectRatio="none">
                  {songs.map((_, idx) => {
                    if (idx === songs.length - 1) return null;
                    const p1 = getNodeCoords(idx);
                    const p2 = getNodeCoords(idx + 1);
                    
                    const unlA = isUnlocked(idx);
                    const unlB = isUnlocked(idx + 1);
                    const clA = hasCleared(songs[idx]);
                    
                    let strokeColor = 'rgba(255,255,255,0.06)';
                    let strokeDash = '';
                    if (isAvant) {
                      if (clA && unlB) {
                        strokeColor = '#39FF14';
                      } else if (unlA && !clA) {
                        strokeColor = 'rgba(57,255,20,0.4)';
                        strokeDash = '4 4';
                      } else {
                        strokeColor = 'rgba(57,255,20,0.1)';
                      }
                    } else {
                      if (clA && unlB) {
                        strokeColor = meta.dc;
                      } else if (unlA && !clA) {
                        strokeColor = `${meta.dc}70`;
                        strokeDash = '4 4';
                      }
                    }
                    
                    return (
                      <line
                        key={idx}
                        x1={p1.x}
                        y1={p1.y}
                        x2={p2.x}
                        y2={p2.y}
                        stroke={strokeColor}
                        strokeWidth={isAvant ? 1.5 : 3.5}
                        strokeDasharray={strokeDash}
                      />
                    );
                  })}
                </svg>

                {songs.map((song, idx) => {
                  const coords = getNodeCoords(idx);
                  const unl = isUnlocked(idx);
                  const cl = hasCleared(song);
                  const nodeMedal = getMedalForSong(song.id);
                  const isSel = activeIdx === idx;
                  const isBonus = idx >= regularSongs.length;
                  
                  const nColor = MEDAL_COLOR[nodeMedal] ?? '#1a1a1a';
                  
                  let borderStyle = {};
                  let bgStyle = {};
                  let outerRing = null;
                  
                  if (isAvant) {
                    borderStyle = {
                      borderColor: isSel ? '#39FF14' : cl ? nColor : unl ? 'rgba(57,255,20,0.6)' : 'rgba(57,255,20,0.15)',
                      boxShadow: isSel ? '0 0 12px #39FF14' : 'none',
                    };
                    bgStyle = {
                      background: isSel ? '#39FF1420' : cl ? `${nColor}25` : '#050505',
                      color: isSel ? '#39FF14' : unl ? '#fff' : 'rgba(255,255,255,0.2)',
                    };
                  } else {
                    borderStyle = {
                      borderColor: isSel ? '#fff' : cl ? nColor : unl ? meta.dc : 'rgba(255,255,255,0.06)',
                      boxShadow: isSel ? `0 0 16px ${meta.dc}` : cl ? `0 0 8px ${nColor}30` : 'none',
                    };
                    bgStyle = {
                      background: isSel ? meta.dc : cl ? '#121212' : 'rgba(255,255,255,0.02)',
                      color: isSel ? '#000' : unl ? '#fff' : 'rgba(255,255,255,0.2)',
                    };
                    
                    if (unl && !cl && !isSel) {
                      outerRing = (
                        <div className="absolute inset-[-5px] rounded-full border border-dashed animate-spin" style={{ borderColor: `${meta.dc}50`, animationDuration: '6s' }} />
                      );
                    }
                  }

                  return (
                    <button
                      key={song.id}
                      onClick={() => {
                        audioManager.playSfx('tap_nav', 0.08);
                        setSelectedIdx(idx);
                      }}
                      className="absolute flex items-center justify-center transition-all duration-200"
                      style={{
                        left: `${coords.x}%`,
                        top: `${coords.y}px`,
                        transform: 'translate(-50%, -50%)',
                        width: 44,
                        height: 44,
                        borderRadius: isAvant ? '0px' : '50%',
                        borderWidth: isSel ? 3 : 2,
                        borderStyle: 'solid',
                        zIndex: 10,
                        cursor: unl ? 'pointer' : 'not-allowed',
                        ...borderStyle,
                        ...bgStyle,
                        opacity: unl ? 1 : 0.45,
                      }}
                    >
                      {outerRing}
                      <span className="font-mono font-bold text-xs">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      
                      {!unl && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-full font-mono text-[10px] text-white/50">
                          🔒
                        </div>
                      )}
                      
                      {isBonus && unl && (
                        <div className="absolute -top-1.5 -right-1.5 text-xs text-[#E5B800]">
                          ★
                        </div>
                      )}
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* Right Column: Milestones and Selected level detail */}
        <div className="w-full lg:w-[40%] flex flex-col gap-6 lg:sticky lg:top-20 lg:h-[calc(100vh-120px)] lg:overflow-y-auto pr-1">
          
          {/* Visual Milestone Rewards Section */}
          <div className={isAvant ? 'border border-[#39FF14]/25 bg-black/60 p-4' : 'glass-panel p-4 rounded-xl'}
            style={!isAvant ? { background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' } : {}}>
            <h3 className="font-mono text-xs tracking-wider mb-3 text-left" style={{ color: isAvant ? '#39FF14' : '#fff' }}>
              // CAMPAIGN PROGRESS TIER BADGES
            </h3>
            
            <div className="flex justify-between items-baseline mb-2">
              <span className="font-mono text-[10px] text-white/40">REGULAR CLEAR PROGRESS:</span>
              <span className="font-mono font-bold text-xs" style={{ color: isAvant ? '#39FF14' : meta.dc }}>
                {clearsCount} / {regularSongs.length} CLEARED
              </span>
            </div>

            <div className="h-2 w-full mb-5 relative rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <div className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, (clearsCount / regularSongs.length) * 100)}%`,
                  background: isAvant ? '#39FF14' : `linear-gradient(90deg, ${meta.dc}80, ${meta.dc})`,
                  boxShadow: `0 0 8px ${isAvant ? '#39FF14' : meta.dc}40`,
                }}
              />
            </div>

            <div className="space-y-3">
              {/* Milestone 1 (5 Clears) */}
              <div className="flex items-center justify-between p-2.5 rounded border"
                style={{
                  background: 'rgba(255,255,255,0.01)',
                  borderColor: clearsCount >= 5 ? '#E5B80030' : 'rgba(255,255,255,0.04)'
                }}>
                <div className="flex items-center gap-2">
                  <span className="text-xl">🎧</span>
                  <div className="text-left">
                    <div className="font-mono font-bold text-[10px] text-[#F2F0E8]">BRONZE CAMPAIGN TROPHY</div>
                    <div className="font-mono text-[8px] text-white/40">EARNED AT 5 SECTOR CLEARS</div>
                  </div>
                </div>
                {clearsCount >= 5 ? (
                  <span className="font-mono font-bold text-[9px] text-[#39FF14] bg-[#39FF14]/10 px-2.5 py-1 rounded">UNLOCKED ✓</span>
                ) : (
                  <span className="font-mono text-[9px] text-white/30 border border-white/5 px-2.5 py-1">LOCKED</span>
                )}
              </div>

              {/* Milestone 2 (15 Clears) */}
              <div className="flex items-center justify-between p-2.5 rounded border"
                style={{
                  background: 'rgba(255,255,255,0.01)',
                  borderColor: clearsCount >= 15 ? '#E5B80030' : 'rgba(255,255,255,0.04)'
                }}>
                <div className="flex items-center gap-2">
                  <span className="text-xl">☀️</span>
                  <div className="text-left">
                    <div className="font-mono font-bold text-[10px] text-[#F2F0E8]">SILVER CAMPAIGN TROPHY</div>
                    <div className="font-mono text-[8px] text-white/40">EARNED AT 15 SECTOR CLEARS</div>
                  </div>
                </div>
                {clearsCount >= 15 ? (
                  <span className="font-mono font-bold text-[9px] text-[#39FF14] bg-[#39FF14]/10 px-2.5 py-1 rounded">UNLOCKED ✓</span>
                ) : (
                  <span className="font-mono text-[9px] text-white/30 border border-white/5 px-2.5 py-1">LOCKED</span>
                )}
              </div>

              {/* Milestone 3 (All Cleared) */}
              <div className="flex items-center justify-between p-2.5 rounded border"
                style={{
                  background: 'rgba(255,255,255,0.01)',
                  borderColor: clearsCount >= regularSongs.length ? '#E5B80030' : 'rgba(255,255,255,0.04)'
                }}>
                <div className="flex items-center gap-2">
                  <span className="text-xl">🌙</span>
                  <div className="text-left">
                    <div className="font-mono font-bold text-[10px] text-[#F2F0E8]">GOLD CHAMPION MEDALLION</div>
                    <div className="font-mono text-[8px] text-white/40">EARNED FOR ALL REGULAR CLEARED</div>
                  </div>
                </div>
                {clearsCount >= regularSongs.length ? (
                  <span className="font-mono font-bold text-[9px] text-[#39FF14] bg-[#39FF14]/10 px-2.5 py-1 rounded">UNLOCKED ✓</span>
                ) : (
                  <span className="font-mono text-[9px] text-white/30 border border-white/5 px-2.5 py-1">LOCKED</span>
                )}
              </div>
            </div>
          </div>

          {/* Selected Stage Detail Panel */}
          {selectedSong ? (
            <div className={isAvant ? 'border border-[#39FF14]/30 bg-black/55 p-5 text-left space-y-4' : 'glass-panel p-5 rounded-xl text-left space-y-4'}
              style={!isAvant ? { background: 'rgba(8,8,12,0.4)', borderColor: 'rgba(255,255,255,0.08)' } : {}}>
              
              <div className="flex gap-4 items-start">
                <div className="relative flex-shrink-0">
                  {selectedSong.coverArt ? (
                    <img src={selectedSong.coverArt} alt={selectedSong.title}
                      className="object-cover rounded"
                      style={{ width: 72, height: 72, filter: isPlayLocked ? 'grayscale(100%) brightness(0.3)' : 'none', border: '1px solid rgba(255,255,255,0.1)' }} />
                  ) : (
                    <div className="flex items-center justify-center font-mono font-bold text-lg rounded bg-white/5 border border-white/10"
                      style={{ width: 72, height: 72, color: 'rgba(255,255,255,0.2)' }}>
                      {selectedSong.day}
                    </div>
                  )}
                  {isUnlocked(songs.indexOf(selectedSong)) && (
                    <button onClick={togglePreview}
                      className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/60 transition-colors rounded">
                      <span className="text-white text-lg font-bold">{previewing ? '❚❚' : '▶'}</span>
                    </button>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    <span className="font-mono text-[8px] px-1.5 py-px border rounded uppercase font-black"
                      style={{
                        borderColor: selectedSong.mood === 'light' ? '#39FF14' : '#FF1493',
                        color: selectedSong.mood === 'light' ? '#39FF14' : '#FF1493',
                        background: selectedSong.mood === 'light' ? '#39FF1410' : '#FF149310'
                      }}>
                      {selectedSong.mood}
                    </span>
                    {medal && (
                      <span className="font-mono text-[8px] px-1.5 py-px border rounded uppercase font-black"
                        style={{ borderColor: mc, color: mc, background: `${mc}10` }}>
                        {medal}
                      </span>
                    )}
                  </div>

                  <h2 className="font-mono font-bold text-sm text-[#F2F0E8] truncate uppercase">
                    {selectedSong.title}
                  </h2>
                  <div className="font-mono text-[10px] text-white/50 truncate uppercase">
                    BY {selectedSong.artist}
                  </div>
                  <div className="font-mono text-[8px] text-white/30 uppercase mt-0.5">
                    STAGE {songs.indexOf(selectedSong) + 1} // BPM: {selectedSong.bpm} // LVL: {difficultyLevel}
                  </div>
                </div>
              </div>

              {/* Waveform preview player */}
              {previewing && (
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 transition-all duration-300" style={{ width: `${previewProg * 100}%` }} />
                </div>
              )}

              {/* Best dispatch info */}
              {score > 0 ? (
                <div className="border border-white/5 bg-white/5 p-2 rounded flex justify-between items-center">
                  <span className="font-mono text-[9px] text-white/40">// DISPATCH HIGH SCORE:</span>
                  <span className="font-mono font-bold text-xs" style={{ color: isAvant ? '#39FF14' : meta.dc }}>
                    {score.toLocaleString()}
                  </span>
                </div>
              ) : (
                <div className="border border-dashed border-white/5 p-2 rounded text-center">
                  <span className="font-mono text-[8px] text-white/20">// NO DISPATCH TELEMETRY ON RECORD</span>
                </div>
              )}

              {/* Description */}
              {selectedSong.description && (
                <p className="font-mono text-[9px] text-white/45 italic leading-relaxed bg-white/[0.01] p-2 rounded border border-white/5">
                  "{selectedSong.description.toUpperCase()}"
                </p>
              )}

              {/* Warnings and Action Button */}
              <div className="space-y-2">
                {isTimeLocked && (
                  <div className="p-2 border border-[#FF3800]/30 bg-[#FF3800]/10 text-center rounded text-[9px] font-mono text-[#FF3800]">
                    🔒 SIGNAL DOCKED — CHRONO TIME LOCK ACTIVE
                  </div>
                )}
                {isBonusLocked && (
                  <div className="p-2 border border-[#FF3800]/30 bg-[#FF3800]/10 text-center rounded text-[9px] font-mono text-[#FF3800]">
                    🔒 BONUS SECTOR SHIELDED — REQUIRE {meta.platNeeded} PLATINUMS (CURRENT: {platinums})
                  </div>
                )}
                {isProgLocked && !isTimeLocked && !isBonusLocked && (
                  <div className="p-2 border border-[#FF3800]/30 bg-[#FF3800]/10 text-center rounded text-[9px] font-mono text-[#FF3800]">
                    🔒 TRANSMISSION LOCKED — CLEAR PREVIOUS LEVEL TO UNLOCK PATHWAY
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={handlePlay}
                    disabled={isPlayLocked}
                    className={`flex-1 py-3 text-xs tracking-[0.3em] font-black border uppercase transition-all rounded cursor-pointer ${
                      !isPlayLocked 
                        ? (isAvant ? 'border-[#39FF14] bg-[#39FF14] text-black hover:bg-[#39FF14]/90' : 'border-[#fff] bg-[#fff] text-black hover:bg-white/90')
                        : 'border-white/10 bg-white/5 text-white/20 cursor-not-allowed'
                    }`}
                    style={!isPlayLocked ? { boxShadow: `0 4px 12px ${isAvant ? '#39FF14' : meta.dc}30` } : {}}
                  >
                    {isPlayLocked ? '🔒 LOCKED' : '▶ START TRANSMISSION'}
                  </button>
                  
                  {isUnlocked(songs.indexOf(selectedSong)) && (
                    <button onClick={() => setLocation(`/song/${selectedSong.id}?from=chapter/${monthNum}`)}
                      className="py-3 px-4 text-xs font-mono border border-white/10 hover:border-white/30 text-white/60 hover:text-white rounded cursor-pointer">
                      CODEX
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-[200px] flex items-center justify-center border border-dashed border-white/10 rounded-xl bg-black/20">
              <div className="font-mono text-xs text-white/20">SELECT A LEVEL NODE ON THE PATHWAY</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
