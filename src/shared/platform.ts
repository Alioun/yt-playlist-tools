import { isBuildId, type BuildId } from "./contracts/vocabulary"

declare global {
  interface ImportMetaEnv {
    readonly PP_BUILD: string
  }
}

export type Platform = {
  readonly browser: "chrome" | "firefox"
  readonly mode: string
  readonly build: BuildId
}

function buildId(value: unknown): BuildId {
  if (!isBuildId(value)) throw new Error("Missing build ID")
  return value
}

/** The only reader of `import.meta.env` (Q-TOOL-8). Code that differs per browser takes a `Platform`. */
export const platform: Platform = Object.freeze({
  browser: import.meta.env.FIREFOX ? "firefox" : "chrome",
  mode: import.meta.env.MODE,
  build: buildId(import.meta.env.PP_BUILD)
})
