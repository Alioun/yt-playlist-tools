# First green full test run, 2026-11-01

Commit `b7fce8322` on `2.0/compose-units`, run serially from 19:42 to 20:22 UTC. Raw logs are in `.audit/full-run-b7fce832/` in the compose worktree and aren't committed.

| Check | Result |
| --- | --- |
| `bun run compile` | 0 errors |
| `test:legacy` (Vitest) | 322 pass, 0 fail |
| `test:bun`, 10 shards | 3,774 pass, 0 fail |
| `test:fixtures`, 4 shards | 143 gates, 143 pass, 0 timeout |

Every shard exited 0. The live-reads fix, the G17 follow-ups (R177) and tombstone expiry (G18, R178) landed since the previous run.

A green suite is not a finished 2.0. See `status.md` for unbuilt and unwired work, and checks the suite doesn't cover.
