import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { getTotalScore, getTotalPlatinums, getTotalCleared } from "@/game/progress";

const LANE_COLORS = ['#E53A00', '#A855F7', '#48E5C2'];
const LANE_KEYS   = ['A', 'S', 'D'];

export default function Home() {
  const [, setLocation] = useLocation();
  const [blink, setBlink] = useState(true);
  const [tick, setTick]   = useState(0);
  const [stats, setStats] = useState({ score: 0, platinums: 0, cleared: 0 });

  useEffect(() => {
    const id = setInterval(() => { setBlink(b => !b); setTick(t => t + 1); }, 600);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setStats({ score: getTotalScore(), platinums: getTotalPlatinums(), cleared: getTotalCleared() });
  }, []);

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 50% 55%, hsl(270 50% 6%) 0%, hsl(15 40% 4%) 70%)' }}
    >
      {/* Grid */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: 'linear-gradient(rgba(168,85,247,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(168,85,247,0.06) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

      {/* Glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-96 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.07) 0%, rgba(229,58,0,0.05) 50%, transparent 70%)' }} />

      {/* Side neon strips */}
      <div className="absolute left-0 top-0 bottom-0 w-1 pointer-events-none"
        style={{ background: 'linear-gradient(180deg, transparent 0%, #E53A00 50%, transparent 100%)', opacity: 0.5 + 0.4 * Math.sin(tick * 0.3) }} />
      <div className="absolute right-0 top-0 bottom-0 w-1 pointer-events-none"
        style={{ background: 'linear-gradient(180deg, transparent 0%, #48E5C2 50%, transparent 100%)', opacity: 0.5 + 0.4 * Math.sin(tick * 0.3 + 1) }} />

      <div className="relative z-10 flex flex-col items-center gap-5 px-4">
        {/* Brand */}
        <div className="font-mono text-xs tracking-[0.5em] mb-1" style={{ color: '#48E5C2' }}>
          TH3SCR1B3 // RHYTHM ENGINE
        </div>

        {/* 365 hero */}
        <h1 className="font-mono font-bold tracking-tight leading-none select-none"
          style={{ fontSize: 'clamp(80px, 18vw, 150px)', color: '#F2EDE5', textShadow: '0 0 40px rgba(168,85,247,0.3), 0 0 80px rgba(229,58,0,0.15)' }}>
          365
        </h1>

        <div className="font-mono text-base tracking-[0.25em]" style={{ color: 'hsl(30 20% 55%)' }}>
          DAYS OF LIGHT &amp; DARK
        </div>

        {/* Live score if any */}
        {stats.score > 0 && (
          <div className="flex items-center gap-5 py-2 px-5 border"
            style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)', borderRadius: 6 }}>
            <div className="text-center">
              <div className="font-mono font-bold" style={{ color: '#F2EDE5', fontSize: 18 }}>
                {stats.score.toLocaleString()}
              </div>
              <div className="font-mono text-xs" style={{ color: 'hsl(30 15% 38%)', fontSize: 9 }}>SCORE</div>
            </div>
            <div className="w-px h-8" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <div className="text-center">
              <div className="font-mono font-bold text-lg" style={{ color: '#48E5C2' }}>{stats.platinums}</div>
              <div className="font-mono text-xs" style={{ color: 'hsl(30 15% 38%)', fontSize: 9 }}>PLATINUM</div>
            </div>
            <div className="w-px h-8" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <div className="text-center">
              <div className="font-mono font-bold text-lg" style={{ color: '#A855F7' }}>{stats.cleared}</div>
              <div className="font-mono text-xs" style={{ color: 'hsl(30 15% 38%)', fontSize: 9 }}>CLEARED</div>
            </div>
          </div>
        )}

        {/* Primary CTA: Campaign */}
        <button
          data-testid="button-start"
          onClick={() => setLocation('/campaign')}
          className="relative px-14 py-4 font-mono font-bold text-sm tracking-[0.35em] uppercase mt-1 transition-all duration-200"
          style={{
            background: 'linear-gradient(135deg, #E53A00, #A855F7)',
            color: '#fff',
            clipPath: 'polygon(10px 0%, 100% 0%, calc(100% - 10px) 100%, 0% 100%)',
            boxShadow: '0 0 40px rgba(168,85,247,0.3), 0 0 60px rgba(229,58,0,0.2)',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 0 60px rgba(168,85,247,0.6), 0 0 80px rgba(229,58,0,0.4)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 0 40px rgba(168,85,247,0.3), 0 0 60px rgba(229,58,0,0.2)'; (e.currentTarget as HTMLElement).style.transform = ''; }}
        >
          ▶ CAMPAIGN
        </button>

        {/* Secondary: Free Play */}
        <button
          onClick={() => setLocation('/songs')}
          className="font-mono text-xs tracking-[0.3em] transition-colors"
          style={{ color: 'hsl(30 15% 38%)' }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#48E5C2')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'hsl(30 15% 38%)')}>
          ◈ FREE PLAY — ALL 365 SONGS
        </button>

        <div className="font-mono text-xs tracking-widest transition-opacity duration-300"
          style={{ color: 'hsl(30 15% 35%)', opacity: blink ? 1 : 0 }}>
          [ PRESS TO BEGIN ]
        </div>

        {/* Lane key display */}
        <div className="mt-2 flex gap-3">
          {LANE_KEYS.map((key, i) => (
            <div key={key} className="flex flex-col items-center gap-1.5">
              <div className="w-14 h-14 flex items-center justify-center font-mono font-bold text-base"
                style={{ borderColor: LANE_COLORS[i], color: LANE_COLORS[i], background: `${LANE_COLORS[i]}12`, border: `2px solid ${LANE_COLORS[i]}`, borderRadius: 12, boxShadow: `0 0 16px ${LANE_COLORS[i]}30, inset 0 0 10px ${LANE_COLORS[i]}10` }}>
                {key}
              </div>
              <div className="font-mono text-xs" style={{ color: 'hsl(30 15% 35%)' }}>
                {['LEFT', 'MID', 'RIGHT'][i]}
              </div>
            </div>
          ))}
        </div>

        {/* Power-up hints */}
        <div className="flex gap-4 mt-1">
          {[
            { combo: 20, label: 'FEVER',      color: '#E5B800', mult: 2 },
            { combo: 40, label: 'SURGE',       color: '#E53A00', mult: 3 },
            { combo: 60, label: 'SIGNAL LOCK', color: '#48E5C2', mult: 4 },
          ].map(p => (
            <div key={p.label} className="text-center">
              <div className="font-mono text-xs px-2 py-0.5" style={{ color: p.color, border: `1px solid ${p.color}40`, background: `${p.color}0D` }}>
                {p.label}
              </div>
              <div className="font-mono text-xs mt-0.5" style={{ color: 'hsl(30 15% 30%)', fontSize: 9 }}>
                ×{p.mult} @ combo {p.combo}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-5 left-0 right-0 flex justify-center">
        <a href="https://th3scr1b3.art" target="_blank" rel="noopener noreferrer"
          className="font-mono text-xs tracking-widest transition-colors" style={{ color: 'hsl(30 15% 28%)' }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#48E5C2')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'hsl(30 15% 28%)')}>
          TH3SCR1B3.ART
        </a>
      </div>
    </div>
  );
}
