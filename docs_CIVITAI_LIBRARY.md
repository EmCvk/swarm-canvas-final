# Civitai Library / Extra Networks Improvements

Implemented:

- Persistent Civitai metadata library independent of SwarmUI's volatile asset catalog.
- Fingerprint-based reattachment across refreshes and file renames/moves when a known hash matches.
- Exact SHA-256, BLAKE3, CRC32, AutoV1/V2/V3, explicit model/version IDs, AIR identifiers, then deep filename/model search.
- Main-model Civitai URL override from the Extra Networks context menu; the override is authoritative and is attempted before bulk hash work for that asset.
- Fresh manual-URL results are cached; stale manual links are revalidated.
- Multiple Civitai preview candidates with version-level and model-level image fallback.
- Remote Civitai previews are cached locally by URL in the desktop build.
- Metadata completeness percentage and explicit matched/partial/unresolved states.
- Favorites, pinned assets, aliases, recent-use tracking, details drawer, and richer context menu actions.
- Unresolved queue with direct manual URL resolution.
- Export/import of the Civitai library.
- Background metadata scan option after asset refresh.
- Structured Civitai resolver diagnostics routed through the app diagnostic event stream.
- Incremental Extra Networks rendering with content-visibility and paged loading.
- More conservative version selection when a local file name does not identify a specific Civitai version.
- Civitai bulk SHA-256 lookup skips assets with manual URL overrides so user-supplied mappings remain first priority.

The desktop cache is app-local by design. This avoids trying to write inside the installed application's resource directory. A portable JSON export can be used to move the library between machines.
