import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import type { Options } from "@sveltejs/vite-plugin-svelte"
import type { ESTree, Plugin } from "vite"
import type { Entrypoint, WxtHooks } from "wxt"
import type { Site } from "../src/shared/contracts/vocabulary"
import { popoversBundle, type EntryOwnership, type PageBundle } from "../src/shared/features/registration.ts"

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

function classify(entries: readonly Entrypoint[], ownership: EntryOwnership): PageBundle {
  if (!entries.every((entry) => entry.type === "unlisted-script")) return { kind: "unrelated" }
  const entry = entries[0]
  if (!entry || entries.length !== 1) throw Error("page-link requires independent unlisted IIFEs")
  const bundle = Object.hasOwn(ownership, entry.name) ? ownership[entry.name] : undefined
  if (!bundle) throw Error(`page-link missing entry ownership ${entry.name}`)
  return bundle
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
    if (node.type === "ImportDeclaration" || ((node.type === "ExportNamedDeclaration" || node.type === "ExportAllDeclaration") && node.source)) return
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

export function createPageLink(options: { siteRoot: string; kitIndex: string; evidenceDir: string; entries: EntryOwnership }) {
  const siteRoot = clean(realpathSync(resolve(options.siteRoot)))
  const kitRoot = clean(realpathSync(dirname(resolve(options.kitIndex))))
  const packageOwners = new Map<string, string | null>()
  const packageOwner = (id: string): string | null => {
    const path = clean(id)
    if (!isAbsolute(path) || !existsSync(path)) return null
    let directory = dirname(realpathSync(path))
    const visited: string[] = []
    let owner: string | null = null
    while (true) {
      if (packageOwners.has(directory)) {
        owner = packageOwners.get(directory) ?? null
        break
      }
      visited.push(directory)
      const manifestPath = resolve(directory, "package.json")
      if (existsSync(manifestPath)) {
        const manifest: unknown = JSON.parse(readFileSync(manifestPath, "utf8"))
        if (typeof manifest === "object" && manifest !== null && "name" in manifest && typeof manifest.name === "string") {
          owner = manifest.name
          break
        }
      }
      const parent = dirname(directory)
      if (parent === directory) break
      directory = parent
    }
    for (const path of visited) packageOwners.set(path, owner)
    return owner
  }
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
    packageOwners.clear()
    buildOrder.length = 0
    const kits: typeof groups = []
    const others: typeof groups = []
    for (const group of groups) {
      const entries = Array.isArray(group) ? group : [group]
      const kitCount = entries.filter((entry) => entry.type === "unlisted-script" && options.entries[entry.name]?.kind === "kit").length
      if (kitCount && kitCount !== entries.length) throw Error("page-link mixed kit group")
      ;(kitCount ? kits : others).push(group)
    }
    groups.splice(0, groups.length, ...others, ...kits)
  }
  const linkPageScripts: WxtHooks["vite:build:extendConfig"] = (entries, config) => {
    const bundle = classify(entries, options.entries)
    pageBuild = bundle.kind !== "unrelated"
    if (bundle.kind === "unrelated") return
    const label = entries.map((entry) => entry.name).join(",")
    const inheritedExternals = new Map<string, Set<string | undefined>>()
    const composedExternals = new Set<string>()
    const renderedImports = new Map<string | null, Set<string>>()
    config.plugins ??= []
    if (bundle.kind === "feature") {
      config.build ??= {}
      const rollup = config.build.rollupOptions ??= {}
      const external = rollup.external
      rollup.external = (id, importer, resolved) => {
        if (specifiers.has(id)) return true
        if (id.startsWith("svelte/")) throw Error(`knownSvelteSpecifier ${importer}: ${id}`)
        const inherited = typeof external === "function" ? external(id, importer, resolved)
          : typeof external === "boolean" ? external
          : (typeof external === "string" ? [external] : external instanceof RegExp ? [external] : external ?? []).some((item) => {
          if (typeof item === "string") return item === id
          const lastIndex = item.lastIndex
          item.lastIndex = 0
          const matches = item.test(id)
          item.lastIndex = lastIndex
          return matches
        })
        if (inherited) {
          let importers = inheritedExternals.get(id)
          if (!importers) inheritedExternals.set(id, importers = new Set())
          importers.add(importer)
        }
        return inherited
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
          const names = collect(this.parse(code), code, id, development)
          if (!names.root.size && !names.client.size && !names.disclose) {
            imports.get(bundle.site)?.delete(id)
            return
          }
          let modules = imports.get(bundle.site)
          if (!modules) imports.set(bundle.site, modules = new Map())
          modules.set(id, names)
        }
      },
      async renderStart() {
        renderedImports.clear()
        composedExternals.clear()
        for (const [id, importers] of [...inheritedExternals]) {
          if (this.getModuleInfo(id)) {
            composedExternals.add(id)
            continue
          }
          for (const importer of importers) {
            const resolved = await this.resolve(id, importer)
            if (!resolved?.external) this.error(`unlistedIifeOnly ${label}: missing external provenance ${id}`)
            composedExternals.add(resolved.id)
          }
        }
      },
      renderChunk: {
        order: "pre",
        handler(_code, chunk) {
          const modules = new Set(chunk.moduleIds)
          for (const moduleId of this.getModuleIds()) {
            if (!modules.has(moduleId)) continue
            const module = this.getModuleInfo(moduleId)
            if (!module) this.error(`unlistedIifeOnly ${label}: missing module provenance ${moduleId}`)
            for (const id of module.importedIds) {
              const dependency = this.getModuleInfo(id)
              if (!dependency || (dependency.code === null && !specifiers.has(id) && !composedExternals.has(id))) this.error(`unlistedIifeOnly ${label}: unaccepted external ${id}`)
            }
          }
          renderedImports.set(chunk.facadeModuleId, new Set(chunk.imports))
          return null
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
          if (artifact.imports.some((id) => !renderedImports.get(artifact.facadeModuleId)?.has(id)) || artifact.dynamicImports.length) this.error(`unlistedIifeOnly ${label}`)
          const modules = Object.keys(artifact.modules).map(clean)
          for (const id of modules) {
            const owner = packageOwner(id)
            if (owner === "svelte" && bundle.kind !== "kit" && label !== popoversBundle) this.error(`noFeatureRuntime ${label}: ${id}`)
            if (id.startsWith(`${kitRoot}/`) && bundle.kind === "feature") this.error(`noFeatureKitImplementation ${label}: ${id}`)
            if (owner === "bits-ui" && label !== popoversBundle) this.error(`lazyBitsOnly ${label}: ${id}`)
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
