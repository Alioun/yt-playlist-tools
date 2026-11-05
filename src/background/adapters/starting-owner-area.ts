type NativeBrowser = typeof import("wxt/browser").browser

const localOwners = new WeakSet<NativeBrowser["storage"]["local"]>()

export function acquireLocalFilterWriterArea(area: NativeBrowser["storage"]["local"]): () => void {
  if (localOwners.has(area)) throw new Error("Local storage already owned")
  localOwners.add(area)
  let owned = true
  return () => {
    if (owned) {
      owned = false
      localOwners.delete(area)
    }
  }
}
