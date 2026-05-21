import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { loadOpts, keyLabel, getActiveTheme } from "@/lib/options";
import { audioManager } from "@/game/audio";

// Read per render so Tutorial always reflects the current settings
const LANE_COLORS = () => loadOpts().laneColors;
const LANE_KEYS   = () => loadOpts().laneKeys.map(k => keyLabel(k)) as [string, string, string];
const NOTE_FALL_MS = 1600;
const HIT_WINDOW_MS = 350;

type NotePhase = "idle" | "falling" | "in-window" | "hit" | "missed";

interface Step {
  id: string;
  num: string;
  title: string;
  lines: string[];
  practiceKey?: 0 | 1 | 2;
}

const STEPS: Step[] = [
  {
    id: "welcome",
    num: "00",
    title: "RHYTHM ENGINE",
    lines: [
      "365 songs — one for every day of the year.",
      "",
      "Notes fall down a three-lane highway.",
      "Press the matching key when a note",
      "reaches the glowing hit line.",
      "",
      "Let's walk through it.",
    ],
  },
  {
    id: "lanes",
    num: "01",
    title: "THREE LANES",
    lines: [
      "The left lane is A.",
      "The middle lane is S.",
      "The right lane is D.",
      "",
      "Each lane has its own color.",
    ],
  },
  {
    id: "hit-a",
    num: "02",
    title: "HIT THE NOTE",
    lines: ["A note is falling in the LEFT lane.", "Press A when it reaches the line."],
    practiceKey: 0,
  },
  {
    id: "hit-s",
    num: "03",
    title: "MID LANE",
    lines: ["Good. Now the MID lane — press S."],
    practiceKey: 1,
  },
  {
    id: "hit-d",
    num: "04",
    title: "RIGHT LANE",
    lines: ["Last one. RIGHT lane — press D."],
    practiceKey: 2,
  },
  {
    id: "timing",
    num: "05",
    title: "TIMING",
    lines: [
      "Earlier is better.",
      "",
      "PERFECT+  highest score",
      "PERFECT   solid hit",
      "GOOD      slightly late",
      "MISS      too late",
    ],
  },
  {
    id: "sync",
    num: "06",
    title: "SYNCING UP",
    lines: [
      "Every device has a tiny gap between",
      "the music and your speakers.",
      "",
      "If hits feel early or late, open ⚙ Options",
      "and adjust AUDIO OFFSET.",
      "",
      "Negative = you hear audio early.",
      "Positive = you hear audio late.",
    ],
  },
  {
    id: "misses",
    num: "07",
    title: "SIGNAL LOST",
    lines: [
      "Three misses in a row and the track",
      "pauses — SIGNAL LOST.",
      "",
      "You can rewind and try again,",
      "or abandon the run.",
      "",
      "Toggle it off in ⚙ Options",
      "if you want to play without limits.",
    ],
  },
  {
    id: "ready",
    num: "08",
    title: "YOU'RE READY",
    lines: [
      "Campaign unlocks songs day by day.",
      "Free Play lets you browse all 365.",
      "",
      "Good luck.",
    ],
  },
];

export default function Tutorial() {
  const [, setLocation] = useLocation();
  const [step, setStep]       = useState(0);
  const [notePhase, setNotePhase] = useState<NotePhase>("idle");
  const [noteKey, setNoteKey]   = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [autoAdvanced, setAutoAdvanced] = useState(0);

  const timerA = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerB = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cur = STEPS[step];
  const isPractice = cur.practiceKey !== undefined;
  const pKey = cur.practiceKey;

  const isAvant = getActiveTheme() === 'avant-garde';

  const clear = () => {
    if (timerA.current) clearTimeout(timerA.current);
    if (timerB.current) clearTimeout(timerB.current);
  };

  const advance = useCallback(() => {
    clear();
    setNotePhase("idle");
    setFeedback(null);
    setAutoAdvanced(0);
    setStep(s => Math.min(s + 1, STEPS.length - 1));
  }, []);

  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  const launchNote = useCallback((missCount = 0) => {
    clear();
    setNotePhase("falling");
    setFeedback(null);
    setNoteKey(k => k + 1);

    timerA.current = setTimeout(() => {
      setNotePhase("in-window");
      timerB.current = setTimeout(() => {
        setNotePhase("missed");
        setFeedback("MISS");
        const next = missCount + 1;
        setAutoAdvanced(next);
        timerA.current = setTimeout(() => {
          if (next >= 5) { advanceRef.current(); return; }
          launchNote(next);
        }, 900);
      }, HIT_WINDOW_MS);
    }, NOTE_FALL_MS - HIT_WINDOW_MS);
  }, []);

  const launchRef = useRef(launchNote);
  launchRef.current = launchNote;

  useEffect(() => {
    if (!isPractice) return;
    setNotePhase("idle");
    setFeedback(null);
    setAutoAdvanced(0);
    const t = setTimeout(() => launchRef.current(0), 700);
    return () => clearTimeout(t);
  }, [step, isPractice]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!isPractice && (k === "enter" || k === " ") && step < STEPS.length - 1) {
        if (isAvant) audioManager.playSfx("tap_nav", 0.12);
        advance(); return;
      }
      if (isPractice && notePhase === "in-window") {
        const keys = loadOpts().laneKeys;
        if (k === keys[pKey!]) {
          clear();
          setNotePhase("hit");
          setFeedback("PERFECT+");
          if (isAvant) audioManager.playSfx("tap_nav", 0.15);
          timerA.current = setTimeout(() => advanceRef.current(), 700);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [step, isPractice, notePhase, pKey, advance, isAvant]);

  useEffect(() => () => clear(), []);

  const pct = step / (STEPS.length - 1);

  if (isAvant) {
    return (
      <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ background: "#050505" }}>
        {/* Kinetic Avant-Garde overlays */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: "linear-gradient(rgba(57,255,20,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.015) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }} />
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 0, 0, 0.25) 2px, rgba(0, 0, 0, 0.25) 4px)"
        }} />

        {/* Technical Corner Brackets */}
        <div className="absolute top-5 left-5 pointer-events-none font-mono text-[9px] text-[#39FF14]/30" style={{ letterSpacing: '0.15em' }}>
          SYS // TUTORIAL_COCKPIT
        </div>
        <div className="absolute top-5 right-5 pointer-events-none font-mono text-[9px] text-[#39FF14]/30" style={{ letterSpacing: '0.15em' }}>
          ROUTINE: 0x0A2B
        </div>
        <div className="absolute bottom-5 left-5 pointer-events-none font-mono text-[9px] text-[#39FF14]/30" style={{ letterSpacing: '0.15em' }}>
          SIGNAL // FEED_081
        </div>
        <div className="absolute bottom-5 right-5 pointer-events-none font-mono text-[9px] text-[#39FF14]/30" style={{ letterSpacing: '0.15em' }}>
          AUTH_LEVEL // STABLE
        </div>

        {/* Top bar */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 gap-6 relative z-10" style={{ borderBottom: "1px solid rgba(57,255,20,0.2)", background: "rgba(5,5,5,0.85)", backdropFilter: "blur(12px)" }}>
          <button
            onClick={() => {
              audioManager.playSfx("tap_nav", 0.15);
              setLocation("/");
            }}
            className="font-mono text-xs tracking-[0.25em] transition-all duration-150 border border-red-500/35 px-4 py-1.5 text-red-400 bg-red-950/10 hover:bg-red-500/20 hover:text-red-300 hover:border-red-400"
            onMouseEnter={() => audioManager.playSfx("tap_nav", 0.08)}
          >
            ✕ TERMINATE
          </button>
          <div className="flex-1 flex items-center gap-4">
            <div className="flex-1 h-1.5 bg-zinc-900 border border-zinc-800/80 relative overflow-hidden">
              <div className="h-full bg-[#39FF14] shadow-[0_0_8px_#39FF14]" style={{ width: `${pct * 100}%`, transition: "width 0.4s cubic-bezier(0.16, 1, 0.3, 1)" }} />
            </div>
            <div className="font-mono text-xs text-[#39FF14]" style={{ letterSpacing: "0.2em", flexShrink: 0 }}>
              [{cur.num} / {String(STEPS.length - 1).padStart(2, "0")}]
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col items-center justify-center gap-10 px-6 relative overflow-hidden z-10">
          
          {/* Diagnostic Box Framing Title */}
          <div className="relative p-6 text-center border border-zinc-800/80 bg-black/45" key={`title-${step}`}>
            {/* Corners */}
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-[#39FF14]" />
            <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-[#39FF14]" />
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-[#39FF14]" />
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-[#39FF14]" />

            <div className="font-mono text-xs tracking-[0.4em] mb-2 text-[#39FF14]/50">
              SEQUENCE_ID_{cur.num}
            </div>
            <div className="font-mono font-bold tracking-[0.25em] text-2xl text-white">
              {cur.title}
            </div>
          </div>

          {/* Visualisation */}
          <div className="w-full flex justify-center py-4 relative">
            <div className="absolute -inset-x-12 top-1/2 h-px bg-zinc-900 pointer-events-none" />
            <div className="relative z-10">
              {cur.id === "welcome" && <WelcomeViz isAvant={true} />}
              {cur.id === "lanes"   && <LanesViz isAvant={true} />}
              {isPractice && pKey !== undefined && (
                <PracticeViz laneIdx={pKey} notePhase={notePhase} noteKey={noteKey} feedback={feedback} isAvant={true} />
              )}
              {cur.id === "sync"    && <SyncViz isAvant={true} />}
              {cur.id === "timing"  && <TimingViz isAvant={true} />}
              {cur.id === "misses"  && <MissesViz isAvant={true} />}
              {cur.id === "ready"   && <ReadyViz isAvant={true} />}
            </div>
          </div>

          {/* Body copy */}
          <div className="text-center max-w-sm px-6 py-4 bg-zinc-950/20 border border-zinc-900/60 rounded">
            {cur.lines.map((line, i) => {
              const isLabel = /^(PERFECT|GOOD|MISS)/.test(line);
              const color = isLabel ? "#39FF14" : "rgba(255,255,255,0.7)";
              return (
                <div key={i} className="font-mono text-sm tracking-wider" style={{ color, lineHeight: 1.8, height: line === "" ? 8 : undefined }}>
                  {line || null}
                </div>
              );
            })}
          </div>

          {/* Practice hint */}
          {isPractice && (
            <div className="font-mono text-xs tracking-[0.3em] px-4 py-2 border border-zinc-800/80 bg-black/40 min-w-[240px] text-center" style={{
              borderColor: notePhase === "hit" ? "#39FF14" : notePhase === "missed" ? "#FF1493" : notePhase === "in-window" ? "#ffffff" : "rgba(255,255,255,0.15)",
              color: notePhase === "hit" ? "#39FF14" : notePhase === "missed" ? "#FF1493" : notePhase === "in-window" ? "#ffffff" : "rgba(255,255,255,0.4)",
              transition: "all 0.15s",
            }}>
              {notePhase === "in-window" ? "▼  [ SYSTEM_ACTIVATE: HIT NOW ]" : notePhase === "hit" ? "✦  [ PERFECT_HIT ]" : notePhase === "missed" ? "✗  [ SIGNAL_MISS — RE-TRYING ]" : "[ MONITORING_TARGET_SIGNAL… ]"}
            </div>
          )}

          {/* CTA */}
          {!isPractice && step < STEPS.length - 1 && (
            <button
              onClick={() => {
                audioManager.playSfx("tap_nav", 0.15);
                advance();
              }}
              className="font-mono text-xs tracking-[0.35em] px-10 py-3 bg-zinc-950/40 border border-[#39FF14]/50 text-[#39FF14] hover:bg-[#39FF14]/12 hover:text-[#39FF14] hover:shadow-[0_0_15px_rgba(57,255,20,0.25)] transition-all duration-150 relative"
              onMouseEnter={() => audioManager.playSfx("tap_nav", 0.08)}
            >
              {/* Corner mini marks */}
              <div className="absolute top-0 left-0 w-1 h-1 bg-[#39FF14]" />
              <div className="absolute bottom-0 right-0 w-1 h-1 bg-[#39FF14]" />
              CONTINUE →
            </button>
          )}

          {step === STEPS.length - 1 && (
            <div className="flex gap-4">
              <button
                onClick={() => {
                  audioManager.playSfx("tap_nav", 0.15);
                  setLocation("/campaign");
                }}
                className="font-mono text-xs font-bold tracking-[0.3em] px-8 py-3.5 bg-[#39FF14] text-black hover:bg-[#39FF14]/90 hover:shadow-[0_0_20px_rgba(57,255,20,0.4)] transition-all duration-150 border border-transparent"
                onMouseEnter={() => audioManager.playSfx("tap_nav", 0.08)}
              >
                ▶ RUN_CAMPAIGN
              </button>
              <button
                onClick={() => {
                  audioManager.playSfx("tap_nav", 0.15);
                  setLocation("/songs");
                }}
                className="font-mono text-xs tracking-[0.3em] px-8 py-3.5 border border-zinc-700 text-[#00E5FF] bg-black/45 hover:bg-[#00E5FF]/10 hover:border-[#00E5FF] hover:shadow-[0_0_20px_rgba(0,229,255,0.2)] transition-all duration-150"
                onMouseEnter={() => audioManager.playSfx("tap_nav", 0.08)}
              >
                SYS_FREEPLAY
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Classic design path (exact original content)
  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ background: "#080808" }}>
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)",
        backgroundSize: "80px 80px",
      }} />

      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 gap-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <button
          onClick={() => setLocation("/")}
          className="font-mono text-xs tracking-widest transition-colors"
          style={{ color: "rgba(255,255,255,0.25)" }}
          onMouseEnter={e => (e.currentTarget.style.color = "#FF1493")}
          onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.25)")}
        >
          ✕ SKIP
        </button>
        <div className="flex-1 flex items-center gap-3">
          <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div className="h-full" style={{ width: `${pct * 100}%`, background: "#39FF14", transition: "width 0.4s ease" }} />
          </div>
          <div className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.2)", letterSpacing: "0.2em", flexShrink: 0 }}>
            {cur.num} / {String(STEPS.length - 1).padStart(2, "0")}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6 relative overflow-hidden">

        {/* Title */}
        <div className="text-center" key={`title-${step}`}>
          <div className="font-mono text-xs tracking-[0.5em] mb-2" style={{ color: "rgba(255,255,255,0.2)" }}>
            {cur.num}
          </div>
          <div className="font-mono font-bold tracking-[0.22em]" style={{ fontSize: 26, color: "#F2EDE5" }}>
            {cur.title}
          </div>
        </div>

        {/* Visualisation */}
        <div className="w-full flex justify-center">
          {cur.id === "welcome" && <WelcomeViz />}
          {cur.id === "lanes"   && <LanesViz />}
          {isPractice && pKey !== undefined && (
            <PracticeViz laneIdx={pKey} notePhase={notePhase} noteKey={noteKey} feedback={feedback} />
          )}
          {cur.id === "sync"    && <SyncViz />}
          {cur.id === "timing"  && <TimingViz />}
          {cur.id === "misses"  && <MissesViz />}
          {cur.id === "ready"   && <ReadyViz />}
        </div>

        {/* Body copy */}
        <div className="text-center max-w-xs">
          {cur.lines.map((line, i) => {
            const isLabel = /^(PERFECT|GOOD|MISS)/.test(line);
            const color = isLabel ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.38)";
            return (
              <div key={i} className="font-mono text-sm" style={{ color, lineHeight: 1.7, height: line === "" ? 8 : undefined }}>
                {line || null}
              </div>
            );
          })}
        </div>

        {/* Practice hint */}
        {isPractice && (
          <div className="font-mono text-xs tracking-[0.3em]" style={{
            color: notePhase === "hit" ? "#39FF14" : notePhase === "missed" ? "#FF1493" : notePhase === "in-window" ? "#F2EDE5" : "rgba(255,255,255,0.2)",
            transition: "color 0.15s",
          }}>
            {notePhase === "in-window" ? "▼  PRESS NOW" : notePhase === "hit" ? "✦  " + (feedback ?? "HIT") : notePhase === "missed" ? "✗  MISS — TRYING AGAIN" : "WATCH THE NOTE…"}
          </div>
        )}

        {/* CTA */}
        {!isPractice && step < STEPS.length - 1 && (
          <button
            onClick={advance}
            className="font-mono text-xs tracking-[0.35em] px-8 py-3"
            style={{ border: "1px solid rgba(255,255,255,0.2)", color: "#F2EDE5", background: "transparent", cursor: "pointer", transition: "all 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#39FF14"; e.currentTarget.style.color = "#39FF14"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"; e.currentTarget.style.color = "#F2EDE5"; }}
          >
            NEXT →
          </button>
        )}

        {step === STEPS.length - 1 && (
          <div className="flex gap-4">
            <button onClick={() => setLocation("/campaign")} className="font-mono text-xs font-bold tracking-[0.3em] px-8 py-3" style={{ background: "#39FF14", color: "#080808", border: "none", cursor: "pointer" }}>
              ▶ CAMPAIGN
            </button>
            <button onClick={() => setLocation("/songs")} className="font-mono text-xs tracking-[0.3em] px-8 py-3" style={{ border: "1px solid rgba(255,255,255,0.2)", color: "#F2EDE5", background: "transparent", cursor: "pointer" }}>
              FREE PLAY
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── sub-components ────────────────────────────────────────────────

interface VizProps {
  isAvant?: boolean;
}

function WelcomeViz({ isAvant }: VizProps) {
  if (isAvant) {
    return (
      <div className="flex gap-4 p-4 border border-zinc-900 bg-black/45 relative">
        {/* brackets corners */}
        <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-[#39FF14]/50" />
        <div className="absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r border-[#39FF14]/50" />
        {LANE_COLORS().map((c, i) => (
          <div key={i} style={{ width: 44, height: 90, border: `1px solid ${c}40`, background: `${c}05`, position: "relative", overflow: "hidden" }}>
            <div style={{
              position: "absolute", left: "50%", transform: "translateX(-50%)",
              width: 30, height: 12, border: `1px solid ${c}`, background: `${c}40`, opacity: 0.9,
              top: "30%", boxShadow: `0 0 14px ${c}`,
              animation: `tutnf ${1.2 + i * 0.18}s ${i * 0.3}s ease-in infinite`,
            }} />
            <div style={{ position: "absolute", bottom: 16, left: 0, right: 0, height: 1, background: c, opacity: 0.6 }} />
            <div style={{ position: "absolute", bottom: 4, left: 0, right: 0, textAlign: "center", fontSize: 6, color: c, fontFamily: "monospace", opacity: 0.5 }}>L-{i}</div>
          </div>
        ))}
        <style>{`@keyframes tutnf { 0%{top:-20px;opacity:0} 20%{opacity:1} 85%{opacity:1} 100%{top:calc(100% - 30px);opacity:0} }`}</style>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      {LANE_COLORS().map((c, i) => (
        <div key={i} style={{ width: 48, height: 80, border: `1px solid ${c}22`, position: "relative", overflow: "hidden" }}>
          <div style={{
            position: "absolute", left: "50%", transform: "translateX(-50%)",
            width: 32, height: 16, borderRadius: 3, background: c, opacity: 0.7,
            top: "30%", boxShadow: `0 0 12px ${c}`,
            animation: `tutnf ${1.2 + i * 0.18}s ${i * 0.3}s ease-in infinite`,
          }} />
          <div style={{ position: "absolute", bottom: 12, left: 4, right: 4, height: 2, background: c, opacity: 0.4 }} />
        </div>
      ))}
      <style>{`@keyframes tutnf { 0%{top:-20px;opacity:0} 20%{opacity:1} 85%{opacity:1} 100%{top:calc(100% - 30px);opacity:0} }`}</style>
    </div>
  );
}

function LanesViz({ isAvant }: VizProps) {
  const [lit, setLit] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setLit(l => (l + 1) % 3), 900);
    return () => clearInterval(id);
  }, []);

  if (isAvant) {
    return (
      <div className="flex gap-3 p-3 border border-zinc-900 bg-zinc-950/20">
        {LANE_COLORS().map((c, i) => (
          <div key={i} className="flex flex-col items-center gap-2.5" style={{ transition: "opacity 0.2s", opacity: lit === i ? 1 : 0.35 }}>
            <div style={{
              width: 56,
              height: 76,
              border: `1px solid ${c}${lit === i ? "80" : "20"}`,
              background: `${c}${lit === i ? "15" : "02"}`,
              transition: "all 0.2s",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 4px 6px"
            }}>
              <span className="font-mono text-[7px]" style={{ color: c, opacity: 0.7 }}>CH_{i+1}</span>
              <div style={{
                width: 38,
                height: 10,
                border: `1px solid ${c}`,
                background: lit === i ? c : "transparent",
                boxShadow: lit === i ? `0 0 12px ${c}` : "none",
                transition: "all 0.2s"
              }} />
              <span className="font-mono text-[6px] tracking-widest" style={{ color: c, opacity: lit === i ? 1 : 0.4 }}>{lit === i ? "ACTIVE" : "STDBY"}</span>
            </div>
            <div className="font-mono font-bold text-sm" style={{ color: lit === i ? c : "rgba(255,255,255,0.2)" }}>[{LANE_KEYS()[i]}]</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      {LANE_COLORS().map((c, i) => (
        <div key={i} className="flex flex-col items-center gap-2" style={{ transition: "opacity 0.2s", opacity: lit === i ? 1 : 0.3 }}>
          <div style={{ width: 52, height: 70, border: `1px solid ${c}${lit === i ? "55" : "22"}`, background: `${c}${lit === i ? "12" : "06"}`, transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 34, height: 14, borderRadius: 3, background: lit === i ? c : `${c}44`, boxShadow: lit === i ? `0 0 16px ${c}` : "none", transition: "all 0.2s" }} />
          </div>
          <div className="font-mono font-bold text-sm" style={{ color: lit === i ? c : "rgba(255,255,255,0.25)", transition: "color 0.2s" }}>{LANE_KEYS()[i]}</div>
          <div className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.2)", fontSize: 9, letterSpacing: "0.15em" }}>
            {["LEFT", "MID", "RIGHT"][i]}
          </div>
        </div>
      ))}
    </div>
  );
}

interface PracticeVizProps {
  laneIdx: 0 | 1 | 2;
  notePhase: NotePhase;
  noteKey: number;
  feedback: string | null;
  isAvant?: boolean;
}
function PracticeViz({ laneIdx, notePhase, noteKey, feedback, isAvant }: PracticeVizProps) {
  const c = LANE_COLORS()[laneIdx];
  const animating = notePhase === "falling" || notePhase === "in-window";
  const hitLine = notePhase === "in-window";
  const isHit = notePhase === "hit";
  const isMiss = notePhase === "missed";

  if (isAvant) {
    return (
      <div className="flex gap-4 items-end p-4 border border-zinc-900 bg-[#050505] relative">
        <div className="absolute top-0.5 left-1 font-mono text-[7px] text-zinc-600 pointer-events-none">STAGE_MONITOR</div>
        {LANE_COLORS().map((lc, i) => {
          const active = i === laneIdx;
          return (
            <div key={i} style={{ width: 62, height: 180, position: "relative", border: `1px solid ${active ? lc + "50" : "rgba(255,255,255,0.04)"}`, overflow: "hidden", background: active ? `${lc}04` : "rgba(255,255,255,0.01)" }}>
              {/* lane coordinate indicators */}
              <div className="absolute top-1 left-1 pointer-events-none font-mono text-[5px] text-zinc-700" style={{ opacity: active ? 0.7 : 0.3 }}>
                L0{i}
              </div>

              {/* hit line */}
              <div style={{
                position: "absolute", bottom: 32, left: 0, right: 0, height: 1,
                background: active ? (hitLine ? lc : `${lc}70`) : "rgba(255,255,255,0.1)",
                boxShadow: active && hitLine ? `0 0 10px ${lc}` : "none",
                transition: "all 0.15s",
              }} />

              {/* target border highlights */}
              {active && (
                <div style={{
                  position: "absolute", bottom: 22, left: 4, right: 4, height: 20,
                  border: `1px dashed ${hitLine ? lc : `${lc}30`}`,
                  opacity: 0.6
                }} />
              )}

              {/* falling note — wireframe style */}
              {active && animating && (
                <div
                  key={noteKey}
                  style={{
                    position: "absolute",
                    left: 6, right: 6, height: 14,
                    border: `2px solid ${lc}`,
                    background: `${lc}30`,
                    boxShadow: `0 0 12px ${lc}`,
                    animation: `tutfall ${NOTE_FALL_MS}ms linear forwards`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  <div style={{ width: 4, height: 4, background: lc }} />
                </div>
              )}

              {/* hit flash */}
              {active && isHit && (
                <div style={{ position: "absolute", inset: 0, background: `${lc}20`, animation: "tutflash 0.5s ease-out forwards" }}>
                  <div className="absolute inset-x-2 bottom-8 font-mono text-[7px] text-center" style={{ color: lc }}>[ OK ]</div>
                </div>
              )}
              {/* miss flash */}
              {active && isMiss && (
                <div style={{ position: "absolute", inset: 0, background: "rgba(255,20,147,0.15)", animation: "tutflash 0.5s ease-out forwards" }}>
                  <div className="absolute inset-x-2 bottom-8 font-mono text-[7px] text-center text-red-500">[ ERR ]</div>
                </div>
              )}

              {/* key label */}
              <div className="font-mono font-bold absolute" style={{
                bottom: 8, left: 0, right: 0, textAlign: "center", fontSize: 13,
                color: active ? (isHit ? lc : isMiss ? "#FF1493" : hitLine ? "#fff" : `${lc}99`) : "rgba(255,255,255,0.15)",
                transition: "color 0.15s",
              }}>
                {LANE_KEYS()[i]}
              </div>
            </div>
          );
        })}
        <style>{`
          @keyframes tutfall { from{top:-22px} to{top:calc(100% - 50px)} }
          @keyframes tutflash { from{opacity:1} to{opacity:0} }
        `}</style>
      </div>
    );
  }

  return (
    <div className="flex gap-3 items-end">
      {LANE_COLORS().map((lc, i) => {
        const active = i === laneIdx;
        return (
          <div key={i} style={{ width: 56, height: 160, position: "relative", border: `1px solid ${active ? lc + "30" : "rgba(255,255,255,0.06)"}`, overflow: "hidden", background: active ? `${lc}06` : "rgba(255,255,255,0.02)" }}>
            {/* hit line */}
            <div style={{
              position: "absolute", bottom: 28, left: 0, right: 0, height: 2,
              background: active ? (hitLine ? lc : `${lc}50`) : "rgba(255,255,255,0.08)",
              boxShadow: active && hitLine ? `0 0 12px ${lc}` : "none",
              transition: "all 0.15s",
            }} />

            {/* lane dividers */}
            <div style={{ position: "absolute", inset: 0, borderRight: "1px solid rgba(255,255,255,0.04)" }} />

            {/* falling note — only in active lane */}
            {active && animating && (
              <div
                key={noteKey}
                style={{
                  position: "absolute",
                  left: 6, right: 6, height: 18, borderRadius: 4,
                  background: lc,
                  boxShadow: `0 0 14px ${lc}`,
                  animation: `tutfall ${NOTE_FALL_MS}ms linear forwards`,
                }}
              />
            )}

            {/* hit flash */}
            {active && isHit && (
              <div style={{ position: "absolute", inset: 0, background: `${lc}30`, animation: "tutflash 0.5s ease-out forwards" }} />
            )}
            {/* miss flash */}
            {active && isMiss && (
              <div style={{ position: "absolute", inset: 0, background: "rgba(255,20,147,0.15)", animation: "tutflash 0.5s ease-out forwards" }} />
            )}

            {/* key label */}
            <div className="font-mono font-bold absolute" style={{
              bottom: 6, left: 0, right: 0, textAlign: "center", fontSize: 13,
              color: active ? (isHit ? lc : isMiss ? "#FF1493" : hitLine ? "#fff" : `${lc}99`) : "rgba(255,255,255,0.15)",
              transition: "color 0.15s",
            }}>
              {LANE_KEYS()[i]}
            </div>
          </div>
        );
      })}
      <style>{`
        @keyframes tutfall { from{top:-22px} to{top:calc(100% - 50px)} }
        @keyframes tutflash { from{opacity:1} to{opacity:0} }
      `}</style>
    </div>
  );
}

function SyncViz({ isAvant }: VizProps) {
  const steps = [-2, -1, 0, 1, 2, 1, 0, -1];
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % steps.length), 900);
    return () => clearInterval(id);
  }, []);
  const offset = steps[idx];
  const px = offset * 18;
  const ms = offset * 50;
  const synced = offset === 0;
  const color = synced ? "#39FF14" : "#FF1493";
  const label = synced ? "SYNCED" : ms > 0 ? `+${ms}ms` : `${ms}ms`;

  if (isAvant) {
    return (
      <div className="flex flex-col items-center gap-5 w-full max-w-xs p-4 border border-zinc-900 bg-[#050505]/80 relative">
        {/* corner markers */}
        <div className="absolute top-0 left-0 w-1 h-1 bg-[#39FF14]/40" />
        <div className="absolute top-0 right-0 w-1 h-1 bg-[#39FF14]/40" />
        <div className="absolute bottom-0 left-0 w-1 h-1 bg-[#39FF14]/40" />
        <div className="absolute bottom-0 right-0 w-1 h-1 bg-[#39FF14]/40" />

        <div style={{ position: "relative", width: "100%", height: 72, background: "rgba(255,255,255,0.01)", border: "1px dashed rgba(255,255,255,0.05)" }}>
          {/* center line */}
          <div style={{ position: "absolute", left: "50%", top: 4, bottom: 4, width: 1, borderLeft: "1px dashed rgba(57,255,20,0.3)", transform: "translateX(-50%)" }} />

          {/* BEAT pulse */}
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 12, height: 12, border: "1px solid #39FF14", background: "rgba(57,255,20,0.2)", boxShadow: "0 0 10px rgba(57,255,20,0.5)" }} />
          <div className="font-mono text-[7px]" style={{ position: "absolute", top: 4, left: "50%", transform: "translateX(-50%)", color: "#39FF14", letterSpacing: "0.25em", whiteSpace: "nowrap" }}>REF_BEAT</div>

          {/* TAP marker */}
          <div style={{ position: "absolute", top: "50%", left: `calc(50% + ${px}px)`, transform: "translate(-50%,-50%)", width: 12, height: 12, border: `1px solid ${color}`, background: `${color}30`, boxShadow: `0 0 10px ${color}`, transition: "left 0.45s ease, border-color 0.3s" }} />
          <div className="font-mono text-[7px]" style={{ position: "absolute", bottom: 4, left: `calc(50% + ${px}px)`, transform: "translateX(-50%)", color, letterSpacing: "0.2em", transition: "left 0.45s ease, color 0.3s", whiteSpace: "nowrap" }}>SYS_TAP</div>

          {/* gap bracket line */}
          {!synced && (
            <div style={{ position: "absolute", top: "50%", left: px > 0 ? "50%" : `calc(50% + ${px}px)`, width: Math.abs(px), height: 1, background: `${color}60`, transform: "translateY(-50%)", transition: "left 0.45s ease, width 0.45s ease" }} />
          )}
        </div>

        <div className="text-center">
          <div className="font-mono font-bold tracking-wider" style={{ fontSize: 24, color, textShadow: `0 0 15px ${color}30`, transition: "color 0.3s" }}>
            {label}
          </div>
          <div className="font-mono mt-1 text-[8px]" style={{ color: "rgba(255,255,255,0.45)", letterSpacing: "0.2em" }}>
            {synced ? "[ SIGNAL_DEC_ALIGNED ]" : "[ ADJUST_OFFSET_REQUIRED ]"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5 w-full max-w-xs">
      <div style={{ position: "relative", width: "100%", height: 72 }}>
        {/* centre reference line */}
        <div style={{ position: "absolute", left: "50%", top: 8, bottom: 8, width: 1, background: "rgba(255,255,255,0.1)", transform: "translateX(-50%)" }} />

        {/* BEAT pulse — fixed at centre */}
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 14, height: 14, background: "#39FF14", boxShadow: "0 0 12px #39FF14", transition: "none" }} />
        <div className="font-mono" style={{ position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)", fontSize: 8, color: "#39FF14", letterSpacing: "0.2em", whiteSpace: "nowrap" }}>BEAT</div>

        {/* TAP marker — shifts with offset */}
        <div style={{ position: "absolute", top: "50%", left: `calc(50% + ${px}px)`, transform: "translate(-50%,-50%)", width: 14, height: 14, background: color, boxShadow: `0 0 12px ${color}`, transition: "left 0.45s ease, background 0.3s, box-shadow 0.3s" }} />
        <div className="font-mono" style={{ position: "absolute", bottom: 6, left: `calc(50% + ${px}px)`, transform: "translateX(-50%)", fontSize: 8, color, letterSpacing: "0.2em", transition: "left 0.45s ease, color 0.3s", whiteSpace: "nowrap" }}>TAP</div>

        {/* gap bracket */}
        {!synced && (
          <div style={{ position: "absolute", top: "50%", left: px > 0 ? "50%" : `calc(50% + ${px}px)`, width: Math.abs(px), height: 2, background: `${color}55`, transform: "translateY(-50%)", transition: "left 0.45s ease, width 0.45s ease" }} />
        )}
      </div>

      <div className="font-mono font-bold" style={{ fontSize: 22, color, letterSpacing: "0.12em", transition: "color 0.3s", minWidth: 100, textAlign: "center" }}>
        {label}
      </div>
      <div className="font-mono" style={{ fontSize: 9, color: "rgba(255,255,255,0.22)", letterSpacing: "0.25em" }}>
        ADJUST IN ⚙ OPTIONS
      </div>
    </div>
  );
}

function TimingViz({ isAvant }: VizProps) {
  const zones = [
    { label: "PERFECT+", color: "#E5B800", w: 16, ms: "±45ms" },
    { label: "PERFECT",  color: "#39FF14", w: 32, ms: "±80ms" },
    { label: "GOOD",     color: "#00E5FF", w: 54, ms: "±135ms" },
    { label: "MISS",     color: "#FF1493", w: 75, ms: "🔍 >135" },
  ];

  if (isAvant) {
    return (
      <div className="flex flex-col items-center gap-3 w-full max-w-xs p-4 border border-zinc-900 bg-zinc-950/20 relative">
        <div className="absolute top-1 left-1.5 font-mono text-[6px] text-zinc-600">ACCURACY_WINDOWS</div>
        {zones.map(z => (
          <div key={z.label} className="flex items-center gap-4 w-full">
            <div className="font-mono text-xs w-20 text-right" style={{ color: z.color, fontSize: 8, letterSpacing: "0.15em", fontWeight: "bold" }}>
              {z.label}
            </div>
            <div className="flex-1 h-3 bg-zinc-900 border border-zinc-800/40 relative">
              <div className="h-full" style={{ width: `${z.w}%`, background: `${z.color}35`, borderRight: `2px solid ${z.color}`, transition: "width 0.4s" }} />
            </div>
            <div className="font-mono text-[7px] w-12 text-left" style={{ color: z.color }}>
              {z.ms}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 w-full max-w-xs">
      {zones.map(z => (
        <div key={z.label} className="flex items-center gap-3 w-full">
          <div className="font-mono text-xs w-16 text-right" style={{ color: z.color, fontSize: 9, letterSpacing: "0.15em" }}>{z.label}</div>
          <div style={{ height: 6, width: `${z.w}%`, background: z.color, opacity: 0.75 }} />
        </div>
      ))}
      <div className="font-mono text-xs mt-2" style={{ color: "rgba(255,255,255,0.2)", letterSpacing: "0.2em" }}>WINDOW SIZE</div>
    </div>
  );
}

function MissesViz({ isAvant }: VizProps) {
  const [lit, setLit] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setLit(l => (l < 3 ? l + 1 : l)), 700);
    return () => clearInterval(id);
  }, []);

  if (isAvant) {
    return (
      <div className="flex flex-col items-center gap-4 p-4 border border-[#FF1493]/20 bg-zinc-950/20 relative">
        <div className="flex gap-4">
          {[0, 1, 2].map(i => {
            const hasMiss = i < lit;
            return (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div style={{
                  width: 28, height: 28,
                  border: hasMiss ? "1px solid #FF1493" : "1px solid rgba(255,255,255,0.1)",
                  background: hasMiss ? "rgba(255,20,147,0.15)" : "transparent",
                  boxShadow: hasMiss ? "0 0 10px rgba(255,20,147,0.4)" : "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s",
                }}>
                  <span className="font-mono text-xs font-bold" style={{ color: hasMiss ? "#FF1493" : "rgba(255,255,255,0.15)" }}>
                    {hasMiss ? "✗" : `0${i+1}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="h-6 flex items-center justify-center">
          {lit >= 3 ? (
            <div className="font-mono text-xs tracking-[0.25em] text-[#FF1493] font-bold" style={{ textShadow: "0 0 10px rgba(255,20,147,0.6)", animation: "tutflash 0.5s ease-out 1, none 0.5s forwards" }}>
              [ ! ] CRITICAL: SIGNAL_LOST
            </div>
          ) : (
            <div className="font-mono text-[8px] tracking-widest text-zinc-500">
              STABILITY_FAIL_COUNT: {lit}/3
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex gap-3">
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 20, height: 20,
            background: i < lit ? "#FF1493" : "rgba(255,255,255,0.08)",
            boxShadow: i < lit ? "0 0 12px rgba(255,20,147,0.8)" : "none",
            transition: "all 0.2s",
          }} />
        ))}
      </div>
      {lit >= 3 && (
        <div className="font-mono text-sm tracking-[0.35em]" style={{ color: "#FF1493", textShadow: "0 0 20px rgba(255,20,147,0.7)", animation: "tutflash 0.5s ease-out 1, none 0.5s forwards" }}>
          SIGNAL LOST
        </div>
      )}
    </div>
  );
}

function ReadyViz({ isAvant }: VizProps) {
  if (isAvant) {
    return (
      <div className="flex flex-col items-center gap-3 p-4">
        <div className="flex gap-1.5 items-center pointer-events-none">
          {LANE_COLORS().map((c, i) => (
            <div key={i} style={{
              height: 4,
              background: c,
              width: 32,
              boxShadow: `0 0 10px ${c}`,
              animation: `pulse-bar 1.5s ease-in-out infinite alternate`,
              animationDelay: `${i * 0.2}s`
            }} />
          ))}
        </div>
        <style>{`
          @keyframes pulse-bar {
            0% { opacity: 0.3; transform: scaleX(0.85); }
            100% { opacity: 1; transform: scaleX(1.15); }
          }
        `}</style>
        <span className="font-mono text-[9px] text-[#39FF14] tracking-[0.35em] uppercase font-bold animate-pulse">
          ENGINE_DEPLOY_READY
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {LANE_COLORS().map((c, i) => (
        <div key={i} style={{ height: 2, background: c, opacity: 0.6, width: `${(3 - i) * 48}px`, boxShadow: `0 0 8px ${c}` }} />
      ))}
    </div>
  );
}
