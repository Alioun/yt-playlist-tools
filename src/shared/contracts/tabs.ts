import { isAccountKey, type AccountKey } from "../model/validation"
import { objectShape } from "./object-shape"
import { isBuildId, isSite, type BuildId, type Site } from "./vocabulary"
import { isJobInvocation, isJobResultFor, type AccountData, type Job, type JobInvocation, type JobResult } from "./jobs"

export type TabPing = Readonly<AccountData & { site: Site; build: BuildId }>
export type TabHello = TabPing & { readonly hidden: boolean; readonly fresh: boolean }
export type TabViewScope = Readonly<AccountData & { private: boolean; build: BuildId }>
export type TabMessages<View extends TabViewScope> = {
  "bg.ping": { payload: Record<never, never>; result: TabPing }
  "bg.view": { payload: View; result: null }
}
export type TabHelloMessages<View extends TabViewScope> = {
  "tab.hello": { payload: TabHello; result: View | null }
}
export type TabPingMessages = Pick<TabMessages<TabViewScope>, "bg.ping">
export type TabJobMessages<J extends Job> = {
  "bg.job": { payload: JobInvocation<J>; result: JobResult<J> }
}

const bool = (value: unknown) => typeof value === "boolean"
export function isTabPing(value: unknown): value is TabPing {
  return (
    objectShape(value, { site: isSite, build: isBuildId, signedIn: v => v === true, acct: isAccountKey }) ||
    objectShape(value, { site: isSite, build: isBuildId, signedIn: v => v === false, acct: v => v === null })
  )
}
export function isTabHello(value: unknown): value is TabHello {
  const fields = { site: isSite, build: isBuildId, hidden: bool, fresh: bool }
  return objectShape(value, { ...fields, signedIn: v => v === true, acct: isAccountKey }) || objectShape(value, { ...fields, signedIn: v => v === false, acct: v => v === null })
}
export function sameTabAccount(left: { readonly acct: AccountKey | null; readonly signedIn: boolean }, right: AccountData): boolean {
  return left.acct === right.acct && left.signedIn === right.signedIn
}
export function tabMessages<View extends TabViewScope>(isView: (value: unknown) => value is View) {
  return {
    ...tabPingMessages(),
    "bg.view": { payload: isView, result: (v: unknown): v is null => v === null, timeoutMs: 2_000 }
  }
}
export function tabPingMessages() {
  return { "bg.ping": { payload: (v: unknown): v is Record<never, never> => objectShape(v, {}), result: isTabPing, timeoutMs: 2_000 } }
}
export function tabHelloMessages<View extends TabViewScope>(isView: (value: unknown) => value is View) {
  return { "tab.hello": { payload: isTabHello, result: (v: unknown): v is View | null => v === null || isView(v), timeoutMs: 2_000 } }
}
export function tabJobMessages<J extends Job>(invocation: JobInvocation<J>, timeoutMs: number) {
  return {
    "bg.job": {
      payload: (value: unknown): value is JobInvocation<J> => isJobInvocation(value) && JSON.stringify(value) === JSON.stringify(invocation),
      result: (value: unknown): value is JobResult<J> => isJobResultFor(invocation.job, value),
      timeoutMs
    }
  }
}

// Only receivers use this contract. Callers must use tabJobMessages for their exact invocation.
export function tabJobReceiverMessages() {
  return {
    "bg.job": {
      payload: isJobInvocation,
      result: (_value: unknown): _value is never => false,
      timeoutMs: 10_000
    }
  }
}
