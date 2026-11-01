# Auto-add choice consumer

`run.ts` drives the actual canonical owner, Backend, JSON RPC and authenticated native receiver. Its storage and removal ports are deterministic in-memory ports. It makes no video request and returns no fake owner success.

The transcript contains fresh and independent selections, Takes and percentage changes, a stale field, untick and retick with a kept filter, final-choice removal, private refusal, account recreation and an old revoked edit. It checks real cache, progress and session cleanup. The capture UUID never appears in the deterministic output. `expected.json` and `expected.jsonl` are complete authored expectations. They have not been generated from a runtime result.

The commands below are deferred. The later executor needs the sole runtime lease, exact candidate source and qualified upstream reconciliation. This authoring checkout has no installed `node_modules` or generated `.wxt` declarations. The executor must bind approved prepared dependencies and record their current identities. Installation and network access are not authorized here.

```sh
timeout -k 10 120 /usr/local/bin/node node_modules/@typescript/native/bin/tsc --noEmit -p tools/fixtures/auto-add-choice/tsconfig.json
timeout -k 10 120 /opt/homebrew/lib/node_modules/bun/bin/bun.exe test src/shared/contracts/first-run.bun-test.ts src/shared/contracts/auto-add-choice.bun-test.ts src/background/store/auto-add-choice.bun-test.ts src/background/router/first-run.bun-test.ts src/ui/backend/core.bun-test.ts tools/fixtures/auto-add-choice/consumer.bun-test.ts
timeout -k 10 60 /opt/homebrew/lib/node_modules/bun/bin/bun.exe tools/fixtures/auto-add-choice/run.ts
```

Run the direct consumer twice in fresh processes. Compare both full outputs through EOF with `expected.jsonl`. The audit's `gates.json` lists the full regression group, every intended-line negative and each proposed compiling control. None has run in this unit. Passing byte and mode replay proves only the returned source identity.
