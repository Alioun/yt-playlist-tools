import { existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { Options } from "@sveltejs/vite-plugin-svelte"
import type { ESTree, Plugin } from "vite"
import type { Entrypoint, WxtHooks } from "wxt"

type Site = "www" | "music"
type PageBundle = { kind: "feature" | "kit"; site: Site } | { kind: "page" | "unrelated" }
type Namespace = "root" | "client"
type ImportedNames = { root: Set<string>; client: Set<string>; disclose: boolean }
type Scope = { parent?: Scope; functionScope: boolean; bindings: Map<string, Namespace | null> }
type LinkedSpecifier = { kind: "namespace"; namespace: Namespace } | { kind: "library"; global: string } | { kind: "side-effect" }
const disclose = "svelte/internal/disclose-version"
const specifiers = new Map<string, LinkedSpecifier>([
  ["svelte", { kind: "namespace", namespace: "root" }],
  ["svelte/internal/client", { kind: "namespace", namespace: "client" }],
  ["$kit", { kind: "library", global: "globalThis.__pp.kit.lib" }],
  [disclose, { kind: "side-effect" }]
])
const virtualId = "virtual:page-link-svelte"
const resolvedVirtualId = `\0${virtualId}`
const clean = (id: string) => id.replace(/\?.*$/, "").replaceAll("\\", "/")
const emptyNames = (): ImportedNames => ({ root: new Set(), client: new Set(), disclose: false })

function classify(entries: readonly Entrypoint[]): PageBundle {
  if (!entries.every((entry) => entry.type === "unlisted-script")) return { kind: "unrelated" }
  const entry = entries[0]
  if (!entry || entries.length !== 1) throw Error("page-link requires independent unlisted IIFEs")
  for (const site of ["www", "music"] satisfies Site[]) {
    if (entry.name === `kit-${site}`) return { kind: "kit", site }
    if (entry.name.endsWith(`-${site}`) && !/^(core|page)-/.test(entry.name)) return { kind: "feature", site }
  }
  return { kind: "page" }
}

function children(node: ESTree.Node): ESTree.Node[] {
  const result: ESTree.Node[] = []
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent") continue
    const values: unknown[] = Array.isArray(value) ? value : [value]
    for (const item of values) {
      if (typeof item === "object" && item !== null && "type" in item && typeof item.type === "string") {
        result.push(item as ESTree.Node)
      }
    }
  }
  return result
}

function collect(ast: ESTree.Program, code: string, id: string, development: boolean): ImportedNames {
  const names = emptyNames()
  const scopes = new WeakMap<ESTree.Node, Scope>()
  const declarations = new WeakSet<ESTree.Node>()
  const parents = new WeakMap<ESTree.Node, ESTree.Node>()
  const root: Scope = { functionScope: true, bindings: new Map() }
  const fail = (node: ESTree.Node, message: string): never => {
    throw Error(`page-link ${id}: ${message}: ${code.slice(node.start, node.end)}`)
  }
  function bind(pattern: ESTree.Node, scope: Scope) {
    if (pattern.type === "Identifier") {
      scope.bindings.set(pattern.name, null)
      declarations.add(pattern)
    } else if (pattern.type === "RestElement") bind(pattern.argument, scope)
    else if (pattern.type === "AssignmentPattern") bind(pattern.left, scope)
    else if (pattern.type === "ArrayPattern") {
      for (const element of pattern.elements) if (element) bind(element, scope)
    } else if (pattern.type === "ObjectPattern") {
      for (const property of pattern.properties) bind(property.type === "RestElement" ? property.argument : property.value, scope)
    }
  }
  function prepare(node: ESTree.Node, incoming: Scope) {
    let scope = incoming
    const fn = node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression"
    if ((node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") && node.id) bind(node.id, incoming)
    const parent = parents.get(node)
    const functionBody = node.type === "BlockStatement" && (parent?.type === "FunctionDeclaration" || parent?.type === "FunctionExpression" || parent?.type === "ArrowFunctionExpression") && parent.body === node
    const varScope = fn || functionBody || node.type === "StaticBlock"
    if (varScope || node.type === "BlockStatement" || node.type === "CatchClause" || node.type === "ForStatement" || node.type === "ForOfStatement" || node.type === "ForInStatement" || node.type === "SwitchStatement" || node.type === "ClassExpression") {
      scope = { parent: incoming, functionScope: varScope, bindings: new Map() }
    }
    scopes.set(node, scope)
    if (fn) {
      if (node.type !== "ArrowFunctionExpression" && node.id) bind(node.id, scope)
      for (const parameter of node.params) bind(parameter, scope)
    }
    if (node.type === "ClassExpression" && node.id) bind(node.id, scope)
    if (node.type === "CatchClause" && node.param) bind(node.param, scope)
    if (node.type === "VariableDeclaration") {
      let target = scope
      if (node.kind === "var") while (!target.functionScope && target.parent) target = target.parent
      for (const declaration of node.declarations) bind(declaration.id, target)
    }
    if (node.type === "ImportDeclaration") {
      const source = String(node.source.value)
      const specifier = specifiers.get(source)
      const namespace = specifier?.kind === "namespace" ? specifier.namespace : undefined
      if (source.startsWith("svelte/") && !specifier) fail(node, "knownSvelteSpecifier unsupported import")
      if (source === disclose) {
        if (node.specifiers.length) fail(node, "disclose-version only supports side effects")
        names.disclose = true
      }
      for (const imported of node.specifiers) {
        bind(imported.local, scope)
        if (!namespace) continue
        if (imported.type === "ImportNamespaceSpecifier") scope.bindings.set(imported.local.name, namespace)
        else if (imported.type === "ImportSpecifier") names[namespace].add(imported.imported.type === "Identifier" ? imported.imported.name : String(imported.imported.value))
        else fail(imported, "unsupported Svelte default import")
      }
    }
    if ((node.type === "ExportNamedDeclaration" || node.type === "ExportAllDeclaration") && node.source) {
      const source = String(node.source.value)
      const specifier = specifiers.get(source)
      const namespace = specifier?.kind === "namespace" ? specifier.namespace : undefined
      if (source.startsWith("svelte/") && !namespace) fail(node, "knownSvelteSpecifier unsupported re-export")
      if (namespace) {
        if (node.type === "ExportAllDeclaration") {
          if (!development) fail(node, "namespace re-export escapes exact collection")
        } else for (const item of node.specifiers) names[namespace].add(item.local.type === "Identifier" ? item.local.name : String(item.local.value))
      }
    }
    for (const child of children(node)) {
      parents.set(child, node)
      prepare(child, node.type === "SwitchStatement" && child === node.discriminant ? incoming : scope)
    }
  }
  prepare(ast, root)
  function visit(node: ESTree.Node) {
    if (node.type === "Identifier" && !declarations.has(node)) {
      let scope = scopes.get(node)
      while (scope && !scope.bindings.has(node.name)) scope = scope.parent
      const namespace = scope?.bindings.get(node.name)
      if (namespace) {
        const parent = parents.get(node)
        if (parent?.type === "MemberExpression" && parent.object === node) {
          if (!parent.computed && parent.property.type === "Identifier") names[namespace].add(parent.property.name)
          else if (parent.computed && parent.property.type === "Literal" && typeof parent.property.value === "string") names[namespace].add(parent.property.value)
          else if (!development) fail(parent, "dynamic namespace access escapes exact collection")
        } else {
          const propertyName = (parent?.type === "MemberExpression" && parent.property === node && !parent.computed)
            || (parent?.type === "Property" && parent.key === node && !parent.computed && !parent.shorthand)
            || ((parent?.type === "MethodDefinition" || parent?.type === "PropertyDefinition") && parent.key === node && !parent.computed)
            || ((parent?.type === "LabeledStatement" || parent?.type === "BreakStatement" || parent?.type === "ContinueStatement") && parent.label === node)
            || (parent?.type === "ExportSpecifier" && parent.exported === node)
          if (!development && !propertyName) fail(node, "namespace escape prevents exact collection")
        }
      }
    }
    for (const child of children(node)) visit(child)
  }
  visit(ast)
  return names
}

export function createPageLink(options: { siteRoot: string; kitIndex: string; evidenceDir: string }) {
  const siteRoot = clean(realpathSync(resolve(options.siteRoot)))
  const kitRoot = clean(realpathSync(dirname(resolve(options.kitIndex))))
  const packageRoot = (name: string) => {
    let directory = dirname(realpathSync(fileURLToPath(import.meta.resolve(name))))
    while (!existsSync(resolve(directory, "package.json"))) {
      const parent = dirname(directory)
      if (parent === directory) throw Error(`page-link cannot locate package root for ${name}`)
      directory = parent
    }
    return clean(directory)
  }
  const svelteRoot = packageRoot("svelte")
  const bitsRoot = packageRoot("bits-ui")
  const imports = new Map<Site, Map<string, ImportedNames>>()
  let pageBuild = false
  let development = false
  let browser = "chrome"
  const buildOrder: string[] = []
  const combined = (site: Site) => {
    const names = emptyNames()
    for (const contribution of imports.get(site)?.values() ?? []) {
      for (const key of ["root", "client"] satisfies Namespace[]) for (const name of contribution[key]) names[key].add(name)
      names.disclose ||= contribution.disclose
    }
    return names
  }
  const pageCompileOptions: NonNullable<Options["dynamicCompileOptions"]> = ({ filename }) => {
    const path = clean(filename)
    return path.startsWith(`${siteRoot}/`) && !path.includes("/node_modules/") ? { css: "injected", runes: true } : pageBuild ? { css: "injected" } : {}
  }
  const buildKitsLast: WxtHooks["entrypoints:grouped"] = (_wxt, groups) => {
    imports.clear()
    buildOrder.length = 0
    const kits: typeof groups = []
    const others: typeof groups = []
    for (const group of groups) {
      const entries = Array.isArray(group) ? group : [group]
      const kitCount = entries.filter((entry) => entry.type === "unlisted-script" && /^kit-(www|music)$/.test(entry.name)).length
      if (kitCount && kitCount !== entries.length) throw Error("page-link mixed kit group")
      ;(kitCount ? kits : others).push(group)
    }
    groups.splice(0, groups.length, ...others, ...kits)
  }
  const linkPageScripts: WxtHooks["vite:build:extendConfig"] = (entries, config) => {
    const bundle = classify(entries)
    pageBuild = bundle.kind !== "unrelated"
    if (bundle.kind === "unrelated") return
    const label = entries.map((entry) => entry.name).join(",")
    config.plugins ??= []
    if (bundle.kind === "feature") {
      config.build ??= {}
      const rollup = config.build.rollupOptions ??= {}
      const external = rollup.external
      rollup.external = (id, importer, resolved) => {
        if (specifiers.has(id)) return true
        if (id.startsWith("svelte/")) throw Error(`knownSvelteSpecifier ${importer}: ${id}`)
        if (typeof external === "function") return external(id, importer, resolved)
        if (typeof external === "boolean") return external
        return (typeof external === "string" ? [external] : external instanceof RegExp ? [external] : external ?? []).some((item) => {
          if (typeof item === "string") return item === id
          const lastIndex = item.lastIndex
          item.lastIndex = 0
          const matches = item.test(id)
          item.lastIndex = lastIndex
          return matches
        })
      }
      const outputs = Array.isArray(rollup.output) ? rollup.output : [rollup.output ?? {}]
      for (const output of outputs) {
        const globals = output.globals
        output.globals = (id) => {
          const specifier = specifiers.get(id)
          if (specifier?.kind === "namespace") return `globalThis.__pp.svelte.${specifier.namespace}`
          if (specifier?.kind === "library") return specifier.global
          return typeof globals === "function" ? globals(id) : globals?.[id] ?? id
        }
      }
      rollup.output = Array.isArray(rollup.output) ? outputs : outputs[0]
    }
    const plugin: Plugin = {
      name: `page-link:${label}`,
      enforce: "post",
      buildStart() { buildOrder.push(label) },
      resolveId(id) { if (id === virtualId && bundle.kind === "kit") return resolvedVirtualId },
      load(id) {
        if (id !== resolvedVirtualId || bundle.kind !== "kit") return
        const names = combined(bundle.site)
        const dictionary = (namespace: Namespace) => `{${[...names[namespace]].sort().map((name) => `${JSON.stringify(name)}:${namespace}[${JSON.stringify(name)}]`).join(",")}}`
        return `${names.disclose || development ? `import ${JSON.stringify(disclose)};` : ""}\nimport * as root from 'svelte';\nimport * as client from 'svelte/internal/client';\nexport default {root:${development ? "root" : dictionary("root")},client:${development ? "client" : dictionary("client")}};`
      },
      transform: {
        order: "post",
        handler(code, id) {
          if (bundle.kind !== "feature") return
          if (!/\bsvelte\b/.test(code)) {
            imports.get(bundle.site)?.delete(clean(id))
            return
          }
          const names = collect(this.parse(code), code, id, development)
          let modules = imports.get(bundle.site)
          if (!modules) imports.set(bundle.site, modules = new Map())
          modules.set(clean(id), names)
        }
      },
      generateBundle(outputOptions, output) {
        if (outputOptions.format !== "iife") this.error(`unlistedIifeOnly ${label}: expected iife output`)
        const chunks: { file: string; modules: string[]; imports: string[]; dynamicImports: string[] }[] = []
        for (const artifact of Object.values(output)) {
          if (artifact.type === "asset") {
            if (artifact.fileName.endsWith(".css")) this.error(`noPageCss ${label}: ${artifact.fileName}`)
            continue
          }
          if (artifact.imports.some((id) => !specifiers.has(id)) || artifact.dynamicImports.length) this.error(`unlistedIifeOnly ${label}`)
          const modules = Object.keys(artifact.modules).map(clean)
          for (const id of modules) {
            const fromSvelte = id.startsWith(`${svelteRoot}/`) || id.includes("/node_modules/svelte/")
            const fromBits = id.startsWith(`${bitsRoot}/`) || id.includes("/node_modules/bits-ui/")
            if (fromSvelte && bundle.kind !== "kit" && label !== "popovers") this.error(`noFeatureRuntime ${label}: ${id}`)
            if (id.startsWith(`${kitRoot}/`) && bundle.kind === "feature") this.error(`noFeatureKitImplementation ${label}: ${id}`)
            if (fromBits && label !== "popovers") this.error(`lazyBitsOnly ${label}: ${id}`)
          }
          chunks.push({ file: artifact.fileName, modules, imports: artifact.imports, dynamicImports: artifact.dynamicImports })
        }
        if (chunks.length !== 1) this.error(`unlistedIifeOnly ${label}: expected one chunk`)
        const names = "site" in bundle ? combined(bundle.site) : emptyNames()
        const directory = resolve(options.evidenceDir, `${browser}-${development ? "dev" : "build"}`)
        mkdirSync(directory, { recursive: true })
        writeFileSync(resolve(directory, `${label}.json`), JSON.stringify({ label, bundle, development, buildOrder, names: { root: [...names.root].sort(), client: [...names.client].sort(), disclose: names.disclose }, contributions: "site" in bundle ? [...imports.get(bundle.site)?.keys() ?? []] : [], chunks }, null, 2))
      }
    }
    config.plugins.push(plugin)
  }
  const hooks = {
    "config:resolved": (wxt) => { development = wxt.config.command === "serve"; browser = wxt.config.browser },
    "entrypoints:grouped": buildKitsLast,
    "vite:build:extendConfig": linkPageScripts
  } satisfies Partial<WxtHooks>
  return { pageCompileOptions, hooks }
}
