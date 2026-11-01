# ExtLink qualification reference

This fixture connects the production `createNativeExtLink`, the extracted callback bridge, shared serialized memory transport, the actual background `createBrowserTabs().bindHello`, the real Tabs engine, the canonical owner session port, and real PageLink over the direct page channel. It defines no RPC implementation or substitute Tabs engine.

The fixture's producer returns a complete explicit synthetic `FixtureView`. Its validator checks the sign-in discriminant, account key, private flag, build, nested fixture owner, revision, and exact object fields. The nested owner must equal the account key. The producer takes privacy from injected native tab facts. This view is not the full ARC-MSG-05 production TabView and supplies no product health or other account facts. Unused Registrar and account-routing ports throw instead of supplying answers.

`run.ts` observes hello registration, account-specific view publication, a native ping, a correlated pinned job, a pushed view, and disposal. It emits full registry records, view history, native calls, callback claims and responses, serialized RPC traffic, page jobs, retirement announcements, and cleanup counts. It does not print raw page identity. All identities and native facts are synthetic inputs.

`expected.jsonl` contains the authored expected stdout bytes, including exactly one trailing LF before EOF. `expected-bytes.json` records its byte count and SHA-256. The expectation comes from the protocol and fixture inputs. It has not been captured or validated by execution. The adjacent core consumer test compares exact bytes.

The authored behavior tests cover one hello after trusted page hello, startup visibility and navigation type, signed-in and signed-out pings, complete-view rejection, account and build mismatch, a push superseding hello, pinned and concurrent jobs, invocation-dependent batch results, sender rejection, account transitions, orphaning, retirement, uncertainty without retry, pending disposal, cleanup, and independent instances. The native adapter tests also cover missing and throwing runtime identity and callback teardown. The original background runtime behavior and type tests remain unchanged.

`controls.json` proposes six exact compiling mutations and names their behavior assertions. Under a later runtime lease, the executor first requires a clean focused compiler and a passing named baseline test. Each mutation must compile and make that test fail. The executor then restores exact bytes and mode and requires the compiler and baseline test again. No mutation has compiled or run here.

The new type negatives live in `src/site/core/extlink.type-test.ts` and `src/site/core/adapters/extlink-runtime.type-test.ts`. Each directive immediately precedes its intended error line. Qualification must remove one directive at a time and require the diagnostic on that line, then restore bytes and mode and rerun the clean compiler. The existing architecture guard owns the site-to-background import rejection. Its synthetic misuse assertion is in `extlink.bun-test.ts`.

The authoring handoff's `unexecuted-gates.json` gives exact bounded compiler, focused behavior, preserved adapter, PageLink, RPC, Tabs, owner, architecture, consumer, and build commands. No product, compiler, test, fixture, build, browser, server, package manager, or control executed in this authoring task. The executor needs a new sole runtime lease and the prepared dependencies. No installation is authorized.

## Later assembly

The SiteCore creates PageLink with its build and site, then supplies that same build and site to `createNativeExtLink`. It passes the native runtime, current document, one-shot deadline, and complete production TabView predicate. ExtLink takes PageLink lifetime ownership. SiteCore and FeatureHost subscribe to `onView` and disarm on `null`. The background binds its existing Tabs adapter to the actual Tabs engine and complete production producer.

PageLink's public state does not expose build or site. Keeping those constructor bindings identical is an assembly obligation. No outside-fence interface change is required for this unit. Main entries and activation remain unchanged.

Tabs and the account-scoped owner projection in this frozen source are authored and runtime-unqualified. Concurrent Backend completion is excluded. Later qualification must refresh against qualified upstreams. Native durability, ownership, exclusion, and sender provenance remain unproven. Privacy approval is pending, production activation is held, and 2.0 remains incomplete.
