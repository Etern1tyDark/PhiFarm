## PRD 2: `PhiFarm` — OCR-Powered Phigros RKS Farm & Push Optimizer

### 1. Overview & Objective

A client-side web application that ingests a player's **PSL (Phigros Score Lookup) Discord bot** or **`phibot.dev` / `phi-plugin**` summary image (B19 / B27 / B30 / B50 extended grids), extracts their current top chart records via layout-aware OCR, and cross-references them against **intrinsic chart metadata** + **community accuracy percentiles** to generate a mathematically optimal RKS farming roadmap.

### 2. Core Data Architecture (Solving the "No Player DB" Problem)

Instead of maintaining a live backend of user accounts, `PhiFarm` ships with a pre-compiled static JSON bundle (`phigros_meta.json`, ~400KB) built once by Claude Code from open sources:

1. **Intrinsic Chart Physics (parsed from raw chart JSONs via `phibot.dev/files`):**
* `chart_constant` ($C$), `total_notes` ($N$), `tap_count`, `drag_count`, `hold_count`, `flick_count`, `duration_sec`, and `peak_nps`.


2. **Derived Intrinsic Metrics:**
* **Good Tolerance Ratio ($\tau$):** Since Phigros accuracy is $100\% \times \frac{N_{\text{perf}} + 0.65 N_{\text{good}}}{N}$, each `Good` costs $\frac{0.35\%}{N}$ accuracy. High-note-count charts with high `(Drag + Hold) / Total` ratios are intrinsically much easier to hold $99.5\%+$ accuracy on because Drags and Holds **cannot** register as `Good` (only Perfect or Miss).
* **Farmability Score ($F$):**

$$F = w_1 \left(\frac{\text{Drag} + \text{Hold}}{N}\right) + w_2 \left(\frac{\ln(N)}{\text{Peak NPS}}\right) + w_3 (\text{Community AP/Top 10\% Rate})$$




3. **Community Aggregate Priors (from `phib19.top` / `phibot` static tables):**
* Chart-level AP %, FC %, Median Acc, Top 25% Acc, and Top 10% Acc.





### 3. Functional Requirements (FR)

#### FR1: Layout-Aware B30/B50 Image OCR & Parser

Why standard full-image OCR fails on rhythm game grids: running Tesseract blindly on a 4K B30/B50 image scrambles card columns.

* **Template Auto-Detection:** When a user drops an image from **PSL Discord Bot**, **`phibot.dev`**, or **`phi-plugin`**, an HTML5 `<canvas>` pre-processor detects the aspect ratio and header layout to select the matching grid bounding-box template (e.g., 3-column B19/B27, 3-column B30 + Overflow, or 5-column B50).
* **Cell Slicing + Perceptual Hash (pHash) Song Matching:**
* Rather than relying solely on OCR for messy Japanese/Chinese/stylized song titles, the app slices the **jacket illustration thumbnail** from each card and runs a fast 64-bit Perceptual Hash (`dHash`/`pHash`) against pre-computed hashes of all Phigros song jackets (~100% accuracy in `<50ms`).
* Runs lightweight numeric OCR (`Tesseract.js` restricted to `0123456789.%INAT`) on the strictly cropped **Accuracy (`99.85%`)** and **Difficulty (`IN 15.8` / `AT 16.5`)** sub-regions of each card.


* **Quick-Fix Verification Table:** Displays the parsed B30/B50 cards in an editable grid where low-confidence OCR cells are highlighted in yellow for 1-click correction, plus a "Export/Import `.json`" button so the user never has to re-OCR twice.

#### FR2: RKS Math & "Min-Good" Push Calculator

Phigros RKS is calculated from the average of your **Best 27 (or B19 in legacy views) + 3 Phi (100% AP) slots** (total 30 slots, often displayed alongside 10–20 overflow slots in B50 views):


$$\text{Single Chart RKS} = \begin{cases} C & \text{if Acc} = 100\% \\ \left(\frac{\text{Acc} - 55}{45}\right)^2 \times C & \text{if } 70\% \le \text{Acc} < 100\% \\ 0 & \text{if Acc} < 70\% \end{cases}$$

* **Floor Threshold Detection:** Automatically identifies $R_{\text{floor}}$ (the 27th/30th lowest RKS chart in your active calculation) and $R_{\text{phi\_floor}}$ (your lowest AP constant among your top 3 APs).
* **Exact "Good Count" Target:** For every recommended chart, instead of saying *"Get 99.64%,"* PhiFarm calculates the exact integer number of `Good` judgments allowed:

$$\text{Max Goods Allowed} = \left\lfloor \frac{N \times (100 - \text{Target Acc})}{0.35} \right\rfloor$$



*Example output:* **"Play * Igallta [IN 16.0]* — Getting $\le 5$ Goods ($99.78\%$) yields $15.842$ RKS, replacing your #27 slot (+0.008 total RKS)."**

#### FR3: Three Specialized Farming Modes

1. **"Unplayed / Missing Free RKS" Tab:** Filters all Phigros charts with Constant $C > R_{\text{floor}}$ that are **absent** from your B30/B50 grid, ranked by highest Farmability Score $F$ (high drag/hold ratio + high community Top 10% accuracy).
2. **"Dirty Score Cleanup" Tab (Existing B50 Upgrades):** Scans your existing B30 and overflow slots (B31–B50) for charts where your accuracy is below the community 25th/10th percentile or where cutting just 2–4 `Goods` gives the largest $\Delta\text{RKS}$ per Good saved.
3. **"Phi3 (B0) AP Sniper" Tab:** If your 3 AP slots aren't maxed out (or contain a 15.9/16.1), ranks charts with $C > R_{\text{phi\_floor}}$ by highest community AP rate and lowest tap/flick complexity.

#### FR4: Interactive "What-If" RKS Simulator

* Users can drag a `+1 Good / -1 Good` stepper on any card in their B30 or add hypothetical scores to immediately see their total Display RKS (`16.5445` $\rightarrow$ `16.5500`) update live, complete with a "Minimum Path to Next 0.01 RKS" banner.

---
