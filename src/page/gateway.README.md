# Gateway page reads and playlist requests

`createGateway` supplies the existing `PageGatewayOperations` interface to `servePage`.
It adds `dispose` and `onSignal`. The page account result contains the complete raw identity.
The existing PageLink hashes that identity before returning shared results inside the isolated world.

## Two halves, two files (G42, R200)

The gateway is a read half and a jobs half, joined by `composeGateway` in `compose.ts`.

- `read-gateway.ts` is the page half's own code in `page-<site>.js`. It pins the account, answers `account`, the current video's `videoInfo`, `nowPlaying` and `castState`, and serves the streams. `serves(job, ctx)` names the jobs it answers.
- `jobs-gateway.ts` is `page-jobs-<site>.js`. It answers every other job and the probe, on the read half's port, guarded reads, signal sinks and pinned identity (`PageReads`). That includes a pointed card's `videoInfo`, `itemInfo` and `channelOf`, whose plain request fallback stays in the same half.
- `start.ts` holds the jobs half as a loader until the file arrives. The first job sends `need`; the file offers itself with `offerJobs` (`jobs-port.ts`) and is taken only while asked for. Waiting jobs run after the core's `loaded { ok: true }`, each with what is left of its 10 s (`JobContext.budget`).
- `createGateway` builds both halves at once, for fixtures and tests that drive the whole gateway.

## Supported read subset

| Job | Site | Read source and failure behavior |
| --- | --- | --- |
| `account` | www, music | Pin `LOGGED_IN` and the whole opaque `DATASYNC_ID` once. Signed out differs from missing identity. |
| `videoInfo` | www | Read the actual target renderer, or prefer agreeing navigation metadata before the counting player's response. |
| `channelOf` | www | Prefer an agreeing navigation response, then the counting player's response. Missing channel data is unavailable. |
| `itemInfo` | music | Read the actual target renderer's data and its automix ancestry. Validate native endpoints with shared guards. |
| `nowPlaying` | music | Read mediaSession metadata, largest artwork, counting player identity and native video progress. Use one selected queue item as the fallback. |
| `castState` | music | Read an explicitly bound raw app state, then an explicitly bound player value. Only boolean test conditions are implemented. |

The same `createGateway.run` now connects `accountLabel`, `membership`, `playlists`, `add`, `remove`, `addBatch`, `removeBatch`, `save`, `unsave`, `create`, and `resolveChannel` to request routes.
`channelOf` joins the playlist lane when its direct read needs a request.
Site support still comes from the shared contracts.
Queue edits, likes, library changes, navigation, and opening a card menu remain unavailable.
`routes/www.ts` and `routes/music.ts` each contain one site table.
Create excludes the command route because it drops the playlist ID.

`PageReadPort` is an honest subset with `config`, `read`, `on` and `has`.
It has no request or cookie operation.
`GatewayRequestPort` supplies the explicit request boundary to the existing gateway.
Without that port, the original read consumers retain their read vocabulary and behavior.
The typed registry keeps each read result correlated with its job. Six separate route modules would duplicate the guarded read context.

## Player and listener ownership

The player stream accepts only `movie_player` and `shorts-player`.
Watch and Shorts navigation must agree with the player and current URL.
A miniplayer reading waits for its watch-context identity event.
Ordinary progress uses content-player position and duration. Shorts can use the scoped native video when its API is missing and navigation supplies the response identity.
Ads emit only the ad variant. The parser preserves clip, provisional made-for-kids and live flags without deciding whether playback counts.
Nonfinite or invalid positions, durations and rates yield no reading.

Each gateway shares one subscription group per supported stream.
The live port shares native listener groups across those subscriptions and follows replacement counting players.
Navigation-only watchers own no media progress listeners. Unsupported streams attach nothing.
Releases reject stale callbacks, and subscriber exceptions do not stop other subscribers.
Ad event state survives listener changes while its counting root remains owned. An ad end missed while media is unwatched can conservatively suppress readings until a later ad-end event or a replacement of the root or its video.
Streams use no timer or global subtree observer.
Request jobs own deadlines separately from stream ownership.
Page code uses no console, storage, or browser API.

The endpoint releases its watches on disposal. The composition owner also disposes the gateway and live port when it retires them.
The gateway does not dispose a shared port that another gateway might still use.

`readVocabulary` owns the stable read identifiers.
When request ports are supplied, `gateway.vocabulary` adds the request route and watch identifiers.
Pass that vocabulary to both `servePage` and PageLink.
Probe and signals use the selected vocabulary. Shape diagnostics keep only bounded schema keys and value types.
Missing and throwing hooks carry a watch identifier. Exceptions, identity values and page text are never diagnostic fields.

## Dispatch, account checks, and lanes

`Dispatch` distinguishes a proven not-sent attempt, a blocked admission, and a pending answer whose request may have been sent.
Missing hooks and proven preflight failures can fall back.
A generic hook throw or rejection cannot prove that a write was not sent.
An uncertain write returns `unconfirmed` and never tries another transport.
Reads can fall back after a timeout or lost answer within the original job budget.
HTTP and application rejections stop transport fallback, including HTTP 200 with `STATUS_FAILED`.

The default deadline is 10 seconds from admission, including lane waiting and signing.
The remaining budget is divided across the remaining transport candidates.
Expired queued work never starts.
Direct reads bypass both FIFO lanes.
The reusable app-state lane is independent of the playlist lane and has no implemented product jobs in this unit.

The page identity remains pinned for the page lifetime.
Account jobs recheck configuration before admission, after awaited work, and before every write.
The www signer rechecks after each awaited hash and immediately before native fetch.
Response identities are observed before status interpretation, including errors and continuations.
A mismatch stays latched until reload, including a late answer after expiry.
Signed-in www membership and aggregation answers require their response identity.
Music's missing-response-identity behavior remains provisional under M2 and relies on the configuration check.
Raw identity is never hashed or stored by the request module.

## Shared playlist operations

Membership requests send one video and `excludeWatchLater: false`.
The parser supports old playlist-option renderers, playlist-option view models, and toggleable view models backed by `saveToPlaylistListEntity` references.
It preserves Save-dialog order, privacy, count, and selected state.
Unrecognised answers never become successful empty lists.
Recognised empty membership containers remain valid.

Playlist aggregation uses `FEplaylist_aggregation`, keeps optional metadata, and adds Watch Later once.
Membership privacy fills omitted listing privacy for the same playlist in this page.
Pagination permits at most 20 answers and refuses repeated or ambiguous continuation tokens.
Channel resolution follows at most three URL hops, checks the channel page type, and browses for title and handle.
The title's existing 150-character limit, trimming, angle-bracket refusal, and privacy values remain provisional and unchanged.

Only confirmed add success can normalize a missing occurrence ID to `null`.
Removal preserves the shared contract's explicit entry-ID or video-ID alternative.
The unchanged shared validator limits batches to 50 actions.
Batch additions preserve input order and recognised per-video refusal statuses.
Aggregate success never confirms individual batch additions.
Missing correlated action facts remain unconfirmed.
Removal batches require correlated entry IDs before counting removals.

`adapters/live-www-gateway.ts` and `adapters/live-music-gateway.ts` compose the live read port and the site's request adapter into `createGateway`, with the site's route table and job builders from `gateway/www.ts` or `gateway/music.ts`. Each page half imports only its own site's, so neither bundles the other site's jobs.
Its owner disposes the composition when retiring the page.
The www adapter finds the global resolver by shape, caches it, and searches once more after its method disappears.
Service requests own a hidden node and completion listener until settlement or cancellation.
Music uses only `networkManager.fetch` for playlist requests.
It never calls the www signer, `handlePlaylistEditEndpoint`, or response actions.
The background Tabs and Playlists composition owns Music's cross-site membership fallback.

The www request module authors same-origin context, delegation, and the three permitted cookie hash variants.
It adds no API key or rewritten Origin or Referer.
Cookie values remain local to one request and never enter storage, signals, or the isolated world.
Plain requests read no cookies or signing session.

## Authoring limits and execution hold

This is an authored candidate. No product, compiler, test, fixture, control, build, browser, server, package manager, network, or credential operation ran for this unit.
The new signer never executed, even with dummy values.
Future dummy checks require a separate runtime lease.
Real credentials additionally require passing credential-free failure tests, a separate secret-flow review, owner approval of the exact frozen code and controlling files, and an owner-controlled frozen execution path.
No such authority exists for this candidate.
Production entry assembly remains a later unit.
Navigation envelopes and native event compatibility still require captured variants and live checks.
Music cast hook discovery, cast encodings, queue subscriptions and metadata-only notifications remain undocumented.
Explicit bindings permit conditional synthetic tests. Their absence is unavailable and does not become a successful stub.
Header counts and unsupported renderer layouts remain pending raw-source evidence.
L1, L2, L3, L5, L6, and M2 remain provisional.
Command callback, service-event, Music fetch, status, and uncaptured renderer variants still need qualification.
Every authored specimen is synthetic.
Native durability, ownership, and exclusion remain unproven.
Privacy approval is pending, activation is held, and 2.0 is incomplete.

See [read provenance](../../tools/fixtures/gateway-reads/provenance.md) and [deferred playlist checks](../../tools/fixtures/gateway-playlists/README.md).
