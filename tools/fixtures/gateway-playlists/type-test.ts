import type { BatchAddResult, JobOf, RemovalIdentity } from "../../../src/shared/contracts"
import type { GatewayRequestPort, Dispatch } from "../../../src/page/gateway/port"
import type { WwwRequestBoundary } from "../../../src/page/gateway/www-request"
import { createGateway } from "../../../src/page/gateway"
import { wwwGateway } from "../../../src/page/gateway/www"
import type { PageReadPort } from "../../../src/page/read-port"
import { entry, playlist, video } from "./specimens"

declare const page: PageReadPort
declare const requests: GatewayRequestPort
declare const raw: unknown
declare const native: WwwRequestBoundary

export async function correlation() {
  const gateway = createGateway({ site: wwwGateway, page, requests })
  const result = await gateway.run({ kind: "create", title: "List", privacy: "PRIVATE", videoId: video })
  if (result.ok) {
    result.data.playlistId.toUpperCase()
    // @ts-expect-error negative:create-result-is-not-add-result
    result.data.setVideoId
  }
  // @ts-expect-error negative:removal-cannot-mix-video-and-entry
  const mixed: RemovalIdentity = { setVideoId: entry, videoId: video }
  // @ts-expect-error negative:batch-success-needs-confirmed-missing-or-returned-id
  const unknownEntry: BatchAddResult = { videoId: video }
  // @ts-expect-error negative:dispatch-pending-needs-cancellation
  const pending: Dispatch = { kind: "pending", answer: Promise.resolve({ http: 200, body: null }) }
  // @ts-expect-error negative:dispatch-cannot-call-generic-error-not-sent
  const guessed: Dispatch = { kind: "not-sent", cause: "generic-error" }
  // @ts-expect-error negative:unparsed-job-input-is-not-a-playlist-id
  const invalid: JobOf<"add"> = { kind: "add", playlistId: raw, videoId: video }
  // @ts-expect-error negative:read-port-cannot-read-cookies
  page.cookie("SAPISID")
  // @ts-expect-error negative:signing-cookie-name-is-restricted
  native.cookie("unrelated-cookie")
  // @ts-expect-error negative:request-transport-is-not-a-page-read
  requests.has("page-read")
  // @ts-expect-error negative:plain-unvalidated-playlist-string
  gateway.run({ kind: "remove", playlistId: "PLunchecked", setVideoId: entry })
  void mixed
  void unknownEntry
  void pending
  void guessed
  void invalid
  void playlist
  gateway.dispose()
}
