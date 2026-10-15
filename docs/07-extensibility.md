# 07 · 擴充與微調彈性

目標：**未來調整場景或角色時，盡量只改設定檔與資產，不改程式碼**；需要新增功能時，以外掛方式加入而非修改核心。

## 1. 資料驅動

所有「長什麼樣、在哪裡、說什麼」都由設定檔決定：

| 要調整的東西 | 位置 |
|---|---|
| 職能 → 主題身分、服裝 | `themes/<id>/theme.json` → `roles` |
| 狀態 → 動畫、道具、特效、移動到哪個區域 | `theme.json` → `states` |
| 區域、席位 | `theme.json` → `zones`（對應 3D 模型中的錨點） |
| 狀態光、音效 | `theme.json` → `ambient`、`audio` |
| 面板外觀 | `theme.json` → `tokens` |
| 泡泡台詞與模板 | `themes/<id>/bubbles.<locale>.json` |
| 單一 agent 外觀 | Agent manifest → `appearance` |

## 2. 覆寫層級（Cascade）

像 CSS 一樣由下往上疊加，後者覆寫前者：

```
core defaults
  → themes/_base           （所有主題共用）
    → themes/<theme>       （主題）
      → workspace override （你的專案設定 diorama.config.json）
        → agent manifest    （單一 agent）
          → runtime         （UI 中即時調整，可匯出回設定檔）
```

- 物件深度合併；陣列預設取代，可用 `"$merge": "append"` 改為附加。
- 任何欄位可用 `null` 明確移除上層設定。

## 3. 主題繼承

新主題可 `extends` 既有主題，只寫差異：

```json
{ "id": "cic-night-ops", "extends": "cic", "ambient": { "baseLight": "#0a1a2a" } }
```

這讓「CIC 夜戰版」「冬季辦公室」「魔道宗門」之類的變體成本極低。

## 4. 角色微調

- **插槽式外觀**：`head / face / hair / outfit / accessory / badge / prop`，每槽可指定資產 ID 與參數（顏色、縮放）。
- **參數化**：膚色、髮色、服裝主色、身高（±10%）、頭身比（3.0–4.0）皆為參數。
- **跨主題身分**：`hair`、`face` 存於 agent 層級；`outfit` 依主題自動套用，可逐主題覆寫。
- **動畫集對應**：狀態名稱 → 動畫 clip 名稱，可在主題或 agent 層級覆寫（例如某 agent 思考時改成「轉筆」）。

## 5. 場景微調

- **錨點約定**：3D 模型中以命名空節點標示位置，例如 `seat:builder:01`、`zone:meeting`、`prop:wall_display_main`。改佈置只需在 Blender 移動錨點並重新匯出。
- **席位自動擴充**：同職能 agent 超過席位數時，依 `overflow` 規則（加桌、加樓層、開側峰）產生新席位。
- **模組化房間**：場景由多個「房間模組」拼成，可增減房間而不重做整個場景。

## 6. 資產契約（Asset Contract）

為了讓美術、AI 生成或外包的資產都能直接替換：

| 項目 | 規範 |
|---|---|
| 格式 | glTF 2.0 / GLB，Draco 或 Meshopt 壓縮 |
| 骨架 | Humanoid 標準骨架命名（相容 Mixamo / VRM） |
| 角色面數 | LOD0 ≤ 15k tris、LOD1 ≤ 5k、LOD2 ≤ 1.5k |
| 貼圖 | PBR（BaseColor / ORM / Normal），≤ 2K，KTX2 |
| 動畫名稱 | `idle` `think` `type` `talk` `listen` `walk` `sit` `raise_hand` `cheer` `panic` `salute`… |
| 表情 | blendshape：`happy` `focus` `confused` `worried` `shock` `proud` `tired` |

## 7. 版本與相容

- 所有 schema 帶 `"v"` 版本號，遵循 SemVer；破壞性變更提供遷移腳本。
- 未知欄位一律保留、不報錯（向前相容）。
- 主題與面板外掛宣告 `engine` 相容版本範圍。

## 8. 開發者體驗

- **熱重載**：修改 `theme.json` 或台詞檔，場景即時更新。
- **驗證**：CLI `diorama validate` 依 JSON Schema 檢查設定與資產契約。
- **未來：主題編輯器**：在場景中直接拖曳席位、試穿服裝、預覽泡泡，然後匯出設定檔。
- **模擬事件產生器**：不用真的跑 agent，就能播放事件劇本預覽主題效果。
