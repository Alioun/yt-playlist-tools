// TypeScript 7's package has no compiler API, so this parser uses the TypeScript 6 alias.
import ts from "typescript6"
import { scriptText, type Source } from "./checker"

export type ForbiddenRule = "update-listener" | "item-migrations" | "oauth" | "outbound" | "container-id" | "state-identity"
export type ForbiddenFinding = { file: string; line: number; rule: ForbiddenRule; evidence: string }

/** Names that may not appear in production source at all, as an identifier, property or string key. */
const forbiddenNames: Record<string, ForbiddenRule> = {
  onUpdateAvailable: "update-listener",
  getAuthToken: "oauth",
  launchWebAuthFlow: "oauth",
  removeCachedAuthToken: "oauth",
  XMLHttpRequest: "outbound",
  sendBeacon: "outbound",
  WebSocket: "outbound",
  EventSource: "outbound",
  RTCPeerConnection: "outbound",
  cookieStoreId: "container-id"
}
const extensionNamespaces = new Set(["browser", "chrome"])
const windowLike = new Set(["window", "globalThis", "self", "win"])
/** The page gateway's live adapter is the one place that asks YouTube for data. */
const youtubeRequester = "src/page/adapters/live-www.ts"
const stateScope = (file: string) => file.startsWith("src/site/kit/") || file.startsWith("src/site/features/")
const equality = new Set([ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken])
const identitySearches = new Set(["includes", "indexOf", "lastIndexOf"])
const elementCallbacks = new Set(["find", "findLast", "findIndex", "findLastIndex", "filter", "some", "every", "forEach", "map", "flatMap"])
const unproxied = /^(?:HTML\w*Element|SVG\w*Element|Element|Node|Text|Document|ShadowRoot|Window|Event|Map|Set|Date)$/

function unwrap(node: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) node = node.expression
  return node
}

function propertyName(node: ts.Node): string | undefined {
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node) || ts.isStringLiteral(node)) return node.text
  return undefined
}

function primitiveType(type: ts.TypeNode): boolean {
  if (ts.isUnionTypeNode(type)) return type.types.every(primitiveType)
  if (ts.isLiteralTypeNode(type)) return true
  if (ts.isTypeReferenceNode(type)) return unproxied.test(type.typeName.getText())
  return [
    ts.SyntaxKind.StringKeyword,
    ts.SyntaxKind.NumberKeyword,
    ts.SyntaxKind.BooleanKeyword,
    ts.SyntaxKind.BigIntKeyword,
    ts.SyntaxKind.UndefinedKeyword,
    ts.SyntaxKind.NullKeyword,
    ts.SyntaxKind.SymbolKeyword
  ].includes(type.kind)
}

/** Svelte proxies a plain object or array held in $state, so the binding may not be compared by identity. $state.raw doesn't proxy. */
function proxiedState(declaration: ts.VariableDeclaration): boolean {
  const call = declaration.initializer && unwrap(declaration.initializer)
  if (!call || !ts.isCallExpression(call) || !ts.isIdentifier(call.expression) || call.expression.text !== "$state") return false
  const [argument] = call.arguments,
    [type] = call.typeArguments ?? []
  if (type) return !primitiveType(type)
  const value = argument && unwrap(argument)
  return value !== undefined && (ts.isObjectLiteralExpression(value) || ts.isArrayLiteralExpression(value) || ts.isNewExpression(value))
}

function literal(node: ts.Expression): boolean {
  node = unwrap(node)
  return (
    ts.isLiteralExpression(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateExpression(node) ||
    ts.isTypeOfExpression(node) ||
    [ts.SyntaxKind.NullKeyword, ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword].includes(node.kind) ||
    (ts.isIdentifier(node) && node.text === "undefined") ||
    ts.isPrefixUnaryExpression(node)
  )
}

export function inspectForbidden(sources: readonly Source[]): ForbiddenFinding[] {
  const findings: ForbiddenFinding[] = []
  for (const source of sources) {
    const file = ts.createSourceFile(
      source.file.endsWith(".svelte") ? `${source.file}.ts` : source.file,
      scriptText(source),
      ts.ScriptTarget.Latest,
      true,
      source.file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    )
    const report = (rule: ForbiddenRule, node: ts.Node) =>
      findings.push({
        file: source.file,
        line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
        rule,
        evidence: node.getText(file).replace(/\s+/g, " ").slice(0, 120)
      })
    const proxied = new Set<string>()
    if (stateScope(source.file)) {
      const collect = (node: ts.Node): void => {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && proxiedState(node)) proxied.add(node.name.text)
        ts.forEachChild(node, collect)
      }
      collect(file)
    }
    const rootedInState = (node: ts.Expression): boolean => {
      node = unwrap(node)
      if (ts.isIdentifier(node)) return proxied.has(node.text)
      return ts.isElementAccessExpression(node) && rootedInState(node.expression)
    }
    const visit = (node: ts.Node): void => {
      // Elements read from a proxied array are proxies too.
      if (ts.isForOfStatement(node) && rootedInState(node.expression) && ts.isVariableDeclarationList(node.initializer)) {
        for (const declaration of node.initializer.declarations) if (ts.isIdentifier(declaration.name)) proxied.add(declaration.name.text)
      }
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && elementCallbacks.has(node.expression.name.text) && rootedInState(node.expression.expression)) {
        const [callback] = node.arguments,
          [element] = callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) ? callback.parameters : []
        if (element && ts.isIdentifier(element.name)) proxied.add(element.name.text)
      }
      const name = ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : undefined
      if (name !== undefined && Object.hasOwn(forbiddenNames, name)) report(forbiddenNames[name]!, node)
      if (ts.isPropertyAccessExpression(node) && node.name.text === "identity" && ts.isIdentifier(node.expression) && extensionNamespaces.has(node.expression.text)) report("oauth", node)
      if (ts.isCallExpression(node)) {
        const callee = unwrap(node.expression)
        const globalFetch = ts.isIdentifier(callee)
          ? callee.text === "fetch"
          : ts.isPropertyAccessExpression(callee) && callee.name.text === "fetch" && ts.isIdentifier(callee.expression) && windowLike.has(callee.expression.text)
        if (globalFetch && source.file !== youtubeRequester) report("outbound", node)
        const calleeName = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : undefined
        if (
          calleeName === "defineItem" &&
          node.arguments.some(
            argument => ts.isObjectLiteralExpression(argument) && argument.properties.some(property => property.name && ["version", "migrations"].includes(propertyName(property.name) ?? ""))
          )
        )
          report("item-migrations", node)
        if (ts.isPropertyAccessExpression(callee) && identitySearches.has(callee.name.text) && rootedInState(callee.expression) && node.arguments[0] && !literal(node.arguments[0]))
          report("state-identity", node)
      }
      if (ts.isBinaryExpression(node) && equality.has(node.operatorToken.kind) && ((rootedInState(node.left) && !literal(node.right)) || (rootedInState(node.right) && !literal(node.left))))
        report("state-identity", node)
      ts.forEachChild(node, visit)
    }
    visit(file)
  }
  return findings
}
