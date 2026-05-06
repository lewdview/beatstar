import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { loadOpts, keyLabel } from "@/lib/options";

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
        advance(); return;
      }
      if (isPractice && notePhase === "in-window") {
        const keys = loadOpts().laneKeys;
        if (k === keys[pKey!]) {
          clear();
          setNotePhase("hit");
          setFeedback("PERFECT+");
          timerA.current = setTimeout(() => advanceRef.current(), 700);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [step, isPractice, notePhase, pKey, advance]);

  useEffect(() => () => clear(), []);

  const pct = step / (STEPS.length - 1);

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
          onMouseEnter={e => (e.currentTarget.style.color = "#FF5400")}
          onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.25)")}
        >
          ✕ SKIP
        </button>
        <div className="flex-1 flex items-center gap-3">
          <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div className="h-full" style={{ width: `${pct * 100}%`, background: "#ACE894", transition: "width 0.4s ease" }} />
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
            color: notePhase === "hit" ? "#ACE894" : notePhase === "missed" ? "#FF5400" : notePhase === "in-window" ? "#F2EDE5" : "rgba(255,255,255,0.2)",
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
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#ACE894"; e.currentTarget.style.color = "#ACE894"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"; e.currentTarget.style.color = "#F2EDE5"; }}
          >
            NEXT →
          </button>
        )}

        {step === STEPS.length - 1 && (
          <div className="flex gap-4">
            <button onClick={() => setLocation("/campaign")} className="font-mono text-xs font-bold tracking-[0.3em] px-8 py-3" style={{ background: "#ACE894", color: "#080808", border: "none", cursor: "pointer" }}>
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

function WelcomeViz() {
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

function LanesViz() {
  const [lit, setLit] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setLit(l => (l + 1) % 3), 900);
    return () => clearInterval(id);
  }, []);
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
}
function PracticeViz({ laneIdx, notePhase, noteKey, feedback }: PracticeVizProps) {
  const c = LANE_COLORS()[laneIdx];
  const animating = notePhase === "falling" || notePhase === "in-window";
  const hitLine = notePhase === "in-window";
  const isHit = notePhase === "hit";
  const isMiss = notePhase === "missed";

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
              <div style={{ position: "absolute", inset: 0, background: "rgba(255,84,0,0.15)", animation: "tutflash 0.5s ease-out forwards" }} />
            )}

            {/* key label */}
            <div className="font-mono font-bold absolute" style={{
              bottom: 6, left: 0, right: 0, textAlign: "center", fontSize: 13,
              color: active ? (isHit ? lc : isMiss ? "#FF5400" : hitLine ? "#fff" : `${lc}99`) : "rgba(255,255,255,0.15)",
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

function SyncViz() {
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
  const color = synced ? "#ACE894" : "#FF5400";
  const label = synced ? "SYNCED" : ms > 0 ? `+${ms}ms` : `${ms}ms`;

  return (
    <div className="flex flex-col items-center gap-5 w-full max-w-xs">
      <div style={{ position: "relative", width: "100%", height: 72 }}>
        {/* centre reference line */}
        <div style={{ position: "absolute", left: "50%", top: 8, bottom: 8, width: 1, background: "rgba(255,255,255,0.1)", transform: "translateX(-50%)" }} />

        {/* BEAT pulse — fixed at centre */}
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 14, height: 14, background: "#ACE894", boxShadow: "0 0 12px #ACE894", transition: "none" }} />
        <div className="font-mono" style={{ position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)", fontSize: 8, color: "#ACE894", letterSpacing: "0.2em", whiteSpace: "nowrap" }}>BEAT</div>

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

function TimingViz() {
  const zones = [
    { label: "PERFECT+", color: "#E5B800", w: 14 },
    { label: "PERFECT",  color: "#ACE894", w: 26 },
    { label: "GOOD",     color: "#4A314D", w: 42 },
    { label: "MISS",     color: "#333",    w: 60 },
  ];
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

function MissesViz() {
  const [lit, setLit] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setLit(l => (l < 3 ? l + 1 : l)), 700);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex gap-3">
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 20, height: 20,
            background: i < lit ? "#FF5400" : "rgba(255,255,255,0.08)",
            boxShadow: i < lit ? "0 0 12px rgba(255,84,0,0.8)" : "none",
            transition: "all 0.2s",
          }} />
        ))}
      </div>
      {lit >= 3 && (
        <div className="font-mono text-sm tracking-[0.35em]" style={{ color: "#FF5400", textShadow: "0 0 20px rgba(255,84,0,0.7)", animation: "tutflash 0.5s ease-out 1, none 0.5s forwards" }}>
          SIGNAL LOST
        </div>
      )}
    </div>
  );
}

function ReadyViz() {
  return (
    <div className="flex flex-col items-center gap-2">
      {LANE_COLORS().map((c, i) => (
        <div key={i} style={{ height: 2, background: c, opacity: 0.6, width: `${(3 - i) * 48}px`, boxShadow: `0 0 8px ${c}` }} />
      ))}
    </div>
  );
}
