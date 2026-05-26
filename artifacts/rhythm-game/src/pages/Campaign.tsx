import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { loadCatalog } from "@/game/api";
import type { GameSong } from "@/game/api";
import {
  getTotalScore, getTotalPlatinums, getTotalCleared,
  getChapterPlatinums, getChapterCleared,
} from "@/game/progress";
import { CHAPTERS, type ChapterMeta } from "@/game/campaign";
import { getActiveTheme } from "@/lib/options";
import { audioManager } from "@/game/audio";
import { Lock, Unlock, Play, Compass, CheckCircle2, ChevronRight, Activity } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ── animated score counter ───────────────────────────────────────
function useCountUp(target: number, duration = 1500, delay = 200) {
  const [value, setValue] = useState(0);
  const [done, setDone]   = useState(false);
  useEffect(() => {
    if (!target) {
      setValue(0);
      setDone(true);
      return;
    }
    setValue(0);
    setDone(false);

    const t0 = setTimeout(() => {
      const start = Date.now();
      const tick  = () => {
        const p    = Math.min(1, (Date.now() - start) / duration);
        const ease = 1 - Math.pow(1 - p, 4);
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

function ScoreDisplay({ total, isAvant }: { total: number; isAvant?: boolean }) {
  const { value, done } = useCountUp(total);
  const str = value.toLocaleString();

  if (isAvant) {
    return (
      <div className="relative flex flex-col items-center">
        {!done && <div style={{ position: 'absolute', left: -20, right: -20, zIndex: 10, background: 'rgba(57,255,20,0.5)', height: 1 }} />}
        <div className="font-mono font-bold tabular-nums text-center whitespace-nowrap flex items-center justify-center text-[#39FF14]"
          style={{
            fontSize: 'clamp(28px, 6vw, 42px)',
            lineHeight: 1,
            letterSpacing: '-0.02em',
            textShadow: '0 0 15px rgba(57,255,20,0.3)',
          }}>
          {str.split('').map((ch, i) => (
            <span key={i} className="inline-block"
              style={{
                minWidth: ch === ',' ? '0.25em' : '0.55em',
                color: ch === ',' ? 'rgba(57,255,20,0.4)' : '#39FF14',
              }}>
              {ch}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col items-center">
      {!done && <div className="score-scanline" style={{ position: 'absolute', left: -20, right: -20, zIndex: 10 }} />}
      <div className="font-mono font-bold tabular-nums text-center whitespace-nowrap flex items-center justify-center"
        style={{
          fontSize: 'clamp(28px, 6vw, 42px)',
          lineHeight: 1,
          letterSpacing: '-0.02em',
          filter: 'drop-shadow(0 0 15px rgba(255,255,255,0.15))',
        }}>
        {str.split('').map((ch, i) => (
          <span key={i} className="inline-block"
            style={{
              minWidth: ch === ',' ? '0.25em' : '0.55em',
              background: ch === ',' ? 'none' : 'linear-gradient(180deg, #F2F0E8 0%, #C8B88A 100%)',
              WebkitBackgroundClip: ch === ',' ? 'none' : 'text',
              WebkitTextFillColor: ch === ',' ? 'initial' : 'transparent',
              color: ch === ',' ? 'rgba(255,255,255,0.2)' : '#F2F0E8',
            }}>
            {ch}
          </span>
        ))}
      </div>
      {done && total > 0 && <div className="absolute inset-0 score-flash pointer-events-none" style={{ filter: 'blur(20px)' }} />}
    </div>
  );
}

interface ChapterData {
  meta: ChapterMeta;
  songs: GameSong[];
  regularIds: string[];
  bonusCount: number;
  platinums: number;
  cleared: number;
  bonusUnlocked: boolean;
  unlocked: boolean;
}

export default function Campaign() {
  const [, setLocation] = useLocation();
  const [chapters, setChapters] = useState<ChapterData[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [totals, setTotals]     = useState({ score: 0, platinums: 0, cleared: 0 });
  const [loading, setLoading]   = useState(true);

  const isAvant = getActiveTheme() === 'avant-garde';

  useEffect(() => {
    setTotals({ score: getTotalScore(), platinums: getTotalPlatinums(), cleared: getTotalCleared() });
    
    loadCatalog().then(catalog => {
      // 1. Calculate raw metadata stats for all chapters
      const data = CHAPTERS.map((meta, idx) => {
        const songs = catalog.filter(s => {
          if (!s.date) return false;
          const parts = s.date.split('-');
          return parts.length > 1 && parseInt(parts[1], 10) === meta.month;
        }).sort((a, b) => a.day - b.day);

        const regularIds = songs.length > 5 ? songs.slice(0, -5).map(s => s.id) : songs.map(s => s.id);
        const bonusCount = songs.length > 5 ? 5 : 0;
        const platinums  = getChapterPlatinums(regularIds);
        const cleared    = getChapterCleared(regularIds);
        
        return {
          meta,
          songs,
          regularIds,
          bonusCount,
          platinums,
          cleared,
          bonusUnlocked: platinums >= meta.platNeeded,
          unlocked: false, // will calculate iteratively next
        };
      });

      // 2. Compute progressive unlock state level-by-chapter
      // Chapter 1 is always unlocked.
      // Chapter N is unlocked if all regular songs in Chapter N-1 are cleared,
      // OR if they already have clears in Chapter N (for backward compatibility).
      data.forEach((ch, idx) => {
        if (idx === 0) {
          ch.unlocked = true;
        } else {
          const prevCh = data[idx - 1];
          const prevFinished = prevCh.cleared >= prevCh.regularIds.length;
          ch.unlocked = prevFinished || ch.cleared > 0;
        }
      });

      setChapters(data);
      
      // Auto-select the highest unlocked chapter
      const highestUnlocked = [...data].reverse().find(ch => ch.unlocked);
      if (highestUnlocked) {
        const hIdx = data.findIndex(ch => ch.meta.month === highestUnlocked.meta.month);
        setSelectedIdx(hIdx >= 0 ? hIdx : 0);
      }

      setLoading(false);
    });
  }, []);

  const selectedSector = chapters[selectedIdx];

  const handleNodeClick = (idx: number) => {
    audioManager.playSfx("tap_nav", 0.12);
    setSelectedIdx(idx);
  };

  const handleEnterSector = () => {
    if (!selectedSector || !selectedSector.unlocked) return;
    audioManager.playSfx("tap_nav", 0.18);
    setLocation(`/chapter/${selectedSector.meta.month}`);
  };

  return (
    <div className="min-h-dvh w-full flex flex-col"
      style={{
        background: isAvant
          ? '#050505'
          : 'radial-gradient(ellipse 80% 50% at 50% 20%, #0e1028 0%, #080808 60%)',
        position: 'relative'
      }}>
      
      {/* Background elements */}
      {isAvant ? (
        <>
          <div className="fixed inset-0 pointer-events-none"
            style={{
              backgroundImage: "linear-gradient(rgba(57,255,20,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(57,255,20,0.02) 1px,transparent 1px)",
              backgroundSize: "64px 64px"
            }} />
          <div className="fixed inset-0 pointer-events-none opacity-10"
            style={{
              background: "radial-gradient(circle at 50% 50%, transparent 60%, rgba(0,0,0,0.95))"
            }} />
        </>
      ) : (
        <div className="fixed inset-0 pointer-events-none opacity-20"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), radial-gradient(rgba(255,255,255,0.01) 1px, transparent 1px)",
            backgroundSize: "40px 40px"
          }} />
      )}

      {/* Top Nav */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-6 py-3.5 flex-shrink-0"
        style={{
          background: isAvant ? 'rgba(5,5,5,0.9)' : 'rgba(8,8,12,0.7)',
          backdropFilter: 'blur(16px)',
          borderBottom: isAvant ? '1px solid rgba(57,255,20,0.2)' : '1px solid rgba(255,255,255,0.06)'
        }}>
        <button
          onClick={() => {
            if (isAvant) audioManager.playSfx('tap_nav', 0.12);
            setLocation('/');
          }}
          onMouseEnter={() => { if (isAvant) audioManager.playSfx('tap_nav', 0.08); }}
          className={isAvant
            ? "font-mono text-[10px] tracking-[0.25em] text-[#39FF14] border border-[#39FF14]/30 px-4 py-1.5 hover:bg-[#39FF14]/10 transition-colors"
            : "neon-btn-outline text-xs px-4 py-1.5 tracking-widest"}
        >
          ← HOME
        </button>
        <div className="font-mono font-bold text-xs tracking-[0.5em] text-center" style={{ color: isAvant ? '#39FF14' : 'rgba(255,255,255,0.7)' }}>
          CAMPAIGN SECTORS
        </div>
        <button
          onClick={() => {
            if (isAvant) audioManager.playSfx('tap_nav', 0.12);
            setLocation('/songs');
          }}
          onMouseEnter={() => { if (isAvant) audioManager.playSfx('tap_nav', 0.08); }}
          className={isAvant
            ? "font-mono text-[10px] tracking-[0.25em] text-[#39FF14] border border-[#39FF14]/30 px-4 py-1.5 hover:bg-[#39FF14]/10 transition-colors"
            : "neon-btn-outline text-xs px-4 py-1.5 tracking-widest"}
        >
          AWARD PLAY →
        </button>
      </header>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="font-mono text-xs tracking-widest animate-pulse" style={{ color: isAvant ? '#39FF14' : 'rgba(255,255,255,0.3)' }}>
            INITIALIZING SECTOR TELEMETRY...
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col lg:flex-row overflow-visible lg:overflow-hidden relative z-10">
          
          {/* LEFT PANEL: Interactive Constellation Map */}
          <div className="flex-1 min-h-[400px] lg:min-h-0 flex items-center justify-center p-4 relative">
            
            {/* Ambient telemetry markings */}
            <div className="absolute top-4 left-4 font-mono text-[8px] opacity-25 uppercase text-white tracking-widest select-none pointer-events-none">
              COORD_GRID // WFOV_CONSTELLATION_SCAN
            </div>

            <svg viewBox="0 0 100 100" className="w-full max-w-[550px] aspect-square overflow-visible relative">
              
              {/* Background circular radar lines */}
              <circle cx="50" cy="50" r="15" fill="none" stroke={isAvant ? 'rgba(57,255,20,0.03)' : 'rgba(255,255,255,0.015)'} strokeWidth="0.5" />
              <circle cx="50" cy="50" r="30" fill="none" stroke={isAvant ? 'rgba(57,255,20,0.03)' : 'rgba(255,255,255,0.015)'} strokeWidth="0.5" />
              <circle cx="50" cy="50" r="42" fill="none" stroke={isAvant ? 'rgba(57,255,20,0.03)' : 'rgba(255,255,255,0.015)'} strokeWidth="0.5" strokeDasharray="2 4" />
              
              {/* Sector Connective Laser Lines */}
              {chapters.map((ch, idx) => {
                if (idx === chapters.length - 1) return null;
                const nextCh = chapters[idx + 1];
                const lineUnlocked = nextCh.unlocked;
                
                return (
                  <line
                    key={`line-${idx}`}
                    x1={ch.meta.mapX}
                    y1={ch.meta.mapY}
                    x2={nextCh.meta.mapX}
                    y2={nextCh.meta.mapY}
                    stroke={lineUnlocked 
                      ? (isAvant ? '#39FF14' : ch.meta.dc)
                      : (isAvant ? 'rgba(57,255,20,0.1)' : 'rgba(255,255,255,0.04)')
                    }
                    strokeWidth={lineUnlocked ? 0.75 : 0.4}
                    strokeDasharray={lineUnlocked ? "none" : "1 1"}
                    className={lineUnlocked ? "pulse-stroke" : ""}
                    style={{
                      opacity: lineUnlocked ? 0.7 : 0.25,
                      filter: lineUnlocked && !isAvant ? `drop-shadow(0 0 3px ${ch.meta.dc})` : 'none'
                    }}
                  />
                );
              })}

              {/* Constellation Nodes */}
              {chapters.map((ch, idx) => {
                const isSelected = selectedIdx === idx;
                const unlocked = ch.unlocked;
                const completed = ch.cleared >= ch.regularIds.length && ch.regularIds.length > 0;
                
                let nodeColor = 'rgba(255,255,255,0.1)';
                if (unlocked) {
                  nodeColor = isAvant ? '#39FF14' : ch.meta.dc;
                }
                
                return (
                  <g
                    key={`node-${idx}`}
                    transform={`translate(${ch.meta.mapX}, ${ch.meta.mapY})`}
                    onClick={() => handleNodeClick(idx)}
                    className="cursor-pointer group"
                  >
                    {/* Ring highlight on selection */}
                    {isSelected && (
                      <circle
                        r="5.5"
                        fill="none"
                        stroke={isAvant ? '#39FF14' : ch.meta.dc}
                        strokeWidth="0.5"
                        className="animate-ping"
                        style={{ opacity: 0.35 }}
                      />
                    )}

                    {/* Outer border ring */}
                    <circle
                      r="4"
                      fill="rgba(5, 5, 5, 0.9)"
                      stroke={nodeColor}
                      strokeWidth={isSelected ? 1.0 : completed ? 0.6 : 0.4}
                      className={`transition-all duration-300 ${isSelected ? 'scale-110' : 'group-hover:scale-105'}`}
                      style={{
                        filter: isSelected && !isAvant ? `drop-shadow(0 0 6px ${ch.meta.dc})` : 'none',
                        opacity: unlocked ? 1 : 0.4
                      }}
                    />

                    {/* Inner core center */}
                    <circle
                      r={completed ? "1.8" : isSelected ? "1.4" : "1.0"}
                      fill={completed ? '#E5B800' : unlocked ? nodeColor : 'rgba(255,255,255,0.1)'}
                      className="transition-all duration-300"
                    />

                    {/* Node status symbols */}
                    {!unlocked && (
                      <g transform="scale(0.3) translate(-8, -8)" opacity="0.65">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="none" stroke="#FF3800" strokeWidth="2" />
                      </g>
                    )}

                    {/* Label */}
                    <text
                      y="7.5"
                      textAnchor="middle"
                      className="font-mono text-[2.8px] font-bold tracking-widest pointer-events-none select-none"
                      fill={isSelected ? (isAvant ? '#39FF14' : '#fff') : unlocked ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)'}
                      style={{
                        textShadow: isSelected && !isAvant ? `0 0 4px ${ch.meta.dc}80` : 'none'
                      }}
                    >
                      {String(ch.meta.month).padStart(2, '0')}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* RIGHT PANEL: Telemetry Detail Sidebar */}
          <div className="w-full lg:w-[360px] flex-shrink-0 flex flex-col justify-between border-t lg:border-t-0 lg:border-l p-6 lg:p-8"
            style={{
              background: isAvant ? 'rgba(5,5,5,0.85)' : 'rgba(8,8,12,0.55)',
              borderColor: isAvant ? 'rgba(57,255,20,0.2)' : 'rgba(255,255,255,0.06)',
              backdropFilter: 'blur(16px)'
            }}>

            {selectedSector ? (
              <AnimatePresence mode="wait">
                <motion.div
                  key={selectedSector.meta.month}
                  initial={{ opacity: 0, x: 15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -15 }}
                  transition={{ duration: 0.2 }}
                  className="flex-1 flex flex-col justify-between"
                >
                  {/* Top sector description block */}
                  <div className="space-y-6">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-mono text-[9px] font-bold tracking-[0.25em]" style={{ color: isAvant ? '#39FF14' : selectedSector.meta.dc }}>
                          SECTOR_{String(selectedSector.meta.month).padStart(2, '0')} //
                        </span>
                        
                        <div className="flex gap-2">
                          <span className="font-mono text-[9px] px-2 py-0.5 border"
                            style={{ 
                              color: isAvant ? '#39FF14' : selectedSector.meta.dc, 
                              borderColor: isAvant ? 'rgba(57,255,20,0.3)' : `${selectedSector.meta.dc}30`,
                              background: 'rgba(0,0,0,0.2)' 
                            }}>
                            {selectedSector.meta.diff}
                          </span>
                          <span className="font-mono text-[9px] px-2 py-0.5 border border-white/5 text-zinc-500 uppercase">
                            {selectedSector.meta.mood}
                          </span>
                        </div>
                      </div>
                      
                      <h2 className="font-mono font-black text-2xl uppercase tracking-wider text-white">
                        {selectedSector.meta.name}
                      </h2>
                      <div className="font-mono text-[10px] text-zinc-500 mt-1 tracking-widest uppercase">
                        {selectedSector.meta.sub}
                      </div>
                    </div>

                    {/* Lock message card */}
                    {!selectedSector.unlocked && (
                      <div className="p-4 border border-[#FF3800]/30 bg-[#FF3800]/05 font-mono text-xs">
                        <div className="flex items-center gap-2 text-[#FF3800] font-black uppercase mb-1">
                          <Lock size={12} />
                          SIGNAL BLOCKED
                        </div>
                        <div className="text-zinc-400 text-[10px] leading-relaxed uppercase">
                          Decode previous sector nodes to establish a stable neural connection to this frequency.
                        </div>
                      </div>
                    )}

                    {/* Sector details and metrics */}
                    <div className="space-y-4 font-mono">
                      
                      {/* Clear Progress */}
                      <div>
                        <div className="flex justify-between text-[10px] text-zinc-400 mb-1.5 uppercase">
                          <span>Sector Decoded</span>
                          <span style={{ color: selectedSector.cleared > 0 ? (isAvant ? '#39FF14' : selectedSector.meta.dc) : 'rgba(255,255,255,0.2)' }}>
                            {selectedSector.cleared} / {selectedSector.regularIds.length} tracks
                          </span>
                        </div>
                        <div className="h-1.5 bg-neutral-950 flex relative overflow-hidden" style={{ border: isAvant ? '1px solid rgba(57,255,20,0.15)' : '1px solid rgba(255,255,255,0.06)' }}>
                          <div
                            className="h-full transition-all duration-500"
                            style={{
                              width: `${(selectedSector.cleared / (selectedSector.regularIds.length || 1)) * 100}%`,
                              background: isAvant ? '#39FF14' : selectedSector.meta.dc,
                              boxShadow: selectedSector.cleared > 0 && !isAvant ? `0 0 10px ${selectedSector.meta.dc}` : 'none'
                            }}
                          />
                        </div>
                      </div>

                      {/* Platinum and Bonus Locks */}
                      <div className="grid grid-cols-2 gap-3 mt-4">
                        <div className="p-3 border border-white/5 bg-zinc-950/40">
                          <div className="text-[8px] text-zinc-500 tracking-wider uppercase mb-1">PLATINUMS</div>
                          <div className="text-lg font-black text-[#39FF14]">
                            ✦ {selectedSector.platinums}
                          </div>
                          <div className="text-[7px] text-zinc-500 mt-1 uppercase">Needed: {selectedSector.meta.platNeeded} PT</div>
                        </div>

                        <div className="p-3 border border-white/5 bg-zinc-950/40">
                          <div className="text-[8px] text-zinc-500 tracking-wider uppercase mb-1">BONUS STAGES</div>
                          <div className={`text-lg font-black ${selectedSector.bonusUnlocked ? 'text-[#E5B800]' : 'text-zinc-600'}`}>
                            {selectedSector.bonusUnlocked ? '★ UNLOCKED' : '🔒 LOCKED'}
                          </div>
                          <div className="text-[7px] text-zinc-500 mt-1 uppercase">{selectedSector.bonusCount} locked tracks</div>
                        </div>
                      </div>

                    </div>
                  </div>

                  {/* Bottom play action panel */}
                  <div className="space-y-4 mt-8">
                    {/* Enter Sector CTA */}
                    <button
                      disabled={!selectedSector.unlocked}
                      onClick={handleEnterSector}
                      className={`w-full py-4 font-mono font-bold text-xs tracking-[0.3em] border transition-all uppercase flex items-center justify-center gap-2 ${
                        selectedSector.unlocked
                          ? (isAvant
                            ? "border-[#39FF14] text-[#39FF14] hover:bg-[#39FF14]/10"
                            : "neon-btn text-white"
                          )
                          : "border-zinc-800 bg-zinc-950/20 text-zinc-600 cursor-not-allowed"
                      }`}
                    >
                      {selectedSector.unlocked ? (
                        <>
                          <Play size={10} className="fill-current" />
                          [ ENGAGE SECTOR ]
                        </>
                      ) : (
                        <>
                          <Lock size={10} />
                          [ CODES INSUFFICIENT ]
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              </AnimatePresence>
            ) : null}

            {/* Total telemetry metrics bottom line */}
            <div className="mt-8 pt-6 border-t border-white/5 font-mono flex items-center justify-between text-[8px] tracking-widest text-zinc-500 uppercase select-none">
              <span>CLEARED: {totals.cleared}</span>
              <span>PLAT: ✦{totals.platinums}</span>
              <span>SCORE: {totals.score.toLocaleString()}</span>
            </div>

          </div>
        </div>
      )}

      {/* SVG animations and style overlays */}
      <style>{`
        @keyframes strokePulse {
          0%, 100% { opacity: 0.6; }
          50%      { opacity: 0.95; }
        }
        .pulse-stroke {
          animation: strokePulse 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
