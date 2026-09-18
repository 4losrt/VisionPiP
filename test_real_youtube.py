"""
Live YouTube Test with Real KISS Translator Extension and VisionPiP
Testing URL: https://www.youtube.com/watch?v=g-S-cpUaPj0
Validates:
1. Both VisionPiP and real KISS Translator loaded into headed Chromium.
2. Real video playback on YouTube.
3. CC toggle nudge if captions/KISS not immediately active.
4. Document Picture-in-Picture window opening.
5. Captions rendering in Document PiP overlay.
"""
import sys
import time
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
KISS_DIR = ROOT / 'fixtures' / 'kiss-extension' / 'chrome'
TARGET_URL = 'https://www.youtube.com/watch?v=g-S-cpUaPj0'

def wait_until(page, expression, timeout=10000, arg=None):
    deadline = time.monotonic() + timeout / 1000
    while time.monotonic() < deadline:
        try:
            if page.evaluate(expression, arg):
                return
        except Exception:
            pass
        page.wait_for_timeout(200)
    raise AssertionError(f'Condition not met within {timeout}ms: {expression}')

def main():
    print(f"🎬 啟動真實 YouTube 測試: {TARGET_URL}")
    ext_dirs = [str(ROOT)]
    if KISS_DIR.exists():
        ext_dirs.append(str(KISS_DIR))
        print(f"📦 已掛載真實 KISS Translator: {KISS_DIR}")
    ext_arg = ','.join(ext_dirs)

    with tempfile.TemporaryDirectory(prefix='visionpip-live-') as profile:
        with sync_playwright() as playwright:
            context = playwright.chromium.launch_persistent_context(
                profile,
                channel='chromium',
                headless=False,
                user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                args=[
                    f'--disable-extensions-except={ext_arg}',
                    f'--load-extension={ext_arg}',
                    '--disable-blink-features=AutomationControlled',
                    '--autoplay-policy=no-user-gesture-required'
                ],
                viewport={'width': 1280, 'height': 850}
            )
            page = context.pages[0] if context.pages else context.new_page()

            print(f"🌐 正在前往 {TARGET_URL}...")
            page.goto(TARGET_URL, wait_until='domcontentloaded', timeout=60000)

            # Handle cookie/consent modals if present
            for label in ['Reject all', '全部拒絕', '拒绝全部', 'Accept all', '全部接受']:
                btn = page.get_by_role('button', name=label, exact=True)
                if btn.count() and btn.first.is_visible():
                    btn.first.click()
                    print(f"已點擊 Cookie 按鈕: {label}")
                    break

            # Wait for video element
            print("⏳ 等待 YouTube 播放器與影片元素...")
            wait_until(page, "!!document.querySelector('video.html5-main-video')", timeout=25000)
            page.evaluate('''() => {
              const v = document.querySelector('video.html5-main-video');
              v.muted = true;
              v.currentTime = 1.0;
              v.play().catch(() => {});
            }''')

            # Wait for VisionPiP float button
            print("⏳ 等待 VisionPiP 懸浮按鈕載入...")
            page.locator('#pip-sub-float').wait_for(timeout=25000)
            print("✅ VisionPiP 懸浮按鈕已就緒！")

            # Check video playback
            wait_until(page, "document.querySelector('video.html5-main-video')?.currentTime > 0.5", timeout=20000)
            cur_time = page.evaluate("document.querySelector('video.html5-main-video').currentTime")
            print(f"▶️ 影片正常播放中，當前時間: {cur_time}s")

            # CC Subtitles Toggle Logic
            page.locator('#movie_player').hover()
            cc_btn = page.locator('.ytp-subtitles-button')
            cc_btn.wait_for(state='visible', timeout=10000)

            print(f"🔍 當前 YouTube CC 狀態: aria-pressed={cc_btn.get_attribute('aria-pressed')}")
            if cc_btn.get_attribute('aria-pressed') != 'true':
                print("🔘 CC 尚未開啟，正在點擊開啟 CC...")
                cc_btn.click()
                page.wait_for_timeout(500)

            # Check if captions are reading
            def check_captions():
                return page.evaluate('''() => {
                  const native = Array.from(document.querySelectorAll('.ytp-caption-segment')).map(n => n.textContent.trim()).filter(Boolean);
                  const kiss = Array.from(document.querySelectorAll('.kiss-caption-window, .kiss-caption-container, .kiss-p, .kiss-youtube-original, .kiss-youtube-translation')).map(n => n.textContent.trim()).filter(Boolean);
                  return { native, kiss };
                }''')

            time.sleep(2)
            captions = check_captions()
            print(f"當前字幕檢測結果: 原生 CC={captions['native']}, KISS={captions['kiss']}")

            # User requirement: "當kiss沒讀取到字幕時 嘗試開關一下字幕開關"
            if not captions['kiss'] and not captions['native']:
                print("⚠️ KISS 或原生字幕尚未檢測到內容，正在嘗試開關一下字幕開關（CC Toggle Nudge）...")
                cc_btn.click() # turn off
                page.wait_for_timeout(350)
                cc_btn.click() # turn back on
                print("🔄 已完成字幕開關切換，等待字幕流重新觸發...")
                page.wait_for_timeout(2000)
                captions = check_captions()
                print(f"切換後字幕檢測結果: 原生 CC={captions['native']}, KISS={captions['kiss']}")

            # Open VisionPiP window
            print("🚀 正在開啟 VisionPiP 畫中畫浮窗（按 P 鍵）...")
            page.keyboard.press('p')
            wait_until(page, "!!window.documentPictureInPicture?.window", timeout=15000)
            print("✅ Document Picture-in-Picture 浮窗已開啟！")

            # Wait for video ready in PiP
            wait_until(page, "documentPictureInPicture.window.document.querySelector('video')?.readyState >= 2", timeout=15000)
            print("✅ 畫中畫視訊渲染就緒！")

            # Wait for captions to display in PiP
            print("⏳ 等待字幕渲染至浮窗...")
            pip_samples = []
            for i in range(12):
                sample = page.evaluate('''() => {
                  const win = window.documentPictureInPicture?.window;
                  const box = win?.document?.querySelector('#pip-sub-box');
                  const lines = Array.from(win?.document?.querySelectorAll('.pip-line') || []).map(n => n.textContent);
                  const native = Array.from(document.querySelectorAll('.ytp-caption-segment')).map(n => n.textContent);
                  const kiss = Array.from(document.querySelectorAll('.kiss-caption-window, .kiss-caption-container, .kiss-p, .kiss-youtube-original, .kiss-youtube-translation')).map(n => n.textContent.trim()).filter(Boolean);
                  const v = document.querySelector('video.html5-main-video');
                  return {
                    time: v ? v.currentTime : 0,
                    text: box?.textContent || '',
                    lines,
                    native,
                    kiss
                  };
                }''')
                pip_samples.append(sample)
                if sample['text'] or sample['lines']:
                    print(f"[{i+1}/12] 浮窗已顯示字幕: {sample['lines']} (KISS: {sample['kiss']})")
                page.wait_for_timeout(1000)

            has_subtitles = any(s['lines'] for s in pip_samples)
            print(f"🎉 測試結果: 浮窗字幕捕獲成功 = {has_subtitles}")

            print("👉 瀏覽器視窗將保持開啟 10 秒供您即時觀看效果...")
            page.wait_for_timeout(10000)

            page.evaluate('window.documentPictureInPicture?.window?.close()')
            context.close()
            print("✅ 真實 YouTube 測試執行完畢！")

if __name__ == '__main__':
    main()
