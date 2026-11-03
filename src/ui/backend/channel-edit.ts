import type { I18n } from "../../shared/i18n"
import type { AccountKey, ChannelId, PlaylistId } from "../../shared/model/validation"
import { offlineChannel } from "../../shared/rules/channel-filter"
import type { Backend } from "./backend"

export type ChannelAdd = { readonly kind: "added" } | { readonly kind: "error"; readonly message: string }
type Channel = readonly [id: ChannelId, title: string, handle?: string]

/**
 * The filter editor's channel list (YT-CF-14, YT-CF-16): a typed channel is resolved by a YouTube tab, or parsed offline
 * when it's a `UC…` ID and no tab is open, then listed in the filter's own mode. A chip's ✕ unlists it.
 */
export function createChannelEditor(backend: Backend, i18n: I18n, acct: AccountKey) {
  async function resolve(input: string): Promise<{ readonly kind: "channel"; readonly channel: Channel } | Extract<ChannelAdd, { kind: "error" }>> {
    const error = (key: "channelFilter_needsTab" | "channelFilter_notFound" | "channelFilter_notChannel" | "filter_failed") => ({ kind: "error", message: i18n.message(key) }) as const
    const answer = await backend.call("ui.resolveChannel", { input })
    if (answer.kind !== "answered") return error("filter_failed")
    const outcome = answer.result
    if (outcome.kind === "result") {
      const result = outcome.result
      if (result.ok) return { kind: "channel", channel: result.data.handle ? [result.data.channelId, result.data.title, result.data.handle] : [result.data.channelId, result.data.title] }
      return error(result.reason === "failed" && (result.http === 404 || result.http === 410) ? "channelFilter_notFound" : "channelFilter_notChannel")
    }
    if (outcome.kind === "no-tab") {
      // With no YouTube tab, only a `UC…` ID or a /channel/ URL is accepted; its title arrives with the next read (YT-CF-10).
      const offline = offlineChannel(input)
      return offline ? { kind: "channel", channel: [offline, offline] } : error("channelFilter_needsTab")
    }
    return error("filter_failed")
  }
  async function change(playlist: PlaylistId, channel: Channel, action: "list" | "unlist"): Promise<boolean> {
    const answer = await backend.call("ui.filterChannel", { change: { acct, playlist, channel, action, mode: null, clearListed: false, expectedGeneration: null } })
    return answer.kind === "answered" && answer.result.kind === "confirmed"
  }
  return {
    async add(playlist: PlaylistId, input: string): Promise<ChannelAdd> {
      const resolved = await resolve(input)
      if (resolved.kind === "error") return resolved
      return (await change(playlist, resolved.channel, "list")) ? { kind: "added" } : { kind: "error", message: i18n.message("filter_failed") }
    },
    remove: (playlist: PlaylistId, channel: Channel) => change(playlist, channel, "unlist")
  }
}
