# SwarmCanvas UI / Reliability Update

## UI and usability
- Ported the polished Canvas / Animation Lab application shell, navigation, workspace styling, controls, focus states, scrollbars, mobile layout, and Dockview visual treatment.
- Preserved the existing generation workflow and companion panels.
- Added incremental loading to Extra Networks so catalogs can exceed 100 visible items without rendering thousands of cards at once.
- Added clearer Civitai match status, a retry-oriented sync action, asset refresh tooltip, and consistent model placeholders.

## Civitai metadata
- Exact lookup now prefers SHA256, BLAKE3, CRC32, AutoV1/2/3 and explicit model/version IDs before filename matching.
- Added bulk SHA256 lookup (up to 100 hashes per request) to reduce API traffic for large catalogs.
- Filename matching now uses multiple normalized query forms and cursor pagination, with a type-filter fallback when indexing/type metadata is incomplete.
- Successful metadata is cached; failed/unmatched entries remain retryable.
- Metadata status and match method are retained with catalog entries.

## Extra Networks thumbnails
- External Civitai/CDN preview URLs are no longer incorrectly rewritten into local `/View` URLs.
- Thumbnail rendering now uses lazy loading and a fallback chain for localhost/127.0.0.1 and Civitai CDN width/original URL variants before showing a placeholder.
- The same fallback behavior remains available to history/gallery images through the shared error handler.

## Performance / correctness
- Reduced high-frequency store subscriptions in expensive Workspace panels using Zustand shallow selectors.
- Debounced Dockview layout persistence and avoided unnecessary resize persistence churn.
- Removed high-frequency generation-preview logging from the React update path while keeping the diagnostics console.
- Restored browser caching for the static tag-database worker path.
- Optimized the Danbooru validation script's category/description matching from repeated linear scans to normalized lookup maps.
- Removed unused duplicate Workspace source copies.

## Validation
- `npm exec tsc -- --noEmit` passes with strict unused-code checks.
- `git diff --check` passes.
- Civitai bulk-lookup flow was exercised with a mocked API response and passed.
- Danbooru data validation completes successfully after the lookup optimization.
- A full Vite bundle could not be executed in the provided Linux environment because the uploaded dependency tree lacks Rollup's Linux native optional package (`@rollup/rollup-linux-x64-gnu`). Run `npm install` on the target development machine before `npm run build`.

## Run
```bash
npm install
npm run dev
```

---

# Hive theme, new identity and app icon

- **New default theme "Hive"** (`src/theme-hive.css`, loaded after `index.css`). Lifted graphite panels around the
  darkest surface (the image canvas), neutral controls, and a single honey accent used only for the active or primary
  element (active tab, Generate, focus ring, selection). It is an ordinary theme (`data-ui-theme="hive"`), so it runs through
  the same token-remapping rules as every non-Obsidian theme. Obsidian and the other 15 themes are unchanged and still
  selectable in Settings. People still on the old default move to Hive once (`settings.hiveThemeOffered`).
- **Type**, using faces that ship with the OS (no downloads, works offline): Segoe UI Variable for reading, Bahnschrift for
  panel titles / tabs / wordmark, Cascadia Mono for numbers and file names. Other platforms fall back to system fonts.
- **App icon and mark.** Three honeycomb cells: the lit (honey) cell, a cell holding a generated image, and the empty cell
  waiting for the next one. Sources: `public/swarmcanvas.svg` and `src/components/BrandMark.tsx` (same geometry). All Tauri
  icon files in `src-tauri/icons` were regenerated from it (PNG sizes, `icon.ico` with 16-256 px, `icon.icns`).
  The cells settle in once when the app opens and pulse in sequence while a generation is running.
- **Page and window title** are now "SwarmCanvas" (the page still said "Tauri + React + Typescript"); favicon is the new mark.
- **Empty states.** An empty model/LoRA/embedding list now says why and offers "Refresh from SwarmUI"; an empty filter result
  offers "Clear search and filters".
- Colour contrast of the text tokens was checked against the panel surfaces (body text 10-15:1, muted 6-7:1, dim >= 4.8:1).

To revert: Settings -> Theme -> Obsidian.

---

# Hive Studio: a different layout, not just a palette

Selecting the **Hive** theme now switches the whole workspace to a different interface (`src/components/HiveStudio.tsx`,
`src/hive-studio.css`). Every other theme keeps the Dockview layout exactly as before.

```
 rail    drawer            stage                           
 [mark]  one tool panel    full-height viewport            
 Settings  at a time,      recent-generations filmstrip    
 Models    resizable       prompt composer + Generate      
 Detailer  (the same                                       
 Control   panels the                                      
 History   classic layout                                  
 Gallery   uses)                                           
 Civitai                                                   
 Studio                                                    
```

- No top bar and no bottom tray. Status lives on the brand mark (green / red / blue dot), the job count and model count sit
  next to Generate, and utilities (command palette, console, shortcuts, simplified layout, settings) are at the bottom of the rail.
- Tools open in a drawer; panels stay mounted once opened so search text, scroll position and edits survive switching tools.
  Click the active tool again to hide the drawer. Drag its edge to resize, or use the width button.
- "Studio" opens a launcher for the companion panels (art director, scene stager, tag tools, ...).
- Image opens that target the Generation Viewer show it as an overlay (Esc closes).
- The filmstrip shows the 40 most recent generations; clicking one opens it in the viewport like History does.
- Layout state (open tool, drawer width, composer open/height) is remembered in localStorage (`sc_hive_*`).
- Below 768 px wide the existing mobile layout is used. The prompt tray is not mounted in Hive (the composer hosts the
  editor), so there is only ever one prompt editor.
- Not available in Hive: workspace presets, the "add panel" menu, section zoom and docking. They are Dockview features;
  pick another theme to use them.

---

# Tower and Genko: two more whole-workspace interfaces

Hive, Tower and Genko each replace the tiled Dockview layout with their own interface (selecting any of them in
Settings -> Theme or the theme menu). They share helpers in `src/components/studio/shared.tsx` and `src/studio-shared.css`
(panel hosting, filmstrip, viewer overlay, icons, tool lists) and receive the app's panels and callbacks as props.
`Workspace.tsx` chooses between them with one switch (`isStudioLayout` / `StudioShell`). Every other theme keeps Dockview.

## Tower (`TowerStudio.tsx`, `theme-tower.css`): the quality-of-life layout

Subject: air-traffic control / cockpit displays; colours follow their conventions (cyan = selected, green = engaged,
amber = caution, magenta = in progress). Everything you touch is on screen at once; nothing hides in a drawer.

- **Vitals bar**: link lamp, model switcher (a dropdown of every checkpoint), queue count, live progress
  (step n/N, percent, ETA) and the usual utilities.
- **Left column**: the prompt editor, **LoRA chips** (every `<lora:name:weight>` in the prompt as a chip with -/+ weight
  in 0.05 steps and a remove button; the prompt text is edited in place), **quick controls** (aspect buttons that keep the
  pixel count and snap to 64, swap, steps / CFG / batch steppers, seed with a random button), **Seed from image**,
  **Reuse settings** (loads the prompt, model, size, steps, CFG, seed and sampler of the image in the viewport) and Generate.
- **Centre**: the viewport, plus a filmstrip of recent images.
- **Right column**: eight tabs (Models, Settings, Detailer, Control, History, Gallery, Civitai, Studio).
- **Shortcuts** (a hint bar lists them; the keyboard button brings it back): `Alt+1..8` tabs, `Alt+B` / `Alt+L` hide the
  columns, `[` `]` or `,` `.` browse images (not while typing). `Ctrl+Enter` and `Ctrl+K` are the existing shortcuts.
  AltGr (Ctrl+Alt) is never treated as a shortcut, so international keyboard layouts are unaffected.
- Side columns shrink before the stage does; drag the edges to resize. State is stored under `sc_tower_*`.

## Genko (`GenkoStudio.tsx`, `theme-genko.css`): manuscript pages (light)

Subject: manga manuscript paper: pale-blue guide grid, ink-black frames with hard offset shadows, red editor's pencil.
The app is split into full-screen pages instead of tiles or a drawer. The title strip (page tabs, status, Generate!) is
always visible and the progress shows as a white ink line across its red rule.

- **Draw**: prompt frame, viewport frame, a numbered storyboard strip, and a settings frame (Settings / Detailer / Control).
- **Library**: the model browser gets a whole page (big cards); Civitai sits beside it and can be hidden.
- **Archive**: history and gallery side by side.
- **Studio**: the companion tools as a list plus the open tool.
- `Alt+1..4` switch pages. Pages mount when first visited and then stay alive, so the viewport and search boxes keep
  their state. Frame sizes are stored under `sc_genko_*`.

Notes for all three: the prompt editor is mounted exactly once (the Studio lists deliberately omit "Prompt pills"); the
Generation Viewer opens as an overlay; below 768 px wide the existing mobile layout is used.
