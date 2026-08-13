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
| JSON3 時間同步備援 | 當原生字幕 DOM 尚未繪製或暫時不可見時，使用 YouTube 字幕軌道資料同步字幕。 |
| 字幕介面過濾 | 排除語言選單、字幕設定、按鈕與「按一下進入設定」等介面文字。 |
| 語言標籤過濾 | 排除「中文（繁體）」、「中文 (Traditional)」、「English」等目前字幕語言名稱。 |
| 播放控制 | 支援播放／暫停、前進、倒退、靜音、字幕切換、播放速度與進度拖曳。 |
| 外觀設定 | 可調整字型大小、字型、文字顏色、背景透明度與字幕位置。 |
| YouTube SPA 換頁支援 | 切換影片後會重新載入影片與字幕狀態，避免顯示上一部影片的字幕。 |

## 字幕來源與處理順序

VisionPiP 會依照以下順序尋找目前應顯示的字幕：

1. **KISS Translator 字幕**：如果 KISS 有產生有效的雙語字幕，優先顯示 KISS 內容。
2. **YouTube 原生字幕 DOM**：如果 KISS 沒有輸出，則讀取 YouTube 播放器中的原生字幕文字。
3. **YouTube JSON3 字幕軌道**：如果原生字幕 DOM 尚未繪製或不可見，使用 YouTube 字幕軌道資料依影片時間同步顯示。

YouTube 目前選取的字幕軌道會優先於預設語言。當播放器沒有公開目前選取的字幕軌道時，VisionPiP 的 fallback 語言偏好為**繁體中文／中文優先，其次為英文**，最後才使用可用的其他字幕軌道。

### 會被自動排除的文字

為避免 YouTube 或 KISS 的介面文字被誤判為字幕，VisionPiP 會排除下列內容：

| 類別 | 範例 |
|---|---|
| 語言名稱 | `中文（繁體）`、`中文 (Traditional)`、`English`、`日本語` |
| 語言選單 | `語言`、`语言`、`Language` |
| 字幕設定 | `字幕設定`、`Subtitle Settings`、`Caption Settings` |
| 一般設定 | `設定`、`设置`、`Settings` |
| 操作提示 | `按一下進入設定`、`點擊進入設定`、`Click to open settings` |
| 播放器選單 | YouTube 設定選單、選單項目、按鈕、下拉選單與隱藏元素 |

這些過濾規則同時套用於 **KISS 字幕**與 **YouTube 原生字幕 fallback**。

## 系統需求

| 項目 | 需求 |
|---|---|
| 瀏覽器 | 支援 Document Picture-in-Picture API 的 Google Chrome。 |
| Chrome 版本 | Chrome 116 或更新版本。 |
| 使用網站 | YouTube 影片頁面，例如 `youtube.com/watch?v=...`。 |
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

目前版本為 **v1.1.5**。更新擴充功能後，建議在 `chrome://extensions/` 點選 VisionPiP 的重新載入按鈕，再重新整理 YouTube 影片頁面，確保新的 content script 已載入。

## 使用方式

### 開啟浮動視窗

進入 YouTube 影片頁面後，將滑鼠移到影片播放器上，點選播放器左上方的 **Open VisionPiP (P)** 按鈕；也可以直接按鍵盤上的 `P`。再次按下 `P`，或在浮動視窗中關閉視窗，即可離開 PiP 模式。

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

## 鍵盤快捷鍵

| 按鍵 | 功能 |
|---|---|
| `P` | 開啟或關閉 VisionPiP。 |
| `Space` 或 `K` | 播放／暫停影片。 |
| `←` | 往前倒退 5 秒。 |
| `→` | 往後前進 5 秒。 |
| `M` | 靜音／取消靜音。 |

## 執行期穩定性處理

VisionPiP 已針對 YouTube 的單頁應用程式導航與字幕載入時序加入額外處理：

- 切換 YouTube 影片時會清除上一部影片的字幕資料，避免舊字幕殘留。
- 播放器 response 會比對目前影片 ID，避免 SPA 換頁時沿用上一部影片的字幕清單。
- 暫停影片後拖曳進度條，字幕會依新的時間立即刷新。
- 如果瀏覽器不支援 `captureStream()` 而改用原生 video 節點，關閉 PiP 或切換影片時會還原原本的 video 節點、位置與 inline style。
- 關閉使用 stream 模式的 PiP 時，會解除 `srcObject` 並清理浮動視窗中的 video 元素。
- KISS 與 YouTube 原生字幕都使用相同的文字與介面元素過濾器。

## 故障排除

### 浮動按鈕沒有出現

請確認目前是在 YouTube 的影片頁面，而不是首頁、搜尋結果或頻道頁面。重新整理頁面後，將滑鼠移到影片播放器上再等待片刻。如果仍然沒有出現，請確認 Chrome 版本支援 Document Picture-in-Picture API。

### 沒有顯示字幕

請先確認影片本身有可用字幕，並在 YouTube 播放器中啟用 CC。若使用 KISS Translator，請確認 KISS 已啟用且確實在影片頁面產生字幕。切換字幕語言後，建議重新整理 YouTube 頁面再開啟 VisionPiP。

### 顯示的是上一部影片的字幕

請先關閉目前的 VisionPiP，再切換 YouTube 影片並重新整理頁面。v1.1.5 已加入 YouTube SPA 換頁時的字幕狀態清理，但不同 YouTube 影片或第三方字幕擴充功能的載入時序仍可能有所不同。

### 仍看到語言名稱或設定文字

請先確認使用的是 v1.1.5 或更新版本，然後在 `chrome://extensions/` 重新載入 VisionPiP，再重新整理 YouTube 頁面。若問題持續，請提供影片頁面、YouTube 字幕語言與出現的實際文字，方便進一步調整過濾規則。

### 關閉 PiP 後 YouTube 影片版面異常

請關閉 PiP 後重新整理 YouTube 頁面。VisionPiP 會在關閉時還原原生 video 節點與原本樣式；若其他影片擴充功能同時修改播放器，可能需要重新整理頁面讓各擴充功能重新初始化。

## 專案結構

```text
VisionPiP/
├── manifest.json          # Chrome Manifest V3 設定
├── content.js             # 核心注入腳本、PiP、字幕同步與過濾邏輯
├── content.css            # YouTube 播放器浮動按鈕樣式
├── popup.html             # 擴充功能設定視窗
├── popup.js               # 設定儲存與 PiP 控制
├── icons/                 # 16x16、48x48、128x128 圖示
├── README.md              # 英文版說明文件
├── README.zh-TW.md        # 繁體中文版說明文件
└── LICENSE                # MIT 授權條款
```

## 開發與修改

如果要以未封裝模式測試：

1. 修改 `content.js`、`popup.js` 或相關檔案。
2. 在 `chrome://extensions/` 重新載入 VisionPiP。
3. 重新整理 YouTube 影片頁面，讓新的 content script 生效。
4. 在影片頁面測試 KISS 字幕、YouTube 原生字幕、換片、seek、關閉 PiP 與重新開啟等情境。

發布前請確認 `manifest.json` 位於 ZIP 根目錄，並確認版本號已同步更新。

## 致謝與來源

- 本專案在 **Gemini** 協助下建立與改良，並由 **Manus AI** 進行額外功能修正、字幕 fallback、過濾邏輯與穩定性改善。
- 感謝 [KISS Translator](https://github.com/fishjar/kiss-translator) 提供雙語字幕整合基礎。
- 本專案的 PiP 字幕概念受到 [mehmetkahya0/youtube-pip-subtitles](https://github.com/mehmetkahya0/youtube-pip-subtitles) 啟發與參考，並保留原始作者的開源 attribution。

## 授權條款

本專案採用 [MIT License](LICENSE) 授權。使用或再發布本專案時，請保留原有授權與 attribution 資訊。
