# First full test run, 2026-11-01

Commit `2dd9838b3` on `2.0/compose-units`, run serially from 16:28 to 17:22 UTC. Raw logs are in `.audit/full-run-2dd9838b/` in the compose worktree and aren't committed.

| Check | Result |
| --- | --- |
| `bun run compile` | 0 errors |
| `test:legacy` (Vitest) | 17 files, 322 pass |
| `test:bun`, 10 shards | 3,749 pass, 4 fail |
| `test:fixtures`, 4 shards | 143 gates, 143 pass |

## The 4 Bun failures

- Three timeouts under machine load (load average 14 to 23). Each passes alone:
  - `local-filter-writer.bun-test.ts`: "actual unchanged fixture worker receives kept Filters manually on start and on area events" and "kept receiver wrong alternatives fail at intended observations without checkout mutations". The file passes 78 of 78 alone.
  - `interim-persistence.bun-test.ts`: "the actual command confirms complete retention and reads it across discarded owner lifetimes" (62 s). The file passes 12 of 12 alone.
- One real failure, from the frozen source: `src/page/live-reads.bun-test.ts:170`, "an ad event survives media listener release and reacquisition while nav remains watched". After reacquisition the ad event arrives as a full snapshot with `"ad": false`.
