import { expect, test } from "bun:test"
import { parseRoute } from "./route"
import { browserLabel, reportAddress } from "./report"

test("hash routes pick a section, or a feature's section with its card and playlist, and default to YouTube", () => {
  expect(parseRoute("#everywhere")).toEqual({ section: "everywhere" })
  expect(parseRoute("#feature-music-keys")).toEqual({ section: "music", feature: "music-keys" })
  expect(parseRoute("#feature-auto-add&playlist=PLabc")).toEqual({ section: "youtube", feature: "auto-add", playlist: "PLabc" as never })
  expect(parseRoute("#feature-any-tab-keys")).toEqual({ section: "everywhere", feature: "any-tab-keys" })
  expect(parseRoute("")).toEqual({ section: "youtube" })
  expect(parseRoute("#feature-nope")).toEqual({ section: "youtube" })
})

test("the report address names the form, title and four values, URL-encoded, and an idea has no status", () => {
  expect(reportAddress({ kind: "not-working", version: "2.0.0 (beta)", browser: "Firefox 141", feature: "Auto-add", status: "Not working" }))
    .toBe("https://github.com/Alioun/yt-playlist-tools/issues/new?template=not-working.yml&title=Auto-add%20isn't%20working&version=2.0.0%20(beta)&browser=Firefox%20141&feature=Auto-add&status=Not%20working")
  expect(reportAddress({ kind: "idea", version: "2.0.0", browser: "Chrome 140", feature: "Something else", status: "Working" }))
    .toBe("https://github.com/Alioun/yt-playlist-tools/issues/new?template=idea.yml&title=&version=2.0.0&browser=Chrome%20140&feature=Something%20else")
  expect(browserLabel("Mozilla/5.0 (X11; Linux x86_64; rv:141.0) Gecko/20100101 Firefox/141.0", "firefox")).toBe("Firefox 141")
})
