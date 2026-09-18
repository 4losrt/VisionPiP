"""
VisionPiP Interactive Test Launcher
Opens a headed Chromium window with the VisionPiP extension loaded and a simulated YouTube player.
Keeps running until you close the browser window or press Ctrl+C in terminal.
"""
import sys
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
FIXTURE_HTML = '''<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>VisionPiP Interactive Test Page</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f0f0f;
      color: #fff;
      padding: 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .container {
      max-width: 800px;
      width: 100%;
    }
    #movie_player {
      position: relative;
      width: 640px;
      height: 360px;
      background: #000;
      border-radius: 12px;
      overflow: hidden;
      margin: 16px 0;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    }
    video {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .ytp-caption-window-container {
      position: absolute;
      bottom: 40px;
      left: 0;
      right: 0;
      text-align: center;
      pointer-events: none;
    }
    .caption-visual-line {
      display: inline-block;
      background: rgba(8, 8, 8, 0.75);
      color: #fff;
      padding: 4px 8px;
      font-size: 18px;
      border-radius: 4px;
    }
    .controls {
      display: flex;
      gap: 12px;
      margin-top: 12px;
      flex-wrap: wrap;
    }
    button {
      background: #272727;
      color: white;
      border: 1px solid #3f3f3f;
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
    }
    button:hover {
      background: #3f3f3f;
    }
    .instructions {
      margin-top: 20px;
      background: #1e1e1e;
      border: 1px solid #333;
      padding: 16px;
      border-radius: 8px;
      line-height: 1.6;
      font-size: 14px;
    }
    code {
      background: #2a2a2a;
      padding: 2px 6px;
      border-radius: 4px;
      color: #3ea6ff;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎬 VisionPiP Interactive Test Environment</h1>
    <p>此環境模擬 YouTube 播放器與原生字幕，已自動掛載 VisionPiP 擴充功能。</p>

    <div id="movie_player" class="html5-video-player">
      <video class="html5-main-video" muted playsinline></video>
      <div class="ytp-caption-window-container"></div>
      <div id="kiss-fixture"></div>
    </div>

    <div class="controls">
      <button id="btn-toggle-sub">切換原生字幕台詞</button>
      <button id="btn-kiss-bilingual" style="background:#1565c0">✨ KISS 雙語字幕 (英+繁中)</button>
      <button id="btn-kiss-pending" style="background:#0277bd">⏳ KISS 譯文延遲 (... 轉 譯文)</button>
      <button id="btn-kiss-word" style="background:#2e7d32">🗣️ 講者台詞 "English" (防誤殺)</button>
      <button id="btn-kiss-clear" style="background:#c62828">❌ 關閉 KISS (測試 Fallback)</button>
      <button id="btn-rate-1">1.0x</button>
      <button id="btn-rate-15">1.5x</button>
      <button id="btn-rate-2">2.0x</button>
    </div>

    <div class="instructions">
      <h3>💡 測試操作指南（包含 KISS Translator 整合）：</h3>
      <ul>
        <li>按 <code>P</code> 鍵或點擊右下角的 VisionPiP 懸浮按鈕開啟 Document PiP 視窗。</li>
        <li>點擊 <code style="color:#64b5f6">KISS 雙語字幕</code>：測試真實 KISS Translator DOM 結構（<code>.kiss-caption-container .kiss-caption-paper .kiss-caption-window p</code>）雙語即時同步。</li>
        <li>點擊 <code style="color:#4fc3f7">KISS 譯文延遲</code>：模擬 KISS 先出現「...」佔位符，待翻譯完成後即刻補上譯文的過渡體驗。</li>
        <li>點擊 <code style="color:#81c784">講者台詞 "English"</code>：驗證當講者台詞為語言名稱時不會被誤殺過濾。</li>
        <li>點擊 <code style="color:#e57373">關閉 KISS</code>：驗證自動降級 Fallback 至 YouTube 原生 CC 字幕。</li>
        <li>在浮窗內測試 <code>J</code> / <code>L</code>（快退/快進 10s）、<code>0</code>～<code>9</code> 進度切換、<code>M</code> 靜音、倍速切換選單。</li>
        <li>直接關閉瀏覽器視窗即可結束測試。</li>
      </ul>
    </div>
  </div>

  <script>
    const video = document.querySelector('video');
    window.fixtureVideo = video;
    let currentRate = 1;

    Object.defineProperty(video, 'playbackRate', {
      get: () => currentRate,
      set: (val) => {
        currentRate = val;
        video.dispatchEvent(new Event('ratechange'));
      },
      configurable: true
    });

    window.fixtureResponse = {
      videoDetails: { videoId: 'interactive01', defaultAudioLanguage: 'en' },
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [{
            vssId: '.en',
            languageCode: 'en',
            name: { simpleText: 'English' },
            baseUrl: 'https://www.youtube.com/api/timedtext?v=interactive01',
            isTranslatable: true
          }]
        }
      }
    };
    window.ytInitialPlayerResponse = window.fixtureResponse;
    const player = document.querySelector('#movie_player');
    player.getPlayerResponse = () => window.fixtureResponse;
    player.getOption = () => ({ vssId: '.en', languageCode: 'en' });
    player.setPlaybackRate = (rate) => { video.playbackRate = rate; };

    // Canvas video generator
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 360;
    const ctx = canvas.getContext('2d');
    let frame = 0;
    setInterval(() => {
      ctx.fillStyle = '#181818';
      ctx.fillRect(0, 0, 640, 360);

      // Draw moving graphic
      const x = (frame * 3) % 640;
      ctx.fillStyle = '#ff0033';
      ctx.fillRect(x, 140, 60, 60);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText('VisionPiP Live Canvas Test', 40, 60);

      ctx.font = '20px sans-serif';
      ctx.fillStyle = '#aaaaaa';
      ctx.fillText(`Frame: ${frame++} | Rate: ${currentRate}x`, 40, 100);
      ctx.fillText(`Time: ${video.currentTime.toFixed(1)}s`, 40, 260);
    }, 40);

    video.srcObject = canvas.captureStream(25);
    video.play();

    // Subtitle toggling
    const subtitles = [
      'Welcome to VisionPiP interactive test environment.',
      'This line tests native YouTube caption segment grouping.',
      'Bilingual subtitle display and layout hierarchy are enabled.',
      'VisionPiP ensures real-time sync with high reliability.'
    ];
    let subIdx = 0;
    const subContainer = document.querySelector('.ytp-caption-window-container');
    function showSubtitle(text) {
      subContainer.innerHTML = `<span class="caption-visual-line"><span class="ytp-caption-segment">${text}</span></span>`;
    }
    showSubtitle(subtitles[0]);
    setInterval(() => {
      subIdx = (subIdx + 1) % subtitles.length;
      showSubtitle(subtitles[subIdx]);
    }, 3500);

    document.getElementById('btn-toggle-sub').addEventListener('click', () => {
      subIdx = (subIdx + 1) % subtitles.length;
      showSubtitle(subtitles[subIdx]);
    });

    // KISS DOM helper
    function getOrCreateKissWindow() {
      let container = document.querySelector('.kiss-caption-container');
      if (!container) {
        container = document.createElement('div');
        container.className = 'kiss-caption-container notranslate';
        container.style.position = 'absolute';
        const paper = document.createElement('div');
        paper.className = 'kiss-caption-paper';
        paper.style.display = 'block';
        const win = document.createElement('div');
        win.className = 'kiss-caption-window';
        paper.appendChild(win);
        container.appendChild(paper);
        document.querySelector('#movie_player').appendChild(container);
      }
      return container.querySelector('.kiss-caption-window');
    }

    document.getElementById('btn-kiss-bilingual').addEventListener('click', () => {
      const win = getOrCreateKissWindow();
      win.parentElement.style.display = 'block';
      win.replaceChildren();
      const p1 = document.createElement('p');
      p1.textContent = 'Artificial intelligence is evolving rapidly.';
      const p2 = document.createElement('p');
      p2.textContent = '人工智慧正以驚人的速度發展。（KISS 雙語字幕）';
      win.append(p1, p2);
    });

    document.getElementById('btn-kiss-pending').addEventListener('click', () => {
      const win = getOrCreateKissWindow();
      win.parentElement.style.display = 'block';
      win.replaceChildren();
      const p1 = document.createElement('p');
      p1.textContent = 'Real-time speech translation in progress...';
      const p2 = document.createElement('p');
      p2.textContent = '...';
      win.append(p1, p2);

      setTimeout(() => {
        p2.textContent = '即時語音翻譯處理中...（延遲譯文已就緒）';
      }, 1500);
    });

    document.getElementById('btn-kiss-word').addEventListener('click', () => {
      const win = getOrCreateKissWindow();
      win.parentElement.style.display = 'block';
      win.replaceChildren();
      const p1 = document.createElement('p');
      p1.textContent = 'English';
      const p2 = document.createElement('p');
      p2.textContent = '英語（口說台詞保留測試）';
      win.append(p1, p2);
    });

    document.getElementById('btn-kiss-clear').addEventListener('click', () => {
      const container = document.querySelector('.kiss-caption-container');
      if (container) {
        const paper = container.querySelector('.kiss-caption-paper');
        if (paper) paper.style.display = 'none';
        const win = container.querySelector('.kiss-caption-window');
        if (win) win.replaceChildren();
      }
    });

    document.getElementById('btn-rate-1').addEventListener('click', () => video.playbackRate = 1.0);
    document.getElementById('btn-rate-15').addEventListener('click', () => video.playbackRate = 1.5);
    document.getElementById('btn-rate-2').addEventListener('click', () => video.playbackRate = 2.0);
  </script>
</body>
</html>
'''

def main():
    print("🚀 正在啟動 Headed (非 Headless) Chromium 測試環境...")
    kiss_dir = ROOT / 'fixtures' / 'kiss-extension' / 'chrome'
    ext_dirs = [str(ROOT)]
    if kiss_dir.exists():
        ext_dirs.append(str(kiss_dir))
        print("📦 已同步掛載真實 KISS Translator 官方擴充功能 (v2.0.32)！")
    ext_arg = ','.join(ext_dirs)

    with tempfile.TemporaryDirectory(prefix='visionpip-interactive-') as profile:
        with sync_playwright() as playwright:
            context = playwright.chromium.launch_persistent_context(
                profile,
                channel='chromium',
                headless=False,
                args=[
                    f'--disable-extensions-except={ext_arg}',
                    f'--load-extension={ext_arg}',
                    '--autoplay-policy=no-user-gesture-required'
                ],
                viewport={'width': 1200, 'height': 850}
            )
            page = context.pages[0] if context.pages else context.new_page()

            # Mock YouTube timedtext route
            page.route('**/api/timedtext?*', lambda route: route.fulfill(
                status=200,
                content_type='application/json',
                body='{"events":[{"tStartMs":0,"dDurationMs":60000,"segs":[{"utf8":"Welcome to VisionPiP"}]}]}'
            ))

            # Load mock page on YouTube watch URL
            page.route('https://www.youtube.com/watch?v=interactive01', lambda route: route.fulfill(
                status=200,
                content_type='text/html',
                body=FIXTURE_HTML
            ))

            page.goto('https://www.youtube.com/watch?v=interactive01')
            print("✅ 測試頁面已載入！")
            print("👉 您可以在瀏覽器視窗中手動操作、按 P 鍵開啟 VisionPiP 畫中畫浮窗。")
            print("👉 關閉瀏覽器視窗即可結束。")

            try:
                # Wait until the page or context is closed
                page.wait_for_event('close', timeout=0)
            except Exception:
                pass
            finally:
                try:
                    context.close()
                except Exception:
                    pass
    print("測試工作階段已結束。")

if __name__ == '__main__':
    main()
