import { expect, test } from "bun:test"
import { channelUrl } from "./requests"

test("every typed channel form YT-CF-16 accepts becomes a youtube.com address to resolve", () => {
  expect(channelUrl("UCaaaaaaaaaaaaaaaaaaaaaa")).toBe("https://www.youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaa")
  expect(channelUrl("@some.handle")).toBe("https://www.youtube.com/@some.handle")
  expect(channelUrl("some.handle")).toBe("https://www.youtube.com/@some.handle")
  expect(channelUrl("youtube.com/@some.handle")).toBe("https://www.youtube.com/@some.handle")
  expect(channelUrl("https://www.youtube.com/c/Name")).toBe("https://www.youtube.com/c/Name")
  expect(channelUrl("/user/name")).toBe("https://www.youtube.com/user/name")
})

test("anything else is refused before YouTube is asked", () => {
  for (const input of ["ab", "has space", "https://example.com/@handle", "https://www.youtube.com/watch?v=aaaaaaaaaaa", "x".repeat(31)]) {
    expect(channelUrl(input)).toBeUndefined()
  }
})
