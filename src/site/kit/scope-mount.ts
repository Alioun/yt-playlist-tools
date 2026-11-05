import { flushSync, mount, unmount } from "svelte"
import type { ScopeMountPort } from "../core/scope"

export function svelteScopeMount(onError: (error: unknown) => void): ScopeMountPort {
  return {
    mount(component, props, where) {
      const instance = flushSync(() => mount(component, { props, target: where, intro: false }))
      return () => {
        void unmount(instance, { outro: false }).catch(error => {
          try { onError(error) } catch {}
        })
      }
    }
  }
}
