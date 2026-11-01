# Card menu qualification

`harness.ts` supplies validated complete TabView values to the actual FeatureHost and Scope, defines the actual `cardMenuFeature`, and connects it to the actual PageLink over the direct page channel with `servePage`. The synthetic parts are the card markup, the view specimens, the gateway operations behind `servePage` and the recording notice collaborator. Items recognition runs unmodified on the markup. An optional gate holds the account digest so PageLink stays `connecting`.

`../../../src/site/features/card-menu/card-menu.bun-test.ts` covers inert construction, the single capture listener, thumbnail, title, nested text and empty area, every preserved case, another card's button, hidden and missing buttons, default and changed `keepLinkMenu`, Shift, an open shadow boundary, an event already cancelled, signed out, absent setup, a detached renderer, a PageLink that is not ready, a delayed failure, revocation while a job is pending, off/on and disposal, the not-working notice request, the actual NoticeOwner with existing localized copy, and the source graph. Each test checks `defaultPrevented` synchronously, apart from the job result. No DOM test proves that a native browser menu appeared.

`run.ts` is the deterministic consumer. `expected.jsonl` is its complete authored output through EOF, written by reading the source, not by execution. `check-consumer.py` compares all bytes.

`source-graph.ts` follows static value imports from the feature. The test requires exactly the feature, Items, Scope and shared validation, with no package. The bundle-size gate is the authoritative check for what ships.

`controls.json` holds nine compiling mutation proposals with unique anchors, the named test that must fail, and baseline, apply, mutant compiler, red, restore and restored commands. `type-probes.json` holds seven intended-line negatives and five positive controls. `apply-case.py` applies and restores one case inside a disposable reconstruction after checking the recorded source identity. `unexecuted-gates.json` lists the compiler, behavior, consumer, guard, regression and bundle-size commands with pinned executables. `inherited-inventories.json` preserves the reused units' inventories by identity with no credit.

Every gate is unexecuted. The launcher named in the gates does not exist and is not approved. Dependencies are missing and their restoration awaits separate approval.
