# Pure watch tracker

`tracker.ts` implements YT-AA-13 through YT-AA-18 and YT-AA-24 through YT-AA-37. It imports only canonical model types. It has no clock, timers, browser, media, storage, or DOM access. Existing auto-add consumers remain separate until the site migration.

`Tracker` is one immutable playback. A new playback receives a new tracker, including when the same video returns after navigation or a Shorts swipe. `TrackerSettings.playlists` accepts the canonical `Setup.autoAdd` entries. `defaultPct` accepts the shared default. `kind` describes the player, so a Short opened on a watch page uses `videos`.

The public functions are:

- `createTracker` creates a playback with optional remembered portions.
- `recordReading` accumulates unique played portions without issuing destinations.
- `updateTracker` replaces video facts or patches settings without issuing destinations.
- `evaluateGoals` returns due playlist IDs and the next tracker with those destinations in flight.
- `recordOutcome` settles one of this tracker's in-flight destinations.
- `progress` returns counted seconds, percentage, whether samples are needed, whether every taking playlist succeeded, and progress for a later visit.

Callers retain the returned tracker after each operation. They evaluate goals after readings and settings or facts changes. A removed skip therefore checks the existing progress immediately. Evaluation does not apply channel filters or read membership. Those decisions belong to the add flow after the session-skip check, using the channel at the moment the add starts.

`Reading.at`, `position`, and both durations use seconds. `at` is an injected monotonic clock. The feed supplies finite nonnegative positions, positive finite playback rates, and positive finite durations or `null` for unknown lengths. Percentages and playlist entries come from the decoded model. Playlist IDs in the settings are unique.

Each `playing` reading describes content playback from the recognized counting player. A rate change needs a reading at the change, with the new rate. The preceding reading's rate checks the interval that just finished. Pauses, buffering, seeks, ads, and ends interrupt continuity. The first content reading after an interruption establishes a new baseline. A final valid content reading before an interruption can close its preceding stretch. An ad reading carries no media position or duration.

The feed owns player recognition and matching the navigation's video ID. The tracker rejects readings for another video. Video facts encode clips, made-for-kids videos, listed and player durations, and the live flags. A duration disagreement over two seconds invalidates this playback. A later agreement does not re-enable it. A stream that becomes a fixed-length replay starts fresh continuity without live credit.

Goals use the union of played portions, including gaps of at most one second. Remembered portions and this visit's portions stay separate until duration checks establish whether the remembered length still matches. Unknown length permits accumulation without firing a goal.

Issuing a destination reserves its one run for this playback. `added` and `already-in` are the only successful outcomes. `filtered` and `failed` settle the run while preserving progress. `skipped` releases the reservation and preserves progress, allowing a later unskip to issue it again. An in-flight add can finish after its playlist is unticked. Settings changes affect subsequent evaluations.

`progress().needsSamples` is false when every taking playlist has reached its goal, including skipped playlists. A skip still needs samples while its goal is pending. Evaluation clears the playback baseline when no samples are needed. A later settings change therefore cannot credit an interval while the feed was detached. `hasRun` requires successful outcomes for every currently taking playlist. A reached goal or an in-flight add cannot clear progress. A completed run returns `remembered: null`, while counted portions remain available during this playback for status and newly selected playlists.

The remembered value is an exact domain snapshot, not a storage document or a write instruction. The integration owns DATA-24 through DATA-29 serialization, the 100-portion cap, 0.1-second storage precision, expiry, private-window handling, and DATA-27 checkpoints. Unknown length returns only previously remembered progress until a length becomes available. A playback that cannot be measured preserves eligible progress from an earlier visit and discards this visit's portions.

Explicit adds bypass this tracker, session skips, and channel filters. Only auto-add outcomes for the emitted destinations go to `recordOutcome`.

Focused verification uses `bun test ./src/site/features/auto-add/tracker.bun-test.ts ./src/shared/rules/channel-filter.bun-test.ts` and `bun run compile`. Run `bun run test:bun` for the full Bun suite, which discovers both test files automatically.
