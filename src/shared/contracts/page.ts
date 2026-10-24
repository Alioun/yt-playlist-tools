import type { Job, JobDataById } from "./jobs"
import { isJob, isJobDataFor } from "./jobs"
import type { JobFailure } from "./results"
import { isJobFailure } from "./results"
import type { RouteId } from "./identifiers"
import { isRouteId } from "./identifiers"
import { isJsonValue } from "./json"
import type { JsonObject } from "./json"

export type PageAccountData =
  | { signedIn: true; datasyncId: string }
  | { signedIn: false; datasyncId: null }
type PageJobDataById = Omit<JobDataById, "account"> & { account: PageAccountData }
export type PageJobData<J extends Job> = PageJobDataById[J["kind"]]
export type PageJobResult<J extends Job = Job> =
  | { ok: true; data: PageJobData<J>; route: RouteId }
  | JobFailure

function exact(value: unknown, keys: readonly string[]): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) && isJsonValue(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
}
export function isPageJobDataFor<J extends Job>(job: J, value: unknown): value is PageJobData<J> {
  try {
    if (!isJob(job)) return false
    if (job.kind !== "account") return isJobDataFor(job, value)
    return exact(value, ["signedIn", "datasyncId"]) &&
      (value.signedIn === true && typeof value.datasyncId === "string" && value.datasyncId.length > 0 ||
       value.signedIn === false && value.datasyncId === null)
  } catch { return false }
}
export function isPageJobResultFor<J extends Job>(job: J, value: unknown): value is PageJobResult<J> {
  try {
    return isJob(job) && (isJobFailure(value) || exact(value, ["ok", "data", "route"]) &&
      value.ok === true && isRouteId(value.route) && isPageJobDataFor(job, value.data))
  } catch { return false }
}
