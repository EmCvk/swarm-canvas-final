# Prompt editor update

## Prompt interaction
- Double-click on a prompt pill now enters text editing instead of disabling/commenting the pill.
- Disable/comment a tag from the right-click menu; this separates editing from muting.
- Ctrl/Cmd-click toggles multi-selection; Shift-click expands a selection range.
- Added a bulk selection toolbar with weight +/- controls, explicit-weight reset, mute/enable, copy, move to the other prompt, extract to a new section, delete, and clear selection.
- Editing inputs stop parent mouse events and preserve native text selection.

## Section workflow
- Existing newline-delimited sections now use the same syntax-aware token parser.
- Individual sections can be saved as reusable local presets from the section header bookmark action.
- Section Library was added to the prompt tools and can replace the focused section or append a new section.
- Section presets are included in Prompt Kit JSON export/import.

## Prompt syntax
- Added syntax-aware comma splitting so nested commas inside parentheses and SwarmUI `<...>` syntax remain inside one logical pill.
- SwarmUI syntax quick insert menu adds Random, Alternate, From-To, Wildcard, Repeat, Embedding, Comment, and Parameter templates.
- Cleanup and prompt diff tokenization now also respect nested syntax.

## Prompt utilities
- Added Find / Replace with Active Section, Active Prompt, and Both scopes.
- Added "Effective" copy buttons that remove commented-out tokens before copying.

## Settings
Added:
- Show selection toolbar
- Enable SwarmUI syntax quick insert
- Double-click edits prompt pills

All new settings default to enabled and are migrated into persisted AppSettings.
