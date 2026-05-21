import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { loadOpts, resetOpts, keyLabel, getActiveTheme, type GameOpts } from "@/lib/options";
import { clearCatalogCache } from "@/game/api";
import { audioManager } from "@/game/audio";

// ── colour palette presets (8 per lane, thematically grouped) ────
const COLOR_PRESETS: [string[], string[], string[]] = [
  // Lane 0 — warm / fire
  ["#FF1493", "#FF0000", "#FF8C00", "#E5B800", "#FF5400", "#CC2200", "#FF6B6B", "#FFD700"],
  // Lane 1 — cool / deep
  ["#00E5FF", "#6B21A8", "#1E3A8A", "#0891B2", "#7C3AED", "#059669", "#831843", "#374151"],
  // Lane 2 — fresh / neon
  ["#39FF14", "#22C55E", "#10B981", "#06B6D4", "#84CC16", "#A78BFA", "#FDE047", "#F0F0F0"],
];

// Common keys displayed for mobile remapping
const KEY_ROWS = [
  ["q","w","e","r","t","y","u","i","o","p"],
  ["a","s","d","f","g","h","j","k","l"],
  ["z","x","c","v","b","n","m"],
  ["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," "],
];

// ── subcomponents ─────────────────────────────────────────────────

function Toggle({ on, onChange, isAvant }: { on: boolean; onChange: () => void; isAvant?: boolean }) {
  if (isAvant) {
    return (
      <button
        onClick={onChange}
        onMouseEnter={() => audioManager.playSfx('tap_nav', 0.1)}
        style={{
          width: 50, height: 18, position: "relative", flexShrink: 0,
          background: on ? "rgba(57,255,20,0.12)" : "rgba(255,255,255,0.02)",
          border: on ? "1px solid #39FF14" : "1px solid rgba(255,255,255,0.15)",
          boxShadow: on ? "0 0 10px rgba(57,255,20,0.2)" : "none",
          transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          cursor: "pointer",
        }}
      >
        <div style={{
          width: 10, height: 10,
          background: on ? "#39FF14" : "rgba(255,255,255,0.3)",
          boxShadow: on ? "0 0 6px #39FF14" : "none",
          position: "absolute",
          top: 3, left: on ? 35 : 3, transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        }} />
        <div style={{
          position: "absolute", right: 6, top: 4, fontSize: 7, fontFamily: "monospace",
          color: "#39FF14", opacity: on ? 1 : 0, transition: "opacity 0.2s", fontWeight: "bold"
        }}>ON</div>
        <div style={{
          position: "absolute", left: 6, top: 4, fontSize: 7, fontFamily: "monospace",
          color: "rgba(255,255,255,0.3)", opacity: on ? 0 : 1, transition: "opacity 0.2s"
        }}>OFF</div>
      </button>
    );
  }
  return (
    <button
      onClick={onChange}
      style={{
        width: 44, height: 24, position: "relative", flexShrink: 0,
        background: on ? "#FF1493" : "rgba(255,255,255,0.08)",
        border: on ? "2px solid #FF1493" : "2px solid rgba(255,255,255,0.12)",
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

function SectionLabel({ label, sub, isAvant }: { label: string; sub?: string; isAvant?: boolean }) {
  if (isAvant) {
    return (
      <div className="flex items-baseline justify-between py-1.5 px-3"
        style={{ borderLeft: "3px solid #39FF14", background: "linear-gradient(90deg, rgba(57,255,20,0.08), transparent)", borderBottom: "1px solid rgba(57,255,20,0.15)", marginBottom: 4 }}>
        <div className="font-mono font-bold tracking-[0.3em] text-[#39FF14]" style={{ fontSize: 11 }}>{label}</div>
        {sub && <div className="font-mono font-black" style={{ fontSize: 8, color: "rgba(255,255,255,0.45)", letterSpacing: "0.15em" }}>// {sub.toUpperCase()}</div>}
      </div>
    );
  }
  return (
    <div className="flex items-baseline justify-between"
      style={{ borderBottom: "2px solid rgba(255,255,255,0.08)", paddingBottom: 10, marginBottom: 0 }}>
      <div className="font-mono font-bold tracking-[0.35em]" style={{ fontSize: 11, color: "#FF1493" }}>{label}</div>
      {sub && <div className="font-mono" style={{ fontSize: 9, color: "rgba(255,255,255,0.22)", letterSpacing: "0.15em" }}>{sub}</div>}
    </div>
  );
}

function BeatVisualizer({ offsetMs, isAvant }: { offsetMs: number; isAvant?: boolean }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => (t + 1) % 80), 33);
    return () => clearInterval(id);
  }, []);

  const progress = tick / 80;
  const beatPos = 0.5;
  const drift = offsetMs === 0 ? 0 : Math.sin(progress * Math.PI * 2) * (Math.abs(offsetMs) / 150) * 0.22;
  const tapPos = beatPos + drift;

  if (isAvant) {
    return (
      <div style={{ position: "relative", height: 56, background: "rgba(8,8,12,0.6)", border: "1px solid rgba(57,255,20,0.15)", overflow: "hidden" }}>
        {/* sweep */}
        <div style={{
          position: "absolute", top: 0, bottom: 0, left: `${progress * 100}%`, width: 2,
          background: "linear-gradient(90deg, rgba(57,255,20,0.4), transparent)",
          boxShadow: "0 0 8px rgba(57,255,20,0.3)"
        }} />
        {/* grid lines */}
        {[0.25, 0.5, 0.75].map(x => (
          <div key={x} style={{ position: "absolute", top: 0, bottom: 0, left: `${x * 100}%`, width: 1, background: "rgba(255,255,255,0.06)" }} />
        ))}
        {/* track */}
        <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.1)", transform: "translateY(-50%)" }} />

        {/* BEAT dot */}
        <div style={{
          position: "absolute", top: "50%", left: `${beatPos * 100}%`,
          transform: "translate(-50%, -50%)",
          width: 10, height: 10, borderRadius: "50%",
          background: "#39FF14", boxShadow: "0 0 12px #39FF14",
        }} />
        {/* TAP dot */}
        <div style={{
          position: "absolute", top: "50%", left: `${tapPos * 100}%`,
          transform: "translate(-50%, -50%)",
          width: 10, height: 10, borderRadius: "50%",
          background: "#FF1493", boxShadow: "0 0 12px #FF1493",
          transition: "left 0.08s linear",
        }} />

        {/* corner details */}
        <div style={{ position: "absolute", top: 2, left: 2, fontSize: 6, color: "rgba(57,255,20,0.4)", fontFamily: "monospace" }}>[ CAL_CH.A ]</div>
        <div style={{ position: "absolute", top: 2, right: 2, fontSize: 6, color: "rgba(255,20,147,0.4)", fontFamily: "monospace" }}>[ CAL_CH.B ]</div>

        {/* labels */}
        <div style={{ position: "absolute", bottom: 4, left: `${beatPos * 100}%`, transform: "translateX(-50%)", fontFamily: "monospace", fontSize: 8, fontWeight: "bold", color: "#39FF14", letterSpacing: "0.15em" }}>BEAT</div>
        <div style={{ position: "absolute", top: 4, left: `${tapPos * 100}%`, transform: "translateX(-50%)", fontFamily: "monospace", fontSize: 8, fontWeight: "bold", color: "#FF1493", letterSpacing: "0.15em" }}>TAP</div>
      </div>
    );
  }

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
        background: "#39FF14", boxShadow: "0 0 10px #39FF14",
      }} />
      {/* TAP dot — drifts */}
      <div style={{
        position: "absolute", top: "50%", left: `${tapPos * 100}%`,
        transform: "translate(-50%, -50%)",
        width: 12, height: 12, borderRadius: "50%",
        background: "#FF1493", boxShadow: "0 0 10px #FF1493",
        transition: "left 0.08s linear",
      }} />

      {/* labels */}
      <div style={{ position: "absolute", bottom: 3, left: `${beatPos * 100}%`, transform: "translateX(-50%)", fontFamily: "monospace", fontSize: 7, color: "#39FF14", letterSpacing: "0.1em" }}>BEAT</div>
      <div style={{ position: "absolute", top: 3, left: `${tapPos * 100}%`, transform: "translateX(-50%)", fontFamily: "monospace", fontSize: 7, color: "#FF1493", letterSpacing: "0.1em" }}>TAP</div>
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

  const isAvant = getActiveTheme() === "avant-garde";

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

  function toggle(k: "missSystem" | "hudMisses" | "comboDisplay" | "judgmentText" | "useLocalFiles") {
    const v = !opts[k];
    localStorage.setItem(`opt_${k}`, String(v));
    setOpts(o => ({ ...o, [k]: v }));
    
    // Clear catalog cache if we toggled the local files switch
    if (k === "useLocalFiles") {
      clearCatalogCache();
    }
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
    <div className="min-h-screen w-full flex flex-col" style={{ background: isAvant ? "#050505" : "#080808" }}>
      {/* bg grid */}
      <div className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: isAvant
            ? "linear-gradient(rgba(57,255,20,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(57,255,20,0.03) 1px,transparent 1px)"
            : "linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.02) 1px,transparent 1px)",
          backgroundSize: "64px 64px"
        }} />
      {isAvant && (
        <div className="fixed inset-0 pointer-events-none opacity-20"
          style={{
            background: "radial-gradient(circle at 50% 50%, transparent 60%, rgba(0,0,0,0.85))"
          }} />
      )}

      {/* sticky header */}
      <div className="sticky top-0 z-40 flex items-center justify-between px-5 py-4 gap-4"
        style={{
          background: isAvant ? "rgba(5,5,5,0.95)" : "rgba(8,8,8,0.95)",
          borderBottom: isAvant ? "1px solid rgba(57,255,20,0.2)" : "2px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(10px)"
        }}>
        <button
          onClick={() => {
            if (isAvant) audioManager.playSfx('tap_nav', 0.12);
            setLocation("/");
          }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          <span className="font-mono text-xs tracking-[0.25em] flex items-center gap-1.5 transition-colors"
            style={{ color: isAvant ? "rgba(57,255,20,0.5)" : "rgba(255,255,255,0.4)" }}
            onMouseEnter={e => {
              if (isAvant) audioManager.playSfx('tap_nav', 0.08);
              e.currentTarget.style.color = isAvant ? "#39FF14" : "#FF1493";
            }}
            onMouseLeave={e => (e.currentTarget.style.color = isAvant ? "rgba(57,255,20,0.5)" : "rgba(255,255,255,0.4)")}>
            ← BACK
          </span>
        </button>

        <div className="font-mono font-bold tracking-[0.4em]"
          style={{
            fontSize: 13,
            color: isAvant ? "#39FF14" : "#F2EDE5",
            flexShrink: 0,
            textShadow: isAvant ? "0 0 10px rgba(57,255,20,0.3)" : "none"
          }}>
          PLAYER CONFIG
        </div>

        <button
          onClick={() => {
            if (isAvant) audioManager.playSfx('tap_nav', 0.15);
            handleReset();
          }}
          onMouseEnter={() => { if (isAvant) audioManager.playSfx('tap_nav', 0.08); }}
          className="font-mono text-xs tracking-[0.2em] transition-all"
          style={{
            background: "none",
            border: isAvant
              ? `1px solid ${resetState === "confirm" ? "#FF1493" : "rgba(57,255,20,0.3)"}`
              : `1px solid ${resetState === "confirm" ? "#FF1493" : "rgba(255,20,147,0.25)"}`,
            color: resetState === "confirm"
              ? "#FF1493"
              : (isAvant ? "rgba(57,255,20,0.6)" : "rgba(255,20,147,0.4)"),
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
          <SectionLabel label="CONTROLS" sub="Key binding & lane colour" isAvant={isAvant} />

          {/* 3 lane cards */}
          <div className="grid grid-cols-3 gap-2 mt-1">
            {([0, 1, 2] as const).map(lane => {
              const lc = color(lane);
              const listening = remapping === lane;
              return (
                <div key={lane} style={{
                  border: isAvant
                    ? `1px solid ${listening ? lc : "rgba(57,255,20,0.15)"}`
                    : `2px solid ${listening ? lc : "rgba(255,255,255,0.08)"}`,
                  background: listening ? `${lc}0f` : (isAvant ? "rgba(5,5,5,0.5)" : "rgba(255,255,255,0.018)"),
                  boxShadow: (isAvant && listening) ? `0 0 15px ${lc}22` : "none",
                  transition: "all 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
                  display: "flex", flexDirection: "column",
                  position: "relative"
                }}>
                  {isAvant && (
                    <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: 4, borderTop: `1px solid ${lc}`, borderLeft: `1px solid ${lc}` }} />
                  )}

                  {/* lane label */}
                  <div className="font-mono px-2 pt-2 pb-1"
                    style={{ fontSize: 8, color: isAvant ? "rgba(57,255,20,0.4)" : "rgba(255,255,255,0.22)", letterSpacing: "0.3em", borderBottom: `1px solid ${lc}28` }}>
                    {["LEFT", "MID", "RIGHT"][lane]}
                  </div>

                  {/* colour stripe */}
                  <div className="mx-2 mt-2 h-0.5"
                    style={{ background: `linear-gradient(90deg, ${lc}00, ${lc}, ${lc}00)` }} />

                  {/* key button */}
                  <button
                    onClick={() => {
                      if (isAvant) audioManager.playSfx('tap_nav', 0.12);
                      setRemapping(listening ? null : lane);
                    }}
                    onMouseEnter={() => { if (isAvant) audioManager.playSfx('tap_nav', 0.08); }}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "12px 4px 8px" }}
                  >
                    <div className="font-mono font-bold text-center leading-none"
                      style={{
                        fontSize: 30, minHeight: 34, display: "flex", alignItems: "center", justifyContent: "center",
                        color: listening ? lc : (isAvant ? "rgba(255,255,255,0.85)" : "#F2EDE5"),
                        textShadow: listening ? `0 0 18px ${lc}` : "none",
                        transition: "color 0.15s, text-shadow 0.15s",
                      }}>
                      {listening ? "…" : keyLabel(opts.laneKeys[lane])}
                    </div>
                    <div className="font-mono text-center mt-1"
                      style={{ fontSize: 7, letterSpacing: "0.2em", color: listening ? lc : (isAvant ? "rgba(57,255,20,0.4)" : "rgba(255,255,255,0.2)") }}>
                      {listening ? "PRESS KEY" : "TAP·REMAP"}
                    </div>
                  </button>

                  {/* colour swatches: 2 rows × 4 */}
                  <div className="px-1.5 pb-1.5 grid grid-cols-4 gap-1">
                    {COLOR_PRESETS[lane].map(c => (
                      <button
                        key={c}
                        onClick={() => {
                          if (isAvant) audioManager.playSfx('tap_nav', 0.1);
                          setColor(lane, c);
                        }}
                        onMouseEnter={() => { if (isAvant) audioManager.playSfx('tap_nav', 0.05); }}
                        style={{
                          aspectRatio: "1", width: "100%", background: c, border: "none",
                          outline: opts.laneColors[lane] === c
                            ? (isAvant ? "1px solid #39FF14" : "2px solid #fff")
                            : "2px solid transparent",
                          outlineOffset: isAvant ? "1px" : "0px",
                          boxShadow: opts.laneColors[lane] === c ? `0 0 8px ${c}` : "none",
                          cursor: "pointer", transition: "outline 0.1s, box-shadow 0.1s",
                        }}
                      />
                    ))}
                  </div>

                  {/* custom colour picker */}
                  <label className="mx-1.5 mb-1.5 flex items-center gap-1.5 cursor-pointer"
                    onMouseEnter={() => { if (isAvant) audioManager.playSfx('tap_nav', 0.05); }}
                    style={{ fontSize: 7, fontFamily: "monospace", color: isAvant ? "rgba(57,255,20,0.5)" : "rgba(255,255,255,0.28)", letterSpacing: "0.2em" }}>
                    <div style={{
                      width: 14, height: 14, background: lc,
                      border: isAvant ? "1px solid rgba(57,255,20,0.3)" : "1px solid rgba(255,255,255,0.2)",
                      position: "relative", flexShrink: 0
                    }}>
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
            <div style={{
              border: isAvant ? `1px solid ${color(remapping)}` : `2px solid ${color(remapping)}`,
              background: isAvant ? `${color(remapping)}0a` : `${color(remapping)}08`,
              padding: "10px 8px 8px"
            }}>
              <div className="font-mono mb-2 text-center"
                style={{ fontSize: 8, color: color(remapping), letterSpacing: "0.25em" }}>
                PICK A KEY FOR {["LEFT", "MID", "RIGHT"][remapping]} LANE
              </div>
              {KEY_ROWS.map((row, ri) => (
                <div key={ri} className="flex justify-center gap-1 mb-1">
                  {row.map(k => (
                    <button
                      key={k}
                      onClick={() => {
                        if (isAvant) audioManager.playSfx('tap_nav', 0.12);
                        assignKey(remapping, k);
                      }}
                      onMouseEnter={() => { if (isAvant) audioManager.playSfx('tap_nav', 0.08); }}
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
                style={{ fontSize: 8, color: isAvant ? "rgba(57,255,20,0.4)" : "rgba(255,255,255,0.2)", letterSpacing: "0.15em" }}>
                ESC to cancel · physical key also works
              </div>
            </div>
          )}
        </section>

        {/* ── AUDIO SYNC ──────────────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <SectionLabel label="AUDIO SYNC" sub="Compensate for speaker delay" isAvant={isAvant} />
          <div style={{
            border: isAvant ? "1px solid rgba(57,255,20,0.2)" : "2px solid rgba(255,255,255,0.08)",
            background: isAvant ? "rgba(5,5,5,0.4)" : "rgba(255,255,255,0.015)"
          }}>
            <div className="px-4 pt-4 pb-3">
              <BeatVisualizer offsetMs={opts.audioOffset} isAvant={isAvant} />
            </div>
            <div className="px-4 pb-1 flex items-center justify-between">
              <div className="font-mono" style={{ fontSize: 10, color: isAvant ? "rgba(57,255,20,0.5)" : "rgba(255,255,255,0.3)", letterSpacing: "0.25em" }}>
                OFFSET
              </div>
              <div className="font-mono font-bold"
                style={{
                  fontSize: 18,
                  letterSpacing: "0.08em",
                  color: opts.audioOffset === 0 ? "#39FF14" : "#FF1493",
                  textShadow: isAvant ? (opts.audioOffset === 0 ? "0 0 10px #39FF14" : "0 0 10px #FF1493") : "none"
                }}>
                {opts.audioOffset === 0 ? "SYNCED" : opts.audioOffset > 0 ? `+${opts.audioOffset} ms` : `${opts.audioOffset} ms`}
              </div>
            </div>
            <div className="px-4 pb-2">
              <input
                type="range" min={-150} max={150} step={5} value={opts.audioOffset}
                onMouseEnter={() => { if (isAvant) audioManager.playSfx('tap_nav', 0.08); }}
                onChange={e => {
                  const v = parseInt(e.target.value);
                  localStorage.setItem("opt_audioOffset", String(v));
                  setOpts(o => ({ ...o, audioOffset: v }));
                  if (isAvant && Math.abs(v) % 25 === 0) {
                    audioManager.playSfx('tap_nav', 0.05);
                  }
                }}
                style={{
                  width: "100%",
                  accentColor: isAvant ? "#39FF14" : "#FF1493",
                  cursor: "pointer"
                }}
              />
              <div className="flex justify-between font-mono mt-0.5"
                style={{
                  fontSize: 8,
                  color: isAvant ? "rgba(57,255,20,0.4)" : "rgba(255,255,255,0.18)",
                  letterSpacing: "0.05em"
                }}>
                <span>−150 ms (early)</span>
                <span>0</span>
                <span>+150 ms (late)</span>
              </div>
            </div>
            <div className="px-4 pb-4">
              <div className="font-mono" style={{ fontSize: 9, color: isAvant ? "rgba(57,255,20,0.4)" : "rgba(255,255,255,0.2)", letterSpacing: "0.12em", lineHeight: 1.8 }}>
                NOTES PASS BEFORE YOU HEAR THE BEAT → DRAG LEFT<br />
                YOU HEAR THE BEAT BEFORE NOTES PASS → DRAG RIGHT
              </div>
            </div>
          </div>
        </section>

        {/* ── CHART GENERATION ──────────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <SectionLabel label="CHART GENERATION" sub="Note mapping engine" isAvant={isAvant} />
          <div style={{
            border: isAvant ? "1px solid rgba(57,255,20,0.2)" : "2px solid rgba(255,255,255,0.08)",
            background: isAvant ? "rgba(5,5,5,0.4)" : "rgba(255,255,255,0.015)",
            padding: 12
          }}>
            <div className="flex gap-2">
              {(["auto", "lyrics", "bpm"] as const).map(mode => {
                const active = opts.noteGenerationSource === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => {
                      if (isAvant) audioManager.playSfx('tap_nav', 0.12);
                      localStorage.setItem("opt_noteGenerationSource", mode);
                      setOpts(o => ({ ...o, noteGenerationSource: mode }));
                      clearCatalogCache();
                    }}
                    onMouseEnter={() => { if (isAvant) audioManager.playSfx('tap_nav', 0.08); }}
                    className="font-mono text-xs font-bold flex-1 py-2.5 transition-all"
                    style={{
                      background: active
                        ? (isAvant ? "rgba(57,255,20,0.15)" : "#FF1493")
                        : "rgba(255,255,255,0.04)",
                      border: active
                        ? (isAvant ? "1px solid #39FF14" : "1px solid #FF1493")
                        : (isAvant ? "1px solid rgba(57,255,20,0.15)" : "1px solid rgba(255,255,255,0.12)"),
                      color: active
                        ? (isAvant ? "#39FF14" : "#fff")
                        : (isAvant ? "rgba(57,255,20,0.4)" : "rgba(255,255,255,0.4)"),
                      boxShadow: (isAvant && active) ? "0 0 10px rgba(57,255,20,0.2)" : "none",
                      cursor: "pointer",
                    }}
                  >
                    {mode.toUpperCase()}
                  </button>
                );
              })}
            </div>
            <div className="font-mono mt-3" style={{ fontSize: 9, color: isAvant ? "rgba(57,255,20,0.4)" : "rgba(255,255,255,0.2)", letterSpacing: "0.12em", lineHeight: 1.6 }}>
              {opts.noteGenerationSource === "auto" && "AUTO: Map from lyrics if available, fallback to BPM rhythm patterns."}
              {opts.noteGenerationSource === "lyrics" && "LYRICS: Force mapping notes synced to song vocal syllables (requires lyrics)."}
              {opts.noteGenerationSource === "bpm" && "BPM: Force mapping notes using structured tempo/BPM patterns."}
            </div>
          </div>
        </section>

        {/* ── GAMEPLAY ────────────────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <SectionLabel label="GAMEPLAY" sub="Mechanics & display" isAvant={isAvant} />
          <div style={{ border: isAvant ? "1px solid rgba(57,255,20,0.2)" : "2px solid rgba(255,255,255,0.08)", background: isAvant ? "rgba(5,5,5,0.4)" : "transparent" }}>
            {([
              { key: "missSystem",   label: "MISS SYSTEM",   sub: "3 strikes trigger SIGNAL LOST" },
              { key: "hudMisses",    label: "HUD MISSES",    sub: "Miss pips shown in HUD" },
              { key: "comboDisplay", label: "COMBO DISPLAY", sub: "Combo counter" },
              { key: "judgmentText", label: "JUDGMENT TEXT", sub: "PERFECT / GOOD popup text" },
            ] as const).map(({ key, label, sub }, i, arr) => {
              const on = opts[key];
              return (
                <div key={key} className="flex items-center justify-between px-4 py-3"
                  onMouseEnter={() => { if (isAvant) audioManager.playSfx('tap_nav', 0.05); }}
                  style={{
                    borderBottom: i < arr.length - 1
                      ? (isAvant ? "1px solid rgba(57,255,20,0.12)" : "1px solid rgba(255,255,255,0.05)")
                      : "none",
                    background: (isAvant && on) ? "rgba(57,255,20,0.02)" : "transparent",
                    transition: "background 0.2s"
                  }}>
                  <div>
                    <div className="font-mono text-xs tracking-[0.15em]"
                      style={{ color: on ? (isAvant ? "#39FF14" : "rgba(255,255,255,0.75)") : "rgba(255,255,255,0.28)" }}>
                      {label}
                    </div>
                    <div className="font-mono mt-0.5"
                      style={{ fontSize: 9, color: isAvant ? "rgba(57,255,20,0.4)" : "rgba(255,255,255,0.18)", letterSpacing: "0.1em" }}>
                      {sub}
                    </div>
                  </div>
                  <Toggle on={on} onChange={() => toggle(key)} isAvant={isAvant} />
                </div>
              );
            })}
          </div>
        </section>

        {/* ── DEVELOPMENT ───────────────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <SectionLabel label="DEVELOPMENT" sub="Debug & local overrides" isAvant={isAvant} />
          <div style={{ border: isAvant ? "1px solid rgba(57,255,20,0.2)" : "2px solid rgba(255,255,255,0.08)", background: isAvant ? "rgba(5,5,5,0.4)" : "transparent" }}>
            {([
              { key: "useLocalFiles", label: "LOCAL RELEASE DATA", sub: "Use local /365-releases when Supabase is down" },
            ] as const).map(({ key, label, sub }, i, arr) => {
              const on = opts[key];
              return (
                <div key={key} className="flex items-center justify-between px-4 py-3"
                  onMouseEnter={() => { if (isAvant) audioManager.playSfx('tap_nav', 0.05); }}
                  style={{
                    borderBottom: i < arr.length - 1
                      ? (isAvant ? "1px solid rgba(57,255,20,0.12)" : "1px solid rgba(255,255,255,0.05)")
                      : "none",
                    background: (isAvant && on) ? "rgba(57,255,20,0.02)" : "transparent",
                    transition: "background 0.2s"
                  }}>
                  <div>
                    <div className="font-mono text-xs tracking-[0.15em]"
                      style={{ color: on ? (isAvant ? "#39FF14" : "#FF1493") : "rgba(255,255,255,0.28)" }}>
                      {label}
                    </div>
                    <div className="font-mono mt-0.5"
                      style={{ fontSize: 9, color: isAvant ? "rgba(57,255,20,0.4)" : "rgba(255,255,255,0.18)", letterSpacing: "0.1em" }}>
                      {sub}
                    </div>
                  </div>
                  <Toggle on={on} onChange={() => toggle(key)} isAvant={isAvant} />
                </div>
              );
            })}
          </div>
        </section>

        {/* footer */}
        <div className="text-center font-mono pb-4"
          style={{ fontSize: 8, color: isAvant ? "rgba(57,255,20,0.3)" : "rgba(255,255,255,0.08)", letterSpacing: "0.35em" }}>
          TH3SCR1B3 · RHYTHM ENGINE · PLAYER CONFIG
        </div>
      </div>
    </div>
  );
}
