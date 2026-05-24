import { useLocation } from "wouter";
import { useEffect, useState, useCallback } from "react";
import { getTotalScore, getTotalPlatinums, getTotalCleared } from "@/game/progress";
import { loadOpts, keyLabel } from "@/lib/options";
import { audioManager } from "@/game/audio";

let hasPlayedIntroThisSession = false;
let sessionIntroType: 'classic' | 'avant-garde' | null = null;

export default function Home() {
  const [, setLocation] = useLocation();
  const [blink, setBlink] = useState(true);
  const [stats, setStats] = useState({ score: 0, platinums: 0, cleared: 0 });
  const liveOpts = loadOpts();
  const LANE_COLORS = liveOpts.laneColors;
  const LANE_KEYS   = liveOpts.laneKeys.map(k => keyLabel(k));

  const [introType] = useState<'classic' | 'avant-garde'>(() => {
    if (sessionIntroType) {
      sessionStorage.setItem('pim_active_theme', sessionIntroType);
      return sessionIntroType;
    }
    const cur = localStorage.getItem('pim_intro_type') || 'classic';
    const next = cur === 'classic' ? 'avant-garde' : 'classic';
    localStorage.setItem('pim_intro_type', next);
    sessionIntroType = cur as 'classic' | 'avant-garde';
    sessionStorage.setItem('pim_active_theme', sessionIntroType);
    return sessionIntroType;
  });

  const [showIntro, setShowIntro] = useState(() => !hasPlayedIntroThisSession);
  const [introPhase, setIntroPhase] = useState<'prompt'|'booting'|'presented'|'intro'|'intro_2'|'intro3'|'climax'|'done'>('prompt');
  const [bootText, setBootText] = useState("");
  const [isIntroTransition, setIsIntroTransition] = useState(false);
  const [currentTime, setCurrentTime] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!showIntro) {
      const completed = localStorage.getItem("pim_tutorial_completed");
      if (!completed) {
        setShowOnboarding(true);
      }
    }
  }, [showIntro]);


  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      setCurrentTime(`${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`);
    };
    updateClock();
    const id = setInterval(updateClock, 1000);
    return () => clearInterval(id);
  }, []);

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
      audioManager.loadSfx('intro3'),
      audioManager.loadSfx('fusion')
    ]);

    if (introType === 'classic') {
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
        setIntroPhase(pick);
        audioManager.playSfx(pick, 0.9);
        
        setTimeout(() => {
          setIntroPhase('done');
          hasPlayedIntroThisSession = true;
          setShowIntro(false);
          window.dispatchEvent(new Event("intro_finished"));
        }, 6000); // Wait for the intro sound to finish
      }, 2500); // Wait for "presented by th3scr1b3"
    } else {
      // Avant-Garde Intro sequence
      // 1. Booting scan phase
      await new Promise(r => setTimeout(r, 1800));

      // 2. Presented split-reveal
      setIntroPhase('presented');
      audioManager.playSfx('by_th3scr1b3', 0.9);
      await new Promise(r => setTimeout(r, 2200));

      // 3. Kinetic Letters: P
      setIntroPhase('intro');
      audioManager.playSfx('intro', 0.9);
      await new Promise(r => setTimeout(r, 1400));

      // 4. Kinetic Letters: I
      setIntroPhase('intro_2');
      audioManager.playSfx('intro_2', 0.9);
      await new Promise(r => setTimeout(r, 1400));

      // 5. Kinetic Letters: M
      setIntroPhase('intro3');
      audioManager.playSfx('intro3', 0.9);
      await new Promise(r => setTimeout(r, 1400));

      // 6. Climax: Merged PIM + 3D Grid Ticker
      setIntroPhase('climax');
      audioManager.playSfx('fusion', 0.8);
      await new Promise(r => setTimeout(r, 2600));

      // 7. Done
      setIsIntroTransition(true);
      setIntroPhase('done');
      hasPlayedIntroThisSession = true;
      setShowIntro(false);
      window.dispatchEvent(new Event("intro_finished"));
    }
  }, [introPhase, introType]);

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

        /* Avant-Garde Intro Animations */
        @keyframes laser-sweep {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
        @keyframes split-top {
          0% { transform: translateX(0); opacity: 0; }
          12% { opacity: 1; }
          82% { transform: translateX(0); opacity: 1; }
          100% { transform: translateX(-100%); opacity: 0; }
        }
        @keyframes split-bottom {
          0% { transform: translateX(0); opacity: 0; }
          12% { opacity: 1; }
          82% { transform: translateX(0); opacity: 1; }
          100% { transform: translateX(100%); opacity: 0; }
        }
        .split-slide-top {
          animation: split-top 2.2s cubic-bezier(0.77, 0, 0.175, 1) forwards;
        }
        .split-slide-bottom {
          animation: split-bottom 2.2s cubic-bezier(0.77, 0, 0.175, 1) forwards;
        }

        @keyframes kinetic-zoom-p {
          0% { transform: scale(3.5) translate(8vw, -8vh); opacity: 0; filter: blur(20px); }
          15% { opacity: 0.95; filter: blur(0); }
          100% { transform: scale(1.1) translate(0, 0); opacity: 0.85; }
        }
        @keyframes kinetic-zoom-i {
          0% { transform: scale(0.2) translate(-20vw, 12vh); opacity: 0; filter: blur(10px); }
          15% { opacity: 0.95; filter: blur(0); }
          100% { transform: scale(1.0) translate(0, 0); opacity: 0.85; }
        }
        @keyframes kinetic-zoom-m {
          0% { transform: scale(2.0) translate(25vw, 4vh); opacity: 0; filter: blur(15px); }
          15% { opacity: 0.95; filter: blur(0); }
          100% { transform: scale(1.0) translate(0, 0); opacity: 0.85; }
        }

        @keyframes climax-pim-pulse {
          0% { transform: scale(0.5); filter: blur(15px); opacity: 0; }
          12% { transform: scale(1.05); filter: blur(0); opacity: 1; }
          18% { transform: scale(1.0); }
          82% { transform: scale(1.0); opacity: 1; }
          100% { transform: scale(1.6); filter: blur(25px); opacity: 0; }
        }
        .climax-pim {
          animation: climax-pim-pulse 2.6s cubic-bezier(0.19, 1, 0.22, 1) forwards;
        }

        @keyframes rotate-grid-floor {
          0% { transform: rotateX(75deg) rotateZ(0deg) translateZ(-50px); }
          100% { transform: rotateX(75deg) rotateZ(360deg) translateZ(-50px); }
        }
        .neon-grid-floor {
          position: absolute;
          width: 300%;
          height: 300%;
          bottom: -100%;
          left: -100%;
          background-image: 
            linear-gradient(rgba(0, 229, 255, 0.12) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 229, 255, 0.12) 1px, transparent 1px);
          background-size: 60px 60px;
          background-position: center;
          transform: rotateX(75deg);
          transform-origin: center center;
          animation: rotate-grid-floor 15s linear infinite;
          mask-image: radial-gradient(circle at center, black 25%, transparent 70%);
          -webkit-mask-image: radial-gradient(circle at center, black 25%, transparent 70%);
        }

        @keyframes rise-column {
          0% { transform: scaleY(0); opacity: 0; }
          40% { opacity: 0.5; }
          80% { opacity: 0.5; }
          100% { transform: scaleY(1); opacity: 0; }
        }

        @keyframes ticker-slide-left {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes ticker-slide-right {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
        .ticker-text {
          display: flex;
          white-space: nowrap;
          font-family: monospace;
          font-size: 9px;
          letter-spacing: 0.4em;
          color: rgba(255, 255, 255, 0.25);
        }

        @keyframes pim-glow-breath {
          0% { text-shadow: 0 0 15px #fff, 0 0 30px #FF1493, 0 0 60px #00E5FF; transform: scale(1); }
          100% { text-shadow: 0 0 25px #fff, 0 0 50px #FF1493, 0 0 100px #00E5FF; transform: scale(1.02); }
        }

        @keyframes avant-fade-in {
          0% { opacity: 0; transform: translateY(15px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .avant-fade-slow {
          animation: avant-fade-in 2.5s cubic-bezier(0.25, 1, 0.5, 1) both;
        }

        /* ── HUD Telemetry Overlays ── */
        .hud-corner {
          position: absolute;
          width: 14px;
          height: 14px;
          border-color: rgba(0, 229, 255, 0.4);
          border-style: solid;
          pointer-events: none;
          z-index: 10;
        }
        .hud-corner-tl { top: 76px; left: 24px; border-width: 2px 0 0 2px; }
        .hud-corner-tr { top: 76px; right: 24px; border-width: 2px 2px 0 0; }
        .hud-corner-bl { bottom: 24px; left: 24px; border-width: 0 0 2px 2px; }
        .hud-corner-br { bottom: 24px; right: 24px; border-width: 0 2px 2px 0; }

        @keyframes scanline-sweep {
          0% { transform: translateY(-100vh); }
          100% { transform: translateY(100vh); }
        }
        .hud-scanline-active {
          position: absolute;
          left: 0; right: 0; top: 0; height: 10px;
          background: linear-gradient(to bottom, transparent, rgba(0, 229, 255, 0.05), transparent);
          pointer-events: none;
          z-index: 5;
          animation: scanline-sweep 8s linear infinite;
        }

        /* ── Multi-Layer Glitch Typography ── */
        @keyframes glitch-cyan-anim {
          0%, 100% { transform: translate(-3px, 2px); }
          20% { transform: translate(2px, -2px); }
          40% { transform: translate(-1px, -1px); }
          60% { transform: translate(3px, 1px); }
          80% { transform: translate(-2px, -3px); }
        }
        @keyframes glitch-magenta-anim {
          0%, 100% { transform: translate(3px, -2px); }
          20% { transform: translate(-2px, 2px); }
          40% { transform: translate(2px, 1px); }
          60% { transform: translate(-3px, -1px); }
          80% { transform: translate(1px, 3px); }
        }
        .pim-layer-cyan {
          animation: glitch-cyan-anim 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) infinite;
          mix-blend-mode: screen;
        }
        .pim-layer-magenta {
          animation: glitch-magenta-anim 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94) infinite;
          mix-blend-mode: screen;
        }

        /* ── Soundwave Widget ── */
        @keyframes eq-bounce-anim {
          0%, 100% { transform: scaleY(0.1); }
          50% { transform: scaleY(1.0); }
        }
        .eq-widget-bar {
          display: inline-block;
          width: 3px;
          height: 100%;
          background: linear-gradient(to top, #00E5FF, #FF1493);
          transform-origin: bottom;
          margin-right: 3px;
        }

        /* ── List Row Menu ── */
        .avant-menu-row {
          position: relative;
          display: flex;
          align-items: center;
          width: 100%;
          padding: 1.25rem 0.5rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          font-family: monospace;
          text-align: left;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          overflow: hidden;
        }
        .avant-menu-row:hover {
          background: rgba(0, 229, 255, 0.03);
          padding-left: 1.5rem;
        }
        .avant-menu-line {
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          height: 1px;
          background: linear-gradient(90deg, #00E5FF, #FF1493, transparent);
          transform: scaleX(0);
          transform-origin: left;
          transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .avant-menu-row:hover .avant-menu-line {
          transform: scaleX(1);
        }
      `}</style>
      {showIntro && (
        <div 
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center cursor-pointer transition-opacity duration-1000"
          style={{ background: '#080808', opacity: introPhase === 'done' ? 0 : 1 }}
          onClick={startIntroSequence}
        >
          {introPhase === 'prompt' && introType === 'classic' && (
            <div className="font-mono text-xs tracking-[0.5em] animate-pulse" style={{ color: 'rgba(255,255,255,0.5)' }}>
              TAP TO INITIATE
            </div>
          )}
          {introPhase === 'prompt' && introType === 'avant-garde' && (
            <div className="flex flex-col items-center gap-4 select-none">
              <div className="w-12 h-12 rounded-full border border-dashed animate-spin flex items-center justify-center" style={{ borderColor: '#FF1493', animationDuration: '8s' }}>
                <div className="w-6 h-6 rounded-full border border-solid" style={{ borderColor: '#00E5FF' }} />
              </div>
              <div className="font-mono text-[9px] tracking-[0.6em] text-center" style={{ color: '#F2F0E8' }}>
                [ PROTOCOL // PIM.INITIALIZE ]
              </div>
              <div className="font-mono text-[8px] tracking-[0.4em] uppercase opacity-40 mt-1 animate-pulse">
                Click / Tap to engage
              </div>
            </div>
          )}

          {introPhase === 'booting' && introType === 'classic' && (
            <div className="font-mono text-[10px] sm:text-xs text-left w-full max-w-md px-6 leading-relaxed" style={{ color: '#39FF14' }}>
              {bootText.split('\n').map((line, i) => <div key={i}>{line}</div>)}
              <div className="animate-pulse inline-block w-2 h-3 bg-[#39FF14] ml-1 align-middle" />
            </div>
          )}
          {introPhase === 'booting' && introType === 'avant-garde' && (
            <div className="absolute inset-0 flex flex-col justify-between p-12 overflow-hidden select-none font-mono">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-cyan-400 opacity-60 pointer-events-none" 
                   style={{
                     background: 'linear-gradient(90deg, transparent, #00E5FF, transparent)',
                     boxShadow: '0 0 15px #00E5FF',
                     animation: 'laser-sweep 1.8s cubic-bezier(0.77, 0, 0.175, 1) infinite'
                   }} />
              <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(rgba(255,255,255,0.8)_50%,transparent_50%)] bg-[length:100%_4px]" />
              <div className="text-[9px] tracking-[0.4em] text-cyan-400 opacity-60">PIM // INTRO_MATRIX_SEQUENCE</div>
              
              <div className="flex flex-col items-center justify-center flex-1 gap-2">
                <div className="text-3xl font-black tracking-[0.6em] text-[#F2F0E8] animate-pulse">BOOTING</div>
                <div className="text-[10px] tracking-[0.3em] text-[#FF1493] opacity-80">[ QUANTUM AUDIO STEM COMPILATION ]</div>
              </div>
              
              <div className="flex justify-between text-[8px] tracking-[0.2em] text-[#39FF14] opacity-50">
                <span>SYSTEM_CHECK: STABLE</span>
                <span>BYPASS_AUTH: OK</span>
              </div>
            </div>
          )}

          {introPhase === 'presented' && introType === 'classic' && (
            <div className="font-mono text-center px-4 animate-in zoom-in-95 duration-1000 z-10" style={{ transition: 'all 1s cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
              <div className="text-[12px] tracking-[0.8em] mb-4 rewind-flicker" style={{ color: '#FF1493' }}>
                PRESENTED BY
              </div>
              <div className="text-3xl tracking-[0.5em] font-black" style={{ color: '#F2F0E8', textShadow: '0 0 30px rgba(242,240,232,0.4)' }}>
                TH3SCR1B3
              </div>
            </div>
          )}
          {introPhase === 'presented' && introType === 'avant-garde' && (
            <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-black select-none font-mono">
              <div className="absolute inset-0 flex flex-col justify-end items-center pb-2 split-slide-top"
                   style={{ clipPath: 'inset(0 0 50% 0)' }}>
                <div className="text-[10px] tracking-[0.8em] mb-6 text-[#FF1493]">
                  PRESENTED BY
                </div>
                <div className="text-5xl sm:text-6xl tracking-[0.4em] font-black text-[#F2F0E8]"
                     style={{ textShadow: '0 0 25px rgba(242,240,232,0.3)' }}>
                  TH3SCR1B3
                </div>
              </div>
              <div className="absolute left-[10%] right-[10%] h-[1px] bg-white/20 z-20" />
              <div className="absolute inset-0 flex flex-col justify-end items-center pb-2 split-slide-bottom"
                   style={{ clipPath: 'inset(50% 0 0 0)' }}>
                <div className="text-[10px] tracking-[0.8em] mb-6 text-[#FF1493]">
                  PRESENTED BY
                </div>
                <div className="text-5xl sm:text-6xl tracking-[0.4em] font-black text-[#F2F0E8]"
                     style={{ textShadow: '0 0 25px rgba(242,240,232,0.3)' }}>
                  TH3SCR1B3
                </div>
              </div>
            </div>
          )}

          {introType === 'classic' && (introPhase === 'intro' || introPhase === 'intro_2' || introPhase === 'intro3') && (
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
                    <div className="absolute font-mono font-black text-center mix-blend-screen opacity-60 rewind-flicker" 
                         style={{ fontSize: '42vw', lineHeight: 0.8, color: '#39FF14', transform: 'scale(1.2) translateZ(-200px)', filter: 'blur(20px)', animationDuration: '0.12s' }}>
                       PIM
                    </div>
                    <div className="absolute font-mono font-black text-center mix-blend-screen opacity-80 rewind-flicker" 
                         style={{ fontSize: '41vw', lineHeight: 0.8, color: '#FF1493', transform: 'scale(1.1) translateZ(-100px)', filter: 'blur(10px)', animationDuration: '0.15s' }}>
                       PIM
                    </div>
                    <div className="absolute font-mono font-black text-center mix-blend-overlay opacity-100 rewind-flicker" 
                         style={{ fontSize: '40vw', lineHeight: 0.8, color: '#fff', textShadow: '0 0 30px #fff, 0 0 80px #00E5FF, 0 0 150px #00E5FF' }}>
                       PIM
                    </div>
                 </div>
              </div>
              <div className="absolute inset-0 rewind-glitch pointer-events-none opacity-90 mix-blend-screen" />
            </>
          )}

          {introType === 'avant-garde' && (introPhase === 'intro' || introPhase === 'intro_2' || introPhase === 'intro3' || introPhase === 'climax') && (
            <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-[#050505] font-mono select-none">
              <div className="absolute inset-0 pointer-events-none" style={{
                backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.01) 1px, transparent 1px)',
                backgroundSize: '100px 100px'
              }} />

              {introPhase === 'intro' && (
                <div className="flex flex-col items-center justify-center w-full h-full relative" style={{ perspective: '1200px' }}>
                  <div className="absolute font-black leading-none text-[#00E5FF] select-none uppercase tracking-tighter"
                       style={{ zIndex: 10, fontSize: '75vw', textShadow: '0 0 60px rgba(0,229,255,0.3)', animation: 'kinetic-zoom-p 1.4s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}>
                    P
                  </div>
                  <div className="absolute bottom-[20%] text-[10px] tracking-[0.8em] text-[#ffffff] uppercase animate-pulse"
                       style={{ zIndex: 20, mixBlendMode: 'difference' }}>
                    [ poetry ]
                  </div>
                </div>
              )}

              {introPhase === 'intro_2' && (
                <div className="flex flex-col items-center justify-center w-full h-full relative" style={{ perspective: '1200px' }}>
                  <div className="absolute font-black leading-none text-[#FF1493] select-none uppercase tracking-tighter"
                       style={{ zIndex: 10, fontSize: '75vw', textShadow: '0 0 60px rgba(255,20,147,0.3)', animation: 'kinetic-zoom-i 1.4s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}>
                    I
                  </div>
                  <div className="absolute bottom-[20%] text-[10px] tracking-[0.8em] text-[#ffffff] uppercase animate-pulse"
                       style={{ zIndex: 20, mixBlendMode: 'difference' }}>
                    [ in ]
                  </div>
                </div>
              )}

              {introPhase === 'intro3' && (
                <div className="flex flex-col items-center justify-center w-full h-full relative" style={{ perspective: '1200px' }}>
                  <div className="absolute font-black leading-none text-[#39FF14] select-none uppercase tracking-tighter"
                       style={{ zIndex: 10, fontSize: '75vw', textShadow: '0 0 60px rgba(57,255,20,0.3)', animation: 'kinetic-zoom-m 1.4s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}>
                    M
                  </div>
                  <div className="absolute bottom-[20%] text-[10px] tracking-[0.8em] text-[#ffffff] uppercase animate-pulse"
                       style={{ zIndex: 20, mixBlendMode: 'difference' }}>
                    [ motion ]
                  </div>
                </div>
              )}

              {introPhase === 'climax' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="neon-grid-floor" />

                  <div className="absolute bottom-0 left-[20%] w-[2px] h-[70vh] bg-gradient-to-t from-transparent to-[#00E5FF] origin-bottom scale-y-75 opacity-20"
                       style={{ animation: 'rise-column 2s infinite ease-out' }} />
                  <div className="absolute bottom-0 right-[25%] w-[2px] h-[85vh] bg-gradient-to-t from-transparent to-[#FF1493] origin-bottom scale-y-90 opacity-25"
                       style={{ animation: 'rise-column 2.6s 0.4s infinite ease-out' }} />
                  <div className="absolute bottom-0 left-[45%] w-[3px] h-[60vh] bg-gradient-to-t from-transparent to-[#39FF14] origin-bottom scale-y-50 opacity-15"
                       style={{ animation: 'rise-column 1.8s 0.8s infinite ease-out' }} />

                  <div className="absolute top-[12%] left-0 w-full overflow-hidden h-6 border-y border-white/5 flex items-center bg-black/40 backdrop-blur-sm">
                    <div className="ticker-text" style={{ animation: 'ticker-slide-left 12s linear infinite' }}>
                      {Array.from({ length: 8 }).map((_, idx) => (
                        <span key={idx}>POETRY IN MOTION {" // "} BY TH3SCR1B3 {" // "}</span>
                      ))}
                    </div>
                  </div>

                  <div className="absolute bottom-[12%] left-0 w-full overflow-hidden h-6 border-y border-white/5 flex items-center bg-black/40 backdrop-blur-sm">
                    <div className="ticker-text" style={{ animation: 'ticker-slide-right 12s linear infinite' }}>
                      {Array.from({ length: 8 }).map((_, idx) => (
                        <span key={idx}>365 DAYS OF LIGHT AND DARK {" // "} COMPANION APPLICATION {" // "}</span>
                      ))}
                    </div>
                  </div>

                  <div className="climax-pim font-black text-center mix-blend-screen text-7xl sm:text-8xl tracking-[0.2em] text-white"
                       style={{ textShadow: '0 0 20px #fff, 0 0 40px #FF1493, 0 0 80px #00E5FF' }}>
                    PIM
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="min-h-screen w-full flex flex-col items-center justify-center relative overflow-hidden"
        style={{
          background: introType === 'classic'
            ? 'radial-gradient(ellipse 80% 60% at 50% 45%, #0e1028 0%, #080808 55%, #0a0810 100%)'
            : '#050505'
        }}>

      {introType === 'classic' ? (
        <>
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
        </>
      ) : (
        <>
          {/* Avant-Garde Background Elements */}
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.01) 1px, transparent 1px)',
            backgroundSize: '100px 100px'
          }} />
          <div className="neon-grid-floor pointer-events-none" />

          {/* Rising Columns */}
          <div className="absolute bottom-0 left-[20%] w-[2px] h-[70vh] bg-gradient-to-t from-transparent to-[#00E5FF] origin-bottom scale-y-75 opacity-20 pointer-events-none"
               style={{ animation: 'rise-column 2s infinite ease-out' }} />
          <div className="absolute bottom-0 right-[25%] w-[2px] h-[85vh] bg-gradient-to-t from-transparent to-[#FF1493] origin-bottom scale-y-90 opacity-25 pointer-events-none"
               style={{ animation: 'rise-column 2.6s 0.4s infinite ease-out' }} />
          <div className="absolute bottom-0 left-[45%] w-[3px] h-[60vh] bg-gradient-to-t from-transparent to-[#39FF14] origin-bottom scale-y-50 opacity-15 pointer-events-none"
               style={{ animation: 'rise-column 1.8s 0.8s infinite ease-out' }} />

          {/* Scrolling Tickers */}
          <div className="absolute top-[12%] left-0 w-full overflow-hidden h-6 border-y border-white/5 flex items-center bg-black/40 backdrop-blur-sm z-0 pointer-events-none select-none">
            <div className="ticker-text" style={{ animation: 'ticker-slide-left 12s linear infinite' }}>
              {Array.from({ length: 8 }).map((_, idx) => (
                <span key={idx}>POETRY IN MOTION {" // "} BY TH3SCR1B3 {" // "}</span>
              ))}
            </div>
          </div>

          <div className="absolute bottom-[12%] left-0 w-full overflow-hidden h-6 border-y border-white/5 flex items-center bg-black/40 backdrop-blur-sm z-0 pointer-events-none select-none">
            <div className="ticker-text" style={{ animation: 'ticker-slide-right 12s linear infinite' }}>
              {Array.from({ length: 8 }).map((_, idx) => (
                <span key={idx}>365 DAYS OF LIGHT AND DARK {" // "} COMPANION APPLICATION {" // "}</span>
              ))}
            </div>
          </div>
        </>
      )}

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

      {introType === 'classic' && !showIntro && (
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
              PIM
            </div>
          </div>

          {/* Sub label */}
          <div className="w-full text-center py-2 mb-1">
            <div className="font-mono text-[12px] font-bold tracking-[0.5em] uppercase" style={{ color: '#F2F0E8' }}>
              POETRY IN MOTION
            </div>
            <div className="font-mono text-[9px] font-bold tracking-[0.3em] uppercase mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
              BY <span style={{ color: '#FF1493' }}>TH3SCR1B3</span>
            </div>
          </div>

          {/* Tagline - companion app */}
          <div className="w-full text-center mb-6 opacity-0"
            style={{
              animation: !showIntro ? 'late-tagline 2.2s 1.2s cubic-bezier(0.25, 1, 0.5, 1) forwards' : 'none'
            }}>
            <div className="font-mono text-[9px] tracking-[0.35em] uppercase italic"
              style={{
                background: 'linear-gradient(90deg, rgba(255,255,255,0.3) 0%, #39FF14 50%, rgba(255,255,255,0.3) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                textShadow: '0 0 15px rgba(57,255,20,0.4)',
              }}>
              a 365 days of light and dark companion app
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
      )}

      {introType === 'avant-garde' && !showIntro && (
        <>
          {/* HUD Overlay Elements */}
          <div className="hud-corner hud-corner-tl" />
          <div className="hud-corner hud-corner-tr" />
          <div className="hud-corner hud-corner-bl" />
          <div className="hud-corner hud-corner-br" />
          <div className="hud-scanline-active" />

          {/* Asymmetrical Grid Container */}
          <div className={`relative z-10 w-full max-w-5xl px-6 grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 items-center ${
            isIntroTransition ? 'avant-fade-slow' : 'slide-up'
          }`}>
            
            {/* LEFT COLUMN: Telemetry and Visualizer (5 cols) */}
            <div className="md:col-span-5 flex flex-col gap-6 font-mono text-left select-none order-2 md:order-1">
              
              {/* Telemetry panel */}
              <div className="p-5 border border-white/10 bg-black/40 backdrop-blur-md rounded-lg relative overflow-hidden">
                {/* Small indicator light */}
                <div className="absolute top-3 right-3 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#39FF14] animate-ping" />
                  <div className="w-1.5 h-1.5 rounded-full bg-[#39FF14] absolute" />
                  <span className="text-[8px] text-[#39FF14] tracking-widest uppercase">ONLINE</span>
                </div>
                
                <div className="text-[10px] text-cyan-400 font-bold tracking-[0.3em] mb-4">
                  // TELEMETRY_STREAM_DATA
                </div>

                <div className="flex flex-col gap-2.5 text-[9px] tracking-wider text-white/50">
                  <div className="flex justify-between border-b border-white/5 pb-1">
                    <span>HOST PROTOCOL</span>
                    <span className="text-[#F2F0E8] font-bold">PIM_V.2.4.0</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-1">
                    <span>AUDIO_ENGINE</span>
                    <span className="text-[#F2F0E8] font-bold">STEM.DSP.32BIT</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-1">
                    <span>SAMPLING RATE</span>
                    <span className="text-[#00E5FF] font-bold">44.1 KHZ // LOW_LAT</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-1">
                    <span>SECTOR CLOCK</span>
                    <span className="text-[#FF1493] font-bold">{currentTime || "00:00:00"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>INTERFACE COMPILER</span>
                    <span className="text-[#39FF14] font-bold">TH3SCR1B3_NODE</span>
                  </div>
                </div>
              </div>

              {/* Animated Soundwave Visualizer Widget */}
              <div className="p-5 border border-white/10 bg-black/40 backdrop-blur-md rounded-lg flex flex-col gap-4">
                <div className="flex justify-between items-center text-[10px] text-white/40 tracking-[0.2em]">
                  <span>SPECTRUM_ANALYSIS</span>
                  <span className="text-[#39FF14] font-mono">DBFS: -12.4</span>
                </div>
                <div className="h-20 flex items-end justify-between px-1">
                  {Array.from({ length: 24 }).map((_, i) => {
                    const duration = 0.5 + (i % 7) * 0.15;
                    const delay = (i % 4) * -0.2;
                    return (
                      <div
                        key={i}
                        className="eq-widget-bar"
                        style={{
                          animation: `eq-bounce-anim ${duration}s ${delay}s ease-in-out infinite alternate`
                        }}
                      />
                    );
                  })}
                </div>
                <div className="text-[8px] text-white/30 tracking-[0.1em] text-center uppercase font-mono">
                  Real-time DSP Monitoring Stream
                </div>
              </div>

              {/* Telemetry Stats Display (SCORE, PLATINUM, CLEARED) */}
              <div className="p-5 border border-white/10 bg-black/40 backdrop-blur-md rounded-lg flex flex-col gap-3">
                <div className="text-[10px] text-white/40 tracking-[0.2em] uppercase">// COMPANION_DATA_METRICS</div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col">
                    <span className="text-[8px] text-white/40 tracking-wider">SCORE</span>
                    <span className="text-sm font-bold text-[#F2F0E8] truncate">{stats.score > 0 ? stats.score.toLocaleString() : "0"}</span>
                  </div>
                  <div className="flex flex-col border-l border-white/10 pl-2">
                    <span className="text-[8px] text-white/40 tracking-wider">PLATINUM</span>
                    <span className="text-sm font-bold text-[#39FF14]">{stats.platinums}</span>
                  </div>
                  <div className="flex flex-col border-l border-white/10 pl-2">
                    <span className="text-[8px] text-white/40 tracking-wider">CLEARED</span>
                    <span className="text-sm font-bold text-[#FFBD00]">{stats.cleared}</span>
                  </div>
                </div>
              </div>

            </div>

            {/* RIGHT COLUMN: Logo, Subtitle, Navigation, and Keys (7 cols) */}
            <div className="md:col-span-7 flex flex-col items-center md:items-start gap-6 order-1 md:order-2">
              
              {/* Technical Logo Boundary Box */}
              <div className="relative w-full border border-dashed border-white/15 p-6 rounded-lg flex flex-col items-center select-none overflow-hidden">
                {/* Crosshairs in corners */}
                <div className="absolute top-2 left-2 text-[8px] text-white/30 font-bold">+ TL</div>
                <div className="absolute top-2 right-2 text-[8px] text-white/30 font-bold">TR +</div>
                <div className="absolute bottom-2 left-2 text-[8px] text-white/30 font-bold">+ BL</div>
                <div className="absolute bottom-2 right-2 text-[8px] text-white/30 font-bold">BR +</div>
                
                {/* Multi-layered Glitch Title Logo */}
                <div className="relative w-full text-center py-4 flex items-center justify-center min-h-[140px]">
                  {/* Neon Cyan Layer */}
                  <div className="absolute font-mono font-black select-none pim-layer-cyan text-glow"
                    style={{
                      fontSize: 'clamp(90px, 15vw, 140px)',
                      color: '#00E5FF',
                      letterSpacing: '0.15em',
                      lineHeight: 0.8,
                      opacity: 0.8,
                      transform: 'translate(-2px, 1px)'
                    }}>
                    PIM
                  </div>
                  
                  {/* Neon Magenta Layer */}
                  <div className="absolute font-mono font-black select-none pim-layer-magenta text-glow"
                    style={{
                      fontSize: 'clamp(90px, 15vw, 140px)',
                      color: '#FF1493',
                      letterSpacing: '0.15em',
                      lineHeight: 0.8,
                      opacity: 0.8,
                      transform: 'translate(2px, -1px)'
                    }}>
                    PIM
                  </div>

                  {/* Crisp White Foreground Layer */}
                  <div className="absolute font-mono font-black select-none text-glow z-10"
                    style={{
                      fontSize: 'clamp(90px, 15vw, 140px)',
                      color: '#ffffff',
                      letterSpacing: '0.15em',
                      lineHeight: 0.8,
                      textShadow: '0 0 15px rgba(255,255,255,0.8)'
                    }}>
                    PIM
                  </div>
                </div>

                {/* Subtitle & Tagline details */}
                <div className="text-center mt-2 z-10">
                  <h2 className="font-mono text-xs font-bold tracking-[0.6em] text-white uppercase">
                    POETRY IN MOTION
                  </h2>
                  <div className="font-mono text-[9px] font-bold tracking-[0.3em] uppercase mt-1 text-white/40">
                    COMPANION FOR <span className="text-[#FF1493]">365 DAYS OF LIGHT & DARK</span>
                  </div>
                </div>
              </div>

              {/* Redesigned Menu Row Buttons */}
              <div className="w-full flex flex-col gap-0 border border-white/10 rounded-lg overflow-hidden bg-black/20">
                {[
                  { label: '▶ INITIATE CAMPAIGN', path: '/campaign', prefix: '01', tag: '[ HYPER_LANE ]' },
                  { label: '◈ ARCHIVE — ALL 365 TRACKS', path: '/songs', prefix: '02', tag: '[ AUDIO_CORE ]' },
                  { label: '? INTEL & TUTORIAL', path: '/tutorial', prefix: '03', tag: '[ DOCUMENTATION ]' },
                  { label: '⚙ SYSTEM CORE CONFIG', path: '/options', prefix: '04', tag: '[ CONFIG_IO ]' }
                ].map((item) => (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    onMouseEnter={() => {
                      try {
                        audioManager.playSfx('tap_nav', 0.12);
                      } catch (e) {
                        console.warn(e);
                      }
                    }}
                    className="avant-menu-row text-white hover:text-[#00E5FF] group relative z-10 w-full cursor-pointer focus:outline-none"
                  >
                    {/* Index prefix */}
                    <span className="text-[10px] text-[#39FF14] font-bold tracking-widest w-12 shrink-0 select-none">
                      {item.prefix} //
                    </span>
                    
                    {/* Main label */}
                    <span className="flex-1 text-xs sm:text-sm tracking-[0.25em] font-semibold uppercase transition-transform duration-300 group-hover:translate-x-1">
                      {item.label}
                    </span>
                    
                    {/* Right-aligned telemetry tags */}
                    <span className="hidden sm:inline font-mono text-[8px] tracking-wider text-white/30 group-hover:text-cyan-400/60 transition-colors select-none">
                      {item.tag}
                    </span>

                    {/* Bottom sweep underline */}
                    <div className="avant-menu-line" />
                  </button>
                ))}
              </div>

              {/* Lane Keys telemetry monitoring block */}
              <div className="w-full flex flex-col gap-3 p-4 border border-white/10 bg-black/40 rounded-lg font-mono">
                <div className="text-[9px] text-white/40 tracking-[0.2em] uppercase select-none">// LANE_TRIGGERS_ACTIVE</div>
                
                <div className="flex gap-4 justify-between items-center w-full">
                  {LANE_KEYS.map((key, i) => (
                    <div key={key} className="flex-1 flex items-center justify-between p-3 rounded-md bg-black/40 border border-white/5 relative group hover:border-cyan-500/30 transition-all select-none">
                      <div className="flex flex-col text-left">
                        <span className="text-[8px] text-white/30 tracking-wider">
                          {['LEFT', 'MID', 'RIGHT'][i]}
                        </span>
                        <span className="text-[10px] font-bold uppercase" style={{ color: LANE_COLORS[i] }}>
                          {LANE_COLORS[i]}
                        </span>
                      </div>
                      
                      <div
                        className="w-10 h-10 flex items-center justify-center font-bold text-lg rounded-lg border transition-transform duration-300 group-hover:scale-105"
                        style={{
                          color: LANE_COLORS[i],
                          background: `${LANE_COLORS[i]}08`,
                          borderColor: `${LANE_COLORS[i]}30`,
                          textShadow: `0 0 8px ${LANE_COLORS[i]}80`,
                          boxShadow: `0 0 10px ${LANE_COLORS[i]}15`
                        }}
                      >
                        {key}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

          </div>
        </>
      )}

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

      {showOnboarding && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/85 backdrop-blur-md p-6">
          <div className="relative max-w-md w-full border border-[#00E5FF]/45 bg-zinc-950/90 p-8 rounded-lg shadow-[0_0_30px_rgba(0,229,255,0.15)] font-mono text-left">
            {/* corner markers */}
            <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 border-[#00E5FF]" />
            <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2 border-[#00E5FF]" />
            <div className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2 border-[#00E5FF]" />
            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-2 border-r-2 border-[#00E5FF]" />

            <div className="text-xs text-red-500 font-bold tracking-[0.4em] mb-2 uppercase flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 bg-red-600 animate-ping rounded-full" />
              [ SYSTEM_WARNING: CALIBRATION_REQUIRED ]
            </div>

            <h3 className="text-lg font-bold text-white tracking-widest uppercase mb-4">
              FIRST TIME ACCESS DETECTED
            </h3>

            <p className="text-xs text-white/70 leading-relaxed mb-6 tracking-wide">
              Your neural link latency has not been calibrated. It is highly recommended to run the 
              RHYTHM ENGINE TUTORIAL to explain Tap, Hold, and Swipe note types and adjust audio offset.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => {
                  try { audioManager.playSfx("tap_nav", 0.15); } catch(e){}
                  setLocation("/tutorial");
                }}
                className="flex-1 font-mono text-xs font-bold tracking-[0.2em] py-3 bg-[#39FF14] text-black hover:bg-[#39FF14]/90 hover:shadow-[0_0_15px_rgba(57,255,20,0.3)] transition-all text-center uppercase cursor-pointer"
              >
                ▶ RUN CALIBRATION
              </button>
              <button
                onClick={() => {
                  try { audioManager.playSfx("tap_nav", 0.12); } catch(e){}
                  localStorage.setItem("pim_tutorial_completed", "true");
                  setShowOnboarding(false);
                }}
                className="flex-1 font-mono text-xs tracking-[0.2em] py-3 border border-white/20 text-white/50 hover:text-white hover:border-white transition-all text-center uppercase cursor-pointer"
              >
                [ BYPASS ]
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
