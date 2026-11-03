import { createBrowserStoreLifecycle, type ClearAllTeardown } from "../adapters/store-lifecycle"
import { deleteRetiredDatabase, keyPlatform, openFirstRun, type NativeBrowser } from "../adapters/browser"
import { nativeStartupInventory } from "../adapters/startup-inventory"
import { createStoreStartupHost } from "../adapters/startup-source"
import type { StoreLifecycle } from "../store/store-lifecycle"
import type { Platform } from "../../shared/platform"

const shortcutAlphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
function shortcutId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), byte => shortcutAlphabet[byte % shortcutAlphabet.length]).join("")
}

/**
 * The store owner and its start (06 §6.9, R64): the 1.x migration runs inside the owner's first startup job,
 * the interim conversion stays off (G29: no conversion host is supplied), and sync starts once it's ready.
 */
export function composeStore(native: NativeBrowser, platform: Platform, teardown: () => ClearAllTeardown): StoreLifecycle {
  const clock = {
    now: () => performance.now(),
    wallNow: () => Date.now(),
    after(milliseconds: number, run: () => void) {
      const timer = setTimeout(run, milliseconds)
      return () => clearTimeout(timer)
    }
  }
  const startup = createStoreStartupHost({
    context: { deviceId: crypto.randomUUID(), settingsGen: crypto.randomUUID(), at: Date.now(), shortcutId: shortcutId(), platform: keyPlatform(platform, navigator.platform), commands: [] },
    source: nativeStartupInventory({ get: keys => native.storage.local.get(keys) }),
    cleanup: {
      removeLocal: keys => native.storage.local.remove([...keys]),
      async deleteDatabase(name) {
        if ((await deleteRetiredDatabase(name)) !== "deleted") throw new Error("Retired database deletion unconfirmed")
      },
      removeSession: keys => native.storage.session.remove([...keys])
    }
  })
  const lifecycle = createBrowserStoreLifecycle(native, {
    owner: {
      local: { get: keys => native.storage.local.get(keys === null ? null : [...keys]), set: items => native.storage.local.set(items) },
      startup,
      onSyncResult: () => {}
    },
    clock,
    generation: () => crypto.randomUUID(),
    teardown: { quiesce: () => teardown().quiesce() },
    database: { delete: deleteRetiredDatabase },
    firstRun: {
      async open() {
        return (await openFirstRun(native)) === "opened" ? { kind: "opened" } : { kind: "unconfirmed", reason: "not-opened" }
      }
    },
    // The popup's reset notice belongs to the notices model (B28). Until it exists the notice is only logged.
    notices: {
      async publish(notice) {
        console.info(`[Perchling] ${notice.text}`)
        return "published"
      }
    }
  })
  void lifecycle.ready().then(state => {
    if (state.kind === "active") void state.owner.startSync()
  })
  return lifecycle
}
