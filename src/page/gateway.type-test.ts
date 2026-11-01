import type { ItemInfo, JobOf, LikeEndpoint, PlayerData, QueueInsertEndpoint } from "../shared/contracts"
import type { PageAccountData } from "../shared/contracts/page"
import { isQueueInsertEndpoint } from "../shared/contracts"
import { createGateway } from "./gateway"
import type { ReadGateway } from "./gateway"
import type { PageReadPort } from "./read-port"

declare const gateway: ReadGateway
declare const port: PageReadPort
declare const target: Element
declare const like: LikeEndpoint

export async function correlatedResults() {
  const account = await gateway.run({ kind: "account" })
  if (account.ok) {
    const pageIdentity: PageAccountData = account.data
    if (pageIdentity.signedIn) pageIdentity.datasyncId.toUpperCase()
    // @ts-expect-error negative:page-account-is-not-hashed
    account.data.acct
    // @ts-expect-error negative:account-is-not-an-item
    const item: ItemInfo = account.data
  }
  const item = await gateway.run({ kind: "itemInfo" }, { target })
  if (item.ok) {
    const parsed: ItemInfo = item.data
    parsed.endpoints.next?.queueAddEndpoint
    // @ts-expect-error negative:item-is-not-cast-state
    item.data.casting
  }
  const cast = await gateway.run({ kind: "castState" })
  if (cast.ok) {
    const casting: boolean = cast.data.casting
    // @ts-expect-error negative:cast-is-not-raw-identity
    cast.data.datasyncId
    void casting
  }
  gateway.watch("player", data => {
    const player: PlayerData = data
    if (player.ad) {
      // @ts-expect-error negative:ad-has-no-content-position
      player.pos
      // @ts-expect-error negative:ad-has-no-content-id
      player.videoId
    } else player.pos.toFixed()
  })
  // @ts-expect-error negative:unknown-stream
  gateway.watch("future-stream", () => {})
  // @ts-expect-error negative:target-must-be-an-element
  gateway.run({ kind: "itemInfo" }, { target: "selector" })
  // @ts-expect-error negative:channel-job-needs-video-id
  gateway.run({ kind: "channelOf" })
}

export function readOnlyPort() {
  createGateway({ site: "music", page: port })
  // @ts-expect-error negative:read-port-has-no-cookie-operation
  port.cookie("session")
  // @ts-expect-error negative:read-port-has-no-request-operation
  port.request("/path", {})
  // @ts-expect-error negative:read-port-has-no-command-operation
  port.command({})
}

export function endpointCorrelation(raw: unknown) {
  if (isQueueInsertEndpoint(raw)) {
    const endpoint: QueueInsertEndpoint = raw
    const job: JobOf<"queueInsert"> = { kind: "queueInsert", endpoint, position: "next" }
    void job
  }
  // @ts-expect-error negative:like-endpoint-cannot-insert
  const mismatch: JobOf<"queueInsert"> = { kind: "queueInsert", endpoint: like, position: "next" }
  // @ts-expect-error negative:unparsed-endpoint-cannot-insert
  const unchecked: QueueInsertEndpoint = { queueAddEndpoint: { queueTarget: { videoId: "synthetic01" }, queueInsertPosition: "INSERT_AT_END" } }
  void mismatch; void unchecked
}
