import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { getTotalScore, getTotalPlatinums, getTotalCleared } from "@/game/progress";

const LANE_COLORS = ['#FF5400', '#4A314D', '#ACE894'];
const LANE_KEYS   = ['A', 'S', 'D'];

export default function Home() {
  const [, setLocation] = useLocation();
  const [blink, setBlink] = useState(true);
  const [stats, setStats] = useState({ score: 0, platinums: 0, cleared: 0 });

  useEffect(() => {
    const id = setInterval(() => setBlink(b => !b), 700);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setStats({ score: getTotalScore(), platinums: getTotalPlatinums(), cleared: getTotalCleared() });
  }, []);

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: '#080808' }}>

      {/* Structural grid — large, visible */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '80px 80px' }} />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4"
        style={{ borderBottom: '2px solid rgba(255,255,255,0.08)' }}>
        <div className="font-mono text-xs tracking-[0.5em]" style={{ color: '#ACE894' }}>
          TH3SCR1B3
        </div>
        <div className="font-mono text-xs tracking-[0.4em]" style={{ color: 'rgba(255,255,255,0.2)' }}>
          RHYTHM ENGINE
        </div>
      </div>

      {/* Left rule */}
      <div className="absolute left-6 top-16 bottom-16 w-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
      {/* Right rule */}
      <div className="absolute right-6 top-16 bottom-16 w-px" style={{ background: 'rgba(255,255,255,0.06)' }} />

      <div className="relative z-10 flex flex-col items-center w-full max-w-lg px-6">

        {/* Hero number — raw, giant */}
        <div className="relative w-full text-center" style={{ borderTop: '3px solid rgba(255,255,255,0.12)', borderBottom: '3px solid rgba(255,255,255,0.12)', marginBottom: 0 }}>
          <div className="font-mono font-bold leading-none select-none"
            style={{ fontSize: 'clamp(110px, 22vw, 180px)', color: '#F2F0E8', letterSpacing: '-0.02em', lineHeight: 0.88 }}>
            365
          </div>
        </div>

        {/* Sub label */}
        <div className="w-full text-center py-3" style={{ borderBottom: '2px solid rgba(255,255,255,0.08)' }}>
          <div className="font-mono text-sm tracking-[0.3em]" style={{ color: 'rgba(255,255,255,0.35)' }}>
            DAYS OF LIGHT &amp; DARK
          </div>
        </div>

        {/* Live stats — only if played */}
        {stats.score > 0 && (
          <div className="w-full grid grid-cols-3 mb-0" style={{ borderBottom: '2px solid rgba(255,255,255,0.08)' }}>
            {[
              { label: 'SCORE',    value: stats.score.toLocaleString(), color: '#F2F0E8' },
              { label: 'PLATINUM', value: stats.platinums,              color: '#ACE894' },
              { label: 'CLEARED',  value: stats.cleared,                color: '#4A314D' },
            ].map((s, i) => (
              <div key={s.label} className="py-3 text-center"
                style={{ borderRight: i < 2 ? '2px solid rgba(255,255,255,0.08)' : 'none' }}>
                <div className="font-mono font-bold text-lg" style={{ color: s.color }}>{s.value}</div>
                <div className="font-mono" style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.3em' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* CTA buttons */}
        <div className="w-full mt-6 flex flex-col gap-3">
          <button
            data-testid="button-start"
            onClick={() => setLocation('/campaign')}
            className="brutal-btn w-full py-5 font-mono font-bold text-base tracking-[0.4em] transition-all duration-100"
            style={{ border: '3px solid #F2F0E8', color: '#080808', background: '#F2F0E8', boxShadow: '6px 6px 0 #FF5400' }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.boxShadow = '3px 3px 0 #FF5400'; el.style.transform = 'translate(3px,3px)'; }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.boxShadow = '6px 6px 0 #FF5400'; el.style.transform = ''; }}>
            ▶ CAMPAIGN
          </button>

          <button
            onClick={() => setLocation('/songs')}
            className="w-full py-3 font-mono text-xs tracking-[0.35em] transition-all duration-100"
            style={{ border: '2px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.4)', background: 'transparent', boxShadow: '4px 4px 0 rgba(255,255,255,0.06)' }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = '#ACE894'; el.style.borderColor = '#ACE894'; el.style.boxShadow = '4px 4px 0 #ACE894'; }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'rgba(255,255,255,0.4)'; el.style.borderColor = 'rgba(255,255,255,0.15)'; el.style.boxShadow = '4px 4px 0 rgba(255,255,255,0.06)'; }}>
            ◈ FREE PLAY — ALL 365 SONGS
          </button>

          <button
            onClick={() => setLocation('/tutorial')}
            className="w-full py-2 font-mono text-xs tracking-[0.35em] transition-all duration-100"
            style={{ border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.25)', background: 'transparent' }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'rgba(255,255,255,0.55)'; el.style.borderColor = 'rgba(255,255,255,0.2)'; }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'rgba(255,255,255,0.25)'; el.style.borderColor = 'rgba(255,255,255,0.08)'; }}>
            ? HOW TO PLAY
          </button>
        </div>

        {/* Blink prompt */}
        <div className="mt-4 font-mono text-xs tracking-[0.3em] transition-opacity duration-200"
          style={{ color: 'rgba(255,255,255,0.2)', opacity: blink ? 1 : 0 }}>
          [ PRESS TO BEGIN ]
        </div>

        {/* Lane keys — square brutal */}
        <div className="mt-6 flex gap-0 w-full max-w-xs mx-auto" style={{ border: '2px solid rgba(255,255,255,0.08)' }}>
          {LANE_KEYS.map((key, i) => (
            <div key={key} className="flex-1 flex flex-col items-center py-3 gap-1.5"
              style={{ borderRight: i < 2 ? '2px solid rgba(255,255,255,0.08)' : 'none' }}>
              <div className="font-mono font-bold text-lg"
                style={{ color: LANE_COLORS[i], textShadow: `0 0 12px ${LANE_COLORS[i]}` }}>{key}</div>
              <div className="font-mono" style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.3em' }}>
                {['LEFT','MID','RIGHT'][i]}
              </div>
            </div>
          ))}
        </div>

        {/* Power-up row */}
        <div className="mt-3 flex w-full max-w-xs mx-auto" style={{ border: '2px solid rgba(255,255,255,0.06)' }}>
          {[
            { label: 'FEVER',       color: '#E5B800', mult: 2, combo: 20 },
            { label: 'SURGE',       color: '#FF5400', mult: 3, combo: 40 },
            { label: 'SIGNAL LOCK', color: '#ACE894', mult: 4, combo: 60 },
          ].map((p, i) => (
            <div key={p.label} className="flex-1 py-2 text-center"
              style={{ borderRight: i < 2 ? '2px solid rgba(255,255,255,0.06)' : 'none' }}>
              <div className="font-mono font-bold" style={{ fontSize: 9, color: p.color, letterSpacing: '0.15em' }}>{p.label}</div>
              <div className="font-mono" style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)' }}>×{p.mult} @{p.combo}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center py-3"
        style={{ borderTop: '2px solid rgba(255,255,255,0.06)' }}>
        <a href="https://th3scr1b3.art" target="_blank" rel="noopener noreferrer"
          className="font-mono text-xs tracking-widest transition-colors"
          style={{ color: 'rgba(255,255,255,0.2)' }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#ACE894')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.2)')}>
          TH3SCR1B3.ART
        </a>
      </div>
    </div>
  );
}
