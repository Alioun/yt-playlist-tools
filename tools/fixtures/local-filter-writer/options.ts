declare const chrome: typeof import("wxt/browser").browser

Object.assign(globalThis, { requestLocalFilterChange: (raw: unknown) => chrome.runtime.sendMessage(raw) })
export {}
