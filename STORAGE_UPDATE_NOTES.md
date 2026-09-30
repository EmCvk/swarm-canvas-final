# SwarmCanvas Storage Update — fixed16

- Fixed the Rust nested-Result compile error in `swarmcanvas_scan_output_folder_pages` (`spawn_blocking(...).await` now unwraps both the task result and command result).
- Removed the legacy code-page risk from the Windows Local Project folder picker by forcing PowerShell/Console stdout to UTF-8 and rejecting invalid UTF-8 instead of silently replacing characters.
- Unicode Windows paths such as `Masaüstü` are kept as real filesystem paths; they are not normalized through ASCII-only sanitization.
- Hardened Zustand persistence: version 7 plus a deep `merge` against current settings defaults prevents newly added settings keys from becoming undefined when an older persisted settings object is rehydrated. Nested `sectionScales` and `panelViewModes` are merged too.
- Bumped the storage backend version to 4 so the frontend can distinguish this Tauri binary from older builds.

- Fixed the `spawn_blocking` nested `Result` type in the paged All Outputs command so `cargo check` no longer stops at E0308 on `scan_output_folder_pages`.
- Hardened the Windows folder chooser for Turkish/Unicode paths by explicitly emitting UTF-8.
- Added a robust settings rehydration merge and version bump so missing settings keys are restored instead of being lost when older persisted state is loaded.
- Native output-image resolution now accepts absolute Windows paths and falls back to a basename search for nested dated/raw Stability Matrix output layouts.
