import { isBuildId } from "../../../src/shared/contracts/vocabulary"
import { objectShape } from "../../../src/shared/contracts/object-shape"
import { createRpc, createRpcCaller, type Authentication, type Deadline, type RpcContract } from "../../../src/shared/rpc/rpc"
import { createMemoryNetwork } from "../../../src/shared/rpc/memory"

type Sender = { context: "tab"; tabId: number; frameId: number } | { context: "background" }
type TabCalls = {
  "fixture.add": { payload: { video: string; playlists: string[] }; result: { added: string[] } }
  "fixture.hello": { payload: { site: "www" | "music" }; result: { tabId: number } }
}

const strings = (value: unknown) => Array.isArray(value) && value.every(item => typeof item === "string")
const contract: RpcContract<TabCalls> = {
  "fixture.add": {
    payload: (v): v is TabCalls["fixture.add"]["payload"] => objectShape(v, { video: x => typeof x === "string", playlists: strings }),
    result: (v): v is TabCalls["fixture.add"]["result"] => objectShape(v, { added: strings }),
    timeoutMs: 10_000
  },
  "fixture.hello": {
    payload: (v): v is TabCalls["fixture.hello"]["payload"] => objectShape(v, { site: x => x === "www" || x === "music" }),
    result: (v): v is TabCalls["fixture.hello"]["result"] => objectShape(v, { tabId: x => typeof x === "number" }),
    timeoutMs: 2_000
  }
}

function frameZero({ sender }: { sender: Sender }): Authentication<{ tabId: number }> {
  return sender.context === "tab" && sender.frameId === 0 ? { kind: "accepted", context: { tabId: sender.tabId } } : { kind: "rejected" }
}

export async function runRuntimeRpcFixture() {
  const build = "fixture-build"
  if (!isBuildId(build)) throw new Error("Invalid fixture build")
  const timers: (() => void)[] = []
  const deadline: Deadline = (_ms, expire) => {
    timers.push(expire)
    return () => {
      const index = timers.indexOf(expire)
      if (index >= 0) timers.splice(index, 1)
    }
  }
  const network = createMemoryNetwork<Sender>({ delivery: "queued" })
  const tabTarget = network.connect({ context: "tab", tabId: 7, frameId: 0 })
  const subframeTarget = network.connect({ context: "tab", tabId: 7, frameId: 2 })
  const tab = createRpcCaller({ send: tabTarget.send }, { build, contract, deadline })
  const subframe = createRpcCaller({ send: subframeTarget.send }, { build, contract, deadline })
  const callerConstructionListeners = network.listening()
  const background = createRpc(network.connect({ context: "background" }), { build, contract, deadline })
  const handled: string[] = []
  background.handle({
    authenticate: frameZero,
    handlers: {
      "fixture.add": ({ video, playlists }, { tabId }) => {
        handled.push(`add ${video} for tab ${tabId}`)
        return { added: playlists }
      },
      "fixture.hello": ({ site }, { tabId }) => {
        handled.push(`hello ${site} for tab ${tabId}`)
        return { tabId }
      }
    }
  })
  const calls = [
    tab.call("fixture.hello", { site: "www" }),
    tab.call("fixture.add", { video: "v1", playlists: ["PLmusic", "WL"] }),
    subframe.call("fixture.hello", { site: "www" }),
    tab.call("fixture.add", { video: "v2", playlists: ["PLgym"] })
  ]
  const [hello, add, forged, lost] = network.queued()
  add!.deliver()
  hello!.deliver()
  forged!.deliver()
  lost!.reject()
  const outcomes = await Promise.all(calls)
  const callerCallListeners = network.listening() - 1
  tab.dispose()
  subframe.dispose()
  const callerDisposalListeners = network.listening() - 1
  background.dispose()
  return {
    outcomes,
    handled,
    trace: network.trace(),
    pendingDeadlines: timers.length,
    listening: network.listening(),
    callerListeners: { construction: callerConstructionListeners, calls: callerCallListeners, disposal: callerDisposalListeners }
  }
}

if (import.meta.main) {
  const result = await runRuntimeRpcFixture()
  for (const outcome of result.outcomes) process.stdout.write(`${JSON.stringify({ outcome })}\n`)
  for (const entry of result.trace) process.stdout.write(`${JSON.stringify({ trace: entry })}\n`)
  process.stdout.write(`${JSON.stringify({ handled: result.handled, pendingDeadlines: result.pendingDeadlines, listening: result.listening, callerListeners: result.callerListeners })}\n`)
}
