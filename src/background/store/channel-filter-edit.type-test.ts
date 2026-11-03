import type { Filter, Stamped } from "../../shared/model"
import type { AccountBodies } from "./accounts"
import type { changeFilterSetting, FilterSettingInput, FilterSettingResult } from "./channel-filter-edit"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Check<T extends true> = T
type ReadonlyBody<T> = T extends object ? { readonly [P in keyof T]: ReadonlyBody<T[P]> } : T
type WritableKeys<T> = { [P in keyof T]-?: Equal<Pick<T, P>, Readonly<Pick<T, P>>> extends true ? never : P }[keyof T]
type Current = NonNullable<FilterSettingInput["current"]>
type ExpectedInput = {
  readonly current: ReadonlyBody<Filter> | undefined
  readonly desired: Readonly<Pick<Filter, "mode" | "on">>
  readonly clearListedChannels: "not-confirmed" | "confirmed"
}
type ExpectedResult = { readonly kind: "unchanged" } | { readonly kind: "confirmation-required" } | { readonly kind: "changed"; readonly filter: Filter }

export type FilterSettingProofs = [
  Check<Equal<FilterSettingInput, ExpectedInput>>,
  Check<Equal<FilterSettingResult, ExpectedResult>>,
  Check<Equal<typeof changeFilterSetting, (input: ExpectedInput) => ExpectedResult>>,
  Check<Equal<keyof typeof import("./channel-filter-edit"), "changeFilterSetting" | "changeFilterChannel" | "refreshChannelLabel">>,
  Check<Equal<FilterSettingInput["desired"]["mode"], Filter["mode"]>>,
  Check<Equal<FilterSettingInput["desired"]["on"], Filter["on"]>>,
  Check<Equal<WritableKeys<FilterSettingInput>, never>>,
  Check<Equal<WritableKeys<FilterSettingInput["desired"]>, never>>,
  Check<Equal<WritableKeys<Current>, never>>,
  Check<Equal<Current["channels"], readonly ReadonlyBody<Filter["channels"][number]>[]>>,
  Check<Equal<Current["channels"][number], readonly [id: string, title: string, handle?: string]>>,
  Check<Equal<WritableKeys<Pick<Current["channels"][number], "0" | "1" | "2">>, never>>,
  Check<Equal<WritableKeys<Extract<FilterSettingResult, { kind: "changed" }>>, never>>,
  Check<Equal<Extract<FilterSettingResult, { kind: "changed" }>["filter"], Filter>>,
  Check<Equal<keyof Extract<FilterSettingResult, { kind: "unchanged" }>, "kind">>,
  Check<Equal<keyof Extract<FilterSettingResult, { kind: "confirmation-required" }>, "kind">>,
  Check<Equal<{ mode: "off"; on: false } extends FilterSettingInput["desired"] ? true : false, false>>,
  Check<Equal<{ mode: "deny" } extends FilterSettingInput["desired"] ? true : false, false>>,
  Check<Equal<{ on: true } extends FilterSettingInput["desired"] ? true : false, false>>,
  Check<Equal<Omit<ExpectedInput, "current"> extends FilterSettingInput ? true : false, false>>,
  Check<Equal<Omit<ExpectedInput, "clearListedChannels"> extends FilterSettingInput ? true : false, false>>,
  Check<Equal<Stamped<Filter> extends Current ? true : false, false>>,
  Check<Equal<AccountBodies extends Current ? true : false, false>>,
  Check<Equal<Record<string, Filter> extends Current ? true : false, false>>
]
