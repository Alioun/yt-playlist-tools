import { accountA, a, build, fixtureView, nativeTab, normal, privateRequester, signedIn, tabsFixture } from "./harness"

export async function runTabsFixture() {
  const h = tabsFixture()
  try {
    h.seedTab(nativeTab(1), signedIn())
    h.seedTab(nativeTab(9, { windowId: 2, incognito: true }), signedIn())
    const hello = { ...signedIn(), build, hidden: true, fresh: true }
    const seen = await h.engine.seen(1, hello, fixtureView)
    const privateSeen = await h.engine.seen(9, hello, fixtureView)
    const restarted = h.restart()
    const inView = await restarted.accountInView(normal)
    const routed = await restarted.serve({ job: { kind: "playlists" }, acct: a }, { site: "www", req: normal, account: accountA })
    const privateView = await h.engine.accountInView(privateRequester)
    return { seen, privateSeen, inView, privateView, routed, stored: h.stored(), calls: h.calls, sessionWrites: h.sessionWrites() }
  } finally {
    await h.dispose()
  }
}

if (import.meta.main) process.stdout.write(`${JSON.stringify(await runTabsFixture())}\n`)
