import { nativeSharedSettingsAccess } from "./shared-settings"
import { createStartingLocalFilterWriter } from "../store/local-filter-writer"
import { nativeAccountRemovalHost } from "../store/account-removal-execution"
import { nativeSettingsImportHost } from "../store/settings-import-execution"
import { nativeSyncJoinHost } from "../store/sync-join-execution"
import { acquireLocalFilterWriterArea } from "./starting-owner-area"

type NativeBrowser = typeof import("wxt/browser").browser
type StartingDependencies = Parameters<typeof createStartingLocalFilterWriter>[0]
type StartingOwner = ReturnType<typeof createStartingLocalFilterWriter>
type HostName = "claim" | "join" | "recovery" | "canonicalAuthority" | "settingsImport"
type NativeHosts = {
  readonly [Name in HostName]?: Exclude<NonNullable<StartingDependencies[Name]>, { readonly kind: "fixture" }>
}

export type BrowserStartingOwnerOptions = Pick<StartingDependencies, "local" | "startup" | "onSyncResult">
  & Pick<StartingDependencies, "resetReceive">
  & Partial<Pick<StartingDependencies, "now" | "generation" | "syncClock" | "syncMutationPace" | "featureAccess" | "allocateShortcut">> & NativeHosts

export type BrowserStartingOwner = StartingOwner & {
  readonly session: { read: StartingOwner["readSession"]; change: StartingOwner["changeSession"] }
}

export function createBrowserStartingLocalFilterWriter(
  native: Pick<NativeBrowser, "storage"> & Partial<Pick<NativeBrowser, "permissions">>,
  options: BrowserStartingOwnerOptions
): BrowserStartingOwner {
  if (!options.local || !options.startup) throw new TypeError("Starting owner requires supplied local and startup collaborators")
  for (const host of [options.claim, options.join, options.recovery, options.canonicalAuthority, options.settingsImport]) {
    if (host && host.kind !== "unavailable") throw new TypeError("Native starting owner host is unavailable")
  }
  const release = acquireLocalFilterWriterArea(native.storage.local)
  let lifecycle: { readonly kind: "open" } | { readonly kind: "closing"; readonly result: Promise<void> } = { kind: "open" }
  let unconfirmedTeardown: { readonly error: unknown } | undefined
  function assertOpen() {
    if (lifecycle.kind !== "open") throw new Error("Starting owner disposal requested")
  }
  try {
    const clock = options.syncClock ?? {
      now: () => performance.now(), wallNow: () => Date.now(),
      after(milliseconds: number, run: () => void) {
        const timer = setTimeout(run, milliseconds)
        return () => clearTimeout(timer)
      }
    }
    const session: StartingDependencies["session"] = {
      get() { assertOpen(); return native.storage.session.get(null) },
      set(items) { assertOpen(); return native.storage.session.set(items) },
      remove(keys) { assertOpen(); return native.storage.session.remove(keys.map(key => `${key.kind}:${key.acct}`)) }
    }
    const owner = createStartingLocalFilterWriter({
      syncMutationPace: options.syncMutationPace,
      resetReceive: options.resetReceive,
      startup: options.startup,
      featureAccess: native.permissions ? nativeSharedSettingsAccess(native.permissions) : options.featureAccess,
      allocateShortcut: options.allocateShortcut,
      local: {
        get(keys) { assertOpen(); return options.local.get(keys) },
        set(items) { assertOpen(); return options.local.set(items) }
      },
      claim: options.claim ?? { kind: "unavailable" },
      removal: nativeAccountRemovalHost({ session, removeLocal(names) { assertOpen(); return native.storage.local.remove([...names]) } }),
      join: options.join ?? nativeSyncJoinHost({ session, removeLocal(names) { assertOpen(); return native.storage.local.remove([...names]) } }),
      recovery: options.recovery ?? { kind: "unavailable" },
      canonicalAuthority: options.canonicalAuthority ?? { kind: "unavailable" },
      settingsImport: options.settingsImport ?? nativeSettingsImportHost({ session, removeLocal(names) { assertOpen(); return native.storage.local.remove([...names]) } }),
      session,
      sync: {
        get() { assertOpen(); return native.storage.sync.get(null) },
        set(items) { assertOpen(); return native.storage.sync.set(items) },
        remove(keys) { assertOpen(); return native.storage.sync.remove([...keys]) },
        subscribe(changed) {
          assertOpen()
          const event = native.storage.sync.onChanged
          let active = true
          const listener = () => { if (active && lifecycle.kind === "open") changed() }
          function remove() {
            active = false
            try { event.removeListener(listener) }
            catch (error) { unconfirmedTeardown ??= { error }; throw error }
          }
          try { event.addListener(listener) }
          catch (error) {
            try { remove() } catch {}
            throw error
          }
          return remove
        }
      },
      syncClock: {
        now: () => clock.now(), wallNow: () => clock.wallNow(),
        after(milliseconds, run) {
          assertOpen()
          let active = true
          let cancel: () => void
          try {
            cancel = clock.after(milliseconds, () => {
              if (!active || lifecycle.kind !== "open") return
              active = false
              run()
            })
          } catch (error) { active = false; unconfirmedTeardown ??= { error }; throw error }
          return () => {
            active = false
            try { cancel() } catch (error) { unconfirmedTeardown ??= { error }; throw error }
          }
        }
      },
      onSyncResult(result) { if (lifecycle.kind === "open") options.onSyncResult(result) },
      now: options.now ?? (() => Date.now()),
      generation: options.generation ?? (() => crypto.randomUUID())
    })
    return {
      ...owner,
      changeFeatureSetting: (origin, change) => owner.changeFeatureSetting(origin, change),
      prepareSettingsImport: (origin, text) => owner.prepareSettingsImport(origin, text),
      importSettings: (origin, input) => owner.importSettings(origin, input),
      resumeSettingsImport: origin => owner.resumeSettingsImport(origin),
      session: { read: owner.readSession, change: owner.changeSession },
      startSync() {
        if (lifecycle.kind === "closing" && unconfirmedTeardown) return Promise.reject(unconfirmedTeardown.error)
        return owner.startSync()
      },
      dispose() {
        if (lifecycle.kind === "closing") return lifecycle.result
        let resolve!: () => void
        let reject!: (error: unknown) => void
        const result = new Promise<void>((done, failed) => { resolve = done; reject = failed })
        lifecycle = { kind: "closing", result }
        try { owner.dispose().then(() => {
          if (unconfirmedTeardown) { reject(unconfirmedTeardown.error); return }
          release(); resolve()
        }, reject) }
        catch (error) { reject(error) }
        return result
      }
    }
  } catch (error) {
    release()
    throw error
  }
}
