import { describe, expect, it } from "vitest"

import {
  CUSTOM_URL_ERROR,
  NOT_A_CHANNEL_ERROR,
  parseChannelInput
} from "@/lib/channel-input"

const ID = "UCSJ4gkVC6NrvII8umztf0Ow"

describe("parseChannelInput", () => {
  it.each([
    // Channel IDs and /channel/ URLs, checked by ID.
    [ID, { by: "id", id: ID }],
    [`  ${ID}\n`, { by: "id", id: ID }],
    [`https://www.youtube.com/channel/${ID}`, { by: "id", id: ID }],
    [`youtube.com/channel/${ID}`, { by: "id", id: ID }],
    [`https://m.youtube.com/channel/${ID}/videos?view=0#top`, { by: "id", id: ID }],
    // Handles, with or without the @ and the URL around them.
    ["@LofiGirl", { by: "handle", handle: "@LofiGirl" }],
    ["LofiGirl", { by: "handle", handle: "@LofiGirl" }],
    ["  @LofiGirl  ", { by: "handle", handle: "@LofiGirl" }],
    ["https://www.youtube.com/@LofiGirl", { by: "handle", handle: "@LofiGirl" }],
    ["youtube.com/@LofiGirl", { by: "handle", handle: "@LofiGirl" }],
    ["www.youtube.com/@LofiGirl/videos?si=abc", { by: "handle", handle: "@LofiGirl" }],
    ["@lofi.girl-music_2", { by: "handle", handle: "@lofi.girl-music_2" }],
    ["https://www.youtube.com/@%E3%83%AD%E3%83%95%E3%82%A3", { by: "handle", handle: "@ロフィ" }],
    // Legacy /user/ URLs, by username.
    ["https://www.youtube.com/user/LofiGirl", { by: "username", username: "LofiGirl" }],
    ["youtube.com/user/LofiGirl/featured?x=1", { by: "username", username: "LofiGirl" }]
  ])("reads %j", (input, query) => {
    expect(parseChannelInput(input)).toEqual({ query })
  })

  it.each([
    "https://www.youtube.com/c/LofiGirl",
    "youtube.com/c/LofiGirl/videos",
    "  www.youtube.com/c/LofiGirl  "
  ])("rejects the custom URL %j", (input) => {
    expect(parseChannelInput(input)).toEqual({ error: CUSTOM_URL_ERROR })
  })

  it.each([
    "",
    "   ",
    "lofi girl",
    "@",
    "@@LofiGirl",
    "https://www.youtube.com/watch?v=jfKfPfyJRdk",
    "https://www.youtube.com/",
    "https://www.youtube.com/channel/not-an-id",
    "https://www.youtube.com/user/",
    "https://example.com/@LofiGirl",
    "youtube.com.evil.example/@LofiGirl",
    "channel/UCSJ4gkVC6NrvII8umztf0Ow"
  ])("rejects %j as not a channel", (input) => {
    expect(parseChannelInput(input)).toEqual({ error: NOT_A_CHANNEL_ERROR })
  })
})
