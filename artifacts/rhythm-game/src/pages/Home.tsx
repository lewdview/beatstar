import { useLocation } from "wouter";
import { useEffect, useState } from "react";

export default function Home() {
  const [, setLocation] = useLocation();
  const [blink, setBlink] = useState(true);

  useEffect(() => {
    const id = setInterval(() => setBlink((b) => !b), 600);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 50% 60%, hsl(14 60% 8%) 0%, hsl(15 40% 4%) 70%)' }}
    >
      {/* Background grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(229,58,0,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(229,58,0,0.06) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Glow orbs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(229,58,0,0.08) 0%, transparent 70%)' }} />
      <div className="absolute bottom-1/3 left-1/4 w-64 h-64 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(72,229,194,0.05) 0%, transparent 70%)' }} />

      <div className="relative z-10 flex flex-col items-center gap-8 px-4">
        {/* Logo */}
        <div className="text-center">
          <div
            className="font-mono text-xs tracking-[0.4em] mb-3"
            style={{ color: 'hsl(168 72% 59%)' }}
          >
            TH3SCR1B3 // RHYTHM ENGINE
          </div>

          <h1
            className="glitch-text font-mono font-bold tracking-tight leading-none select-none"
            data-text="365"
            style={{
              fontSize: 'clamp(80px, 18vw, 160px)',
              color: '#F2EDE5',
              textShadow: '0 0 40px rgba(229,58,0,0.3)',
            }}
          >
            365
          </h1>

          <div className="font-mono text-base tracking-[0.25em] mt-1" style={{ color: 'hsl(30 20% 60%)' }}>
            DAYS OF LIGHT &amp; DARK
          </div>
        </div>

        {/* Subtitle */}
        <div className="text-center max-w-sm">
          <p className="font-mono text-xs tracking-widest leading-relaxed" style={{ color: 'hsl(30 15% 45%)' }}>
            TAP TO THE TRANSMISSION.<br />
            EVERY SONG IS A SIGNAL.
          </p>
        </div>

        {/* CTA button */}
        <div className="flex flex-col items-center gap-4 mt-4">
          <button
            data-testid="button-start"
            onClick={() => setLocation('/songs')}
            className="relative group px-12 py-4 font-mono font-bold text-sm tracking-[0.3em] uppercase transition-all duration-200"
            style={{
              background: 'hsl(14 100% 48%)',
              color: '#fff',
              clipPath: 'polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)',
              boxShadow: '0 0 30px rgba(229,58,0,0.4)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = '0 0 50px rgba(229,58,0,0.7)';
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = '0 0 30px rgba(229,58,0,0.4)';
              (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
            }}
          >
            SELECT TRACK
          </button>

          <div
            className="font-mono text-xs tracking-widest transition-opacity duration-300"
            style={{ color: 'hsl(30 15% 40%)', opacity: blink ? 1 : 0 }}
          >
            [ PRESS TO BEGIN ]
          </div>
        </div>

        {/* Controls hint */}
        <div className="mt-8 grid grid-cols-4 gap-2">
          {['A', 'S', 'D', 'F'].map((key, i) => (
            <div key={key} className="flex flex-col items-center gap-1">
              <div
                className="w-10 h-10 flex items-center justify-center font-mono font-bold text-sm border"
                style={{
                  borderColor: ['var(--lane-0)', 'var(--lane-1)', 'var(--lane-2)', 'var(--lane-3)'][i],
                  color: ['var(--lane-0)', 'var(--lane-1)', 'var(--lane-2)', 'var(--lane-3)'][i],
                  background: ['rgba(229,58,0,0.08)', 'rgba(72,229,194,0.08)', 'rgba(229,184,0,0.08)', 'rgba(139,72,229,0.08)'][i],
                  clipPath: 'polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)',
                }}
              >
                {key}
              </div>
              <div className="font-mono text-xs" style={{ color: 'hsl(30 15% 35%)' }}>
                {['LANE 1', 'LANE 2', 'LANE 3', 'LANE 4'][i]}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-6 left-0 right-0 flex justify-center">
        <a
          href="https://th3scr1b3.art"
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs tracking-widest transition-colors"
          style={{ color: 'hsl(30 15% 30%)' }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = 'hsl(168 72% 59%)')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'hsl(30 15% 30%)')}
        >
          TH3SCR1B3.ART
        </a>
      </div>
    </div>
  );
}
