import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { audioManager } from "@/game/audio";

export default function GamepadCursor() {
  const [location] = useLocation();
  const [active, setActive] = useState(false);
  const [position, setPosition] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const [clicking, setClicking] = useState(false);
  const [hoveredElement, setHoveredElement] = useState<Element | null>(null);

  const posRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const activeRef = useRef(false);
  const animationFrameId = useRef<number | null>(null);
  const prevButtons = useRef<boolean[]>([]);
  const lastHoveredElRef = useRef<Element | null>(null);

  // Disable gamepad cursor completely on gameplay pages unless overlays are active
  const isPlaying = location.startsWith("/play/");
  const [isOverlayActive, setIsOverlayActive] = useState(false);

  useEffect(() => {
    if (!isPlaying) {
      setIsOverlayActive(false);
      return;
    }

    const checkOverlays = () => {
      const active = document.body.classList.contains("gameplay-paused") ||
                     document.body.classList.contains("gameplay-continue") ||
                     document.body.classList.contains("gameplay-audio-error") ||
                     document.body.classList.contains("gameplay-load-error") ||
                     document.body.classList.contains("gameplay-tutorial-help");
      setIsOverlayActive(active);
    };

    checkOverlays();

    const observer = new MutationObserver(checkOverlays);
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, [isPlaying, location]);

  const showCursor = !isPlaying || isOverlayActive;

  useEffect(() => {
    if (!showCursor) {
      // Clean up hover state and class when entering gameplay
      if (hoveredElement) {
        hoveredElement.classList.remove("gamepad-hover");
        setHoveredElement(null);
      }
      document.body.classList.remove("gamepad-cursor-active");
      setActive(false);
      activeRef.current = false;
      return;
    }

    // Toggle active state based on real mouse movement
    const handleMouseMove = (e: MouseEvent) => {
      // Use e.isTrusted to ensure this mousemove was triggered by a human hardware mouse, not our synthetic mousemove dispatches
      if (e.isTrusted && activeRef.current) {
        setActive(false);
        activeRef.current = false;
        document.body.classList.remove("gamepad-cursor-active");
        
        // Remove hover class from any hovered elements
        document.querySelectorAll(".gamepad-hover").forEach((el) => {
          el.classList.remove("gamepad-hover");
        });

        // Dispatch mouseleave on last hovered element to clean up any visual popups
        if (lastHoveredElRef.current) {
          lastHoveredElRef.current.dispatchEvent(new MouseEvent("mouseleave", {
            bubbles: false,
            cancelable: true,
            clientX: posRef.current.x,
            clientY: posRef.current.y,
          }));
          lastHoveredElRef.current = null;
        }

        setHoveredElement(null);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);

    const findScrollableContainer = (startEl: Element | null, x: number, y: number) => {
      const isScrollable = (element: Element) => {
        const style = window.getComputedStyle(element);
        const isScrollableY =
          element.scrollHeight > element.clientHeight &&
          (style.overflowY === "auto" || style.overflowY === "scroll");
        const isScrollableX =
          element.scrollWidth > element.clientWidth &&
          (style.overflowX === "auto" || style.overflowX === "scroll");
        return isScrollableY || isScrollableX;
      };

      let current = startEl;
      while (current && current !== document.body) {
        if (isScrollable(current)) {
          return current;
        }
        current = current.parentElement;
      }

      // If near screen edges (top/bottom), probe viewport center to bypass sticky header/footer overlays
      const edgeThreshold = 45;
      if (y < edgeThreshold || y > window.innerHeight - edgeThreshold) {
        const probeY = window.innerHeight / 2;
        const probeEl = document.elementFromPoint(x, probeY);
        current = probeEl;
        while (current && current !== document.body) {
          if (isScrollable(current)) {
            return current;
          }
          current = current.parentElement;
        }
      }

      return document.scrollingElement || document.documentElement || window;
    };

    // Main poll loop
    const poll = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = gamepads.find((g) => g !== null);

      if (!gp) {
        animationFrameId.current = requestAnimationFrame(poll);
        return;
      }

      // Check for stick movement past a threshold to activate gamepad cursor mode
      const deadzone = 0.15;
      const ax = gp.axes[0] || 0;
      const ay = gp.axes[1] || 0;
      const rx = gp.axes[2] || 0;
      const ry = gp.axes[3] || 0;
      const stickMoved = Math.abs(ax) > deadzone || Math.abs(ay) > deadzone || Math.abs(rx) > deadzone || Math.abs(ry) > deadzone;

      // Check if any button is pressed
      const buttonPressed = gp.buttons.some((b) => b.pressed);

      if ((stickMoved || buttonPressed) && !activeRef.current) {
        setActive(true);
        activeRef.current = true;
        document.body.classList.add("gamepad-cursor-active");
        // Center on screen when first activated
        posRef.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        setPosition({ ...posRef.current });
      }

      if (activeRef.current) {
        // 1. Move virtual cursor
        if (Math.abs(ax) > deadzone || Math.abs(ay) > deadzone) {
          // Non-linear acceleration for precision + speed
          const speedFactor = 16;
          const dx = Math.sign(ax) * Math.pow(Math.abs(ax), 1.5) * speedFactor;
          const dy = Math.sign(ay) * Math.pow(Math.abs(ay), 1.5) * speedFactor;

          posRef.current.x += dx;
          posRef.current.y += dy;

          // Clamp to window
          posRef.current.x = Math.max(0, Math.min(window.innerWidth, posRef.current.x));
          posRef.current.y = Math.max(0, Math.min(window.innerHeight, posRef.current.y));
        }

        // 2. Find element under cursor
        const x = posRef.current.x;
        const y = posRef.current.y;
        const el = document.elementFromPoint(x, y);

        // Edge Scrolling (pushing against the scroll direction at top/bottom/left/right of screen)
        const edgeThreshold = 45;
        const edgeScrollSpeed = 14;
        let edgeScrollY = 0;
        if (posRef.current.y > window.innerHeight - edgeThreshold && ay > 0.1) {
          edgeScrollY = ay * edgeScrollSpeed;
        } else if (posRef.current.y < edgeThreshold && ay < -0.1) {
          edgeScrollY = ay * edgeScrollSpeed;
        }
        let edgeScrollX = 0;
        if (posRef.current.x > window.innerWidth - edgeThreshold && ax > 0.1) {
          edgeScrollX = ax * edgeScrollSpeed;
        } else if (posRef.current.x < edgeThreshold && ax < -0.1) {
          edgeScrollX = ax * edgeScrollSpeed;
        }

        if (edgeScrollY !== 0 || edgeScrollX !== 0) {
          const container = findScrollableContainer(el, x, y) as (Element | Window);
          container.scrollBy({
            top: edgeScrollY,
            left: edgeScrollX,
            behavior: "auto",
          });
        }

        // Find closest interactive element
        const interactiveEl = el?.closest(
          "button, a, input, select, textarea, [role='button'], .cursor-pointer"
        ) || null;

        // Manage hover classes and magnetic snap
        if (interactiveEl !== hoveredElement) {
          if (hoveredElement) {
            hoveredElement.classList.remove("gamepad-hover");
          }
          if (interactiveEl) {
            interactiveEl.classList.add("gamepad-hover");
            audioManager.playSfx("tap_nav", 0.15);
          }
          setHoveredElement(interactiveEl);
        }

        // Magnetic snap: pull cursor toward center of interactive elements
        if (interactiveEl) {
          const rect = interactiveEl.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;

          const dist = Math.hypot(x - cx, y - cy);
          const stickIntensity = Math.hypot(ax, ay);

          // Only snap if we are within a reasonable distance (80px) and not pushing the stick to full deflection
          if (dist < 80 && stickIntensity < 0.6) {
            const pullFactor = 0.18 * (1 - stickIntensity);
            posRef.current.x += (cx - x) * pullFactor;
            posRef.current.y += (cy - y) * pullFactor;
          }
        }

        // 3. Dispatch simulated mousemove and hover transition events to update standard React hover / JS state
        if (el) {
          if (el !== lastHoveredElRef.current) {
            const prevEl = lastHoveredElRef.current;
            if (prevEl) {
              prevEl.dispatchEvent(new MouseEvent("mouseout", {
                bubbles: true,
                cancelable: true,
                clientX: posRef.current.x,
                clientY: posRef.current.y,
                relatedTarget: el,
              }));
              prevEl.dispatchEvent(new MouseEvent("mouseleave", {
                bubbles: false,
                cancelable: true,
                clientX: posRef.current.x,
                clientY: posRef.current.y,
                relatedTarget: el,
              }));
            }
            el.dispatchEvent(new MouseEvent("mouseover", {
              bubbles: true,
              cancelable: true,
              clientX: posRef.current.x,
              clientY: posRef.current.y,
              relatedTarget: prevEl,
            }));
            el.dispatchEvent(new MouseEvent("mouseenter", {
              bubbles: false,
              cancelable: true,
              clientX: posRef.current.x,
              clientY: posRef.current.y,
              relatedTarget: prevEl,
            }));
            lastHoveredElRef.current = el;
          }

          el.dispatchEvent(new MouseEvent("mousemove", {
            bubbles: true,
            cancelable: true,
            clientX: posRef.current.x,
            clientY: posRef.current.y,
          }));
        }

        // 4. Handle buttons
        // Button A (index 0) - Click
        const aPressed = gp.buttons[0]?.pressed || false;
        const aWasPressed = prevButtons.current[0] || false;

        if (aPressed && !aWasPressed) {
          setClicking(true);
          audioManager.playSfx("tap_nav", 0.4);

          const target = interactiveEl || el;
          if (target) {
            const clickX = posRef.current.x;
            const clickY = posRef.current.y;

            // Dispatch standard pointer & mouse click sequences
            const clickEvents = [
              new PointerEvent("pointerdown", { bubbles: true, cancelable: true, clientX: clickX, clientY: clickY }),
              new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: clickX, clientY: clickY }),
              new PointerEvent("pointerup", { bubbles: true, cancelable: true, clientX: clickX, clientY: clickY }),
              new MouseEvent("mouseup", { bubbles: true, cancelable: true, clientX: clickX, clientY: clickY }),
              new MouseEvent("click", { bubbles: true, cancelable: true, clientX: clickX, clientY: clickY }),
            ];

            if (typeof (target as HTMLElement).focus === "function") {
              (target as HTMLElement).focus();
            }

            clickEvents.forEach((ev) => target.dispatchEvent(ev));
          }
        } else if (!aPressed && aWasPressed) {
          setClicking(false);
        }

        // Button B (index 1) - Back / Cancel
        const bPressed = gp.buttons[1]?.pressed || false;
        const bWasPressed = prevButtons.current[1] || false;

        if (bPressed && !bWasPressed) {
          audioManager.playSfx("back", 0.4);
          window.history.back();
        }

        // 5. Handle scrolling (Right Stick)
        if (Math.abs(ry) > deadzone || Math.abs(rx) > deadzone) {
          const container = findScrollableContainer(el, x, y) as (Element | Window);
          const scrollSpeed = 12;
          const scrollY = Math.sign(ry) * Math.pow(Math.abs(ry), 1.5) * scrollSpeed;
          const scrollX = Math.sign(rx) * Math.pow(Math.abs(rx), 1.5) * scrollSpeed;

          container.scrollBy({
            top: scrollY,
            left: scrollX,
            behavior: "auto",
          });
        }

        // Update position states
        setPosition({ x: posRef.current.x, y: posRef.current.y });

        // Save button states
        prevButtons.current = gp.buttons.map((b) => b.pressed);
      }

      animationFrameId.current = requestAnimationFrame(poll);
    };

    animationFrameId.current = requestAnimationFrame(poll);

    return () => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      window.removeEventListener("mousemove", handleMouseMove);
      document.body.classList.remove("gamepad-cursor-active");
      if (hoveredElement) hoveredElement.classList.remove("gamepad-hover");
      if (lastHoveredElRef.current) {
        lastHoveredElRef.current.dispatchEvent(new MouseEvent("mouseleave", {
          bubbles: false,
          cancelable: true,
          clientX: posRef.current.x,
          clientY: posRef.current.y,
        }));
        lastHoveredElRef.current = null;
      }
    };
  }, [showCursor, hoveredElement]);

  if (!active || !showCursor) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        pointerEvents: "none",
        zIndex: 99999,
      }}
    >
      {/* Outer ring */}
      <div
        style={{
          position: "absolute",
          transform: `translate3d(${position.x}px, ${position.y}px, 0) translate(-50%, -50%) ${
            clicking ? "scale(0.8)" : hoveredElement ? "scale(1.25)" : "scale(1)"
          }`,
          width: 28,
          height: 28,
          borderRadius: "50%",
          border: hoveredElement ? "2px solid #00E5FF" : "1.5px solid #FF1493",
          boxShadow: hoveredElement
            ? "0 0 10px rgba(0, 229, 255, 0.6), inset 0 0 8px rgba(0, 229, 255, 0.4)"
            : "0 0 8px rgba(255, 20, 147, 0.5)",
          background: hoveredElement ? "rgba(0, 229, 255, 0.05)" : "rgba(255, 20, 147, 0.05)",
          backdropFilter: "blur(2px)",
          transition: "transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.2s, box-shadow 0.2s, background 0.2s",
          pointerEvents: "none",
        }}
      />
      {/* Inner dot */}
      <div
        style={{
          position: "absolute",
          transform: `translate3d(${position.x}px, ${position.y}px, 0) translate(-50%, -50%)`,
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: hoveredElement ? "#00E5FF" : "#FF1493",
          boxShadow: hoveredElement ? "0 0 6px #00E5FF" : "0 0 4px #FF1493",
          transition: "background 0.2s, box-shadow 0.2s",
          pointerEvents: "none",
        }}
      />
      {/* Button helper pill */}
      {hoveredElement && (
        <div
          style={{
            position: "absolute",
            transform: `translate3d(${position.x + 22}px, ${position.y + 16}px, 0)`,
            background: "rgba(0, 0, 0, 0.85)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            borderRadius: "4px",
            padding: "2px 6px",
            fontFamily: "monospace",
            fontSize: "9px",
            color: "#fff",
            whiteSpace: "nowrap",
            boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
            pointerEvents: "none",
          }}
        >
          <span style={{ color: "#39FF14", fontWeight: "bold" }}>A</span> SELECT
        </div>
      )}
    </div>
  );
}
