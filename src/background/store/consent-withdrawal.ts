import { CONSENT_VERSION, STORAGE_SCHEMA_VERSION, decodeDevice, type Device } from "../../shared/model"
import { isJsonValue, type JsonObject } from "../../shared/contracts/json"
import { sameSyncJson } from "./sync-write-admission"

export type Agreement = NonNullable<Device["consent"]>
export const consentStateKey = "consent:state"
export type ConsentStateV1 = {
  readonly v: 1
  readonly kind: "consent-state"
  readonly deviceId: string
  readonly generation: number
  readonly lastAgreementAt: number
  readonly legacyBasis: { readonly kind: "observed"; readonly agreement: Agreement } | { readonly kind: "not-observed" }
  readonly state: { readonly kind: "withdrawing" | "withdrawn"; readonly prior: Agreement } |
    { readonly kind: "agreed"; readonly current: Agreement; readonly prior: Agreement | null }
}
export type ConsentDeviceRead =
  | { readonly kind: "supported"; readonly device: Device; readonly raw: JsonObject; readonly control: ConsentStateV1 | null }
  | { readonly kind: "layout" | "newer-layout" | "invalid-device" | "invalid-control" | "newer-control" | "mismatched" }
export type ConsentItems = { readonly device: JsonObject; readonly "consent:state": ConsentStateV1 }
export type WithdrawalIntentItems = { readonly "consent:state": ConsentStateV1 & { readonly state: { readonly kind: "withdrawing"; readonly prior: Agreement } } }
export type ConsentDevicePort = {
  get(keys: readonly ["schema", "device", "consent:state"]): Promise<Readonly<Record<string, unknown>>>
  set(items: ConsentItems | WithdrawalIntentItems): Promise<void>
}
export const consentDeviceKeys = ["schema", "device", "consent:state"] as const

export function consentObject(raw: unknown): raw is JsonObject {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw) && isJsonValue(raw)
}
function exact(raw: JsonObject, names: readonly string[]): boolean {
  return Object.keys(raw).length === names.length && names.every(name => Object.hasOwn(raw, name))
}
export function isAgreement(raw: unknown): raw is Agreement {
  return consentObject(raw) && exact(raw, ["v", "at"]) && raw.v === CONSENT_VERSION &&
    typeof raw.at === "number" && Number.isSafeInteger(raw.at) && raw.at >= 0
}
function counter(raw: unknown): raw is number { return typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0 }
export function parseConsentState(raw: unknown): ConsentStateV1 | undefined {
  if (!consentObject(raw) || !exact(raw, ["v", "kind", "deviceId", "generation", "lastAgreementAt", "legacyBasis", "state"]) ||
    raw.v !== 1 || raw.kind !== "consent-state" || typeof raw.deviceId !== "string" || !raw.deviceId ||
    !counter(raw.generation) || !counter(raw.lastAgreementAt) || !consentObject(raw.legacyBasis) || !consentObject(raw.state)) return
  const basis = raw.legacyBasis, state = raw.state
  let legacyBasis: ConsentStateV1["legacyBasis"]
  if (basis.kind === "observed" && exact(basis, ["kind", "agreement"]) && isAgreement(basis.agreement)) legacyBasis = { kind: "observed", agreement: { ...basis.agreement } }
  else if (basis.kind === "not-observed" && exact(basis, ["kind"])) legacyBasis = { kind: "not-observed" }
  else return
  let parsed: ConsentStateV1["state"]
  if ((state.kind === "withdrawing" || state.kind === "withdrawn") && exact(state, ["kind", "prior"]) && isAgreement(state.prior)) parsed = { kind: state.kind, prior: { ...state.prior } }
  else if (state.kind === "agreed" && exact(state, ["kind", "current", "prior"]) && isAgreement(state.current) && (state.prior === null || isAgreement(state.prior))) parsed = { kind: "agreed", current: { ...state.current }, prior: state.prior === null ? null : { ...state.prior } }
  else return
  if ((parsed.kind === "agreed" ? parsed.current.at : parsed.prior.at) > raw.lastAgreementAt) return
  return { v: 1, kind: "consent-state", deviceId: raw.deviceId, generation: raw.generation, lastAgreementAt: raw.lastAgreementAt, legacyBasis, state: parsed }
}
export function readConsentDevice(records: unknown): ConsentDeviceRead {
  if (!consentObject(records)) return { kind: "layout" }
  if (typeof records.schema === "number" && records.schema > STORAGE_SCHEMA_VERSION) return { kind: "newer-layout" }
  if (records.schema !== STORAGE_SCHEMA_VERSION) return { kind: "layout" }
  const raw = records.device
  if (!consentObject(raw) || !["id", "consent", "syncOn"].every(name => Object.hasOwn(raw, name))) return { kind: "invalid-device" }
  let device: Device
  try { device = decodeDevice(raw) } catch { return { kind: "invalid-device" } }
  if (device.consent !== null) {
    const consent = { v: device.consent.v, at: device.consent.at }
    if (!isAgreement(consent)) return { kind: "invalid-device" }
    device = { ...device, consent }
  }
  if (!Object.hasOwn(records, consentStateKey)) return { kind: "supported", device, raw, control: null }
  const value = records[consentStateKey]
  if (consentObject(value) && typeof value.v === "number" && value.v > 1) return { kind: "newer-control" }
  const control = parseConsentState(value)
  if (!control) return { kind: "invalid-control" }
  if (control.deviceId !== device.id) return { kind: "mismatched" }
  switch (control.state.kind) {
    case "withdrawing":
      if (device.consent !== null && !sameSyncJson(control.state.prior, device.consent)) return { kind: "mismatched" }
      break
    case "withdrawn":
      if (device.consent !== null) return { kind: "mismatched" }
      break
    case "agreed":
      if (!sameSyncJson(control.state.current, device.consent)) return { kind: "mismatched" }
  }
  return { kind: "supported", device, raw, control }
}
export function withdrawalItems(read: Extract<ConsentDeviceRead, { kind: "supported" }>): ConsentItems | undefined {
  const previous = read.control, retry = previous?.state.kind === "withdrawing"
  const prior = previous?.state.kind === "withdrawing" ? previous.state.prior : read.device.consent
  if (!prior || !isAgreement(prior) || !retry && (previous?.generation ?? 0) >= Number.MAX_SAFE_INTEGER) return
  return { device: { ...read.raw, consent: null }, "consent:state": {
    v: 1, kind: "consent-state", deviceId: read.device.id, generation: (previous?.generation ?? 0) + (retry ? 0 : 1),
    lastAgreementAt: Math.max(previous?.lastAgreementAt ?? 0, prior.at),
    legacyBasis: previous?.legacyBasis ?? { kind: "observed", agreement: { ...prior } }, state: { kind: "withdrawn", prior: { ...prior } }
  } }
}
export function withdrawalIntentItems(read: Extract<ConsentDeviceRead, { kind: "supported" }>): WithdrawalIntentItems | undefined {
  const items = withdrawalItems(read), state = items?.[consentStateKey]
  if (!state || state.state.kind !== "withdrawn") return
  return { [consentStateKey]: { ...state, state: { kind: "withdrawing", prior: state.state.prior } } }
}
export function agreementItems(read: Extract<ConsentDeviceRead, { kind: "supported" }>, now: number): ConsentItems | undefined {
  const previous = read.control
  if (!previous || previous.state.kind === "withdrawing" || !counter(now) || previous.generation >= Number.MAX_SAFE_INTEGER) return
  const at = Math.max(now, previous.lastAgreementAt + 1, (read.device.consent?.at ?? 0) + 1)
  if (!counter(at)) return
  const current = { v: CONSENT_VERSION, at }
  return { device: { ...read.raw, consent: current }, "consent:state": { ...previous, generation: previous.generation + 1,
    lastAgreementAt: at, state: { kind: "agreed", current, prior: read.device.consent } } }
}
