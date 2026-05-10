import { useLocation } from "wouter";
import { useEffect, useState, useCallback } from "react";
import { getTotalScore, getTotalPlatinums, getTotalCleared } from "@/game/progress";
import { loadOpts, keyLabel } from "@/lib/options";
import { audioManager } from "@/game/audio";

export default function Home() {
  const [, setLocation] = useLocation();
  const [blink, setBlink] = useState(true);
  const [stats, setStats] = useState({ score: 0, platinums: 0, cleared: 0 });
  const liveOpts = loadOpts();
  const LANE_COLORS = liveOpts.laneColors;
  const LANE_KEYS   = liveOpts.laneKeys.map(k => keyLabel(k));

  const navigate = useCallback((path: string) => {
    audioManager.ensureReady().then(() => audioManager.preloadAll());
    audioManager.playSfx('tap_nav', 0.4);
    setLocation(path);
  }, [setLocation]);

  useEffect(() => {
    const id = setInterval(() => setBlink(b => !b), 700);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setStats({ score: getTotalScore(), platinums: getTotalPlatinums(), cleared: getTotalCleared() });
  }, []);

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 45%, #0e1028 0%, #080808 55%, #0a0810 100%)' }}>

      {/* Ambient floating particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="absolute rounded-full"
            style={{
              width: 2 + (i % 3),
              height: 2 + (i % 3),
              left: `${8 + (i * 7.3) % 84}%`,
              top: `${60 + (i * 11) % 40}%`,
              background: [LANE_COLORS[0], LANE_COLORS[1], LANE_COLORS[2]][i % 3],
              opacity: 0.25,
              animation: `float-up ${4 + (i % 3) * 2}s ${i * 0.5}s ease-in-out infinite`,
            }} />
        ))}
      </div>

      {/* Structural grid — subtle */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.01) 1px, transparent 1px)', backgroundSize: '80px 80px' }} />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4 z-20"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(8,8,12,0.6)', backdropFilter: 'blur(16px)' }}>
        <div className="font-mono text-[10px] font-bold tracking-[0.6em] uppercase" style={{ color: '#ACE894', textShadow: '0 0 15px rgba(172,232,148,0.5)' }}>
          TH3SCR1B3 // PROTOCOL
        </div>
        <div className="font-mono text-[9px] tracking-[0.4em] uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>
          VERSION 2.4.0 — ACTIVE
        </div>
      </div>

      <div className="relative z-10 flex flex-col items-center w-full max-w-lg px-6 slide-up">

        {/* Hero number */}
        <div className="relative w-full text-center" style={{ marginBottom: -10 }}>
          <div className="font-mono font-black leading-none select-none text-glow"
            style={{
              fontSize: 'clamp(120px, 25vw, 200px)',
              background: 'linear-gradient(180deg, #FFFFFF 0%, #C8B88A 50%, #8A7A5A 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.05em',
              lineHeight: 0.8,
              filter: 'drop-shadow(0 0 50px rgba(255,255,255,0.2))',
            }}>
            365
          </div>
        </div>

        {/* Sub label */}
        <div className="w-full text-center py-4 mb-4">
          <div className="font-mono text-[11px] font-bold tracking-[0.5em] uppercase" style={{ color: 'rgba(255,255,255,0.4)' }}>
            DAYS OF <span style={{ color: '#F2F0E8' }}>LIGHT</span> &amp; <span style={{ color: '#FF5400' }}>DARK</span>
          </div>
        </div>

        {/* Live stats — only if played */}
        {stats.score > 0 && (
          <div className="w-full grid grid-cols-3 mb-6 glass-card">
            {[
              { label: 'SCORE',    value: stats.score.toLocaleString(), color: '#F2F0E8' },
              { label: 'PLATINUM', value: stats.platinums,              color: '#ACE894' },
              { label: 'CLEARED',  value: stats.cleared,                color: '#FFBD00' },
            ].map((s, i) => (
              <div key={s.label} className="py-4 text-center relative"
                style={{ borderRight: i < 2 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                <div className="font-mono font-bold text-xl leading-tight" style={{ color: s.color, textShadow: `0 0 15px ${s.color}50` }}>{s.value}</div>
                <div className="font-mono font-bold" style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.2em' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* CTA buttons */}
        <div className="w-full mt-2 flex flex-col gap-4">
          <button
            data-testid="button-start"
            onClick={() => navigate('/campaign')}
            className="neon-btn w-full py-6 text-base tracking-[0.5em] font-black uppercase">
            ▶ INITIATE CAMPAIGN
          </button>

          <button
            onClick={() => navigate('/songs')}
            className="neon-btn-outline w-full py-4 text-xs tracking-[0.4em] uppercase">
            ◈ ARCHIVE — ALL 365 TRACKS
          </button>

          <div className="flex gap-3">
            <button
              onClick={() => navigate('/tutorial')}
              className="neon-btn-outline flex-1 py-3 text-[10px] tracking-[0.3em] uppercase">
              ? INTEL
            </button>

            <button
              onClick={() => navigate('/options')}
              className="neon-btn-outline flex-1 py-3 text-[10px] tracking-[0.3em] uppercase">
              ⚙ CORE
            </button>
          </div>
        </div>

        {/* Blink prompt */}
        <div className="mt-8 font-mono text-[10px] font-bold tracking-[0.4em] transition-opacity duration-300"
          style={{ opacity: blink ? 0.6 : 0, color: 'rgba(255,255,255,0.5)' }}>
          <span className="shimmer-text">[ STANDBY FOR TRANSMISSION ]</span>
        </div>

        {/* Lane keys */}
        <div className="mt-8 flex gap-5 w-full max-w-xs mx-auto justify-center">
          {LANE_KEYS.map((key, i) => (
            <div key={key} className="flex flex-col items-center gap-2">
              <div className="flex items-center justify-center font-mono font-bold text-xl rounded-xl transition-transform hover:scale-110 cursor-default"
                style={{
                  width: 48, height: 48,
                  color: LANE_COLORS[i],
                  background: `${LANE_COLORS[i]}10`,
                  border: `1px solid ${LANE_COLORS[i]}40`,
                  boxShadow: `0 0 20px ${LANE_COLORS[i]}20, inset 0 0 10px ${LANE_COLORS[i]}10`,
                  textShadow: `0 0 12px ${LANE_COLORS[i]}`,
                }}>{key}</div>
              <div className="font-mono font-bold" style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.2em' }}>
                {['LEFT','MID','RIGHT'][i]}
              </div>
            </div>
          ))}
        </div>

        {/* Power-up row */}
        <div className="mt-6 flex w-full max-w-sm mx-auto glass-card">
          {[
            { label: 'FEVER',       color: '#FFBD00', mult: 2, combo: 20 },
            { label: 'SURGE',       color: '#FF5400', mult: 3, combo: 40 },
            { label: 'OVERDRIVE',   color: '#ACE894', mult: 4, combo: 60 },
          ].map((p, i) => (
            <div key={p.label} className="flex-1 py-3 text-center relative"
              style={{ borderRight: i < 2 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
              <div className="font-mono font-bold uppercase" style={{ fontSize: 10, color: p.color, letterSpacing: '0.1em', textShadow: `0 0 10px ${p.color}40` }}>{p.label}</div>
              <div className="font-mono" style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>×{p.mult} @ {p.combo}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center py-3"
        style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <a href="https://th3scr1b3.art" target="_blank" rel="noopener noreferrer"
          className="font-mono text-xs tracking-widest transition-colors duration-200"
          style={{ color: 'rgba(255,255,255,0.15)' }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#ACE894')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.15)')}>
          TH3SCR1B3.ART
        </a>
      </div>
    </div>
  );
}
