import { configDefaults, defineConfig, type Plugin, type ViteUserConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import { WxtVitest } from "wxt/testing/vitest-plugin"

type TargetBrowser = "chrome" | "firefox"
const MANIFEST_VERSION = 3

/**
 * WxtVitest ships a `globals()` Vite plugin that `define`s import.meta.env.BROWSER,
 * FIREFOX, CHROME, MANIFEST_VERSION... That define is SILENTLY DROPPED under Vitest:
 * Vitest's `MetaEnvReplacerPlugin` (enforce: "pre") rewrites every `import.meta.env`
 * to a process.env-backed Proxy before vite:define ever runs, and Vitest only
 * harvests `import.meta.env.*` defines that were present on the *user* config when
 * its own config() hook ran -- plugin-contributed defines are merged in too late.
 * Even when harvested they land in process.env and come back as STRINGS, so the
 * string "false" would be truthy.
 *
 * This plugin does the substitution itself, at enforce:"pre", keeping real
 * booleans/numbers. Verified against wxt 0.21.4 / vite 8.2.2 / vitest 4.1.11.
 */
function wxtTestGlobals(browser: TargetBrowser, manifestVersion: number): Plugin {
  const values: Record<string, string> = {
    "import.meta.env.MANIFEST_VERSION": String(manifestVersion),
    "import.meta.env.BROWSER": JSON.stringify(browser),
    "import.meta.env.CHROME": String(browser === "chrome"),
    "import.meta.env.FIREFOX": String(browser === "firefox"),
    "import.meta.env.SAFARI": "false",
    "import.meta.env.EDGE": "false",
    "import.meta.env.OPERA": "false",
    "import.meta.env.COMMAND": JSON.stringify("serve")
  }
  return {
    name: "wxt:test-globals",
    enforce: "pre",
    transform(code) {
      if (!code.includes("import.meta.env.")) return null
      let out = code
      let changed = false
      for (const [k, v] of Object.entries(values)) {
        if (out.includes(k)) { out = out.split(k).join(v); changed = true }
      }
      return changed ? { code: out, map: null } : null
    }
  }
}

function project(browser: TargetBrowser): ViteUserConfig {
  return {
    plugins: [
      wxtTestGlobals(browser, MANIFEST_VERSION),
      react(),
      WxtVitest({ browser, manifestVersion: MANIFEST_VERSION })
    ],
    test: {
      name: browser,
      globals: true,
      environment: "happy-dom",
      setupFiles: ["./vitest.setup.ts"],
      // Chrome is the default target and runs the whole suite.
      // Firefox only runs tests explicitly written against the Firefox build,
      // so Chrome-specific assertions don't have to be duplicated.
      include:
        browser === "chrome"
          ? ["src/**/*.{test,spec}.{ts,tsx}"]
          : ["src/**/*.firefox.{test,spec}.{ts,tsx}"],
      exclude: [
        ...configDefaults.exclude,
        ...(browser === "chrome" ? ["src/**/*.firefox.{test,spec}.{ts,tsx}"] : [])
      ],
      css: false,
      restoreMocks: true
    }
  }
}

/**
 * The token-broker server is plain Bun/Node code -- no extension APIs, no
 * auto-imports. Running it through WxtVitest would only slow it down.
 */
const serverProject: ViteUserConfig = {
  test: {
    name: "server",
    globals: true,
    environment: "node",
    include: ["server/**/*.{test,spec}.ts"]
  }
}

export default defineConfig({
  test: {
    projects: [project("chrome"), project("firefox"), serverProject],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.{ts,tsx}", "server/**/*.ts"],
      exclude: [
        "src/components/ui/**",       // vendored shadcn components
        "src/**/*.test.{ts,tsx}",
        "server/index.ts",            // process entry: env + Bun.serve only
        "src/entrypoints/**/main.tsx" // ReactDOM.createRoot bootstrap
      ]
    }
  }
})
