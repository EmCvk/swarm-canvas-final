# SwarmCanvas Civitai Library

The desktop/Tauri build stores the live Civitai metadata database and downloaded preview cache in the OS app-local data directory so Windows sleep/lock/reconnects cannot overwrite it with a fresh SwarmUI asset list.

The Extra Networks > Civitai Metadata dialog provides Export/Import, cache status, automatic background scanning, and cache clearing. Use **Copy Cache Location** to find the exact directory on the current machine.

The `data/civitai` directory is intentionally kept as the project-side portability/documentation location. The library can be exported as JSON and imported on another installation.
