import { expect, it, vi } from "vitest"
import { runSessionJob, type SessionSnapshot } from "@/lib/session"
import { addVideoToPlaylist, fetchChannel, fetchUserPlaylists, fetchVideoChannel } from "@/lib/youtube"
vi.mock("@/lib/session", async original => ({ ...await original<typeof import("@/lib/session")>(), runSessionJob: vi.fn() }))
const session: SessionSnapshot = { tabId: 7, accountKey: "account0000000001", incognito: false, consentGeneration: "generation-1" }

it("returns authoritative already-in results without a duplicate cache", async () => {
  vi.mocked(runSessionJob).mockResolvedValue({ kind: "add", accountKey: session.accountKey, alreadyIn: true })
  await expect(addVideoToPlaylist(session, "WL", "abcdefghijk")).resolves.toEqual({ alreadyIn: true })
  expect(runSessionJob).toHaveBeenCalledWith(session, { kind: "add", accountKey: session.accountKey, playlistId: "WL", videoId: "abcdefghijk" }, undefined)
})
it("lists playlists for the captured account", async () => {
  vi.mocked(runSessionJob).mockResolvedValue({ kind: "playlists", accountKey: session.accountKey, playlists: [{ id: "WL", title: "Watch later" }] })
  await expect(fetchUserPlaylists(session)).resolves.toEqual([{ id: "WL", title: "Watch later" }])
})
it("resolves video and typed channels through page jobs", async () => {
  const channel = { channelId: "UCabcdefghijklmnopqrstuv", title: "Channel", handle: "@channel" }
  vi.mocked(runSessionJob).mockResolvedValue({ kind: "channel", channel })
  await expect(fetchVideoChannel(session, "abcdefghijk")).resolves.toEqual(channel)
  await expect(fetchChannel(session, { by: "handle", handle: "@channel" })).resolves.toEqual({ status: "found", channel })
})
it("does not turn the wrong reply kind into a confirmed write", async () => {
  vi.mocked(runSessionJob).mockResolvedValue({ kind: "channel", channel: null })
  await expect(addVideoToPlaylist(session, "WL", "abcdefghijk")).rejects.toMatchObject({ code: "unconfirmed" })
})

it("preserves the original absolute expiry when forwarding a save", async () => {
  const expiry = Date.now() + 2000
  vi.mocked(runSessionJob).mockResolvedValue({ kind: "add", accountKey: session.accountKey, alreadyIn: false })
  await addVideoToPlaylist(session, "WL", "abcdefghijk", expiry)
  expect(runSessionJob).toHaveBeenCalledWith(session, { kind: "add", accountKey: session.accountKey, playlistId: "WL", videoId: "abcdefghijk" }, expiry)
})
