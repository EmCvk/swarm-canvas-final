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
