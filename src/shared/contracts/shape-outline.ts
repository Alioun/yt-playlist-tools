import { isJsonValue } from "./json"
import type { JsonValue } from "./json"
import { objectShape } from "./object-shape"

export type ShapeOutline =
  | { kind: "null" | "boolean" | "number" | "string" }
  | { kind: "object"; fields: { key: string; value: ShapeOutline }[] }
  | { kind: "array"; items: ShapeOutline[] }
  | { kind: "union"; variants: ShapeOutline[] }
  | { kind: "cut"; type: "object" | "array" }

const MAX_DEPTH = 6
const MAX_BYTES = 2048
const compare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0
const sourceType = (value: ShapeOutline): string => value.kind === "cut" ? value.type : value.kind

function byteLength(value: unknown): number {
  let bytes = 0
  for (const character of JSON.stringify(value)) {
    const point = character.codePointAt(0) ?? 0
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4
  }
  return bytes
}

function alternatives(nodes: readonly ShapeOutline[]): ShapeOutline[] {
  const groups = new Map<string, [ShapeOutline, ...ShapeOutline[]]>()
  const add = (node: ShapeOutline): void => {
    if (node.kind === "union") { node.variants.forEach(add); return }
    const key = sourceType(node)
    const group = groups.get(key)
    if (group) group.push(node)
    else groups.set(key, [node])
  }
  nodes.forEach(add)
  const result: ShapeOutline[] = []
  for (const group of groups.values()) {
    const first = group[0]
    const cut = group.find(node => node.kind === "cut")
    if (cut) { result.push(cut); continue }
    if (first.kind === "object") {
      const fields = new Map<string, ShapeOutline[]>()
      for (const node of group) {
        if (node.kind !== "object") continue
        for (const field of node.fields) {
          const values = fields.get(field.key)
          if (values) values.push(field.value)
          else fields.set(field.key, [field.value])
        }
      }
      result.push({ kind: "object", fields: [...fields].sort(([a], [b]) => compare(a, b))
        .map(([key, values]) => ({ key, value: merged(values) })) })
    } else if (first.kind === "array") {
      result.push({ kind: "array", items: arrayItems(group.flatMap(node => node.kind === "array" ? node.items : [])) })
    } else result.push(first)
  }
  return result.sort((a, b) => compare(sourceType(a), sourceType(b)))
}

function merged(nodes: readonly ShapeOutline[]): ShapeOutline {
  const variants = alternatives(nodes)
  return variants.length === 1 && variants[0] ? variants[0] : { kind: "union", variants }
}

function arrayItems(nodes: readonly ShapeOutline[]): ShapeOutline[] {
  return nodes.length === 0 ? [] : [merged(nodes)]
}

function outline(value: JsonValue, keys: ReadonlySet<string>, depth: number): ShapeOutline {
  if (value === null) return { kind: "null" }
  if (typeof value === "boolean") return { kind: "boolean" }
  if (typeof value === "number") return { kind: "number" }
  if (typeof value === "string") return { kind: "string" }
  if (Array.isArray(value)) {
    return depth === MAX_DEPTH ? { kind: "cut", type: "array" } :
      { kind: "array", items: arrayItems(value.map(item => outline(item, keys, depth + 1))) }
  }
  if (depth === MAX_DEPTH) return { kind: "cut", type: "object" }
  const fields = new Map<string, ShapeOutline[]>()
  for (const [sourceKey, child] of Object.entries(value)) {
    const key = keys.has(sourceKey) ? sourceKey : "<key>"
    const node = outline(child, keys, depth + 1)
    const values = fields.get(key)
    if (values) values.push(node)
    else fields.set(key, [node])
  }
  return { kind: "object", fields: [...fields].sort(([a], [b]) => compare(a, b))
    .map(([key, nodes]) => ({ key, value: merged(nodes) })) }
}

function prune(node: ShapeOutline): ShapeOutline {
  if (node.kind === "object") {
    for (let index = node.fields.length - 1; index >= 0; index--) {
      const field = node.fields[index]
      if (!field) continue
      const child = prune(field.value)
      if (child !== field.value) {
        return { kind: "object", fields: node.fields.map((entry, i) => i === index ? { key: entry.key, value: child } : entry) }
      }
    }
    return { kind: "cut", type: "object" }
  }
  if (node.kind === "array" || node.kind === "union") {
    const children = node.kind === "array" ? node.items : node.variants
    for (let index = children.length - 1; index >= 0; index--) {
      const original = children[index]
      if (!original) continue
      const child = prune(original)
      if (child !== original) {
        const next = children.map((entry, i) => i === index ? child : entry)
        return node.kind === "array" ? { kind: "array", items: arrayItems(next) } : merged(next)
      }
    }
    if (node.kind === "array") return { kind: "cut", type: "array" }
  }
  return node
}

export function makeShapeOutline(value: JsonValue, schemaKeys: readonly string[]): ShapeOutline {
  let result = outline(value, new Set(schemaKeys), 0)
  while (byteLength(result) > MAX_BYTES) result = prune(result)
  return result
}

function canonicalAlternatives(values: unknown, keys: ReadonlySet<string>, depth: number): boolean {
  if (!Array.isArray(values) || values.length < 2) return false
  const types = new Set<string>()
  let previous: string | undefined
  for (const value of values) {
    if (!validNode(value, keys, depth) || value.kind === "union") return false
    const type = sourceType(value)
    const text = sourceType(value)
    if (types.has(type) || previous !== undefined && compare(previous, text) >= 0) return false
    types.add(type)
    previous = text
  }
  return true
}

function validNode(value: unknown, keys: ReadonlySet<string>, depth: number): value is ShapeOutline {
  if (depth > MAX_DEPTH || value === null || typeof value !== "object" || Array.isArray(value) || !Object.hasOwn(value, "kind")) return false
  const kind: unknown = Object.getOwnPropertyDescriptor(value, "kind")?.value
  switch (kind) {
    case "null": case "boolean": case "number": case "string":
      return objectShape(value, { kind: v => v === kind })
    case "cut":
      return objectShape(value, { kind: v => v === "cut", type: v => v === "object" || v === "array" })
    case "object": {
      if (depth === MAX_DEPTH || !objectShape(value, { kind: v => v === "object", fields: Array.isArray }) || !Array.isArray(value.fields)) return false
      let previous: string | undefined
      return value.fields.every(field => {
        if (!objectShape(field, {
          key: v => typeof v === "string" && (v === "<key>" || keys.has(v)),
          value: v => validNode(v, keys, depth + 1)
        }) || typeof field.key !== "string") return false
        if (previous !== undefined && compare(previous, field.key) >= 0) return false
        previous = field.key
        return true
      })
    }
    case "array":
      return depth < MAX_DEPTH && objectShape(value, {
        kind: v => v === "array", items: v => Array.isArray(v) && v.length <= 1 && v.every(item => validNode(item, keys, depth + 1))
      })
    case "union":
      return objectShape(value, { kind: v => v === "union", variants: v => canonicalAlternatives(v, keys, depth) })
    default: return false
  }
}

export function isShapeOutline(value: unknown, schemaKeys: readonly string[]): value is ShapeOutline {
  try {
    return isJsonValue(value) && byteLength(value) <= MAX_BYTES && validNode(value, new Set(schemaKeys), 0)
  } catch { return false }
}
