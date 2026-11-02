import { expect, test } from "bun:test"
import { createChannelEditor } from "./channel-edit"
import { createScriptedBackend, type ScriptedResponders } from "./scripted"
import type { UiMessages } from "../../shared/contracts/ui"
import type { AccountKey, PlaylistId } from "../../shared/model/validation"
import { build } from "../../../tools/fixtures/page-link/support"
import { englishI18n } from "../../../tools/fixtures/localization/scripted"

const acct = "AAAAAAAAAAAAAAAA" as AccountKey, playlist = "PL_music" as PlaylistId
const channel = "UCAAAAAAAAAAAAAAAAAAAAAA"
type Resolved = UiMessages["ui.resolveChannel"]["result"]
function editor(resolved: Resolved) {
  const sent: unknown[] = []
  const respond: ScriptedResponders = {
    "ui.resolveChannel": () => resolved,
    "ui.filterChannel": payload => { sent.push(payload.change); return { kind: "confirmed" } }
  }
  const scripted = createScriptedBackend({ build, deadline: () => () => {}, answers: [], respond })
  return { channels: createChannelEditor(scripted.backend, englishI18n(), acct), sent }
}

test("a typed channel that a YouTube tab resolves is listed in the filter's own mode with its title and @handle", async () => {
  const { channels, sent } = editor({ kind: "result", tabId: 4, result: { ok: true, route: "plain.resolveChannel" as never, data: { channelId: channel as never, title: "Lofi Girl", handle: "@LofiGirl" } } })
  expect(await channels.add(playlist, "@LofiGirl")).toEqual({ kind: "added" })
  expect(sent).toEqual([{ acct, playlist, channel: [channel, "Lofi Girl", "@LofiGirl"], action: "list", mode: null, clearListed: false, expectedGeneration: null }])
})

test("with no YouTube tab only a UC… ID is accepted, offline; other forms ask to open YouTube (YT-CF-16)", async () => {
  const offline = editor({ kind: "no-tab", attempted: [] })
  expect(await offline.channels.add(playlist, `https://www.youtube.com/channel/${channel}`)).toEqual({ kind: "added" })
  expect(offline.sent).toEqual([{ acct, playlist, channel: [channel, channel], action: "list", mode: null, clearListed: false, expectedGeneration: null }])
  const handle = editor({ kind: "no-tab", attempted: [] })
  expect(await handle.channels.add(playlist, "@LofiGirl")).toEqual({ kind: "error", message: "Open YouTube to look up this channel" })
  expect(handle.sent).toEqual([])
})

test("a channel YouTube can't find, and input that isn't a channel, answer with 1.5.0's wording", async () => {
  const missing = editor({ kind: "result", tabId: 4, result: { ok: false, reason: "failed", http: 404 } })
  expect(await missing.channels.add(playlist, "@gone")).toEqual({ kind: "error", message: "Couldn't find that channel on YouTube." })
  const nonsense = editor({ kind: "result", tabId: 4, result: { ok: false, reason: "unavailable" } })
  expect(await nonsense.channels.add(playlist, "hello there")).toEqual({ kind: "error", message: "That doesn't look like a channel. Paste an @handle or a channel URL." })
  expect([...missing.sent, ...nonsense.sent]).toEqual([])
})

test("a chip's ✕ unlists that channel", async () => {
  const { channels, sent } = editor({ kind: "no-tab", attempted: [] })
  expect(await channels.remove(playlist, [channel as never, "Lofi Girl"])).toBe(true)
  expect(sent).toEqual([{ acct, playlist, channel: [channel, "Lofi Girl"], action: "unlist", mode: null, clearListed: false, expectedGeneration: null }])
})
