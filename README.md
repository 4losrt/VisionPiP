# VisionPiP - YouTube Floating Subtitles

**繁體中文版：** [README.zh-TW.md](README.zh-TW.md)

> Next-generation Picture-in-Picture (PiP) floating subtitles for YouTube with real-time bilingual rendering and ultra-fast performance.

VisionPiP is a modern Chrome extension (Manifest V3) that leverages Chrome's **Document Picture-in-Picture API** to display floating YouTube videos with synchronized subtitles in a standalone, OS-level window. Custom-built and optimized for displaying bilingual subtitles seamlessly when used alongside [KISS Translator](https://github.com/fishjar/kiss-translator) as well as native YouTube CC tracks.

---

## [📥 Download Latest VisionPiP.crx](https://github.com/4losrt/VisionPiP/releases/latest/download/VisionPiP.crx)

---

## ✨ Features

- 🎬 **Document Picture-in-Picture API**: Renders full video, subtitles, and interactive controls in an independent floating window (Chrome 116+ required).
- 🌐 **Real-time Bilingual Subtitle Support**: High-efficiency DOM extraction custom-tailored to work with [KISS Translator](https://github.com/fishjar/kiss-translator) to display dual-language subtitles live in PiP mode. When KISS produces no output because its target language is the same as YouTube's selected/native caption language, VisionPiP falls back to YouTube's native caption DOM and JSON3 caption track. If YouTube does not expose a selected track, the language preference is Traditional Chinese / Chinese first, followed by English.
- 🔀 **Subtitle Display Mode Toggle (V)**: Cycle between **Bilingual (雙語對照)**, **Original Only (僅原文)**, and **Translation Only (僅譯文)** with a single keystroke `V` or control button `#yt-submode-btn`.
- 🎛️ **Direct Mouse Wheel Volume Control & HUD**: Adjust video volume smoothly inside the PiP window simply by scrolling your mouse wheel (±5% per step) with an elegant glassmorphism HUD overlay.
- 🖼️ **Video Scaling & Aspect Fit Modes (F)**: Toggle between **Contain** (preserve entire video with letterbox bars) and **Cover** (immersive full-bleed view without black bars) via keyboard shortcut `F` or control button `#yt-fitmode-btn`.
- 🀄️ **High-Readability Chinese Typography**: Pre-configured with premium Traditional & Simplified Chinese font stacks: System UI, PingFang TC / Microsoft JhengHei (Modern CJK), Noto Sans TC / SC (思源黑體), and Georgia / Songti (Serif).
- 🌉 **Main-World Player Bridge Architecture**: Uses Manifest V3 `world: "MAIN"` bridge (`player-bridge.js`) to directly query YouTube's player API and `ytInitialPlayerResponse` for reliable timedtext captions and playback rate synchronization.
- 📱 **YouTube Shorts & Watch Support**: Works seamlessly on standard YouTube watch pages (`/watch?v=...`) as well as YouTube Shorts (`/shorts/...`).
- ⏱️ **Live Stream & Infinite Duration Protection**: Formats live broadcasts and infinite media streams gracefully with clean `00:00 / Live` indicators without numeric overflow.
- ⌨️ **Keyboard Shortcuts & In-Window Hotkeys**:
  - `P` : Toggle PiP window on YouTube watch and shorts pages.
  - `Space` / `K` : Play / Pause video inside PiP.
  - `J` / `L` : Seek backward / forward 10 seconds.
  - `←` / `→` : Seek backward / forward 5 seconds.
  - `0` – `9` : Jump directly to 0% – 90% of the video duration.
  - `↑` / `↓` : Increase / decrease volume by 5%.
  - `Mouse Wheel` : Scroll up/down anywhere in PiP window to adjust volume with glassmorphism HUD.
  - `M` : Mute / Unmute audio.
  - `C` : Toggle subtitle visibility.
  - `V` : Cycle subtitle mode (Bilingual ➔ Original Only ➔ Translation Only).
  - `F` : Toggle video scaling mode (Contain 🔀 Cover).
  - `A` / `Double Click` : Auto-fit window to the exact video aspect ratio (eliminates letterbox/pillarbox bars).
- 📐 **Smart Video Aspect Ratio & Dynamic Subtitle Anchoring**:
  - Automatically calculates ideal initial window dimensions for standard landscape (16:9 / 4:3 / 21:9) and vertical Shorts (9:16).
  - Dynamically calculates the rendered video rect inside the PiP window, anchoring subtitles directly to the active video frame even when letterboxed.
  - Dedicated **Auto-fit button** in the control bar with dynamic in-window pill indicator.
- ⚡️ **Ultra-Performance Engine**:
  - **Zero CPU Idle Overhead**: Uses native YouTube SPA navigation hooks (`yt-navigate-finish`) instead of heavy MutationObservers.
  - **Zero Layout Thrashing**: Utilizes high-performance DOM visibility checks (`checkVisibility()`).
  - **Bi-directional Playback Rate Sync**: Changes to playback speed in YouTube main player or PiP immediately synchronize.
  - **Native Line Grouping**: Visual lines with multiple inline segments are correctly unified as coherent subtitle lines.
- 🎨 **Modern Dark Glassmorphism UI**: Sleek, flat-icon interface with customizable typography, text color, background opacity, vertical subtitle placement, and bilingual text hierarchy.

---

## 🔧 Runtime Stability Notes

- YouTube SPA navigation clears the previous video's subtitle state before loading the new caption track, preventing stale subtitles from appearing after switching videos.
- Seeking while paused refreshes the PiP subtitle immediately instead of waiting for playback to resume.
- When the browser uses the native video-node fallback, VisionPiP restores the original video node and its exact inline style after PiP closes or switches video.
- Stream-backed PiP video elements are explicitly detached and cleaned up when the PiP window closes.
- Both KISS and native YouTube caption extraction ignore YouTube/KISS language menus, settings panels, buttons, prompts such as “按一下進去設定”, and menu labels while preserving legitimate spoken language words like "English".

## 🚀 Installation

1. Download or clone this repository to your local machine.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked** and select the folder containing these project files.
5. Open any YouTube video (`youtube.com/watch?v=...`) or Shorts (`youtube.com/shorts/...`) to start using VisionPiP.

---

## 🛠 Usage

1. **Open PiP Mode**:
   - Hover over the video player and click the **Open VisionPiP (P)** floating button in the top-left corner, or press `P` on your keyboard.
2. **Bilingual Subtitles with KISS Translator**:
   - Install and enable [KISS Translator](https://github.com/fishjar/kiss-translator) on YouTube. VisionPiP automatically captures and renders translated bilingual subtitles in real time inside the PiP overlay. If KISS is configured to the same language as the YouTube caption, VisionPiP automatically displays the original YouTube caption instead.
3. **Customize Subtitle Appearance**:
   - Click the extension icon in your Chrome toolbar to open the settings popup.
   - Adjust font size, font family, text color, background opacity, and position (Top / Bottom). Settings are synced instantly via `chrome.storage.sync`.
4. **In-Window Video Controls**:
   - Hover over the floating window to reveal progress controls, speed rate selector (`0.5x`–`2x`), CC toggle, and mute button.

---

## 📁 Project Structure

```text
├── manifest.json       # Extension Manifest V3 configuration
├── player-bridge.js    # Main-world script for YouTube player & caption track metadata
├── content.js          # Core content script, Document PiP logic & subtitle sync
├── content.css         # Floating button & player styling
├── popup.html          # Extension settings popup UI (Dark Glassmorphism)
├── popup.js            # Settings storage & tab communication logic
├── icons/              # Extension icons (16x16, 48x48, 128x128)
├── browser_smoke.py    # Playwright automated browser smoke test suite (17 test cases)
├── README.md           # Documentation
└── LICENSE             # MIT License
```

---

## 🧪 Testing

Run test suites and automated browser checks using the following commands:

```bash
npm run test:unit            # Run unit test suites (42 tests)
npm run test:browser         # Run headless browser smoke tests (17 tests)
npm run test:browser:headed  # Run browser smoke tests with visible UI (non-headless)
npm run test:interactive     # Launch interactive test browser with live mock controls
```

---

## 🙏 Acknowledgments & Attribution

- This project was completed collaboratively by **Gemini** and **Manus AI**, covering the extension architecture, subtitle fallback, UI-text filtering, runtime stability, and documentation.
- Designed to work seamlessly with [KISS Translator](https://github.com/fishjar/kiss-translator) for bilingual subtitle rendering.
- Inspired by and adapted from [mehmetkahya0/youtube-pip-subtitles](https://github.com/mehmetkahya0/youtube-pip-subtitles). Special thanks to the original author for the foundational concept.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
