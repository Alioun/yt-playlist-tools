# Canonical tabs

`createTabs(ports)` implements `seen`, `accountInView`, `serve`, `runIn`, bounded `push`, and `dispose`. It receives the existing owner's `SessionPort`. It does not receive a native storage area or construct another owner.

Normal records live in `storage.session.tabs` through `changeSession`. Each operation captures the owner revision before its native work. The owner plans edits against fresh storage and verifies exact readback. Private records live in a separate map and recheck the captured account revision before adoption. Each privacy partition holds at most 200 records. Rows evict by `seenAt`, then tab ID for equal times. `at` remains hello time. Unchanged pings preserve observation metadata and write nothing.

`accountInView(req)` checks the active site tab first, including an explicit signed-out answer. It then checks recent site tabs of the same native window kind. It probes at most three tabs without injection. A normal requester can fall back to `accounts.lastAccount()` only when `accounts.hasSetup(acct)` confirms its Setup. A cached fallback carries no claim of current sign-in. Settings account selection remains a separate caller concern.

`serve(invocation, need)` queries the job's site, filters native privacy, discarded, and frozen facts, and excludes rows known to name another account. It orders the active requester, matching account rows, and unknown rows by native `lastAccessed`. It probes at most three candidates. Injection is allowed for at most one candidate. Initial native checks, injection, both pings when selected, session adoption, and final native checks share that candidate's two-second deadline.

`runIn(tabId, invocation, need)` follows the same checks in the original tab. It never selects another tab. Account-scoped jobs carry their account pin to the endpoint. The endpoint must guard it again immediately before using PageLink. Once a gateway job is sent, neither method retries it. A transport failure carries unknown delivery. Gateway results remain typed and unchanged.

`push(req, producer)` visits at most 200 rows of the requester's privacy kind. It rechecks the account after projection and sends only a validated view for that account. It injects no core. Every operation checks admission and disposal. Disposal releases engine deadlines and disposes the owned native port. Disposal does not dispose the shared canonical owner.

`createBrowserTabs(browser, options)` is the native adapter. It uses the existing sender resolver, frame-zero `tabTarget`, and shared RPC. `requester(sender, popupWindowId)` checks native window privacy. `bindHello(tabs, producer)` installs only the background hello receiver and authenticates the existing native sender context. No tab, window, or navigation event listener is installed.

## Required adjoining services

The caller supplies all `TabsPorts` members. `registrar.ensure(tabId, { site, core, signal })` must bind to the real Registrar and stop further work when its signal is aborted. The engine still bounds an injection that ignores cancellation. `accounts` must read Device and Setup through the existing owner. `enabled()` must reflect real consent and activation state.

Every method that creates a view requires `TabViewProducer<View>`. Its producer and complete validator must cover the real account-scoped TabView. This unit supplies no production projection, feature statuses, or successful empty view.

The core must install the matching `bg.ping`, `bg.job`, and `bg.view` receiver contracts. Its job handler must preserve the invocation account guard and forward to PageLink once. No production core endpoint, ExtLink, Registrar startup binding, Backend serving-account port, or AddFlow executor composition is installed here. An absent endpoint remains a failed RPC outcome.

## Qualification state

Compiler, test, fixture, behavior-control, browser, and build gates were not executed during authoring. The fixture and tests use synthetic accounts and native ports. They prove no native durability, ownership, exclusion, or service-worker lifetime guarantee. Privacy approval is pending. Activation is held. This unit does not complete 2.0.
