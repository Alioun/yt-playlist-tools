# The add coordinator fixture

`run.ts` calls the real coordinator through the synthetic executor and owner in `harness.ts`. It authors a compact session covering signed-out and ordinary adds, older-entry untick, one-use restoration, missing-entry-ID fallback, rate limits, gathers, mixed batch outcomes and stopping after a confirmed addition. It prints actual reports and sent job identities. It has not run.

The executor models ordered playlist entries, including multiple copies of one video. Exact removal drops one entry. Video removal follows the synthetic Save-dialog operation. This is not proof of a real YouTube request or response.

The runtime lease holder can run `timeout -k 10 120 bun --no-env-file tools/fixtures/add-flow/run.ts`. The acceptance checklist also requires byte-identical repeat runs and the compiling sensitivity proposals. No dependency installation is needed.
