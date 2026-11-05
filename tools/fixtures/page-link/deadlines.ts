import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { createDirectPageChannel } from "../../../src/shared/rpc/page-channel"
import { createPageLink } from "../../../src/site/core/page-link"
import { build, deferred, expectedKey, harness, invocation, rawIdentity, vocabulary } from "./support"

GlobalRegistrator.register()
const absent = createPageLink({ build, site: "www", vocabulary }, createDirectPageChannel())
const missing = await absent.hello
if (missing.ok || missing.reason !== "unavailable") throw new Error("Unbounded real hello")
absent.dispose()
const remote = deferred<unknown>()
const h = harness({ link: { clock: undefined }, run: () => remote.promise })
try {
  await h.link.hello
  const result = await h.link.run(invocation({ job: { kind: "create", title: "Synthetic", privacy: "PRIVATE" }, acct: expectedKey(rawIdentity) }))
  if (result.ok || result.reason !== "unconfirmed" || h.calls.length !== 1) throw new Error("Invalid real write deadline")
  process.stdout.write(JSON.stringify({ hello: missing, write: result, remoteCalls: h.calls.length, retries: 0 }) + "\n")
} finally {
  h.dispose()
  await GlobalRegistrator.unregister()
}
