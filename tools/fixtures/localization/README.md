# Localization fixtures

These fixtures are authored and unexecuted. The authoring unit has no product runtime lease.

`scripted.ts` substitutes native positional values into the actual English JSON catalogue. It is a native-shaped script, not native browser integration. Every call constructs an independent localization instance. Its pseudo mode expands literal text by at least 40 percent while preserving placeholder tokens, emphasis markers and substituted title data. Only English ships.

`run.ts` emits five complete JSON lines. They cover inert construction, named substitution ordering, count variants, both fixed disclosure identities and pseudo input. `run.bun-test.ts` compares two complete transcripts and checks the English and agreement fields. Existing add-feedback and add-flow fixtures now receive localization explicitly. The existing first-run Backend fixture passes the same text snapshot to the view and agreement owner.

`check-catalogue.ts` checks the actual JSON, the shipped locale directory, placeholder names and dense positions, generated parameter metadata, structured emphasis and feedback keys. `check-types.mjs positive` requires a clean compiler result. Each other invocation removes exactly one expected diagnostic and requires the compiler to reject the intended line with no unrelated error. Run the positive first.

`check-defects.mjs` edits one named source in a qualification checkout, requires successful compilation, and then requires the named assertion to fail. It restores the original source bytes in `finally`. It must run under the sole runtime lease with no concurrent writer. The rich HTML control also requires the Svelte checker. A timeout, missing dependency, syntax error or unrelated failure gives no sensitivity credit. The control transcript is evidence only after execution.

The audit bundle lists all bounded future commands. No installation or network operation is part of these checks. Qualification must compose this descendant with accepted Setup and session authority first. Main compiler configuration still needs JSON module support. The Svelte fixture configuration has that option. Its existing checker remains unchanged and has no `--tsgo` argument.

Pseudo rendering is an input to later visual tests. This authoring unit proves no layout, browser permission, keyboard, focus, accessibility, durability, ownership or exclusion guarantee. Privacy approval remains pending and activation stays held.
