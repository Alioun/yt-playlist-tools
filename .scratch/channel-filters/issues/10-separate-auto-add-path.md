# 10: Separate auto-add from the shortcut path

**What to build:** a prefactor that changes no behaviour. The background's auto-add message gets its own path: it runs the existing duplicate check for each auto-add playlist first, still showing the "already in playlist" toast, then hands only the remaining playlists to the shared add step. The keyboard shortcut keeps calling the shared add step directly and never goes through the auto-add path. This gives channel filters exactly one place to plug in, and it keeps filtering auto-add-only by construction.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Base branch:** `main` if [Alioun/yt-playlist-tools#2](https://github.com/Alioun/yt-playlist-tools/pull/2) (WXT migration) has merged. Otherwise branch off `feat/wxt-migration` and retarget to `main` once it merges. One branch and one PR for this ticket.

**Spec:** [Per-playlist channel filters](../spec.md), "Auto-add flow (background)". Terms are as defined in `GLOSSARY.md`.

- [ ] Auto-add runs the duplicate check per playlist before the add step; the shortcut path is unchanged.
- [ ] Existing toasts are unchanged on both paths: added, duplicate, failed, no playlists selected, and no access token.
- [ ] Background tests cover auto-add with a mix of duplicate and new playlists, and confirm the shortcut add is unaffected.
- [ ] `bun run compile` and the full test suite pass.
