# Session access delivery evidence

## Decisions

- Replace OAuth access without expanding into the full 2.0 rebuild. Keep the current React interface and existing consumers.
- Keep cookies and raw account identity in YouTube's page. Extension messages carry an account digest, private context, consent generation, and original intent deadline.
- Leave old playlist choices saved and inactive. Enumeration does not establish ownership, so legacy claiming is disabled.
- Keep cached account lists read-only without a YouTube tab. Persist titles with the first explicit choice, while untouched accounts and private caches remain unsaved.
- Own consent transitions, account writes, and Clear All Data in the background. Await every deletion before releasing the queue, including failures.
- Bound browser reconciliation to two seconds. If revocation injection fails, wait for old jobs' ten-second lifetime before clearing or regranting. Expired marker injections cannot overwrite a later grant.

## Verification

At executable revision `7fbb80c`, TypeScript and all 316 tests pass. The suite includes real source-level reconciliation and page jobs with controlled browser boundaries. It covers original expiry, revoke/regrant, frozen-tab injection, indefinitely pending injection, late markers, cross-context clear, sibling deletion failure, and first-choice title retention.

Native Firefox 158.0.1 checks installed the final extension in a fresh automated profile and exercised consent, signed-out YouTube detection, native content delivery, both Clear All Data controls, storage deletion, script removal, and no resurrection after a held account write. Final checks covered `7fbb80c` and also passed controlled faults for stalled injection, late marker delivery, and failed sibling deletion. Native Chrome and beta installation were not exercised.

Production-minified serialization checks covered the standalone page function and actual Chrome, Firefox, and beta functions at `7fbb80c`. They verified generation and expiry guards using synthetic YouTube boundaries.

The built popup fixture displayed consent, signed out, no tab, account changed, unavailable, ready, private, and cached states at 340 pixels without horizontal overflow. Fixture consent, revoke, and settings interactions passed.

Two independent Sol reviewers returned no findings on the final fix diff `098ee77..7fbb80c`. Earlier findings were resolved in three fix rounds.

## Limits

No authenticated profile was used. Live signed-in playlist reads, adds, duplicate prevention, account changes, and retained features remain unverified. Synthetic responses do not establish YouTube compatibility or quiet page-command behavior. Already dispatched YouTube writes cannot be undone. Queued transitions can incur multiple generation-retirement waits. The combined clear or revoke/regrant sequence has no proven ten-second bound. Storage deletion has no timeout because a later grant cannot safely overlap a pending deletion.
