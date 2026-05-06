import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { loadOpts, resetOpts, keyLabel, type GameOpts } from "@/lib/options";

// ── colour palette presets (8 per lane, thematically grouped) ────
const COLOR_PRESETS: [string[], string[], string[]] = [
  // Lane 0 — warm / fire
  ["#FF5400", "#FF0000", "#FF8C00", "#E5B800", "#FF1493", "#CC2200", "#FF6B6B", "#FFD700"],
  // Lane 1 — cool / deep
  ["#4A314D", "#6B21A8", "#1E3A8A", "#0891B2", "#7C3AED", "#059669", "#831843", "#374151"],
  // Lane 2 — fresh / neon
  ["#ACE894", "#22C55E", "#10B981", "#06B6D4", "#84CC16", "#A78BFA", "#FDE047", "#F0F0F0"],
];

// Common keys displayed for mobile remapping
const KEY_ROWS = [
  ["q","w","e","r","t","y","u","i","o","p"],
  ["a","s","d","f","g","h","j","k","l"],
  ["z","x","c","v","b","n","m"],
  ["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," "],
];

// ── subcomponents ─────────────────────────────────────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      style={{
        width: 44, height: 24, position: "relative", flexShrink: 0,
        background: on ? "#FF5400" : "rgba(255,255,255,0.08)",
        border: on ? "2px solid #FF5400" : "2px solid rgba(255,255,255,0.12)",
        transition: "background 0.15s, border-color 0.15s",
        cursor: "pointer",
      }}
    >
      <div style={{
        width: 14, height: 14, background: "#fff", position: "absolute",
        top: 3, left: on ? 24 : 3, transition: "left 0.15s",
      }} />
    </button>
  );
}

function SectionLabel({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between"
      style={{ borderBottom: "2px solid rgba(255,255,255,0.08)", paddingBottom: 10, marginBottom: 0 }}>
      <div className="font-mono font-bold tracking-[0.35em]" style={{ fontSize: 11, color: "#FF5400" }}>{label}</div>
      {sub && <div className="font-mono" style={{ fontSize: 9, color: "rgba(255,255,255,0.22)", letterSpacing: "0.15em" }}>{sub}</div>}
    </div>
  );
}

function BeatVisualizer({ offsetMs }: { offsetMs: number }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => (t + 1) % 80), 33);
    return () => clearInterval(id);
  }, []);

  const progress = tick / 80;
  const beatPos = 0.5;
  // TAP dot: drifts sinusoidally when offset ≠ 0 so user can see the mismatch
  const drift = offsetMs === 0 ? 0 : Math.sin(progress * Math.PI * 2) * (Math.abs(offsetMs) / 150) * 0.22;
  const tapPos = beatPos + drift;

  return (
    <div style={{ position: "relative", height: 48, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
      {/* grid lines */}
      {[0.25, 0.5, 0.75].map(x => (
        <div key={x} style={{ position: "absolute", top: 0, bottom: 0, left: `${x * 100}%`, width: 1, background: "rgba(255,255,255,0.04)" }} />
      ))}
      {/* track */}
      <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.06)", transform: "translateY(-50%)" }} />

      {/* BEAT dot — fixed */}
      <div style={{
        position: "absolute", top: "50%", left: `${beatPos * 100}%`,
        transform: "translate(-50%, -50%)",
        width: 12, height: 12, borderRadius: "50%",
        background: "#ACE894", boxShadow: "0 0 10px #ACE894",
      }} />
      {/* TAP dot — drifts */}
      <div style={{
        position: "absolute", top: "50%", left: `${tapPos * 100}%`,
        transform: "translate(-50%, -50%)",
        width: 12, height: 12, borderRadius: "50%",
        background: "#FF5400", boxShadow: "0 0 10px #FF5400",
        transition: "left 0.08s linear",
      }} />

      {/* labels */}
      <div style={{ position: "absolute", bottom: 3, left: `${beatPos * 100}%`, transform: "translateX(-50%)", fontFamily: "monospace", fontSize: 7, color: "#ACE894", letterSpacing: "0.1em" }}>BEAT</div>
      <div style={{ position: "absolute", top: 3, left: `${tapPos * 100}%`, transform: "translateX(-50%)", fontFamily: "monospace", fontSize: 7, color: "#FF5400", letterSpacing: "0.1em" }}>TAP</div>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────
export default function Options() {
  const [, setLocation] = useLocation();
  const [opts, setOpts] = useState<GameOpts>(loadOpts);
  const [remapping, setRemapping] = useState<number | null>(null);
  const [resetState, setResetState] = useState<"idle" | "confirm">("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const colorRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  // keyboard listener for remapping
  useEffect(() => {
    if (remapping === null) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === "Escape") { setRemapping(null); return; }
      // Accept single printable chars and arrow keys
      const ok = e.key.length === 1 || e.key.startsWith("Arrow");
      if (!ok) return;
      assignKey(remapping, e.key);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [remapping]); // eslint-disable-line react-hooks/exhaustive-deps

  function assignKey(lane: number, key: string) {
    const k = key === " " ? " " : key.length === 1 ? key.toLowerCase() : key;
    const newKeys = [...opts.laneKeys] as [string, string, string];
    newKeys[lane] = k;
    localStorage.setItem(`opt_laneKey_${lane}`, k);
    setOpts(o => ({ ...o, laneKeys: newKeys }));
    setRemapping(null);
  }

  function setColor(lane: number, color: string) {
    const newColors = [...opts.laneColors] as [string, string, string];
    newColors[lane] = color;
    localStorage.setItem(`opt_laneColor_${lane}`, color);
    setOpts(o => ({ ...o, laneColors: newColors }));
  }

  function toggle(k: "missSystem" | "hudMisses" | "comboDisplay" | "judgmentText") {
    const v = !opts[k];
    localStorage.setItem(`opt_${k}`, String(v));
    setOpts(o => ({ ...o, [k]: v }));
  }

  function handleReset() {
    if (resetState === "idle") {
      setResetState("confirm");
      resetTimer.current = setTimeout(() => setResetState("idle"), 2500);
    } else {
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetOpts();
      setOpts(loadOpts());
      setResetState("idle");
    }
  }

  const color = (lane: number) => opts.laneColors[lane];

  return (
    <div className="min-h-screen w-full flex flex-col" style={{ background: "#080808" }}>
      {/* bg grid */}
      <div className="fixed inset-0 pointer-events-none"
        style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.02) 1px,transparent 1px)", backgroundSize: "64px 64px" }} />

      {/* sticky header */}
      <div className="sticky top-0 z-40 flex items-center justify-between px-5 py-4 gap-4"
        style={{ background: "rgba(8,8,8,0.95)", borderBottom: "2px solid rgba(255,255,255,0.08)", backdropFilter: "blur(10px)" }}>
        <button
          onClick={() => setLocation("/")}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          <span className="font-mono text-xs tracking-[0.25em] flex items-center gap-1.5 transition-colors"
            style={{ color: "rgba(255,255,255,0.4)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#FF5400")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}>
            ← BACK
          </span>
        </button>

        <div className="font-mono font-bold tracking-[0.4em]" style={{ fontSize: 13, color: "#F2EDE5", flexShrink: 0 }}>
          PLAYER CONFIG
        </div>

        <button
          onClick={handleReset}
          className="font-mono text-xs tracking-[0.2em] transition-all"
          style={{
            background: "none",
            border: `1px solid ${resetState === "confirm" ? "#FF5400" : "rgba(255,84,0,0.25)"}`,
            color: resetState === "confirm" ? "#FF5400" : "rgba(255,84,0,0.4)",
            padding: "4px 10px", cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          {resetState === "confirm" ? "CONFIRM?" : "RESET"}
        </button>
      </div>

      {/* content */}
      <div className="flex-1 w-full max-w-lg mx-auto px-4 py-6 flex flex-col gap-8 relative z-10">

        {/* ── CONTROLS ────────────────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <SectionLabel label="CONTROLS" sub="Key binding & lane colour" />

          {/* 3 lane cards */}
          <div className="grid grid-cols-3 gap-2 mt-1">
            {([0, 1, 2] as const).map(lane => {
              const lc = color(lane);
              const listening = remapping === lane;
              return (
                <div key={lane} style={{
                  border: `2px solid ${listening ? lc : "rgba(255,255,255,0.08)"}`,
                  background: listening ? `${lc}0f` : "rgba(255,255,255,0.018)",
                  transition: "border-color 0.15s, background 0.15s",
                  display: "flex", flexDirection: "column",
                }}>
                  {/* lane label */}
                  <div className="font-mono px-2 pt-2 pb-1"
                    style={{ fontSize: 8, color: "rgba(255,255,255,0.22)", letterSpacing: "0.3em", borderBottom: `1px solid ${lc}28` }}>
                    {["LEFT", "MID", "RIGHT"][lane]}
                  </div>

                  {/* colour stripe */}
                  <div className="mx-2 mt-2 h-0.5"
                    style={{ background: `linear-gradient(90deg, ${lc}00, ${lc}, ${lc}00)` }} />

                  {/* key button */}
                  <button
                    onClick={() => setRemapping(listening ? null : lane)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "12px 4px 8px" }}
                  >
                    <div className="font-mono font-bold text-center leading-none"
                      style={{
                        fontSize: 30, minHeight: 34, display: "flex", alignItems: "center", justifyContent: "center",
                        color: listening ? lc : "#F2EDE5",
                        textShadow: listening ? `0 0 18px ${lc}` : "none",
                        transition: "color 0.15s, text-shadow 0.15s",
                      }}>
                      {listening ? "…" : keyLabel(opts.laneKeys[lane])}
                    </div>
                    <div className="font-mono text-center mt-1"
                      style={{ fontSize: 7, letterSpacing: "0.2em", color: listening ? lc : "rgba(255,255,255,0.2)" }}>
                      {listening ? "PRESS KEY" : "TAP·REMAP"}
                    </div>
                  </button>

                  {/* colour swatches: 2 rows × 4 */}
                  <div className="px-1.5 pb-1.5 grid grid-cols-4 gap-1">
                    {COLOR_PRESETS[lane].map(c => (
                      <button key={c} onClick={() => setColor(lane, c)} style={{
                        aspectRatio: "1", width: "100%", background: c, border: "none",
                        outline: opts.laneColors[lane] === c ? "2px solid #fff" : "2px solid transparent",
                        boxShadow: opts.laneColors[lane] === c ? `0 0 8px ${c}` : "none",
                        cursor: "pointer", transition: "outline 0.1s, box-shadow 0.1s",
                      }} />
                    ))}
                  </div>

                  {/* custom colour picker */}
                  <label className="mx-1.5 mb-1.5 flex items-center gap-1.5 cursor-pointer"
                    style={{ fontSize: 7, fontFamily: "monospace", color: "rgba(255,255,255,0.28)", letterSpacing: "0.2em" }}>
                    <div style={{ width: 14, height: 14, background: lc, border: "1px solid rgba(255,255,255,0.2)", position: "relative", flexShrink: 0 }}>
                      <input
                        ref={colorRefs[lane]}
                        type="color"
                        value={lc}
                        onChange={e => setColor(lane, e.target.value)}
                        style={{ opacity: 0, position: "absolute", inset: 0, width: "100%", height: "100%", cursor: "pointer", border: "none", padding: 0 }}
                      />
                    </div>
                    CUSTOM
                  </label>
                </div>
              );
            })}
          </div>

          {/* on-screen key picker — shown when remapping active (works on mobile) */}
          {remapping !== null && (
            <div style={{ border: `2px solid ${color(remapping)}`, background: `${color(remapping)}08`, padding: "10px 8px 8px" }}>
              <div className="font-mono mb-2 text-center"
                style={{ fontSize: 8, color: color(remapping), letterSpacing: "0.25em" }}>
                PICK A KEY FOR {["LEFT", "MID", "RIGHT"][remapping]} LANE
              </div>
              {KEY_ROWS.map((row, ri) => (
                <div key={ri} className="flex justify-center gap-1 mb-1">
                  {row.map(k => (
                    <button
                      key={k}
                      onClick={() => assignKey(remapping, k)}
                      className="font-mono font-bold"
                      style={{
                        minWidth: k.startsWith("Arrow") ? 28 : 22, height: 24,
                        background: opts.laneKeys[remapping] === (k === " " ? " " : k.length === 1 ? k.toLowerCase() : k)
                          ? color(remapping) : "rgba(255,255,255,0.06)",
                        border: `1px solid ${opts.laneKeys[remapping] === (k === " " ? " " : k.length === 1 ? k.toLowerCase() : k)
                          ? color(remapping) : "rgba(255,255,255,0.12)"}`,
                        color: "#F2EDE5", fontSize: 10, cursor: "pointer", padding: "0 4px",
                        transition: "background 0.1s",
                      }}
                    >
                      {keyLabel(k)}
                    </button>
                  ))}
                </div>
              ))}
              <div className="font-mono text-center mt-2"
                style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", letterSpacing: "0.15em" }}>
                ESC to cancel · physical key also works
              </div>
            </div>
          )}
        </section>

        {/* ── AUDIO SYNC ──────────────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <SectionLabel label="AUDIO SYNC" sub="Compensate for speaker delay" />
          <div style={{ border: "2px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.015)" }}>
            <div className="px-4 pt-4 pb-3">
              <BeatVisualizer offsetMs={opts.audioOffset} />
            </div>
            <div className="px-4 pb-1 flex items-center justify-between">
              <div className="font-mono" style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.25em" }}>
                OFFSET
              </div>
              <div className="font-mono font-bold"
                style={{ fontSize: 18, letterSpacing: "0.08em", color: opts.audioOffset === 0 ? "#ACE894" : "#FF5400" }}>
                {opts.audioOffset === 0 ? "SYNCED" : opts.audioOffset > 0 ? `+${opts.audioOffset} ms` : `${opts.audioOffset} ms`}
              </div>
            </div>
            <div className="px-4 pb-2">
              <input
                type="range" min={-150} max={150} step={5} value={opts.audioOffset}
                onChange={e => {
                  const v = parseInt(e.target.value);
                  localStorage.setItem("opt_audioOffset", String(v));
                  setOpts(o => ({ ...o, audioOffset: v }));
                }}
                style={{ width: "100%", accentColor: "#FF5400", cursor: "pointer" }}
              />
              <div className="flex justify-between font-mono mt-0.5"
                style={{ fontSize: 8, color: "rgba(255,255,255,0.18)", letterSpacing: "0.05em" }}>
                <span>−150 ms (early)</span>
                <span>0</span>
                <span>+150 ms (late)</span>
              </div>
            </div>
            <div className="px-4 pb-4">
              <div className="font-mono" style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", letterSpacing: "0.12em", lineHeight: 1.8 }}>
                NOTES PASS BEFORE YOU HEAR THE BEAT → DRAG LEFT<br />
                YOU HEAR THE BEAT BEFORE NOTES PASS → DRAG RIGHT
              </div>
            </div>
          </div>
        </section>

        {/* ── GAMEPLAY ────────────────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <SectionLabel label="GAMEPLAY" sub="Mechanics & display" />
          <div style={{ border: "2px solid rgba(255,255,255,0.08)" }}>
            {([
              { key: "missSystem",   label: "MISS SYSTEM",   sub: "3 strikes trigger SIGNAL LOST" },
              { key: "hudMisses",    label: "HUD MISSES",    sub: "Miss pips shown in HUD" },
              { key: "comboDisplay", label: "COMBO DISPLAY", sub: "Combo counter" },
              { key: "judgmentText", label: "JUDGMENT TEXT", sub: "PERFECT / GOOD popup text" },
            ] as const).map(({ key, label, sub }, i, arr) => {
              const on = opts[key];
              return (
                <div key={key} className="flex items-center justify-between px-4 py-3"
                  style={{ borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                  <div>
                    <div className="font-mono text-xs tracking-[0.15em]"
                      style={{ color: on ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.28)" }}>
                      {label}
                    </div>
                    <div className="font-mono mt-0.5"
                      style={{ fontSize: 9, color: "rgba(255,255,255,0.18)", letterSpacing: "0.1em" }}>
                      {sub}
                    </div>
                  </div>
                  <Toggle on={on} onChange={() => toggle(key)} />
                </div>
              );
            })}
          </div>
        </section>

        {/* footer */}
        <div className="text-center font-mono pb-4"
          style={{ fontSize: 8, color: "rgba(255,255,255,0.08)", letterSpacing: "0.35em" }}>
          TH3SCR1B3 · RHYTHM ENGINE · PLAYER CONFIG
        </div>
      </div>
    </div>
  );
}
