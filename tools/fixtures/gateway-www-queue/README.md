# Gateway www queue fixture

Synthetic behavior tests and one composed JSONL consumer for the canonical www page operations `queueAdd`, `queueUndo`, `queueAddList` and `openCardMenu`. Nothing here has run. The authoring unit had no runtime lease.

The tests drive the real `createGateway`, app-state lane, account guard, route table, `src/page/gateway/www-queue.ts` decisions and `src/page/parsers/www-queue.ts` parsers. The only fake is the `WwwQueuePort` native boundary in `specimens.ts`, plus `scriptedPage` for config and target data. `run.ts` adds `servePage`, the direct and DOM page channels and `createPageLink`.

`expected-output.jsonl` was written separately from the expected records in `run.ts`. The consumer test checks that the direct run, the DOM run, the in-code records and the file all agree byte for byte.

`controls.json` lists the intended-line negatives and compiling controls. Each names the authored test that must turn red.

## Future gates

Run them only under a granted synthetic runtime lease, after the dummy-fixture boundary is proved. Every Bun command and its descendants needs `--no-env-file` and `--no-install`, a cleared environment, a pinned executable and `PATH`, a scratch `HOME` and `TMPDIR`, and closed stdin. `$BUN` is the pinned absolute Bun path and `$SCRATCH` a fresh scratch directory. Run each command from the sealed source root.

```sh
env -i PATH=/usr/bin:/bin HOME="$SCRATCH/home" TMPDIR="$SCRATCH/tmp" timeout -k 10 300 "$BUN" --no-env-file --no-install x tsc -p tools/fixtures/gateway-www-queue/tsconfig.json < /dev/null
env -i PATH=/usr/bin:/bin HOME="$SCRATCH/home" TMPDIR="$SCRATCH/tmp" timeout -k 10 540 "$BUN" --no-env-file --no-install x tsc -p tsconfig.json < /dev/null
env -i PATH=/usr/bin:/bin HOME="$SCRATCH/home" TMPDIR="$SCRATCH/tmp" timeout -k 10 300 "$BUN" --no-env-file --no-install test --config tools/fixtures/gateway-www-queue/bunfig.toml tools/fixtures/gateway-www-queue/gateway.bun-test.ts tools/fixtures/gateway-www-queue/consumer.bun-test.ts < /dev/null
env -i PATH=/usr/bin:/bin HOME="$SCRATCH/home" TMPDIR="$SCRATCH/tmp" timeout -k 10 120 "$BUN" --no-env-file --no-install tools/fixtures/gateway-www-queue/run.ts direct < /dev/null > "$SCRATCH/direct.jsonl"
env -i PATH=/usr/bin:/bin HOME="$SCRATCH/home" TMPDIR="$SCRATCH/tmp" timeout -k 10 120 "$BUN" --no-env-file --no-install tools/fixtures/gateway-www-queue/run.ts dom < /dev/null > "$SCRATCH/dom.jsonl"
cmp "$SCRATCH/direct.jsonl" tools/fixtures/gateway-www-queue/expected-output.jsonl && cmp "$SCRATCH/dom.jsonl" "$SCRATCH/direct.jsonl"
```

Run each consumer twice through EOF. Rerun the inherited gateway-playlists, gateway-reads, page-channel, page-link, Items, Music ad transport and architecture suites unchanged. Prove each control in `controls.json` with the protocol listed there.
