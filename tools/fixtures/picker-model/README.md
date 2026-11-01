# Picker model consumer fixture

`Consumer.svelte` is a minimal Svelte container for `src/shared/picker/model.svelte.ts`. It renders rows, the membership status, search, Sort A-Z and Refresh with plain markup and data attributes, so a test can drive the compiled model through a real component. It is not product UI.

`fake-source.ts` implements `PickerSource` with a ledger. Every port call stays pending until a test answers it, which lets tests order answers to reproduce races. `settle()` waits until given answers have run through the model.

The Bun test that renders the fixture is `src/shared/picker/consumer.bun-test.ts`. Bun's test discovery skips `tools/**`.

Run these from the repository root. They have not been run yet.

```sh
bun test --no-env-file --isolate --conditions=browser ./src/shared/picker/consumer.bun-test.ts
node node_modules/svelte-check/bin/svelte-check --workspace . --tsconfig ./tools/fixtures/picker-model/tsconfig.json --fail-on-warnings
```
