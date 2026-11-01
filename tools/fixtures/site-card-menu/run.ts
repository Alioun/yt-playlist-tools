import { cardMenuHarness, view } from "./harness"

// Deterministic consumer. Each line is one observation; expected.jsonl holds the complete output through EOF.
const lines: string[] = []
const emit = (value: Record<string, unknown>) => { lines.push(JSON.stringify(value)) }
const f = await cardMenuHarness()
f.start()
for (const id of ["thumb-img", "video-title", "empty", "channel-link", "avatar-img", "bare-avatar-img", "hashtag",
  "ad-text", "playlist-text", "mix-text", "two-videos", "no-menu-text", "hidden-menu-thumb", "outer-text", "outside"]) {
  const before = f.menuCalls().length
  const prevented = f.click(f.byId(id)).defaultPrevented
  await f.settle()
  const calls = f.menuCalls()
  emit({ case: id, prevented, jobs: calls.length - before, target: calls.length > before ? calls.at(-1)?.context?.target?.id ?? null : null })
}
emit({ case: "shift", prevented: f.click(f.byId("empty"), { shiftKey: true }).defaultPrevented })
f.source.publish(view({ keepLinkMenu: true }))
emit({ case: "keep-link-thumbnail", prevented: f.click(f.byId("thumb-img")).defaultPrevented, scopes: f.scopes.length })
emit({ case: "keep-link-empty", prevented: f.click(f.byId("empty")).defaultPrevented, scopes: f.scopes.length })
f.source.publish(view({ broken: true }))
emit({ case: "not-working", prevented: f.click(f.byId("empty")).defaultPrevented, requests: f.requests.length })
emit({ case: "not-working-again", prevented: f.click(f.byId("empty")).defaultPrevented, requests: f.requests.length })
f.source.publish(view({ on: false }))
emit({ case: "off", prevented: f.click(f.byId("empty")).defaultPrevented, disposed: f.scopes[0]?.disposed ?? null })
f.source.publish(view())
emit({ case: "on", prevented: f.click(f.byId("empty")).defaultPrevented, scopes: f.scopes.length })
f.host.dispose()
await f.settle()
emit({ case: "end", prevented: f.click(f.byId("empty")).defaultPrevented, resources: f.scopes.map(scope => scope.resourceCount),
  errors: f.errors.length, seen: f.seen.length, jobs: f.menuCalls().length })
f.dispose()
process.stdout.write(`${lines.join("\n")}\n`)
