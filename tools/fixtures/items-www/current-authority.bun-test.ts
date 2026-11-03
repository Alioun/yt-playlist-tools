import { afterEach, expect, test } from "bun:test"
import { rawNavigation, rawPlayer } from "../../../src/page/gateway.specimens"
import { itemsFixture } from "./harness"
import { firstVideo, secondVideo, shortVideo } from "./specimens"

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})

test("watch ad player identity cannot replace the navigation content video", async () => {
  const h = await itemsFixture()
  cleanups.push(() => h.dispose())
  h.items.track(h.owner())
  const player = h.player()
  player.update(rawPlayer(secondVideo))
  player.root.classList.add("ad-showing")
  h.navigate(rawNavigation("watch", firstVideo), `/watch?v=${firstVideo}`)
  expect(await h.items.resolve()).toMatchObject({ kind: "current-video", video: { videoId: firstVideo } })
})

test("an unconfirmed home player does not become the current miniplayer", async () => {
  const h = await itemsFixture()
  cleanups.push(() => h.dispose())
  h.items.track(h.owner())
  const player = h.player()
  player.update(rawPlayer(secondVideo))
  h.navigate(rawNavigation("other"))
  expect(await h.items.resolve()).toHaveProperty("kind", "current-unavailable")
  player.root.dispatchEvent(new Event("onVideoDataChange"))
  expect(await h.items.resolve()).toMatchObject({ kind: "current-video", video: { videoId: secondVideo } })
})

test("a Shorts ad navigation is not a content Short", async () => {
  const h = await itemsFixture()
  cleanups.push(() => h.dispose())
  h.items.track(h.owner())
  const player = h.player()
  player.root.id = "shorts-player"
  player.update(rawPlayer(shortVideo))
  h.navigate(
    {
      ...rawNavigation("shorts", shortVideo),
      endpoint: {
        reelWatchEndpoint: {
          videoId: shortVideo,
          adClientParams: { isAd: true }
        }
      }
    },
    `/shorts/${shortVideo}`
  )
  expect(await h.items.resolve()).toHaveProperty("kind", "current-unavailable")
})
