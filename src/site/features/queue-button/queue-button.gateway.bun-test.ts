import { afterEach, expect, test } from "bun:test"
import { card, queueFixture, queueView, recycle, settle as settleUi, videoA, videoB, type QueueFixture } from "../../../../tools/fixtures/site-queue-button/harness"
import { added, answer, card as cardData, checked, listA, pending, queueWorld, settle, type QueueWorld } from "../../../../tools/fixtures/gateway-www-queue/specimens"
import { isVideoId } from "../../../shared/model/validation"

const a = checked(isVideoId, videoA),
  b = checked(isVideoId, videoB),
  c = checked(isVideoId, "CCCCCCCCCCC")
const open: { ui: QueueFixture; world: QueueWorld }[] = []
afterEach(() => {
  for (const { ui, world } of open.splice(0)) {
    ui.dispose()
    world.gateway.dispose()
  }
})

async function setup() {
  const world = queueWorld({ signedIn: false })
  const ui = await queueFixture({ view: queueView({ signedIn: false }), signedInPage: false })
  ui.respond((job, context) => world.gateway.run(job, context))
  open.push({ ui, world })
  return { ui, world }
}
async function click(ui: QueueFixture, target: ReturnType<typeof card>) {
  ui.hover(target.thumbnail, [target.element])
  ui.button()?.click()
  await settleUi()
}
function labelOn(ui: QueueFixture, target: ReturnType<typeof card>) {
  ui.hover(target.thumbnail, [target.element])
  return ui.button()?.getAttribute("aria-label") ?? null
}
const queued = (world: QueueWorld) => world.state.entries.map(entry => entry.videoId)
const addsTheVideoAsked = pending((queue, call) => {
  const edit = call.endpoint.playlistEditEndpoint as { actions: { addedVideoId: string }[] }
  return answer(added(queue.add(edit.actions[0]!.addedVideoId)))
})

test("a click queues the clicked video when YouTube gives its card another video while the add waits its turn", async () => {
  const { ui, world } = await setup()
  world.replace(listA, [])
  world.scripts.push(
    pending(() => undefined),
    addsTheVideoAsked
  )
  world.page.values.targetData = cardData(c)
  await click(ui, card(c, "Video C"))
  expect(world.calls).toHaveLength(1)

  const clicked = card(a, "Video A")
  world.page.values.targetData = cardData(a)
  await click(ui, clicked)
  expect(world.calls).toHaveLength(1)
  recycle(clicked, b, "Video B")
  world.page.values.targetData = cardData(b)
  await settle(world, 5_200)
  await settleUi()

  expect(queued(world)).toEqual([a])
  expect(ui.toast()?.content.text).toBe("Added “Video A” to queue")
  expect(labelOn(ui, card(a, "Video A"))).toBe("Added to queue")
  expect(labelOn(ui, clicked)).toBe("Add to queue")
})

test("a click on a card that already holds another video adds nothing and says it couldn't", async () => {
  const { ui, world } = await setup()
  world.scripts.push(
    pending(queue => {
      queue.add(b, listA)
    })
  )
  const clicked = card(a, "Video A")
  world.page.values.targetData = cardData(b)
  await click(ui, clicked)
  await settle(world, 5_200)
  await settleUi()

  expect(queued(world)).toEqual([])
  expect(world.calls).toHaveLength(0)
  expect(ui.toast()?.content.text).toBe("Couldn't add “Video A”")
  expect(labelOn(ui, clicked)).toBe("Couldn't add")
})
