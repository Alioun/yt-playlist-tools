# Shared shortcut engine

`index.ts` exports pure shortcut rules using `Key`, `Settings`, and `Shortcut` from `shared/model`. Inputs must already satisfy the model. Functions preserve inputs and unknown settings fields. Returned settings share untouched branches with the input, so callers treat both as immutable.

## Matching

`bindingsForSite(settings, { site, undoAvailable })` selects live bindings for `www` or `music`. It includes Undo while a shortcut feature or an Undo toast needs it. The Music section switch gates every Music binding. Feature health does not remove a binding.

`match(facts, bindings, context)` returns the first matching `Binding` or `null`. Modifiers match exactly. ASCII letters and digits compare by character when the recorded key has `char`. Other presses compare `code`. `keyMatches` exposes that comparison. `keysOverlap` checks equal-modifier character aliases or physical-code aliases for conflicts.

`KeyFacts.altGraph` is required. The caller projects it from `event.getModifierState("AltGraph")`. `MatchContext` supplies menu, dialog, and per-target pending state. Its `path` describes the complete composed path, including shadow hosts. Each descriptor carries its tag, input type, effective `isContentEditable` state or contenteditable attribute, and role. `isTyping(path)` exposes the editable-field rule.

The caller owns top-frame capture listener registration, focus, lifecycle, and action dispatch. For a non-null match, it calls both `preventDefault()` and `stopImmediatePropagation()`. A null result passes through untouched.

## Assignment and presets

`ShortcutTarget` distinguishes a playlist shortcut ID, YouTube picker, Music action, or shared Undo. Playlist shortcuts and Undo reserve both sites even when their features, Music option, or Music section are off. The YouTube picker reserves only YouTube. Music actions reserve only Music.

`findConflicts(settings, target, key)` excludes the target itself and returns conflicting targets with their shared sites. `assignKey(settings, target, key, replaceConflicts?)` returns `missing-target`, `conflict`, or `assigned`. Explicit replacement clears all conflicts in the returned settings. Clearing a key leaves labels and playlist choices intact.

`applyPresets(settings, request)` applies the approved playlist or Music preset once, sets its shared flag, and returns blocked keys with their conflicts. It does not enable a feature. Existing choices survive. A playlist request supplies a fresh six-character shortcut ID. Invalid or duplicate IDs throw `TypeError`; a full list throws `RangeError`. Migration marks the playlist preset applied before this function runs, preventing a Watch Later preset for upgraders.

Blocked preset reasons are returned, not persisted in a second schema. The activation caller can retain each offered key and derive a current reason with `findConflicts`.

## Recorder and presentation

`recorder(state, event, context)` reduces `idle`, `recording`, and `conflict` states. Events cover start, clear, keydown, keyup, blur, close, cancel, and use-here. Every step returns its next state, `consume`, and an outcome of `none`, `cancelled`, or `commit`. A commit includes the candidate key and conflicting targets to clear. The caller applies it through `assignKey` against current settings in its atomic write. Use-here refreshes conflicts against the supplied current settings.

Tab and Shift+Tab cancel with `consume: false`. Escape cancels with `consume: true`. Blur, outside clicks represented as blur, close, and cancel preserve the old key. IME and repeat events pass through. Refusal codes distinguish plain Enter or Space, Ctrl+Alt or AltGr, reserved browser keys, and unsupported physical codes. Modifier-only presses update the preview without committing.

`display(key, os)` formats keycaps. `displayModifiers(modifiers, os)` formats the live modifier preview. `isReserved(key, platform)` checks browser policy. `shortcutWarnings(key, { sites, platform, commands })` returns site, browser, and any-tab command warnings. The caller supplies command keys, including keys whose feature is disabled. Messages and rendering belong to the UI.

## Policy sources and limits

The approved rules are [YT-KEY-01 through YT-KEY-34](../../../.scratch/rebuild/spec/02-youtube.md#28-playlist-shortcuts-the-picker-key-and-the-undo-key), [YM-KEY and YM-PS](../../../.scratch/rebuild/spec/03-youtube-music.md#12-keys-quick-action-shortcuts), [FT-04 through FT-06](../../../.scratch/rebuild/spec/04-features-accounts-data.md#11-the-features), and [UI-PICK-23 and UI-PICK-24](../../../.scratch/rebuild/spec/05-ui.md#the-key-recorder). The supplied chapter contains no YT-KEY-35.

The browser tables preserve the approved reservations and menu-key list. OS mappings were checked on 2026-10-24 against [Chromium's accelerators](https://github.com/chromium/chromium/blob/main/chrome/browser/ui/accelerator_table.cc), [Chromium's macOS accelerators](https://github.com/chromium/chromium/blob/main/chrome/browser/ui/cocoa/accelerators_cocoa.mm), and [Firefox's key sets](https://github.com/mozilla-firefox/firefox/blob/main/browser/base/content/browser-sets.inc.xhtml). The primary modifier is Meta on macOS and Ctrl elsewhere. Firefox Quit uses Ctrl+Shift+Q on Windows, Ctrl+Q on Linux, and Meta+Q on macOS. Chrome's OS-specific Quit and Ctrl+F4 and reverse-tab reservations are included. Music warning details use the existing research branch's recorded HOTKEY_DIALOG as evidence, subordinate to the approved spec.

Warnings cover the enumerated site keys, browser menu keys, and the browser actions listed in `policy.ts`. They are not an exhaustive list of every browser or OS shortcut. Other extensions' keys cannot be detected. Physical fallback retains the specified non-QWERTY macOS preset limitation. Non-ASCII recording labels use the physical key name because canonical `Key.char` permits only ASCII letters and digits.

## Verification

`bun test --isolate --conditions=browser ./src/shared/keys/engine.bun-test.ts` runs the adjacent behavioral tests. `bun run compile` checks types. The parent must add `src/shared/keys` to the normal Bun test command, whose explicit paths currently exclude this directory. Browser event projection, focus behavior, listener cleanup, rendering, and storage integration need consumer-level browser verification.
