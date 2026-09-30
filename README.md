# SwarmCanvas

This build contains the storage/backend command synchronization fix for Local Project and All Outputs.

# swarm-canvas

### Prompt editor improvements

The prompt editor now supports section presets, multi-selection actions, syntax-aware tokenization for nested SwarmUI prompt syntax, Find/Replace, syntax quick insert templates, and explicit separation of editing from tag muting.


## fixed22 changes
- Remote Danbooru tag listing now uses `search[order]` correctly and supports true page-based tag navigation.
- Tag page, feed, search and filter state persists across application restarts.
- Tag type buttons cycle off -> include -> exclude -> off.
- Post cards open their live Danbooru post information on click; the separate Info button was removed.
- External Danbooru URLs use the native Tauri opener in the desktop build.
- Tag & Image Browser can open as a separate Tauri popup window.
- Post pagination is page-based and detects duplicate API pages, preventing repeated post tiles.
