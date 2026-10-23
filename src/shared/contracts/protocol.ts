import { isJsonValue } from "./json"
import { isBuildId } from "./vocabulary"
import type { BuildId } from "./vocabulary"

export const CONTRACT_VERSION = 1
export type MessageHeader = { v: typeof CONTRACT_VERSION; build: BuildId }
export type HeaderCheck =
  | { kind: "ok"; header: MessageHeader }
  | { kind: "invalid" }
  | { kind: "unsupported-version"; received: number }
  | { kind: "build-mismatch"; received: BuildId }

export function inspectMessageHeader(raw: unknown, expectedBuild: BuildId): HeaderCheck {
  try {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw) || !isJsonValue(raw)) return { kind: "invalid" }
    const v: unknown = Object.getOwnPropertyDescriptor(raw, "v")?.value
    const build: unknown = Object.getOwnPropertyDescriptor(raw, "build")?.value
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v <= 0 || !isBuildId(build)) return { kind: "invalid" }
    if (v !== CONTRACT_VERSION) return { kind: "unsupported-version", received: v }
    if (build !== expectedBuild) return { kind: "build-mismatch", received: build }
    return { kind: "ok", header: { v, build } }
  } catch {
    return { kind: "invalid" }
  }
}
