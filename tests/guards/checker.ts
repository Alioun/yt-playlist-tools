import { readdirSync, readFileSync } from "node:fs"
import { posix, resolve } from "node:path"
import ts from "typescript"

export const rules = ["imports", "env", "page-console", "entrypoints", "storage-writes", "running-cost"] as const
export type Rule = typeof rules[number]
export type Finding = { file: string; line: number; rule: Rule; reason: string; evidence: string }
export type Source = { file: string; text: string }
export type Aliases = Record<string, string[]>

const layers: Record<string, readonly string[]> = {
  shared: ["shared"], page: ["shared", "page"], site: ["shared", "site"],
  background: ["shared", "background"], ui: ["shared", "ui"],
}
const implicitWxt = new Set([
  "browser", "storage", "defineBackground", "defineContentScript", "defineUnlistedScript",
  "defineAppConfig", "defineWxtPlugin", "createShadowRootUi", "createIntegratedUi",
  "createIframeUi", "injectScript",
])
const sourceExtension = /\.(?:[cm]?[jt]sx?|svelte)$/
const testExtension = /\.(?:test|spec|bun-test)\.[cm]?[jt]sx?$/
const inDirectory = (file: string, directory: string) => file.startsWith(`${directory}/`)
const browserAdapter = (file: string) => inDirectory(file, "src/site/core/adapters")
  || inDirectory(file, "src/background/adapters") || file === "src/ui/backend/browser.ts"
const storageOwner = (file: string) => inDirectory(file, "src/background/store")

export function readSources(root: string): Source[] {
  const sources: Source[] = []
  function visit(directory: string) {
    for (const item of readdirSync(resolve(root, directory), { withFileTypes: true })) {
      const file = `${directory}/${item.name}`
      if (item.isDirectory()) visit(file)
      else if (sourceExtension.test(file) && !testExtension.test(file) && !file.endsWith(".d.ts")) {
        sources.push({ file, text: readFileSync(resolve(root, file), "utf8") })
      }
    }
  }
  visit("src")
  return sources.sort((a, b) => a.file.localeCompare(b.file))
}

export function readAliases(root: string): Aliases {
  const config = ts.readConfigFile(resolve(root, "tsconfig.json"), ts.sys.readFile)
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"))
  return config.config.compilerOptions?.paths ?? {}
}

function scriptText(source: Source): string {
  if (!source.file.endsWith(".svelte")) return source.text
  const characters: string[] = source.text.split("").map(character => character === "\n" ? "\n" : " ")
  for (const match of source.text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/g)) {
    const content = match[1] ?? ""
    const start = (match.index ?? 0) + match[0].indexOf(">") + 1
    for (let offset = 0; offset < content.length; offset++) characters[start + offset] = content[offset] ?? " "
  }
  return characters.join("")
}

function moduleTargets(file: string, specifier: string, aliases: Aliases): string[] {
  const clean = specifier.replace(/[?#].*$/, "")
  if (clean.startsWith(".")) return [posix.normalize(posix.join(posix.dirname(file), clean))]
  if (clean.startsWith("/")) return [posix.normalize(clean.slice(1))]
  for (const [pattern, targets] of Object.entries(aliases).sort(([a], [b]) => b.length - a.length)) {
    const star = pattern.indexOf("*")
    const match = star < 0 ? clean === pattern : clean.startsWith(pattern.slice(0, star)) && clean.endsWith(pattern.slice(star + 1))
    if (!match) continue
    const middle = star < 0 ? "" : clean.slice(star, clean.length - (pattern.length - star - 1))
    return targets.map(target => posix.normalize(target.replace("*", middle)))
  }
  if (clean === "$kit") return ["src/site/kit/index.ts"]
  return []
}

export function inspect(sources: Source[], aliases: Aliases = { "@/*": ["src/*"], "~/*": ["src/*"] }): Finding[] {
  const findings: Finding[] = []
  for (const source of sources) {
    const file = ts.createSourceFile(source.file, scriptText(source), ts.ScriptTarget.Latest, true,
      source.file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const host: ts.CompilerHost = {
      getSourceFile: name => name === source.file ? file : undefined,
      getDefaultLibFileName: () => "", writeFile: () => {}, getCurrentDirectory: () => "/",
      getDirectories: () => [], fileExists: name => name === source.file,
      readFile: name => name === source.file ? file.text : undefined,
      getCanonicalFileName: name => name, useCaseSensitiveFileNames: () => true, getNewLine: () => "\n",
    }
    const program = ts.createProgram([source.file], { noLib: true, noResolve: true }, host)
    const checker = program.getTypeChecker()
    const seen = new Set<string>()
    function report(rule: Rule, node: ts.Node, reason: string, evidence = node.getText(file), position = node.getStart(file)) {
      const key = `${rule}:${position}:${reason}`
      if (seen.has(key)) return
      seen.add(key)
      findings.push({ file: source.file, line: file.getLineAndCharacterOfPosition(position).line + 1,
        rule, reason, evidence: evidence.replace(/\s+/g, " ").trim() })
    }
    function literal(node: ts.Node | undefined): string | undefined {
      if (!node) return undefined
      if (ts.isStringLiteralLike(node) || ts.isIdentifier(node)) return node.text
      return undefined
    }
    function imported(node: ts.Node): { module: string; name: string; typeOnly: boolean } | undefined {
      if (!ts.isImportSpecifier(node) && !ts.isNamespaceImport(node) && !ts.isImportClause(node)) return undefined
      let declaration: ts.Node | undefined = node
      while (declaration && !ts.isImportDeclaration(declaration)) declaration = declaration.parent
      if (!declaration || !ts.isImportDeclaration(declaration) || !ts.isStringLiteral(declaration.moduleSpecifier)) return undefined
      return { module: declaration.moduleSpecifier.text,
        name: ts.isImportSpecifier(node) ? (node.propertyName ?? node.name).text : ts.isNamespaceImport(node) ? "*" : "default",
        typeOnly: !!declaration.importClause?.isTypeOnly || (ts.isImportSpecifier(node) && node.isTypeOnly) }
    }
    function unwrap(node: ts.Node): ts.Node {
      while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)
        || ts.isSatisfiesExpression(node) || ts.isTypeAssertionExpression(node)) node = node.expression
      return node
    }
    function symbolAt(node: ts.Identifier): ts.Symbol | undefined {
      return ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node
        ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node)
    }
    function value(node: ts.Node, visited = new Set<ts.Symbol>()): ts.Node {
      node = unwrap(node)
      if (!ts.isIdentifier(node)) return node
      const symbol = symbolAt(node)
      if (!symbol || visited.has(symbol)) return node
      visited.add(symbol)
      const declaration = symbol.valueDeclaration
      return declaration && ts.isVariableDeclaration(declaration) && declaration.initializer
        ? value(declaration.initializer, visited) : node
    }
    function member(node: ts.Node): string | undefined {
      node = value(node)
      return ts.isStringLiteralLike(node) ? node.text : undefined
    }
    function access(node: ts.Node, visited = new Set<ts.Symbol>()): string[] | undefined {
      node = unwrap(node)
      if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword) return ["import.meta"]
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        const base = access(node.expression, new Set(visited))
        const name = ts.isPropertyAccessExpression(node) ? node.name.text : node.argumentExpression && member(node.argumentExpression)
        return base && name ? [...base, name] : undefined
      }
      if (!ts.isIdentifier(node)) return undefined
      const symbol = symbolAt(node)
      if (!symbol?.declarations?.length) return [node.text]
      if (visited.has(symbol)) return undefined
      visited.add(symbol)
      for (const declaration of symbol.declarations ?? []) {
        const binding = imported(declaration)
        if (binding && !binding.typeOnly) {
          if (binding.module === "wxt/browser") return binding.name === "*" ? ["wxt-browser"] : ["browser"]
          if (binding.module === "wxt/utils/storage" && binding.name === "storage") return ["storage"]
          return [`local:${node.text}`]
        }
        if (ts.isVariableDeclaration(declaration) && declaration.initializer) return access(declaration.initializer, visited) ?? [`local:${node.text}`]
        if (ts.isParameter(declaration) && ["browser", "chrome", "storage"].includes(node.text)) return [node.text]
        if (ts.isBindingElement(declaration)) {
          const parts: string[] = []
          let current: ts.Node = declaration
          while (ts.isBindingElement(current)) {
            const name = current.propertyName ? literal(current.propertyName)
              ?? (ts.isComputedPropertyName(current.propertyName) ? member(current.propertyName.expression) : undefined)
              : literal(current.name)
            if (!name || current.dotDotDotToken || !ts.isObjectBindingPattern(current.parent)) return undefined
            parts.unshift(name)
            current = current.parent.parent
          }
          if (ts.isVariableDeclaration(current) && current.initializer) {
            const base = access(current.initializer, visited)
            return base ? [...base, ...parts] : undefined
          }
        }
      }
      return [`local:${node.text}`]
    }
    function canonical(node: ts.Node): string[] {
      const parts = access(node) ?? []
      if (["globalThis", "window", "self"].includes(parts[0] ?? "")) parts.shift()
      if (parts[0] === "wxt-browser" && parts[1] === "browser") parts.shift()
      return parts
    }
    function property(node: ts.Node): string | undefined {
      if (ts.isPropertyAccessExpression(node)) return node.name.text
      if (ts.isElementAccessExpression(node) && node.argumentExpression) return member(node.argumentExpression)
      return undefined
    }
    function checkImport(node: ts.Node, specifier: string) {
      const entrypoint = inDirectory(source.file, "src/entrypoints")
      if (specifier === "#imports" || specifier.startsWith("#imports/")) report("imports", node, "implicit-wxt", specifier)
      if (specifier.startsWith("wxt/utils/define-") && !entrypoint) report("entrypoints", node, "define-outside-entrypoint", specifier)
      if ((specifier === "wxt" || specifier.startsWith("wxt/")) && !entrypoint) {
        if (specifier.startsWith("wxt/utils/define-") || !browserAdapter(source.file)) report("imports", node, "wxt-boundary", specifier)
      }
      const layer = source.file.split("/")[1] ?? ""
      const allowed = layers[layer]
      if (!allowed) return
      const targets = moduleTargets(source.file, specifier, aliases)
      if (targets.length) {
        if (targets.some(target => !target.startsWith("src/") || !allowed.includes(target.split("/")[1] ?? ""))) report("imports", node, "layer-boundary", specifier)
      } else if ((layer === "shared" || layer === "page") && !(inDirectory(source.file, "src/shared/picker")
        && (specifier === "svelte" || specifier.startsWith("svelte/")))) report("imports", node, "external-boundary", specifier)
      else if (specifier.startsWith("@/") || specifier.startsWith("~/") || specifier.startsWith("#")) report("imports", node, "unresolved-alias", specifier)
    }
    function runtime(node: ts.Node): boolean {
      for (let parent: ts.Node | undefined = node; parent; parent = parent.parent) {
        if (ts.isTypeNode(parent) || ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) return false
      }
      return true
    }
    function reference(node: ts.Node): boolean {
      const parent = node.parent
      if ((ts.isPropertyAccessExpression(parent) && parent.name === node)
        || (ts.isPropertyAssignment(parent) && parent.name === node && !ts.isComputedPropertyName(node))
        || ((ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isFunctionDeclaration(parent)
          || ts.isBindingElement(parent) || ts.isMethodDeclaration(parent)) && parent.name === node)
        || ts.isBindingElement(parent) || ts.isLabeledStatement(parent)) return false
      return true
    }
    function broadRoot(node: ts.Node): boolean {
      const path = canonical(node).join(".")
      if (["document", "document.body", "document.documentElement"].includes(path)) return true
      node = value(node)
      if (!ts.isCallExpression(node) || !["document.querySelector", "document.getElementsByTagName"].includes(canonical(node.expression).join("."))) return false
      const selector = node.arguments[0] && member(node.arguments[0])
      return selector === "ytd-app" || selector === "ytmusic-app" || selector === "body" || selector === "html"
    }
    function subtree(node: ts.Node): boolean {
      node = value(node)
      return ts.isObjectLiteralExpression(node) && node.properties.some(property => ts.isPropertyAssignment(property)
        && (literal(property.name) ?? (ts.isComputedPropertyName(property.name) ? member(property.name.expression) : undefined)) === "subtree"
        && value(property.initializer).kind === ts.SyntaxKind.TrueKeyword)
    }
    function visit(node: ts.Node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) checkImport(node, node.moduleSpecifier.text)
      if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression && ts.isStringLiteralLike(node.moduleReference.expression)) checkImport(node, node.moduleReference.expression.text)
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) checkImport(node, node.argument.literal.text)
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
        const specifier = node.arguments[0] && member(node.arguments[0])
        if (specifier) checkImport(node, specifier)
        else report("imports", node, "nonliteral-module", node.getText(file))
      }
      if (runtime(node)) {
        if ((ts.isIdentifier(node) && reference(node)) || ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
          const parts = canonical(node)
          const path = parts.join(".")
          const parent = node.parent
          const extended = (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent))
            && parent.expression === node && canonical(parent).length > 0
          if (!extended) {
            if (parts[0] === "import.meta" && parts[1] === "env") {
              if (source.file !== "src/shared/platform.ts") report("env", node, "env-outside-platform")
              else if (parts.length !== 3 || !ts.isPropertyAccessExpression(node)
                || !ts.isPropertyAccessExpression(node.expression) || !ts.isMetaProperty(node.expression.expression)) report("env", node, "indirect-platform-env")
            }
            if (inDirectory(source.file, "src/page") && parts[0] === "console") report("page-console", node, "page-console")
            if (parts[0] === "setInterval" || /^(?:browser|chrome)\.alarms(?:\.|$)/.test(path)) report("running-cost", node, "clock-work")
            if (/^(?:browser|chrome)\.(?:(?:tabs|windows)\.on\w+|webNavigation(?:\.|$)|(?:menus|contextMenus)\.(?:onShown|refresh)(?:\.|$))/.test(path)) report("running-cost", node, "browser-wide-event")
            if ((inDirectory(source.file, "src/site") || inDirectory(source.file, "src/page")) && /^(?:(?:browser|chrome)\.)?storage\.(?:(?:local|sync|session)\.)?onChanged(?:\.|$)/.test(path)) report("running-cost", node, "page-storage-listener")
            if ((inDirectory(source.file, "src/site/features") || inDirectory(source.file, "src/site/kit"))
              && [...parts, property(node)].some(part => part && ["addEventListener", "MutationObserver", "ResizeObserver", "IntersectionObserver", "setTimeout", "requestAnimationFrame"].includes(part))) report("running-cost", node, "unscoped-resource")
          }
          if (ts.isIdentifier(node) && implicitWxt.has(node.text)) {
            const symbol = symbolAt(node)
            const declared = symbol?.declarations?.some(declaration => {
              const binding = imported(declaration)
              return binding ? !binding.typeOnly : true
            })
            if (!declared) report("imports", node, "implicit-wxt", node.text)
          }
        }
        if (ts.isCallExpression(node)) {
          const path = canonical(node.expression).join(".")
          if (!storageOwner(source.file) && /^(?:(?:browser|chrome)\.)?storage\.(?:local|sync|session)\.(?:set|remove|clear)$/.test(path)) report("storage-writes", node, "storage-write")
          if ((path.endsWith(".observe") || property(node.expression) === "observe") && node.arguments[0] && node.arguments[1]
            && broadRoot(node.arguments[0]) && subtree(node.arguments[1])) report("running-cost", node, "broad-subtree-observer")
        }
      }
      ts.forEachChild(node, visit)
    }
    for (const diagnostic of program.getSyntacticDiagnostics(file)) {
      report("imports", file, "syntax-error", ts.flattenDiagnosticMessageText(diagnostic.messageText, " "), diagnostic.start ?? 0)
    }
    visit(file)
    if (inDirectory(source.file, "src/entrypoints")) {
      const lines = source.text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n").length
      if (lines > 15) report("entrypoints", file, "entrypoint-lines", String(lines))
    }
  }
  return findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule) || a.reason.localeCompare(b.reason))
}

export function formatFinding(finding: Finding): string {
  return `${finding.file}:${finding.line} [${finding.rule}/${finding.reason}] ${finding.evidence}`
}

export function inventoryChanges(actual: Finding[], frozen: Finding[]): string[] {
  const remaining = [...frozen]
  const changes: string[] = []
  for (const finding of actual) {
    const index = remaining.findIndex(item => item.file === finding.file && item.rule === finding.rule
      && item.reason === finding.reason && (item.reason === "entrypoint-lines"
        ? Number(finding.evidence) <= Number(item.evidence) : item.evidence === finding.evidence))
    if (index < 0) changes.push(`New violation: ${formatFinding(finding)}`)
    else remaining.splice(index, 1)
  }
  for (const stale of remaining) changes.push(`Remove resolved inventory entry: ${formatFinding(stale)}`)
  return changes
}
