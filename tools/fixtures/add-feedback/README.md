# Add feedback fixture

This command plays a fixed sequence of synthetic adds through the real feedback modules and prints one JSON line per add.

```sh
bun --no-env-file tools/fixtures/add-feedback/run.ts
```

Each raw gateway answer passes `isJobFailure` before `failureOf` reads it, so a malformed answer is rejected at the boundary. The command keeps one shown-once set per tab and one per session, as the future add flow will, and applies each plan's `remember` keys. Its output covers feedback off, the per-tab account change, the once-per-session unknown-channel note, the silent signed-out auto-add, explicit answers, pending, the no-playlist hint, a four-playlist list, an ordinary picker tick that raises no toast and YouTube Music wording.

`runAddFeedbackFixture()` returns the same records for a caller. Nothing here touches a browser, storage or YouTube.

An `unavailable` gateway answer produces the generic Save or menu copy on both sites. It does not establish that the connection is offline. The synthetic `notSent` fixture input represents a caller that observed an unsent request and reports `not-sent` directly. Those steps retain the exact "Check your connection." copy on both sites.
