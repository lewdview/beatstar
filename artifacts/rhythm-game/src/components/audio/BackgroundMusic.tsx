import { useEffect, useRef, useCallback, useState } from "react";
import { useLocation } from "wouter";
import { audioManager } from "@/game/audio";

/**
 * BackgroundMusic — persistent ambient music for menu screens.
 *
 * Design decisions:
 *  - Uses a regular HTMLAudioElement (not AudioContext) for long bg loops
 *    to avoid decoding 30MB+ WAVs entirely into memory.
 *  - Audio is NOT auto-played on mount — browsers block it. Instead we
 *    listen for the first user click/tap anywhere on the page and start
 *    playback then. This also triggers SFX preloading.
 *  - Fades out smoothly when entering /play/* routes; fades back in on exit.
 *  - Also pauses on /results/* to let the results ambient play unobstructed.
 */
export default function BackgroundMusic() {
  const [location] = useLocation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [started, setStarted] = useState(false);
  const fadeIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const [introDone, setIntroDone] = useState(() => !!sessionStorage.getItem("intro_seen"));
  
  useEffect(() => {
    const onIntroDone = () => setIntroDone(true);
    window.addEventListener("intro_finished", onIntroDone);
    return () => window.removeEventListener("intro_finished", onIntroDone);
  }, []);

  const isSilentRoute = location.startsWith("/play/") || location.startsWith("/results/") || (location === "/" && !introDone);

  // Create (but don't play) the bg audio element once
  useEffect(() => {
    const BG_TRACKS = ['bg1', 'bg2', 'bg3', 'bg5', 'bg8', 'bg9', 'bg_4'];
    let nextBgIdx = Math.floor(Math.random() * BG_TRACKS.length);
    
    const audio = new Audio(`/audio/sfx/${BG_TRACKS[nextBgIdx]}.wav`);
    audio.loop = false;
    audio.volume = 0;
    audio.preload = "none"; // don't download until user clicks
    audioRef.current = audio;
    
    const onEnded = () => {
      nextBgIdx = (nextBgIdx + 1) % BG_TRACKS.length;
      audio.src = `/audio/sfx/${BG_TRACKS[nextBgIdx]}.wav`;
      audio.load();
      audio.play().catch(() => {});
    };
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('ended', onEnded);
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, []);

  // Start bg music on first user interaction
  const startOnInteraction = useCallback(() => {
    setStarted((prev) => {
      if (prev) return prev;
      
      const audio = audioRef.current;
      if (audio) {
        audio.preload = "auto";
        audio.load();
        audio.volume = 0;
        audio.play().catch(() => {});
      }

      // Preload all SFX on first interaction
      audioManager.preloadAll();
      return true;
    });
  }, []);

  useEffect(() => {
    document.addEventListener("click", startOnInteraction, { once: true });
    document.addEventListener("touchstart", startOnInteraction, { once: true });
    return () => {
      document.removeEventListener("click", startOnInteraction);
      document.removeEventListener("touchstart", startOnInteraction);
    };
  }, [startOnInteraction]);

  // Fade in/out based on route
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !started) return;

    clearInterval(fadeIntervalRef.current);

    if (isSilentRoute) {
      // Immediate stop on silent routes to prevent leaking on iOS
      audio.pause();
      audio.volume = 0;
      clearInterval(fadeIntervalRef.current);
    } else {
      // Resume → fade in
      if (audio.paused) {
        audio.volume = 0;
        const p = audio.play();
        if (p !== undefined) {
          p.catch(() => {});
        }
      }
      fadeIntervalRef.current = setInterval(() => {
        if (audio.volume < 0.35) {
          audio.volume = Math.min(0.4, audio.volume + 0.03);
        } else {
          audio.volume = 0.4;
          clearInterval(fadeIntervalRef.current);
        }
      }, 40);
    }

    return () => clearInterval(fadeIntervalRef.current);
  }, [isSilentRoute, started]);

  return null;
}
