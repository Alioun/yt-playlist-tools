# Gather controller fixture

The real chain: the canonical session owner (`createLocalFilterWriter` over the removal harness), `createTabs`, `createAddFlow` and `createGather`. Only the browser's tab strip (`GatherNativePort`, `TabNativePort`) and YouTube's in-page jobs (the add-flow harness's execution port) are fakes.

Authored without a runtime lease. Nothing here has run. Commands, once dependencies are restored and a run is approved:

```sh
timeout -k 10 540 bun test tools/fixtures/gather-controller/gather.bun-test.ts
timeout -k 10 540 bunx tsc --noEmit -p tsconfig.json
```

`expected-output.jsonl` states each case's expected observation, written from the spec rows it names, not from a run.

`manual-completion.bun-test.ts` adds 13 cases for the manual completion unit: canonical history across a restart, all-already-in closing and reopening, partial and rejected removal, unreadable reads, navigation before removal, account removal and withdrawal while the batch waits, persisted `kept` and its activation seam, private memory, the real execution adapter over `Tabs.serve`, and Firefox's reopen at the browser boundary. `expected-completion.jsonl` and `completion-controls.json` state its expectations and controls, written from the spec, not from a run. The 14 original tests, 17 expectation lines and `controls.json` are unchanged.

```sh
timeout -k 10 540 bun test tools/fixtures/gather-controller/manual-completion.bun-test.ts
```
