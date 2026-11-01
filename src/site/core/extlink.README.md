# ExtLink reference

`createExtLink(options)` connects a real PageLink to the shared runtime RPC protocol. It owns PageLink disposal, its native receiving endpoint, the hello caller, and its view subscriptions. The owner supplies build, site, PageLink, runtime ports, a deadline, captured startup visibility, and a complete `isView` predicate.

`view` is the current validated view or `null`. While live, `onView(listener)` immediately supplies that value and returns an idempotent unsubscribe function. A disposed link accepts no new subscriber. Invalid views do not publish. Listener failures do not tear down other subscribers. Account change or an unavailable PageLink disarms view use and publishes `null`. Disposal publishes `null`, releases subscribers, and prevents later publication. `state` records waiting, ready, disarmed, or disposed.

The native binding is `createNativeExtLink(options, browser.runtime, document)` in `adapters/extlink-runtime.ts`. It reads `visibilityState` once when the core starts. It supplies actual runtime identity and native sender IDs through the shared callback bridge. No browser API is read by the pure endpoint.

After PageLink's real hello succeeds, ExtLink sends one `tab.hello`. `hidden` is the conjunction of the gateway's captured `startedHidden` and the core's captured startup visibility. `fresh` means the captured navigation type is `navigate`. No visibility or navigation listener exists. A failed hello is not retried.

`bg.ping` answers with the trusted PageLink account, site, and build. `bg.job` forwards the validated pinned invocation to that PageLink. PageLink owns account checks and the exact job result. ExtLink never retries a mutation or converts `unconfirmed` into evidence that the mutation was unsent.

Both hello answers and pushed views pass the injected complete predicate. ExtLink then checks build, account key, and sign-in discriminant against the current ready PageLink. Any valid pushed view supersedes the hello answer. Account change invalidates the outstanding hello, so a late answer cannot rearm a view.

The job receiver uses `tabJobReceiverMessages`. Its result predicate accepts nothing because a receiver cannot validate every invocation-dependent successful result with one broad guard. Shared RPC validates receiver payloads and typed handlers supply results. The background continues to call `tabJobMessages(actualInvocation, timeout)` and validates each answer against that exact invocation. The wire result is unchanged.

The runtime identity is pinned when ExtLink starts. Every actual RPC operation, publication, read, and subscription checks it. A missing, changed, or throwing identity disposes ExtLink and PageLink. There is no identity polling timer. PageLink retirement also disposes ExtLink. PageLink owns the retirement announcement, and ExtLink sends no second event.

The native callback bridge is extracted from the frozen background runtime adapter. Both adapters use the same literal callback return, single response, rejection, disposal, and reentrancy behavior.

## Assembly dependencies

The eventual SiteCore supplies the same build and site used by PageLink, a ready native runtime, the current document, a one-shot deadline adapter, and the complete production TabView validator. It transfers PageLink lifetime ownership to ExtLink and subscribes FeatureHost to view changes. The background uses its existing `createBrowserTabs().bindHello(tabs, producer)`.

The complete ARC-MSG-05 producer over the owner projection, registry, and Monitor is adjoining work. This generic API and the synthetic fixture view do not establish a complete production TabView. No health, setup, filter, private-session, AddFlow, progress, query, notice, or feature behavior is invented here. Entries and activation remain unchanged.

This candidate is authored only. No compiler, test, fixture, build, browser, or product runtime ran. Tabs and owner projection remain runtime-unqualified. Concurrent Backend completion is excluded. Native guarantees remain unproven, privacy approval is pending, activation is held, and 2.0 remains incomplete.
