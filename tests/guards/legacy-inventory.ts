import type { Finding } from "./checker"

export const legacyInventory: Finding[] = [
  {
    "file": "src/components/SessionAccess.tsx",
    "line": 1,
    "rule": "imports",
    "reason": "wxt-boundary",
    "evidence": "wxt/browser"
  },
  {
    "file": "src/entrypoints/background.ts",
    "line": 1,
    "rule": "entrypoints",
    "reason": "entrypoint-lines",
    "evidence": "216"
  },
  {
    "file": "src/entrypoints/options/App.tsx",
    "line": 1,
    "rule": "entrypoints",
    "reason": "entrypoint-lines",
    "evidence": "34"
  },
  {
    "file": "src/entrypoints/popup/App.tsx",
    "line": 1,
    "rule": "entrypoints",
    "reason": "entrypoint-lines",
    "evidence": "272"
  },
  {
    "file": "src/entrypoints/youtube.content.tsx",
    "line": 1,
    "rule": "entrypoints",
    "reason": "entrypoint-lines",
    "evidence": "165"
  },
  {
    "file": "src/entrypoints/youtube.content.tsx",
    "line": 94,
    "rule": "running-cost",
    "reason": "broad-subtree-observer",
    "evidence": "playerObserver.observe(document.documentElement, { childList: true, subtree: true })"
  },
  {
    "file": "src/lib/queue-button.ts",
    "line": 291,
    "rule": "running-cost",
    "reason": "broad-subtree-observer",
    "evidence": "observer.observe(document.documentElement, { childList: true, subtree: true })"
  },
  {
    "file": "src/lib/session.ts",
    "line": 1,
    "rule": "imports",
    "reason": "wxt-boundary",
    "evidence": "wxt/browser"
  },
  {
    "file": "src/lib/storage.ts",
    "line": 1,
    "rule": "imports",
    "reason": "wxt-boundary",
    "evidence": "wxt/browser"
  },
  {
    "file": "src/lib/storage.ts",
    "line": 2,
    "rule": "imports",
    "reason": "wxt-boundary",
    "evidence": "wxt/utils/storage"
  },
  {
    "file": "src/lib/storage.ts",
    "line": 191,
    "rule": "storage-writes",
    "reason": "storage-write",
    "evidence": "browser.storage.local.remove([ \"accessToken\", \"refreshToken\", \"clientID\", \"clientSecret\", \"authMode\", \"authServerURL\" ])"
  },
  {
    "file": "src/lib/storage.ts",
    "line": 209,
    "rule": "storage-writes",
    "reason": "storage-write",
    "evidence": "browser.storage.local.clear()"
  },
  {
    "file": "src/lib/storage.ts",
    "line": 210,
    "rule": "storage-writes",
    "reason": "storage-write",
    "evidence": "browser.storage.sync.clear()"
  },
  {
    "file": "src/lib/storage.ts",
    "line": 210,
    "rule": "storage-writes",
    "reason": "storage-write",
    "evidence": "browser.storage.session.clear()"
  },
  {
    "file": "src/page/youtube-session.ts",
    "line": 1,
    "rule": "imports",
    "reason": "layer-boundary",
    "evidence": "@/lib/session-types"
  }
]
