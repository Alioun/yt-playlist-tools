# Queue button qualification inventory

This directory holds the unexecuted proof plan for `src/site/features/queue-button/` and `src/site/kit/overlay/`. Nothing here has run. No row has credit.

`harness.ts` builds the real chain: PageLink over the real page endpoint (`servePage`) with a scripted gateway, ExtLink over the memory runtime, FeatureHost, Scope, Pointer, WwwItems, the overlay kit and a FeedbackSession with the real toaster and core Undo key. The fakes are the page-world gateway answers, `elementsFromPoint`, focus-visible matching, offset and client boxes, and the window timers.

`expected.jsonl` lists every authored test with its expected result and ends with an EOF record. `compare-expected.py` compares a captured reporter output with it. `negatives.json` names each `@ts-expect-error` with its intended line. `controls.json` names the compiling positive lines of the same program. `mutations.json` holds compiling behavioral mutations with exact anchors and the tests each must turn red. `check-mutations.py` checks the anchors statically. `attribution.json` maps all 24 rows and the six cross-references to source and tests. `obligation-rows.json` recomputes each row's spec text hash. `dependency-identities.json` pins the collaborators and test support from the frozen input. `unexecuted-gates.json` lists the future commands.

Every gate needs a later sole lease, verified dependencies and dummy-fixture enforcement of the command boundary first.
