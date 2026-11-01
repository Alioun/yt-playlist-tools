# First-run Backend

This is an authored, inactive first-run subset. No compiler, test, fixture, build, browser or native runtime gate has run for this unit. UI/picker qualification is in progress. Setup destination dependencies are authored and unqualified.

`Backend` provides `load`, `watch`, `change`, typed `call` and `access`. Only `browser.ts` names native browser types in `src/ui`. It accepts the real browser object through `BrowserBackendPort`; construction starts no reads, messages, permission requests or listeners. `scripted.ts` implements the same contract through the shared JSON RPC receiver and caller.

## Reads

`load()` makes one read-only local get for `schema`, `device` and `doc:settings`. `load({ acct })` adds that account's canonical Setup key to the same get. The account key comes from the required serving-account service. `Device.lastAccount` never selects it.

The shared projections decode known records and return selected features, shortcut display fields and playlist destinations. Missing, deleted, current, invalid and newer documents remain distinct. Device identity, account memory, stamps, unknown bodies, legacy records and retained records are absent from the result. A missing Device stays missing. Readers have no write, remove, clear, sync or session capability.

`watch` observes local changes to those named keys. It ignores other areas and unrelated keys. One native listener serves all watches on one Backend. The final unsubscribe removes it once. A newer observed view supersedes an older pending load. Disposal drops pending answers and notifications.

## Messages and agreement

The catalogue is `shared/contracts/first-run.ts`. It adds no exports to the protected contracts root.

| Route | Implemented payload | Public result |
| --- | --- | --- |
| `ui.change` | First-run agreement with displayed version, attempt, exact selected features and sync choice | Correlated agreement rows or a fixed refusal |
| `ui.change` | One canonical Setup destination with an expected prior choice | Exact confirmed destination or a fixed refusal |
| `ui.syncedChoices` | Explicit pre-consent lookup | Feature choices or a fixed disposition |

The shared RPC validates the complete JSON envelope and payload before native authentication. The receiver uses `authenticateUi`, rejects private calls and allows a window claim only for a popup. Settings and onboarding derive their Origin from the native tab. Content pages, foreign extensions, subframes and unverifiable privacy state never reach owner handlers.

One authenticated request calls the real owner's `readAgreement`, checks the displayed version and canonical presentation, verifies current native access, and passes the captured review directly to `agree`. No review, marker, handle or continuation is accepted from the caller. There is no caller-bound review state, so no window-only capability binding or persistent review journal exists. Concurrent documents retain separate handler-local objects.

`rendered-disclosure.ts` pins version 1 with fixed SHA-256 identities derived independently from the frozen English source. The actual catalogue and the displayed structured snapshot must both match. Both complete browser-specific closing paragraphs are covered. Changed canonical text, arbitrary native output and pseudo text refuse agreement without changing the displayed version. The receiver compares the submitted version with its own review and passes the submitted version through unchanged. A background update cannot substitute a newer version for text an older page rendered. Privacy wording approval remains pending.

Only semantic `committed` and `joined` results with ordinary gates, the submitted consent version and every exact requested application scope can confirm. Rejected setters followed by exact readback retain that meaning. Resolved but unconfirmed setters and `unchanged` results cannot confirm. The scope parity check uses the actual canonical planner for every page feature, including both scopes of shortcuts and any-tab keys. Off, missing, duplicate, unexpected and access-inconsistent applications refuse confirmation. Raw errors and owner results never become DTOs.

Held, retained, upgrade-note and pending presentations refuse this first-run path. Explicit agreement never resumes retained work. A real sync join that needs a side returns `join-required`; no dialog, side choice or review continuation is implemented.

## Permissions and lifecycle

`requestPermissions` delegates directly to `requestCombined`. Its native request starts synchronously before any contains call or await. Chrome combines optional Music origins and contextMenus in one request when declared. Firefox uses declared Music host access and requests optional contextMenus. Native contains results remain authoritative after the prompt and again in the receiver. No permission Boolean or Promise crosses the wire.

The frozen `wxt.config.ts` lacks the required optional declarations and Firefox host pattern. The adapter reads the actual manifest and requests only declared options. An exact unapplied manifest proposal is in the unit's audit bundle. No production entrypoint imports these modules.

Cancelling a synced lookup settles the UI result locally and drops its late answer. It does not promise to cancel native work across the wire. The real background lookup has its existing ten-second limit. Receiver disposal calls its real cancel method and releases its subscription. No construction or mount starts a lookup.

## Setup services and limits

`createFirstRunOwner` requires account, playlist-title, chooser and navigation ports. The consumer supplies explicit synthetic implementations. Real serving-tab account and playlist services, a production picker adapter and main Svelte assembly remain unwired.

The FirstRun adapter reads Setup and invokes those services only after its own request receives a confirmed ordinary agreement. A fresh or refused first-run context cannot start serving-tab work or present retained settings as completed first-run setup.

Quick-save, Music save and an explicitly selected existing shortcut destination call the real canonical destination operation. The adapter rechecks the account after the chooser, supplies the captured destination expectation, and accepts only the exact confirmed playlist. Unrelated destination changes remain the canonical owner's responsibility. Cancelled or unavailable choosers report that disposition and write nothing.

Auto-add destination editing is outside this subset and returns `picker-unavailable`. Multiple shortcut rows receive no guessed picker target. The three pending picker policies remain open. The adapter neither activates features nor relaxes retained authority.

## Unexecuted checks

The adjacent tests cover the real RPC and canonical owner, native-shaped callbacks, strict JSON schemas, permission order, semantic confirmation, scope completeness, direct read calls, stale loads, listener disposal, cancelled lookups and inert FirstRun mounting. `backend.type-test.ts` contains named intended-line negatives. The fixture's native type control checks assignability from the actual WXT browser type.

The compact consumer is `tools/fixtures/first-run-backend/run.ts`. It has a fixed six-line public transcript. The audit bundle contains bounded future commands and named sensitivity controls. All remain unexecuted. Native provenance, browser interoperability, durability, ownership and exclusion remain unproven. Production activation stays held. This unit does not complete 2.0. Review was not requested.

## Localization binding

`createBrowserI18n` accepts only native `getMessage` and `getUILanguage`, plus the actual English catalogue supplied by entry assembly. It exposes no Backend, account, storage or write authority. `shared/i18n` remains pure and has no browser import or global locale. Generated placeholder-name metadata keeps its imports inside the shared layer. The catalogue consistency fixture checks this metadata against the actual JSON.

Create one `FirstRunText` snapshot from that localization instance. Pass the same snapshot to `createFirstRunOwner` and `FirstRun`. The disclosure text is captured before rendering and is reused for agreement checks. The local agreement request carries that same object. A different view snapshot refuses before any RPC. Only explicit existing fields enter the wire request. Permission requests still start in the existing synchronous click path. First-run agreement remains version 1. Main entry wiring and manifest localization are unapplied assembly proposals in the localization audit bundle.

Each complete disclosure bullet contains safe emphasis markers in one catalogue entry. `RichText.svelte` renders structured text and strong elements. It never injects HTML. The provisional cookie marker and privacy policy URL are unchanged. Privacy wording approval remains pending. Button and tag minimum heights allow longer labels to wrap. Visual, keyboard, focus and axe qualification remain unperformed.
