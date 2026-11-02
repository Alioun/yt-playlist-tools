import { isChannelId, type ChannelId, type Filter } from "../model"
import type { Snapshot } from "../model/settings-view"

export type FilterDecision = "pass" | "filtered" | "filtered-unknown-channel"

export function decide(filter: Filter | undefined, channel: ChannelId | null): FilterDecision {
  if (!filter?.on) return "pass"
  if (channel === null) return filter.mode === "allow" ? "filtered-unknown-channel" : "pass"
  const listed = filter.channels.some(([id]) => id === channel)
  return listed === (filter.mode === "allow") ? "pass" : "filtered"
}

/**
 * The channel a typed input names without asking YouTube: a bare `UC…` ID or a `/channel/UC…` address. With no
 * YouTube tab open these are the only forms accepted; others need a tab to resolve (YT-CF-16).
 */
export function offlineChannel(input: string): ChannelId | null {
  const value = input.trim()
  if (isChannelId(value)) return value
  try {
    const url = new URL(/^(?:www\.|m\.)?youtube\.com\//.test(value) ? `https://${value}` : value, "https://www.youtube.com")
    if (url.protocol !== "https:" || !["www.youtube.com", "youtube.com", "m.youtube.com"].includes(url.hostname)) return null
    const id = /^\/channel\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null
    return isChannelId(id) ? id : null
  } catch { return null }
}

/** Stored channel labels are cut at 100 characters for titles and 30 for handles (YT-CF-10). */
export function channelLabel(title: string, handle?: string): { readonly title: string; readonly handle?: string } {
  const cut = (text: string, limit: number) => [...text].slice(0, limit).join("")
  return { title: cut(title.trim(), 100), ...(handle ? { handle: cut(handle.trim(), 30) } : {}) }
}

/**
 * YT-CF-15's "this channel" control for one mode of one playlist's filter, and what choosing it sends:
 * - `available` lists the channel, switching an off filter on in this mode and keeping its kept channels;
 * - `listed` reads Allowed or Denied, and choosing it again unlists the channel;
 * - `confirm` turns an off filter on in the other mode, which clears its `kept` channels once confirmed;
 * - `greyed` is the other mode of a filter that's on.
 */
export type ChannelControl =
  | { readonly mode: Filter["mode"]; readonly state: "available"; readonly send: { readonly action: "list"; readonly mode: Filter["mode"] | null; readonly clearListed: false } }
  | { readonly mode: Filter["mode"]; readonly state: "listed"; readonly send: { readonly action: "unlist"; readonly mode: null; readonly clearListed: false } }
  | { readonly mode: Filter["mode"]; readonly state: "confirm"; readonly kept: number; readonly send: { readonly action: "list"; readonly mode: Filter["mode"]; readonly clearListed: true } }
  | { readonly mode: Filter["mode"]; readonly state: "greyed" }
export function channelControls(filter: Snapshot<Filter> | undefined, channel: ChannelId): readonly [ChannelControl, ChannelControl] {
  const current: Snapshot<Filter> = filter ?? { mode: "deny", on: false, channels: [] }
  const listed = current.channels.some(([id]) => id === channel)
  const control = (mode: Filter["mode"]): ChannelControl => {
    if (current.on) {
      if (mode !== current.mode) return { mode, state: "greyed" }
      return listed ? { mode, state: "listed", send: { action: "unlist", mode: null, clearListed: false } }
        : { mode, state: "available", send: { action: "list", mode: null, clearListed: false } }
    }
    if (mode === current.mode || current.channels.length === 0) return { mode, state: "available", send: { action: "list", mode, clearListed: false } }
    return { mode, state: "confirm", kept: current.channels.length, send: { action: "list", mode, clearListed: true } }
  }
  return [control("allow"), control("deny")]
}
