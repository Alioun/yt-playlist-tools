import type { Monitor } from "../monitor/monitor"
import type { Requester, TabContext, TabLookup, Tabs } from "../tabs/ports"
import type { BuildId, Job, JobId, Site } from "../../shared/contracts"
import type { UiCheck, UiDiagnostics, UiSignal } from "../../shared/contracts/ui-pages"
import type { AccountKey } from "../../shared/model"

// One read per read job that needs no item, as Check now runs them (HEALTH-23). Account jobs need a signed-in tab.
const reads: Readonly<Record<Site, readonly { readonly job: JobId; readonly account: boolean }[]>> = {
  www: [
    { job: "account", account: false },
    { job: "accountLabel", account: true },
    { job: "playlists", account: true }
  ],
  music: [
    { job: "account", account: false },
    { job: "castState", account: false },
    { job: "nowPlaying", account: false }
  ]
}

/**
 * Diagnostics' session evidence (HEALTH-22 to HEALTH-24): the breakage signals the Monitor holds for every open tab's
 * account, and Check now, which runs each site's read jobs once in its most recent normal tab and writes nothing.
 * The jobs' own signals reach the Monitor through the tab as usual. A check is kept until the worker stops.
 */
export function createDiagnostics(deps: {
  readonly tabs: Pick<Tabs, "known" | "runIn">
  tab(tabId: number): Promise<TabLookup>
  readonly monitor: Pick<Monitor, "diagnostics">
  readonly build: BuildId
  consented(): boolean
  now(): number
}) {
  const checks = new Map<Site, UiCheck>()
  // Normal tabs only: a private tab's evidence stays in that window, and Check now never reads YouTube there.
  async function open(): Promise<{ readonly context: TabContext; readonly acct: AccountKey | null }[]> {
    const rows: { readonly context: TabContext; readonly acct: AccountKey | null }[] = []
    for (const known of await deps.tabs.known({ kind: "all" })) {
      if (known.privateTab) continue
      const lookup = await deps.tab(known.tabId).catch(() => null)
      if (lookup?.kind !== "tab" || lookup.tab.site === null) continue
      const site = lookup.tab.site
      rows.push({
        acct: known.acct,
        context: { tab: { ...lookup.tab, site }, info: known.acct === null ? { site, build: deps.build, signedIn: false, acct: null } : { site, build: deps.build, signedIn: true, acct: known.acct } }
      })
    }
    return rows.sort((x, y) => y.context.tab.lastAccessed - x.context.tab.lastAccessed)
  }
  async function check(site: Site, serving: { readonly context: TabContext; readonly acct: AccountKey | null }): Promise<UiCheck> {
    const req: Requester = { windowId: serving.context.tab.windowId, incognito: false, activeTabId: serving.context.tab.tabId }
    const jobs = []
    for (const read of reads[site]) {
      if (read.account && serving.acct === null) continue
      const invocation = (read.account ? { job: { kind: read.job }, acct: serving.acct } : { job: { kind: read.job } }) as never
      const outcome = await deps.tabs
        .runIn<Job>(serving.context.tab.tabId, invocation, { site, req, account: serving.acct === null ? { kind: "any" } : { kind: "account", acct: serving.acct, signedIn: true } })
        .catch(() => null)
      jobs.push({ job: read.job, ok: outcome?.kind === "result" && outcome.result.ok })
    }
    return { site, at: deps.now(), jobs }
  }
  function signals(journals: readonly Awaited<ReturnType<Monitor["diagnostics"]>>[]): UiSignal[] {
    const seen = new Map<string, UiSignal>()
    for (const journal of journals)
      for (const row of journal?.signals ?? []) {
        const s = row.signal,
          shape = s.shape === null ? null : JSON.stringify(s.shape).slice(0, 2048)
        const signal: UiSignal = {
          site: s.site,
          feature: s.feature,
          job: s.job,
          route: s.route,
          kind: s.kind,
          pageType: s.pageType,
          clientVersion: s.clientVersion,
          shape,
          count: s.count,
          firstSeen: s.firstSeen,
          lastSeen: s.lastSeen
        }
        seen.set(JSON.stringify([signal.site, signal.feature, signal.job, signal.route, signal.kind, signal.pageType, shape, row.tabId]), signal)
      }
    return [...seen.values()].sort((x, y) => x.firstSeen - y.firstSeen).slice(-200)
  }
  return {
    async read(run: boolean): Promise<UiDiagnostics> {
      const rows = await open()
      const serving = { www: rows.find(row => row.context.tab.site === "www"), music: rows.find(row => row.context.tab.site === "music") }
      if (run) {
        if (!deps.consented()) return { kind: "refused", reason: "consent" }
        if (!serving.www && !serving.music) return { kind: "refused", reason: "no-tab" }
        for (const site of ["www", "music"] as const) {
          const tab = serving[site]
          if (tab) checks.set(site, await check(site, tab))
        }
      }
      const journals = await Promise.all(rows.map(row => deps.monitor.diagnostics(row.context).catch(() => undefined)))
      return { kind: "diagnostics", checks: [...checks.values()], signals: signals(journals), tabs: { www: serving.www !== undefined, music: serving.music !== undefined } }
    }
  }
}
