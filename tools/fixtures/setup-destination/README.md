# Setup destination fixture

`run.ts` drives the real starting owner and the plain owner over a synthetic in-memory store. It reads an account Setup, sets the quick-save, Music-save, gather and shortcut destinations through `changeSetupDestination`, and records the stored documents, events and refusals.

Its 49 cases retain the original eight and add last-choice deletion for each destination with sync on and off, exact account cleanup, live kept filters, concurrent choices and Settings membership, interruption and restart, rejected or ignored removal acceptance, and disposal or withdrawal at each removal storage boundary. Boundary probes count within four aggregate cases and keep their observations compact.

It also covers unrelated newer local Settings, newer remote Settings and a newer different account, while the edited newer Setup remains refused. Event cases hold a native write to check that publication waits for confirmation, exercise manual and automatic receive, reject duplicate unchanged events, and dispose or unsubscribe listeners. A join case confirms only the changed remote Setup and keeps Settings subscribers separate.

`account-removal-execution.bun-test.ts` adds admission cases for absent, supported and newer remote counterparts of unrelated newer local documents, exact input preservation, quota accounting and refusal of an addressed newer document. `setup-edit.type-test.ts` and owner type tests distinguish committed live and absent views from incomplete cleanup.

Nothing here touches a browser. `production` is always `not-connected`. `store-composition.bun-test.ts` runs it.

The completion author ran no fixture, tests, compiler, build or browser. The coordinator's runtime lease holder must run the commands in the completion audit before accepting behavior.
