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

  const [showIntro, setShowIntro] = useState(() => !sessionStorage.getItem('intro_seen'));
  const [introPhase, setIntroPhase] = useState<'prompt'|'booting'|'presented'|'intro'|'intro_2'|'intro3'|'done'>('prompt');
  const [bootText, setBootText] = useState("");

  const startIntroSequence = useCallback(async () => {
    if (introPhase !== 'prompt') return;
    setIntroPhase('booting');
    await audioManager.ensureReady();
    audioManager.preloadAll();
    
    // Ensure intro sounds are cached
    await Promise.all([
      audioManager.loadSfx('by_th3scr1b3'),
      audioManager.loadSfx('intro'),
      audioManager.loadSfx('intro_2'),
      audioManager.loadSfx('intro3')
    ]);

    // Boot sequence effect
    const lines = [
      "> INITIATING SECURE CONNECTION...",
      "> BYPASSING MAINFRAME PROTOCOLS...",
      "> DECRYPTING AUDIO STEMS...",
      "> CALIBRATING NEURAL LINK... [OK]"
    ];
    for (let i = 0; i < lines.length; i++) {
      setBootText(lines.slice(0, i+1).join('\n'));
      audioManager.playSfx('tap_nav', 0.2);
      await new Promise(r => setTimeout(r, 150 + Math.random() * 200));
    }
    await new Promise(r => setTimeout(r, 300));

    setIntroPhase('presented');
    audioManager.playSfx('by_th3scr1b3', 0.9);

    setTimeout(() => {
      const intros = ['intro', 'intro_2', 'intro3'] as const;
      const pick = intros[Math.floor(Math.random() * intros.length)];
      setIntroPhase(pick as any);
      audioManager.playSfx(pick, 0.9);
      
      setTimeout(() => {
        setIntroPhase('done');
        sessionStorage.setItem('intro_seen', 'true');
        setShowIntro(false);
        window.dispatchEvent(new Event("intro_finished"));
      }, 6000); // Wait for the intro sound to finish
    }, 2500); // Wait for "presented by th3scr1b3"
  }, [introPhase]);

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
    <>
      <style>{`
        @keyframes late-tagline {
          0% {
            opacity: 0;
            transform: translateY(12px);
            letter-spacing: 0.2em;
            filter: blur(4px);
          }
          100% {
            opacity: 0.85;
            transform: translateY(0);
            letter-spacing: 0.6em;
            filter: blur(0);
          }
        }
      `}</style>
      {showIntro && (
        <div 
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center cursor-pointer transition-opacity duration-1000"
          style={{ background: '#080808', opacity: introPhase === 'done' ? 0 : 1 }}
          onClick={startIntroSequence}
        >
          {introPhase === 'prompt' && (
            <div className="font-mono text-xs tracking-[0.5em] animate-pulse" style={{ color: 'rgba(255,255,255,0.5)' }}>
              TAP TO INITIATE
            </div>
          )}
          {introPhase === 'booting' && (
            <div className="font-mono text-[10px] sm:text-xs text-left w-full max-w-md px-6 leading-relaxed" style={{ color: '#39FF14' }}>
              {bootText.split('\n').map((line, i) => <div key={i}>{line}</div>)}
              <div className="animate-pulse inline-block w-2 h-3 bg-[#39FF14] ml-1 align-middle" />
            </div>
          )}
          {introPhase === 'presented' && (
            <div className="font-mono text-center px-4 animate-in zoom-in-95 duration-1000 z-10" style={{ transition: 'all 1s cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
              <div className="text-[12px] tracking-[0.8em] mb-4 rewind-flicker" style={{ color: '#FF1493' }}>
                PRESENTED BY
              </div>
              <div className="text-3xl tracking-[0.5em] font-black" style={{ color: '#F2F0E8', textShadow: '0 0 30px rgba(242,240,232,0.4)' }}>
                TH3SCR1B3
              </div>
            </div>
          )}
          {(introPhase === 'intro' || introPhase === 'intro_2' || introPhase === 'intro3') && (
            <>
              <div className="absolute inset-0 pointer-events-none mix-blend-screen transition-opacity duration-100"
                style={{
                  background: introPhase === 'intro' ? 'radial-gradient(circle, rgba(57,255,20,0.6) 0%, transparent 80%)' :
                              introPhase === 'intro_2' ? 'radial-gradient(circle, rgba(0,229,255,0.7) 0%, transparent 80%)' :
                              'radial-gradient(circle, rgba(255,20,147,0.6) 0%, transparent 80%)'
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden" style={{ perspective: '1200px' }}>
                 <div className="relative flex items-center justify-center w-full h-full animate-in zoom-in-150 ease-out" style={{ transformStyle: 'preserve-3d', animationDuration: '6s' }}>
                   {/* Back Layer - Neon Green */}
                   <div className="absolute font-mono font-black text-center mix-blend-screen opacity-60 rewind-flicker" 
                        style={{ fontSize: '42vw', lineHeight: 0.8, color: '#39FF14', transform: 'scale(1.2) translateZ(-200px)', filter: 'blur(20px)', animationDuration: '0.12s' }}>
                      365
                   </div>
                   {/* Middle Layer - Hot Pink */}
                   <div className="absolute font-mono font-black text-center mix-blend-screen opacity-80 rewind-flicker" 
                        style={{ fontSize: '41vw', lineHeight: 0.8, color: '#FF1493', transform: 'scale(1.1) translateZ(-100px)', filter: 'blur(10px)', animationDuration: '0.15s' }}>
                      365
                   </div>
                   {/* Front Layer - Brilliant White with Cyan Glow */}
                   <div className="absolute font-mono font-black text-center mix-blend-overlay opacity-100 rewind-flicker" 
                        style={{ fontSize: '40vw', lineHeight: 0.8, color: '#fff', textShadow: '0 0 30px #fff, 0 0 80px #00E5FF, 0 0 150px #00E5FF' }}>
                      365
                   </div>
                 </div>
              </div>
              <div className="absolute inset-0 rewind-glitch pointer-events-none opacity-90 mix-blend-screen" />
            </>
          )}
        </div>
      )}

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
      <div className={`absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4 z-20 transition-all duration-1000 ${!showIntro ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(8,8,12,0.6)', backdropFilter: 'blur(16px)' }}>
        <div className="font-mono text-[10px] font-bold tracking-[0.6em] uppercase" style={{ color: '#39FF14', textShadow: '0 0 15px rgba(57,255,20,0.5)' }}>
          TH3SCR1B3 // PROTOCOL
        </div>
        <div className="font-mono text-[9px] tracking-[0.4em] uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>
          VERSION 2.4.0 — ACTIVE
        </div>
      </div>

      <div className={`relative z-10 flex flex-col items-center w-full max-w-lg px-6 ${!showIntro ? 'slide-up' : 'opacity-0'}`}>

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
        <div className="w-full text-center py-4 mb-2">
          <div className="font-mono text-[11px] font-bold tracking-[0.5em] uppercase" style={{ color: 'rgba(255,255,255,0.4)' }}>
            DAYS OF <span style={{ color: '#F2F0E8' }}>LIGHT</span> &amp; <span style={{ color: '#FF1493' }}>DARK</span>
          </div>
        </div>

        {/* Tagline - poetry in motion (late animated intro) */}
        <div className="w-full text-center mb-6 opacity-0"
          style={{
            animation: !showIntro ? 'late-tagline 2.2s 1.2s cubic-bezier(0.25, 1, 0.5, 1) forwards' : 'none'
          }}>
          <div className="font-mono text-[9px] tracking-[0.5em] uppercase italic"
            style={{
              background: 'linear-gradient(90deg, rgba(255,255,255,0.3) 0%, #FF1493 50%, rgba(255,255,255,0.3) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textShadow: '0 0 15px rgba(255,20,147,0.4)',
            }}>
            poetry in motion
          </div>
        </div>

        {/* Live stats — only if played */}
        {stats.score > 0 && (
          <div className="w-full grid grid-cols-3 mb-6 glass-card">
            {[
              { label: 'SCORE',    value: stats.score.toLocaleString(), color: '#F2F0E8' },
              { label: 'PLATINUM', value: stats.platinums,              color: '#39FF14' },
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
            { label: 'SURGE',       color: '#FF1493', mult: 3, combo: 40 },
            { label: 'OVERDRIVE',   color: '#39FF14', mult: 4, combo: 60 },
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
      <div className={`absolute bottom-0 left-0 right-0 flex items-center justify-center py-3 transition-all duration-1000 ${!showIntro ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <a href="https://th3scr1b3.art" target="_blank" rel="noopener noreferrer"
          className="font-mono text-xs tracking-widest transition-colors duration-200"
          style={{ color: 'rgba(255,255,255,0.15)' }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#39FF14')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.15)')}>
          TH3SCR1B3.ART
        </a>
      </div>
    </div>
    </>
  );
}
