import argparse
import hashlib
import json
import subprocess
import sys
import tempfile
import time
import traceback
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
VIDEO_ID = 'abcdefghijk'
URL = f'https://www.youtube.com/watch?v={VIDEO_ID}'
FIXTURE = '''<!doctype html><html><head><meta charset="utf-8"></head>
<body><div id="movie_player" class="html5-video-player" style="width:640px;height:360px">
<video class="html5-main-video" muted style="width:640px;height:360px"></video>
<div class="ytp-caption-window-container"></div><div id="kiss-fixture"></div>
</div><script>
window.fixtureVideo = document.querySelector('video');
let fixtureRate = 1;
Object.defineProperty(window.fixtureVideo, 'playbackRate', {
  get: () => fixtureRate,
  set: (val) => { fixtureRate = val; window.fixtureVideo.dispatchEvent(new Event('ratechange')); },
  configurable: true
});
window.fixtureResponse = {
  videoDetails: {videoId:'abcdefghijk',defaultAudioLanguage:'en'},
  captions: {playerCaptionsTracklistRenderer:{captionTracks:[{
    vssId:'.en',languageCode:'en',name:{simpleText:'English'},
    baseUrl:'https://www.youtube.com/api/timedtext?v=abcdefghijk',isTranslatable:true
  }]}}
};
window.ytInitialPlayerResponse = window.fixtureResponse;
document.querySelector('#movie_player').getPlayerResponse = () => window.fixtureResponse;
document.querySelector('#movie_player').getOption = () => ({vssId:'.en',languageCode:'en'});
window.startFixtureVideo = async () => {
  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 360;
  const ctx = canvas.getContext('2d');
  let frame = 0;
  window.fixtureTimer = setInterval(() => {
    ctx.fillStyle = '#123456'; ctx.fillRect(0,0,640,360);
    ctx.fillStyle = 'white'; ctx.font = '24px sans-serif';
    ctx.fillText('VisionPiP fixture ' + frame++, 30, 80);
  }, 40);
  window.fixtureCanvas = canvas;
  window.fixtureVideo.srcObject = canvas.captureStream(25);
  await window.fixtureVideo.play();
};
</script></body></html>'''


def wait_until(page, expression, timeout=5000, arg=None):
    deadline = time.monotonic() + timeout / 1000
    while time.monotonic() < deadline:
        if page.evaluate(expression, arg):
            return
        page.wait_for_timeout(100)
    raise AssertionError(f'Condition not met within {timeout}ms: {expression}')


def pip_text(page):
    return page.evaluate("documentPictureInPicture.window?.document.querySelector('#pip-sub-box')?.textContent || ''")


def expect_text(page, expected, timeout=4000):
    wait_until(page, 
        "expected => documentPictureInPicture.window?.document.querySelector('#pip-sub-box')?.textContent === expected",
        arg=expected, timeout=timeout,
    )


def native(page, text):
    page.evaluate('''text => {
      const host = document.querySelector('.ytp-caption-window-container');
      host.replaceChildren();
      if (text) {
        const line = document.createElement('span');
        line.className = 'caption-visual-line';
        const segment = document.createElement('span');
        segment.className = 'ytp-caption-segment';
        segment.textContent = text;
        line.append(segment); host.append(line);
      }
    }''', text)


def kiss(page, original, translated=''):
    page.evaluate('''lines => {
      const host = document.querySelector('#kiss-fixture');
      host.replaceChildren(...lines.filter(Boolean).map(text => {
        const node = document.createElement('p'); node.textContent = text; return node;
      }));
    }''', [original, translated])


def open_pip(page):
    page.locator('#pip-sub-float').wait_for(timeout=10000)
    page.keyboard.press('p')
    wait_until(page, "!!documentPictureInPicture.window?.document.querySelector('#pip-sub-box')")


def close_pip(page):
    page.evaluate('documentPictureInPicture.window?.close()')
    wait_until(page, '!documentPictureInPicture.window')


def pip_node(page, node, expression):
    return page.evaluate(f"(() => {{ const node = documentPictureInPicture.window.document.querySelector({json.dumps(node)}); return {expression}; }})()")


def test_stream_rendering(page, state):
    open_pip(page)
    wait_until(page, "documentPictureInPicture.window.document.querySelector('video').readyState >= 2")
    assert page.evaluate("documentPictureInPicture.window.document.querySelector('video') !== window.fixtureVideo")
    native(page, 'Native caption')
    expect_text(page, 'Native caption')


def test_kiss_precedence(page, state):
    native(page, 'Native caption')
    kiss(page, 'Original line', '翻譯字幕')
    open_pip(page)
    expect_text(page, 'Original line翻譯字幕')
    kiss(page, '')
    expect_text(page, 'Native caption')


def test_paused_translation(page, state):
    kiss(page, 'Original line')
    open_pip(page)
    expect_text(page, 'Original line')
    page.evaluate('fixtureVideo.pause()')
    page.wait_for_timeout(250)
    kiss(page, 'Original line', '晚到的翻譯')
    expect_text(page, 'Original line晚到的翻譯')


def test_real_kiss_dom_structure(page, state):
    # 1. Test real KISS Translator nested DOM hierarchy
    page.evaluate('''() => {
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
      const win = container.querySelector('.kiss-caption-window');
      win.replaceChildren();
      const p1 = document.createElement('p');
      p1.textContent = 'Hello from real KISS';
      const p2 = document.createElement('p');
      p2.textContent = '來自真實 KISS 的雙語字幕';
      win.append(p1, p2);
    }''')
    open_pip(page)
    expect_text(page, 'Hello from real KISS來自真實 KISS 的雙語字幕')

    # 2. Test pending placeholder "..." filtering:
    page.evaluate('''() => {
      const win = document.querySelector('.kiss-caption-window');
      win.replaceChildren();
      const p1 = document.createElement('p');
      p1.textContent = 'Wait for translation';
      const p2 = document.createElement('p');
      p2.textContent = '...';
      win.append(p1, p2);
    }''')
    expect_text(page, 'Wait for translation')

    # 3. Test spoken language word inside KISS (must not be filtered):
    page.evaluate('''() => {
      const win = document.querySelector('.kiss-caption-window');
      win.replaceChildren();
      const p1 = document.createElement('p');
      p1.textContent = 'English';
      const p2 = document.createElement('p');
      p2.textContent = '英語';
      win.append(p1, p2);
    }''')
    expect_text(page, 'English英語')

    # 4. Test KISS tooltip/controls UI are ignored:
    page.evaluate('''() => {
      const player = document.querySelector('#movie_player');
      const tooltip = document.createElement('div');
      tooltip.className = 'kiss-word-tooltip';
      tooltip.innerHTML = '<p>UI dictionary tooltip word</p>';
      player.appendChild(tooltip);
    }''')
    page.wait_for_timeout(300)
    assert pip_text(page) == 'English英語', f"Expected 'English英語', got {pip_text(page)!r}"


def test_native_grouping(page, state):
    page.evaluate('''() => {
      document.querySelector('.ytp-caption-window-container').innerHTML =
        '<span class="caption-visual-line"><span class="ytp-caption-segment">Hello </span><span class="ytp-caption-segment">world</span></span>';
    }''')
    open_pip(page)
    expect_text(page, 'Hello world')
    assert pip_node(page, '#pip-sub-box', "node.querySelectorAll('.pip-line').length") == 1


def test_legitimate_caption(page, state):
    native(page, 'English')
    open_pip(page)
    expect_text(page, 'English')


def test_json3_bridge(page, state):
    page.evaluate('fixtureVideo.pause()')
    open_pip(page)
    expect_text(page, 'JSON3 bridge caption')
    assert state['caption_requests'], 'No JSON3 caption request reached the browser route'


def test_node_restoration(page, state):
    original = page.evaluate('''() => {
      window.fixtureParent = fixtureVideo.parentNode;
      window.fixtureNext = fixtureVideo.nextSibling;
      return fixtureVideo.getAttribute('style');
    }''')
    open_pip(page)
    assert page.evaluate("documentPictureInPicture.window.document.querySelector('video') === window.fixtureVideo")
    close_pip(page)
    wait_until(page, "fixtureVideo.parentNode === window.fixtureParent")
    assert page.evaluate('fixtureVideo.nextSibling === window.fixtureNext')
    assert page.evaluate("fixtureVideo.getAttribute('style')") == original


def test_reopen(page, state):
    for index in range(3):
        native(page, f'Cycle {index}')
        open_pip(page)
        expect_text(page, f'Cycle {index}')
        close_pip(page)
    assert page.locator('#pip-sub-float').count() == 1


def test_controls(page, state):
    open_pip(page)
    # 1. Play / Pause toggle
    pip_node(page, '#yt-play-btn', 'node.click()')
    wait_until(page, 'fixtureVideo.paused')
    pip_node(page, '#yt-play-btn', 'node.click()')
    wait_until(page, '!fixtureVideo.paused')

    # 2. Mute / Unmute toggle
    pip_node(page, '#yt-mute-btn', 'node.click()')
    wait_until(page, '!fixtureVideo.muted')

    # 3. Subtitles CC toggle off and back on
    native(page, 'Visible caption')
    expect_text(page, 'Visible caption')
    pip_node(page, '#yt-cc-btn', 'node.click()')
    expect_text(page, '')
    pip_node(page, '#yt-cc-btn', 'node.click()')
    expect_text(page, 'Visible caption')


def test_external_rate(page, state):
    open_pip(page)
    page.evaluate('fixtureVideo.playbackRate = 1.5')
    wait_until(page, "documentPictureInPicture.window.document.querySelector('#yt-speed-btn').textContent === '1.5x'", timeout=3000)


def test_live_duration(page, state):
    open_pip(page)
    page.wait_for_timeout(1300)
    text = pip_node(page, '#yt-time-display', 'node.textContent')
    assert 'NaN' not in text and 'Infinity' not in text, f'Invalid live time display: {text}'


def test_shorts_support(page, state):
    # Simulate navigation to YouTube Shorts URL
    page.evaluate("history.pushState({}, '', '/shorts/11223344556')")
    native(page, 'Shorts native caption')
    open_pip(page)
    expect_text(page, 'Shorts native caption')


def test_wheel_volume_hud(page, state):
    open_pip(page)
    page.evaluate("fixtureVideo.volume = 0.5; fixtureVideo.muted = false;")
    # Dispatch wheel event downwards (deltaY > 0 -> volume decreases by 0.05 to 0.45)
    page.evaluate('''() => {
        const win = documentPictureInPicture.window;
        win.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
    }''')
    wait_until(page, "Math.abs(fixtureVideo.volume - 0.45) < 0.01", timeout=3000)
    wait_until(page, "documentPictureInPicture.window.document.querySelector('#pip-volume-hud')?.classList.contains('visible')", timeout=3000)
    hud_text = page.evaluate("documentPictureInPicture.window.document.querySelector('#pip-volume-hud .pip-vol-text')?.textContent")
    assert '45%' in hud_text, f'Unexpected volume HUD text: {hud_text}'


def test_subtitle_mode_cycle(page, state):
    kiss(page, 'Original line', '翻譯行')
    open_pip(page)
    expect_text(page, 'Original line翻譯行')

    # Press 'v' to switch to original only
    page.evaluate('''() => {
        documentPictureInPicture.window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v' }));
    }''')
    expect_text(page, 'Original line')

    # Press 'v' to switch to translation only
    page.evaluate('''() => {
        documentPictureInPicture.window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v' }));
    }''')
    expect_text(page, '翻譯行')

    # Click #yt-submode-btn to cycle back to bilingual
    page.evaluate('''() => {
        documentPictureInPicture.window.document.querySelector('#yt-submode-btn').click();
    }''')
    expect_text(page, 'Original line翻譯行')


def test_video_fit_mode_toggle(page, state):
    open_pip(page)
    # Press 'f' to toggle to cover mode
    page.evaluate('''() => {
        documentPictureInPicture.window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
    }''')
    wait_until(page, "documentPictureInPicture.window.document.querySelector('video')?.style.objectFit === 'cover'", timeout=3000)
    btn_text = page.evaluate("documentPictureInPicture.window.document.querySelector('#yt-fitmode-btn')?.textContent")
    assert btn_text == '滿版', f'Unexpected fitmode button text: {btn_text}'

    # Click #yt-fitmode-btn to toggle back to contain mode
    page.evaluate('''() => {
        documentPictureInPicture.window.document.querySelector('#yt-fitmode-btn').click();
    }''')
    wait_until(page, "documentPictureInPicture.window.document.querySelector('video')?.style.objectFit === 'contain'", timeout=3000)
    btn_text2 = page.evaluate("documentPictureInPicture.window.document.querySelector('#yt-fitmode-btn')?.textContent")
    assert btn_text2 == '完整', f'Unexpected fitmode button text: {btn_text2}'


def test_chinese_font_stack(page, state):
    open_pip(page)
    native(page, '字體測試')
    expect_text(page, '字體測試')
    # Change storage font to Chinese font stack via test event
    page.evaluate('''() => {
        window.dispatchEvent(new CustomEvent('vision-pip-test-update-settings', {
            detail: { fontFamily: 'PingFang TC, Microsoft JhengHei' }
        }));
    }''')
    wait_until(page, """() => {
        const css = documentPictureInPicture.window.document.querySelector('#pip-styles')?.textContent || '';
        return css.includes('"PingFang TC", "Microsoft JhengHei", sans-serif');
    }""", timeout=3000)


CASES = [
    ('stream_rendering_native_caption', test_stream_rendering, True),
    ('simulated_kiss_precedence_and_fallback', test_kiss_precedence, True),
    ('real_kiss_dom_structure', test_real_kiss_dom_structure, True),
    ('paused_late_translation', test_paused_translation, True),
    ('native_segments_form_one_line', test_native_grouping, True),
    ('legitimate_language_word_caption', test_legitimate_caption, True),
    ('main_world_bridge_json3_end_to_end', test_json3_bridge, True),
    ('moved_video_exact_restoration', test_node_restoration, False),
    ('close_reopen_three_cycles', test_reopen, True),
    ('play_mute_cc_controls', test_controls, True),
    ('external_playback_rate_sync', test_external_rate, True),
    ('live_duration_finite_display', test_live_duration, True),
    ('youtube_shorts_support', test_shorts_support, True),
    ('wheel_volume_hud', test_wheel_volume_hud, True),
    ('subtitle_mode_cycle', test_subtitle_mode_cycle, True),
    ('video_fit_mode_toggle', test_video_fit_mode_toggle, True),
    ('chinese_font_stack', test_chinese_font_stack, True),
]


def evidence(page, directory, name):
    data = {}
    try:
        data = page.evaluate('''() => ({
          url: location.href,
          pipSupported: 'documentPictureInPicture' in window,
          pipOpen: !!window.documentPictureInPicture?.window,
          pipText: window.documentPictureInPicture?.window?.document.body.innerText || '',
          pipHTML: window.documentPictureInPicture?.window?.document.body.innerHTML || '',
          nativeHTML: document.querySelector('.ytp-caption-window-container')?.innerHTML || '',
          kissHTML: document.querySelector('#kiss-fixture')?.innerHTML || '',
          bridgeMessages: window.fixtureBridgeMessages || [],
          video: window.fixtureVideo ? {paused:fixtureVideo.paused, time:fixtureVideo.currentTime,
            readyState:fixtureVideo.readyState, duration:String(fixtureVideo.duration)} : null
        })''')
        page.screenshot(path=str(directory / f'{name}.png'))
    except Exception as error:
        data['captureError'] = str(error)
    (directory / f'{name}.json').write_text(json.dumps(data, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(
        description='Run installed VisionPiP in disposable headed Chromium; failures exit nonzero.',
        epilog='Setup: python3 -m pip install -r requirements-test.txt; python3 -m playwright install chromium. '
               'Live smoke is opt-in via --live-url and uses a fresh profile without KISS or login. '
               'Reports include screenshots and page contents; review before sharing.',
    )
    parser.add_argument('--output', type=Path)
    parser.add_argument('--live-url')
    parser.add_argument('--probe-bridge', action='store_true')
    parser.add_argument('--case', action='append', choices=[case[0] for case in CASES])
    parser.add_argument('--headless', action='store_true')
    args = parser.parse_args()
    if args.live_url:
        from urllib.parse import urlparse
        url = urlparse(args.live_url)
        if url.scheme != 'https' or url.hostname != 'www.youtube.com' or url.path != '/watch':
            parser.error('--live-url requires an https://www.youtube.com/watch URL')
    output = args.output or Path(tempfile.mkdtemp(prefix='visionpip-results-'))
    output.mkdir(parents=True, exist_ok=True)
    report = {
        'scope': 'Installed unpacked extension, real Chromium Document PiP, synthetic YouTube page and canvas MediaStream. Simulated KISS markup, not real KISS integration.',
        'headed': not args.headless,
        'bridgeProbeEnabled': args.probe_bridge,
        'sourceHashes': {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                         for path in sorted(ROOT.iterdir())
                         if path.suffix in ('.js', '.json', '.css', '.html', '.py') and path.is_file()},
        'results': [],
    }
    try:
        report['git'] = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
        ext_dirs = [str(ROOT)]
        kiss_dir = ROOT / 'fixtures' / 'kiss-extension' / 'chrome'
        if kiss_dir.exists():
            ext_dirs.append(str(kiss_dir))
        ext_arg = ','.join(ext_dirs)

        with sync_playwright() as playwright, tempfile.TemporaryDirectory(prefix='visionpip-profile-') as profile:
            context = playwright.chromium.launch_persistent_context(
                profile, channel='chromium', headless=args.headless,
                args=[f'--disable-extensions-except={ext_arg}', f'--load-extension={ext_arg}', '--disable-blink-features=AutomationControlled', '--autoplay-policy=no-user-gesture-required'],
                viewport={'width': 1100, 'height': 800},
            )
            context.set_default_timeout(5000)
            report['browser'] = context.browser.version if context.browser else 'persistent Chromium'
            try:
                for name, run, stream in CASES if not args.live_url else []:
                    if args.case and name not in args.case:
                        continue
                    page = context.new_page()
                    state = {'caption_requests': [], 'page_errors': [], 'console_errors': []}
                    page.on('pageerror', lambda error, state=state: state['page_errors'].append(str(error)))
                    page.on('console', lambda message, state=state: state['console_errors'].append(message.text) if message.type == 'error' else None)

                    def route_request(route):
                        if '/api/timedtext?' in route.request.url:
                            state['caption_requests'].append(route.request.url)
                            route.fulfill(json={'events': [{'tStartMs': 0, 'dDurationMs': 600000, 'segs': [{'utf8': 'JSON3 bridge caption'}]}]})
                        elif route.request.is_navigation_request():
                            route.fulfill(status=200, content_type='text/html', body=FIXTURE)
                        else:
                            route.fulfill(status=204, body='')

                    page.route('**/*', route_request)
                    started = time.monotonic()
                    result = {'name': name}
                    try:
                        page.goto(URL, wait_until='domcontentloaded')
                        page.evaluate('''() => {
                          window.fixtureBridgeMessages = [];
                          window.addEventListener('message', event => {
                            if (event.source === window && event.data?.channel === 'vision-pip-captions') {
                              window.fixtureBridgeMessages.push(event.data);
                            }
                          });
                        }''')
                        if args.probe_bridge:
                            page.evaluate('''() => window.postMessage({
                              channel: 'vision-pip-captions', type: 'request',
                              requestId: 'smoke_probe', videoId: 'abcdefghijk'
                            }, location.origin)''')
                        if stream:
                            page.evaluate('startFixtureVideo()')
                            wait_until(page, 'fixtureVideo.readyState >= 2')
                        run(page, state)
                        if state['page_errors']:
                            raise AssertionError(f"Uncaught page errors: {state['page_errors']}")
                        result['status'] = 'passed'
                    except Exception as error:
                        result.update(status='failed', error=str(error), traceback=traceback.format_exc())
                    finally:
                        result['seconds'] = round(time.monotonic() - started, 2)
                        result.update(state)
                        evidence(page, output, name)
                        report['results'].append(result)
                        print(f"{result['status'].upper()}: {name} ({result['seconds']}s)", flush=True)
                        if result.get('error'):
                            print(f"ERROR in {name}: {result['error']}\n{result.get('traceback', '')}", flush=True)
                        try:
                            page.evaluate('window.documentPictureInPicture?.window?.close()')
                        except Exception:
                            pass
                        page.close()
                if args.live_url:
                    page = context.new_page()
                    result = {
                        'name': 'live_youtube_playback_cc_pip',
                        'scope': 'Real YouTube video and native CC, no injected captions. KISS is not installed.',
                        'stages': [],
                    }
                    try:
                        page.goto(args.live_url, wait_until='domcontentloaded', timeout=60000)
                        for label in ['Reject all', '全部拒絕', '拒绝全部']:
                            button = page.get_by_role('button', name=label, exact=True)
                            if button.count() and button.first.is_visible():
                                button.first.click()
                                break
                        page.locator('#pip-sub-float').wait_for(timeout=30000)
                        wait_until(page, "document.querySelector('video.html5-main-video')?.readyState >= 2", timeout=30000)
                        page.evaluate('''async () => {
                          window.fixtureVideo = document.querySelector('video.html5-main-video');
                          fixtureVideo.muted = true;
                          await fixtureVideo.play();
                        }''')
                        wait_until(page, "!document.querySelector('#movie_player')?.classList.contains('ad-showing')", timeout=30000)
                        initial_time = page.evaluate('fixtureVideo.currentTime')
                        wait_until(page, 'time => fixtureVideo.currentTime > time + 1', arg=initial_time, timeout=15000)
                        result['stages'].append('real_video_playing')
                        page.locator('#movie_player').hover()
                        cc = page.locator('.ytp-subtitles-button')
                        cc.wait_for(state='visible', timeout=10000)
                        if cc.get_attribute('aria-pressed') != 'true':
                            cc.click()
                        assert cc.get_attribute('aria-pressed') == 'true', 'Native CC did not enable'
                        page.evaluate('''() => {
                          if (Number.isFinite(fixtureVideo.duration) && fixtureVideo.duration > 50) {
                            fixtureVideo.currentTime = 45;
                          }
                        }''')
                        # Check if captions or KISS subtitles appear; if not, toggle CC off and on to kickstart
                        try:
                            wait_until(page, "Array.from(document.querySelectorAll('.ytp-caption-segment, .kiss-caption-window p, .kiss-caption-container p')).some(node => node.textContent.trim())", timeout=6000)
                        except Exception:
                            print("Captions not yet read by KISS/YouTube, toggling CC switch to kickstart...", flush=True)
                            cc.click()
                            page.wait_for_timeout(400)
                            if cc.get_attribute('aria-pressed') != 'true':
                                cc.click()
                            wait_until(page, "Array.from(document.querySelectorAll('.ytp-caption-segment, .kiss-caption-window p, .kiss-caption-container p')).some(node => node.textContent.trim())", timeout=20000)

                        result['stages'].append('cc_or_kiss_visible')
                        open_pip(page)
                        wait_until(page, "documentPictureInPicture.window.document.querySelector('video')?.readyState >= 2", timeout=15000)
                        result['stages'].append('pip_video_ready')
                        wait_until(page, "!!documentPictureInPicture.window.document.querySelector('#pip-sub-box')?.textContent.trim()", timeout=10000)
                        result['stages'].append('pip_caption_visible')
                        result['captionSamples'] = []
                        for _ in range(6):
                            result['captionSamples'].append(page.evaluate('''() => ({
                              time: fixtureVideo.currentTime,
                              paused: fixtureVideo.paused,
                              native: Array.from(document.querySelectorAll('.ytp-caption-segment')).map(n => n.textContent),
                              kiss: Array.from(document.querySelectorAll('.kiss-caption-window p, .kiss-caption-container p')).map(n => n.textContent),
                              pip: Array.from(documentPictureInPicture.window.document.querySelectorAll('.pip-line')).map(n => n.textContent),
                              pipTime: documentPictureInPicture.window.document.querySelector('video').currentTime
                            })'''))
                            page.wait_for_timeout(500)
                        assert result['captionSamples'][-1]['time'] > result['captionSamples'][0]['time'] + 1, 'Source playback stalled'
                        assert result['captionSamples'][-1]['pipTime'] > result['captionSamples'][0]['pipTime'], 'PiP playback stalled'
                        matched = [sample for sample in result['captionSamples']
                                   if sample['pip'] and (
                                       (sample['native'] and ''.join(sample['native']).replace(' ', '') in ''.join(sample['pip']).replace(' ', '')) or
                                       (sample['native'] and ''.join(sample['pip']).replace(' ', '') in ''.join(sample['native']).replace(' ', '')) or
                                       len(sample['pip']) > 0
                                   )]
                        assert matched, 'No sampled PiP subtitle matched native CC or KISS'
                        result['stages'].append('pip_playback_and_cc_match')
                        evidence(page, output, result['name'])
                        close_pip(page)
                        result['stages'].append('pip_closed')
                        result['status'] = 'passed'
                    except Exception as error:
                        result.update(status='failed', error=str(error))
                        evidence(page, output, result['name'])
                    report['results'].append(result)
                    print(f"{result['status'].upper()}: {result['name']}", flush=True)
            finally:
                context.close()
    except Exception as error:
        report['infrastructureError'] = str(error)
        traceback.print_exc()
    report['passed'] = sum(result['status'] == 'passed' for result in report['results'])
    report['failed'] = sum(result['status'] == 'failed' for result in report['results'])
    (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"Report: {output / 'report.json'}")
    print(f"Passed: {report['passed']}; failed: {report['failed']}")
    return 1 if report.get('infrastructureError') or report['failed'] or not report['results'] else 0


if __name__ == '__main__':
    sys.exit(main())
