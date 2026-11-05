import type { Device, DocumentKey, Filter, Key, Settings, Setup, SetupContext, Stamped } from "../../shared/model"
import type { JsonObject } from "../../shared/contracts/json"
import type { KnownSyncValue } from "./sync-codec"
import type { PrepareBodyInput, PrepareBodyResult, prepareDocumentBody } from "./write-preparation"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Check<T extends true> = T
type ReadonlyBody<T> = T extends object ? { readonly [P in keyof T]: ReadonlyBody<T[P]> } : T
type ExpectedInput =
  | { readonly kind: "settings"; readonly data: ReadonlyBody<Settings> }
  | { readonly kind: "setup"; readonly data: ReadonlyBody<Setup>; readonly context: Readonly<Required<SetupContext>> }
  | { readonly kind: "filter"; readonly data: ReadonlyBody<Filter> }
type ExpectedResult = { kind: "prepared"; data: JsonObject } | { kind: "invalid"; reason: "json" | "shape" }
type SettingsInput = Extract<PrepareBodyInput, { kind: "settings" }>
type SetupInput = Extract<PrepareBodyInput, { kind: "setup" }>
type FilterInput = Extract<PrepareBodyInput, { kind: "filter" }>
type Canonical<K extends KnownSyncValue["kind"]> = Extract<KnownSyncValue, { kind: K }>["document"]["data"]
type WritableKeys<T> = { [P in keyof T]-?: Equal<Pick<T, P>, Readonly<Pick<T, P>>> extends true ? never : P }[keyof T]

export type PreparationProofs = [
  Check<Equal<PrepareBodyInput, ExpectedInput>>,
  Check<Equal<PrepareBodyResult, ExpectedResult>>,
  Check<Equal<typeof prepareDocumentBody, (input: ExpectedInput) => ExpectedResult>>,
  Check<Equal<PrepareBodyInput["kind"], DocumentKey["kind"]>>,
  Check<Equal<SettingsInput["data"], ReadonlyBody<Canonical<"settings">>>>,
  Check<Equal<SetupInput["data"], ReadonlyBody<Canonical<"setup">>>>,
  Check<Equal<FilterInput["data"], ReadonlyBody<Canonical<"filter">>>>,
  Check<Equal<SettingsInput["data"]["shortcuts"]["list"], readonly ReadonlyBody<Settings["shortcuts"]["list"][number]>[]>>,
  Check<Equal<SettingsInput["data"]["musicKeys"]["keys"], Readonly<Record<keyof Settings["musicKeys"]["keys"], ReadonlyBody<Key> | null>>>>,
  Check<Equal<SetupInput["data"]["autoAdd"], readonly ReadonlyBody<Setup["autoAdd"][number]>[]>>,
  Check<Equal<SetupInput["data"]["targets"], { readonly [id: string]: string }>>,
  Check<Equal<SetupInput["data"]["marks"], { readonly [id: string]: "missing" | "full" }>>,
  Check<Equal<FilterInput["data"]["channels"][number], readonly [id: string, title: string, handle?: string]>>,
  Check<Equal<WritableKeys<Pick<FilterInput["data"]["channels"][number], "0" | "1" | "2">>, never>>,
  Check<Equal<WritableKeys<ReadonlyBody<Key>>, never>>,
  Check<Equal<WritableKeys<SetupInput["data"]["targets"]>, never>>,
  Check<Equal<SetupInput["context"], Readonly<Required<SetupContext>>>>,
  Check<Equal<{} extends Pick<SetupInput, "context"> ? true : false, false>>,
  Check<Equal<{} extends Pick<SetupInput["context"], "additionalChosenPlaylists"> ? true : false, false>>,
  Check<Equal<"context" extends keyof SettingsInput ? true : false, false>>,
  Check<Equal<"context" extends keyof FilterInput ? true : false, false>>,
  Check<Equal<{ kind: "setup"; data: Setup } extends PrepareBodyInput ? true : false, false>>,
  Check<Equal<{ kind: "setup"; data: Setup; context: { shortcutIds: ReadonlySet<string> } } extends PrepareBodyInput ? true : false, false>>,
  Check<Equal<{ kind: "filter"; data: Stamped<Filter> } extends PrepareBodyInput ? true : false, false>>,
  Check<Equal<{ kind: "device"; data: Device } extends PrepareBodyInput ? true : false, false>>,
  Check<Equal<{ kind: "settings"; data: Partial<Settings> } extends PrepareBodyInput ? true : false, false>>,
  Check<Equal<Extract<PrepareBodyResult, { kind: "prepared" }>["data"] extends Filter ? true : false, false>>
]

export type MaterializeProofs = [
  Check<Equal<import("./write-preparation").MaterializeBodyInput, Omit<SetupInput, "context"> | SettingsInput | FilterInput>>,
  Check<Equal<typeof import("./write-preparation").materializeDocumentBody, (input: Omit<SetupInput, "context"> | SettingsInput | FilterInput) => PrepareBodyResult>>
]
