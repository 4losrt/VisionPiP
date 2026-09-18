# VisionPiP — YouTube 浮動字幕擴充功能

> 在獨立的浮動視窗中播放 YouTube 影片，並同步顯示 KISS Translator 或 YouTube 原生字幕。

**VisionPiP** 是一個以 Chrome Manifest V3 建立的 YouTube 字幕輔助擴充功能。它使用 Chrome 的 Document Picture-in-Picture API，將影片、字幕與播放控制項放入獨立的浮動視窗，讓使用者在瀏覽其他內容時仍能持續觀看影片與字幕。

本專案特別針對 [KISS Translator](https://github.com/fishjar/kiss-translator) 的雙語字幕顯示進行整合，同時支援 YouTube 原生字幕作為 fallback。當 KISS 的目標語言與 YouTube 目前字幕語言相同，導致 KISS 不產生可讀取的字幕內容時，VisionPiP 會改讀取 YouTube 原生字幕顯示。

## 功能總覽

| 功能 | 說明 |
|---|---|
| 浮動播放視窗 | 使用 Document Picture-in-Picture API，在獨立視窗中播放 YouTube 影片。 |
| KISS 雙語字幕 | 讀取 KISS Translator 在 YouTube 播放器中的字幕 DOM，顯示即時雙語字幕。 |
| YouTube 原生字幕 fallback | 當 KISS 沒有輸出，或目標語言與原字幕相同時，讀取 YouTube 原生字幕。 |
| 主環境 Player Bridge 架構 | 以 Manifest V3 `world: "MAIN"` 注入 `player-bridge.js`，直接存取 YouTube 播放器 API 與 timedtext 軌道。 |
| YouTube Shorts 與一般影片支援 | 完美支援 `/watch?v=...` 與 YouTube Shorts 短影音 `/shorts/...`。 |
| 原生字幕行分組修復 | 將單行內多個 inline segment 正確拼接為單一字幕行，避免斷行破碎。 |
| 播放速度雙向即時同步 | 在 YouTube 主播放器或 PiP 調整播放速度時，速度按鈕與影片倍速立即同步。 |
| 直播與無窮時間防護 | 對於直播或 MediaStream 串流，顯示乾淨的 `00:00 / Live` 標籤，避免 `NaN` 或 `Infinity`。 |
| JSON3 時間同步備援 | 當原生字幕 DOM 尚未繪製或暫時不可見時，使用 YouTube 字幕軌道資料依時間精確同步。 |
| 字幕介面過濾 | 排除語言選單、字幕設定、按鈕與「按一下進入設定」等介面文字，同時保留對白中的合法單字。 |
| 播放控制 | 支援播放／暫停、前進、倒退、靜音、字幕切換、視訊比例自適應、播放速度、音量調整與進度拖曳。 |
| 滑鼠滾輪直接調節音量 | 在浮動視窗中滑動滑鼠滾輪，直接以 ±5% 為單位調節音量，並顯示精緻毛玻璃動態 HUD 提示條。 |
| 字幕顯示模式切換 | 支援「雙語對照」、「僅原文」、「僅譯文」三種模式，可於設定頁選取、在控制欄點擊或按下鍵盤 `V` 鍵即時切換。 |
| 畫面顯示模式切換 | 支援「等比例完整畫面 (Contain)」與「滿版沉浸無黑邊 (Cover)」，可於設定頁選取、在控制欄點擊或按下鍵盤 `F` 鍵即時切換。 |
| 智慧視訊比例自適應 | 自動依據橫式 (16:9 / 4:3 / 21:9) 或直式 (Shorts 9:16) 視訊大小設定浮窗，支援雙擊視窗或按下 `A` 鍵即時無縫最適配。 |
| 動態字幕貼合定位 | 就算視窗被任意拉伸縮放產生黑邊，字幕仍自動精確計算貼附於實際視訊畫面下緣，永不走位。 |
| 中文字體與外觀設定 | 支援「系統預設 (System UI)」、「蘋方 / 微軟正黑體 (Modern CJK)」、「思源黑體 (Noto Sans)」、「Georgia / 宋體 (Serif)」等高辨識度中文字型，並可調整字型大小、顏色、透明度與位置。 |
| YouTube SPA 換頁支援 | 切換影片後會重新載入影片與字幕狀態，並自動調整浮窗比例，避免顯示上一部影片的字幕。 |

## 字幕來源與處理順序

VisionPiP 會依照以下順序尋找目前應顯示的字幕：

1. **KISS Translator 字幕**：如果 KISS 有產生有效的雙語字幕，優先顯示 KISS 內容。
2. **YouTube 原生字幕 DOM**：如果 KISS 沒有輸出，則讀取 YouTube 播放器中的原生字幕文字。
3. **YouTube JSON3 字幕軌道**：如果原生字幕 DOM 尚未繪製或不可見，使用由 `player-bridge.js` 擷取的字幕軌道資料依影片時間同步顯示。

YouTube 目前選取的字幕軌道會優先於預設語言。當播放器沒有公開目前選取的字幕軌道時，VisionPiP 的 fallback 語言偏好為**繁體中文／中文優先，其次為英文**，最後才使用可用的其他字幕軌道。

### 會被自動排除的文字

為避免 YouTube 或 KISS 的介面文字被誤判為字幕，VisionPiP 會排除下列內容：

| 類別 | 範例 |
|---|---|
| 語言設定選單 | `中文（繁體）`、`English (auto-generated)` 等帶有屬性之語言選單 |
| 語言選單標籤 | `語言`、`语言`、`Language` |
| 字幕設定 | `字幕設定`、`Subtitle Settings`、`Caption Settings` |
| 一般設定 | `設定`、`设置`、`Settings` |
| 操作提示 | `按一下進入設定`、`點擊進入設定`、`Click to open settings` |
| 播放器選單 | YouTube 設定選單、選單項目、按鈕、下拉選單與隱藏元素 |

原生字幕容器中的合法對白單字（例如角色說出 "English"）會受到保護並正常顯示。

## 系統需求

| 項目 | 需求 |
|---|---|
| 瀏覽器 | 支援 Document Picture-in-Picture API 的 Google Chrome。 |
| Chrome 版本 | Chrome 116 或更新版本。 |
| 使用網站 | YouTube 影片與 Shorts 頁面，例如 `youtube.com/watch?v=...` 或 `youtube.com/shorts/...`。 |
| KISS Translator | 選用。只有在需要雙語字幕時才需要安裝並啟用。 |

## 安裝方式

### 從 Chrome Web Store 安裝

如果專案已經發布到 Chrome Web Store，請直接從商店頁面安裝最新版本。安裝後開啟 YouTube 影片頁面即可使用。

### 使用 ZIP 載入未封裝擴充功能

1. 下載本專案的 ZIP 檔案並解壓縮。
2. 在 Chrome 開啟 `chrome://extensions/`。
3. 開啟右上角的**開發人員模式**。
4. 點選**載入未封裝項目**。
5. 選取解壓縮後、包含 `manifest.json` 的資料夾。請確認 `manifest.json` 位於所選資料夾的根目錄，而不是再多包一層子資料夾。
6. 開啟或重新整理 YouTube 影片頁面。

目前版本為 **v2.0.0**。更新擴充功能後，建議在 `chrome://extensions/` 點選 VisionPiP 的重新載入按鈕，再重新整理 YouTube 影片頁面，確保新的 content script 已載入。

## 使用方式

### 開啟浮動視窗

進入 YouTube 影片或 Shorts 頁面後，將滑鼠移到影片播放器上，點選播放器左上方的 **Open VisionPiP (P)** 按鈕；也可以直接按鍵盤上的 `P`。再次按下 `P`，或在浮動視窗中關閉視窗，即可離開 PiP 模式。

### 使用 KISS Translator 雙語字幕

先在 YouTube 上安裝並啟用 [KISS Translator](https://github.com/fishjar/kiss-translator)。當 KISS 正常產生雙語字幕時，VisionPiP 會自動擷取並顯示字幕。

如果 KISS 的目標語言設定為與 YouTube 原生字幕相同的語言，例如 YouTube 使用「中文（繁體）」而 KISS 的目標語言也是中文繁體，KISS 可能不會產生翻譯字幕。此時 VisionPiP 會自動使用 YouTube 原生字幕，不需要另外切換設定。

### 調整字幕外觀

點選 Chrome 工具列中的 VisionPiP 圖示開啟設定視窗，可調整下列項目：

| 設定 | 說明 |
|---|---|
| Font Size | 字幕字型大小。 |
| Font Family | 字幕字型。 |
| Text Color | 字幕文字顏色。 |
| Background Opacity | 字幕背景透明度。 |
| Position | 字幕顯示於浮動視窗上方或下方。 |

設定會透過 `chrome.storage.sync` 儲存。調整後通常會即時套用到目前的字幕視窗。

### 浮動視窗控制項

將滑鼠移到浮動視窗上即可顯示控制列。控制列包含播放／暫停、倒退 10 秒、前進 10 秒、靜音、字幕切換、播放速度與進度條。

## 鍵盤快捷鍵與互動操作

| 按鍵 / 手勢 | 功能 |
|---|---|
| `P` | 開啟或關閉 VisionPiP。 |
| `Space` 或 `K` | 播放／暫停影片。 |
| `J` / `L` | 往前倒退 10 秒 / 往後前進 10 秒。 |
| `←` / `→` | 往前倒退 5 秒 / 往後前進 5 秒。 |
| `0` ~ `9` | 快速跳轉至影片的 0% ~ 90% 位置。 |
| `↑` / `↓` | 調高音量 5% / 調低音量 5%。 |
| `滑鼠滾輪 (Scroll Wheel)` | 直接在浮窗滑動滾輪即時調節音量 (±5%)，自動顯示毛玻璃動態 HUD 條。 |
| `M` | 靜音／取消靜音。 |
| `C` | 開啟／關閉字幕顯示。 |
| `V` | 循環切換字幕顯示模式（雙語對照 ➔ 僅原文 ➔ 僅譯文）。 |
| `F` | 切換畫面縮放模式（等比例保留黑邊 Contain 🔀 沉浸滿版無黑邊 Cover）。 |
| `A` | 自動適應目前影片的長寬比例與最適尺寸（去除黑邊）。 |
| `雙擊視窗 (Double Click)` | 快速將視窗貼合為影片原生比例。 |

## 執行期穩定性處理

VisionPiP 已針對 YouTube 的單頁應用程式導航與字幕載入時序加入額外處理：

- 切換 YouTube 影片時會清除上一部影片的字幕資料，避免舊字幕殘留。
- 播放器 response 會比對目前影片 ID，避免 SPA 換頁時沿用上一部影片的字幕清單。
- 暫停影片後拖曳進度條或延遲載入字幕，字幕會依新的時間立即刷新。
- 如果瀏覽器不支援 `captureStream()` 而改用原生 video 節點，關閉 PiP 或切換影片時會還原原本的 video 節點、位置與 inline style。
- 關閉使用 stream 模式的 PiP 時，會解除 `srcObject` 並清理浮動視窗中的 video 元素。
- KISS 與 YouTube 原生字幕都使用相同的文字與介面元素過濾器。

## 專案結構

```text
VisionPiP/
├── manifest.json          # Chrome Manifest V3 設定 (含 world: MAIN bridge)
├── player-bridge.js       # Main World 橋接腳本，讀取 YouTube Player 與字幕軌道
├── content.js             # 核心注入腳本、PiP、字幕同步、速度同步與過濾邏輯
├── content.css            # YouTube 播放器浮動按鈕樣式
├── popup.html             # 擴充功能設定視窗 (支援中文字型與模式選擇)
├── popup.js               # 設定儲存與 PiP 控制
├── icons/                 # 16x16、48x48、128x128 圖示
├── browser_smoke.py       # Playwright 瀏覽器自動化端到端煙霧測試套件 (17 項)
├── player-bridge.test.cjs # Player bridge 單元測試套件 (34 項)
├── subtitle-sync.test.cjs # 字幕同步機制單元測試套件 (8 項)
├── package.json           # 測試與自動化檢查設定
├── README.md              # 英文版說明文件
├── README.zh-TW.md        # 繁體中文版說明文件
└── LICENSE                # MIT 授權條款
```

## 開發與測試

本專案具備完整的自動化單元測試與 Playwright 端到端瀏覽器測試：

1. **環境建置**：
   ```bash
   python3 -m venv .venv
   .venv/bin/pip install -r requirements-test.txt
   .venv/bin/playwright install chromium
   ```
2. **執行全套測試**：
   ```bash
   npm test
   ```
   包含：
   - 語法與 AST 檢查：`npm run check`
   - 42 項單元測試：`npm run test:unit`
   - 17 項端到端瀏覽器測試：
     ```bash
     npm run test:browser         # 執行 Headless 瀏覽器冒煙測試（17 項全功能測試）
     npm run test:browser:headed  # 執行有介面（非 Headless）瀏覽器自動化測試
     npm run test:interactive     # 啟動互動式測試瀏覽器，可手動測試浮窗與快捷鍵
     ```

## 開發與修改

如果要以未封裝模式測試：

1. 修改 `content.js`、`popup.js` 或相關檔案。
2. 在 `chrome://extensions/` 重新載入 VisionPiP。
3. 重新整理 YouTube 影片頁面，讓新的 content script 生效。
4. 在影片頁面測試 KISS 字幕、YouTube 原生字幕、換片、seek、關閉 PiP 與重新開啟等情境。

發布前請確認 `manifest.json` 位於 ZIP 根目錄，並確認版本號已同步更新。

## 致謝與來源

- 本專案由 **Gemini** 與 **Manus AI** 協作完成，包含擴充功能架構、字幕 fallback、介面文字過濾、執行期穩定性與文件整理。
- 感謝 [KISS Translator](https://github.com/fishjar/kiss-translator) 提供雙語字幕整合基礎。
- 本專案的 PiP 字幕概念受到 [mehmetkahya0/youtube-pip-subtitles](https://github.com/mehmetkahya0/youtube-pip-subtitles) 啟發與參考，並保留原始作者的開源 attribution。

## 授權條款

本專案採用 [MIT License](LICENSE) 授權。使用或再發布本專案時，請保留原有授權與 attribution 資訊。
