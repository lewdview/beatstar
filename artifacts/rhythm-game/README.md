# @workspace/rhythm-game

> **Standalone Rhythm Game Client Package for PIM : th3v4ult - poetry in motion**

[![React 19](https://img.shields.io/badge/React-19.1.0-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-7.x-646CFF?style=flat-square&logo=vite)](https://vitejs.dev)
[![Supabase](https://img.shields.io/badge/Supabase-Auth%20%2B%20Passkeys-3ECF8E?style=flat-square&logo=supabase)](https://supabase.com)

---

## 🧭 Role & Synchronization Protocol

`rhythm-game` is the secondary standalone rhythm client package.

> [!NOTE]
> ### Synchronization Protocol
> - **Primary Source of Truth**: `@workspace/beatstar-vault` (`artifacts/beatstar-vault`).
> - Feature development, UI redesigns, audio filter adjustments, and new note taxonomy implementations occur first in `beatstar-vault`.
> - Rhythm engine updates, campaign chapters, stage maps, calibration offsets, and tutorials are synced back to `rhythm-game` **AFTER** verification in `beatstar-vault`.

---

## 🎮 Features

* **3D Perspective Canvas Highway**: 60fps HTML5 Canvas rendering loop with approach time scaling.
* **3-Lane Layout**:
  - Lane 0 (Bass $<300\text{Hz}$, Lowpass filter)
  - Lane 1 (Mids $\approx 1200\text{Hz}$, Bandpass filter)
  - Lane 2 (Treble $>3200\text{Hz}$, Highpass filter)
* **Full Note Mechanics**: Tap, Hold, 8-directional Swipe, Hold+Swipe End, Double Tap, Slide/Drag, Zigzag Slide, Mine/Ghost hazards, Lift, Scratch, and Remix Notes.
* **Flow State Overdrives**: FEVER ($2\times$), SURGE ($3\times$ with autoplay assist), SIGNAL LOCK ($4\times$).
* **Audio Calibration & Options (`Options.tsx`)**: Millisecond audio offset calibration, custom keybinds, and miss limit toggles.
* **Interactive Tutorial (`Tutorial.tsx`)**: Step-by-step interactive onboarding for new players.
* **Campaign & Winding Road Chapters (`Campaign.tsx`, `Chapter.tsx`)**: Constellation maps, star rating thresholds ($70\%, 85\%, 95\%$), and milestone reward progress.
* **Authentication**: Supabase Auth integration with WebAuthn / Passkey support.

---

## 🛠️ Development

```bash
# Start standalone development server
pnpm dev

# Build standalone production bundle
pnpm build

# Preview build locally
pnpm preview
```

---

## 📄 License

Created by **TH3SCR1B3** ([th3scr1b3.art](https://th3scr1b3.art)). All rights reserved.
