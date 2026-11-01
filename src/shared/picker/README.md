# Shared playlist picker model

`PickerModel` is the one playlist-picker behaviour for the popup's sheet, the choosers in settings and on the first-run page, and both sites' `popovers.js` (06 §6.4.1, UI-PICK-01). Containers draw it and wire DOM events. The model holds no DOM, browser API, storage, timer, global or account session.

`source.ts` is the port a container implements. `PickerSource` carries one account's facts for one open and every request the model may make. `ItemPort` carries the item's membership read, add, remove and item-inclusive create. A source whose `item` is null belongs to a settings chooser. The model knows no transport.

`model.svelte.ts` holds the model, its row view, the outcome types and `titleProblem`. Svelte compiles its runes, so every field a container reads is Svelte state.

## Use

```ts
const picker = new PickerModel({ source, site: "www", mode: "save" })
picker.rows                    // search-filtered, in the site's order or A-Z
picker.query = "mix"
picker.membership              // none | checking | known (count) | unreadable
picker.list                    // { at, refreshing, refreshable }
picker.pins                    // available | private | none
picker.creation                // available | private | noTab | signedOut | noChannel
picker.form, picker.titleCheck, picker.creating
await picker.tick(id)          // save: add. choose: pick. many: choose
await picker.untick(id)        // save: remove actual membership. choose, many: change the choice
await picker.pin(id)
await picker.refresh()
await picker.create(title, privacy)
await picker.setSortAZ(on)
picker.close()
```

Every method resolves with an outcome and never throws. A container acts on it. A `picked` outcome closes a choose-mode picker and carries the save, the owner's Undo and the choice result. A save-mode `removed` outcome carries the owner's Undo for the untick's toast. The popup's inline "Removed · Undo" ticks the row again, which YT-PK-05 says also puts the item back.

## Rules the model owns

- Rows paint from `cachedList()` and work before membership arrives. Membership is read whenever the source has an item, in save and choose modes. Save checks mean membership. Choose and many checks mean selected choices. Membership supplies its own set, order and titles, and the list still supplies thumbnails and counts (UI-PICK-04, DATA-21).
- Row results, membership facts and choices live in separate slots, so an answer never erases another slot. A row's own confirmed result outranks an older membership read.
- Each list answer applies only if it is newer than the last one applied. After `close()` no answer changes state and no method calls the source.
- On YouTube, Watch later moves first. On YouTube Music it appears only where the source lists it. Sort A-Z sorts every row by title. Search matches titles case-insensitively in every mode.
- Opening refreshes a cache older than 5 minutes, once. `refresh()` always fetches where a tab exists and joins a fetch already in flight. Without a tab the stamp stays and refresh and creating are unavailable (UI-PICK-25, FT-54).
- A busy row ignores further ticks, unticks and pins. One pick and one creation run at a time. Nothing retries.
- In a private window the model starts no account-setup write: pins, chooser picks, auto-add changes, a first pick's choice and the last visibility (DATA-33). The owner's other refusals come back as `refused` with its reason.

## Held product questions

The membership question is resolved. The remaining entries preserve the authored behaviour pending their policy disposition.

1. Membership in choose mode is settled. UI-PICK-03 lists "the membership status" in every container, and YT-PK-02 says "Membership is fetched fresh each time the picker opens." UI-PICK-08 says a check in choose mode "means 'chosen'". The model reads fresh membership independently of the selected choices.
2. A first pick in a private window. YT-PK-09 says "the pick saves the video but isn't stored as the quick-save playlist", while UI-PICK-10's toast says "One click now saves there." No private wording exists. The model reports `choice: { skipped: "private" }`.
3. A first pick whose save succeeds and whose choice the owner refuses. No clause covers it. The model reports both results in `picked`.
4. A close while a pick is pending. No clause covers it. The model starts no choice write after close, so the save can land without the choice.
5. Where a created playlist sits before YouTube lists it. YT-NEW-06 says only "shown in every playlist list until YouTube's own list includes it". The model lists it first, after Watch later on YouTube.

The 150-character title limit is "PROVISIONAL (ticket 25: the title limit)" in YT-NEW-02.

## Not in the model

Containers own keyboard handling and focus (UI-PICK-12), copy, toasts, the popup's 6 s inline Undo and relative-time text. "Enter in the search ticks the first match" is `picker.tick(picker.rows[0].id)`. The store and AddFlow own the 24-hour created-playlist cache, Missing-mark clearing, the untick's session skip and the order of adds and removals.

## Checks

`model.bun-test.ts` drives the compiled model through `tools/fixtures/picker-model/fake-source.ts`. `consumer.bun-test.ts` renders `tools/fixtures/picker-model/Consumer.svelte`. `model.type-test.ts` holds compile-time proofs. These checks have not been run yet:

```sh
bun test --no-env-file --isolate --conditions=browser ./src/shared/picker/model.bun-test.ts ./src/shared/picker/consumer.bun-test.ts
bun run compile
node node_modules/svelte-check/bin/svelte-check --tsgo --workspace tools/fixtures/picker-model --tsconfig ./tsconfig.json --fail-on-warnings
bun test --no-env-file --isolate --conditions=browser ./tests/guards
```


The authored browser Backend list operation in `src/ui/backend/playlist-list/operation.ts` supplies `cachedList` and `freshList` with these existing signatures. Its lifetime belongs to the UI caller, which disposes it when the picker closes or the source changes. See `tools/fixtures/ui-playlist-progressive/README.md` for the finite RPC protocol and its unexecuted qualification gates. This does not settle any pending picker policy or qualify a production renderer.
