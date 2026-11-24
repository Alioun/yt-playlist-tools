import { expect, test } from "bun:test"
import { englishI18n } from "../../../tools/fixtures/localization/scripted"
import type { PageFeatureId } from "../contracts/tab-view"
import { noticeText } from "./index"

const i18n = englishI18n()
const www = (...features: [PageFeatureId, ...PageFeatureId[]]) => noticeText({ due: { kind: "not-working", features }, site: "www", unavailableActionNames: [] }, i18n)

test("a single YouTube feature's notice is its own whole message from YT-BRK-06", () => {
  expect(www("queue-button")).toBe("The Add to queue button isn't working right now because YouTube changed something. Use YouTube's ⋮ menu for now.")
  expect(www("card-menu")).toBe("The right-click menu isn't working right now because YouTube changed something. You'll get the browser's menu for now.")
  expect(www("auto-add")).toBe("Auto-add isn't working right now because YouTube changed something. It won't add the videos you watch until it works again.")
  expect(www("quick-save")).toBe("Quick-save on thumbnails isn't working right now because YouTube changed something. Use YouTube's own Save for now.")
  expect(www("shortcuts")).toBe("Playlist shortcuts aren't working right now because YouTube changed something. Use YouTube's own Save for now.")
  expect(www("watch-button")).toBe("The watch-page button isn't working right now because YouTube changed something. This video's status is still in the toolbar popup.")
})

test("features found together share one notice that names each by its full name (R75)", () => {
  expect(www("quick-save", "queue-button")).toBe(
    "Quick-save on thumbnails and Queue button on thumbnails aren't working right now because YouTube changed something. Use YouTube's own buttons for now."
  )
})
