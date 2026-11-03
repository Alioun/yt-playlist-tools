import type { BuildId, DiagnosticVocabulary, Job, ProbeReport, Site } from "../shared/contracts"
import type { PageJobResult } from "../shared/contracts/page"
import { pageJobsEvent } from "../shared/rpc/page-channel"
import type { PageReads } from "./read-gateway"

/** A job's whole budget from the moment the page half receives it, waiting for the jobs file included. */
export const jobLimitMs = 10_000

/** `budget` is what is left of the job's 10 s when the jobs file takes it over, so waiting for the file counts. */
export type JobContext = { readonly target?: Element; readonly budget?: number }
/** The jobs half of the gateway, which loads in its own MAIN-world file on a page's first job (G42). */
export interface Jobs {
  readonly vocabulary: DiagnosticVocabulary
  run<J extends Job>(job: J, ctx?: JobContext): Promise<PageJobResult<J>>
  probe(): Promise<ProbeReport>
  dispose(): void
}
/** What the page half lends the jobs file when it takes it: the page, and its read half with the identity pinned at load. */
export type JobsHost = { readonly window: Window; readonly document: Document; readonly reads: PageReads }
export type JobsOffer = { readonly build: BuildId; readonly site: Site; create(host: JobsHost): Jobs }

export function isJobsOffer(value: unknown, expected: { build: BuildId; site: Site }): value is JobsOffer {
  if (value === null || typeof value !== "object") return false
  const offer = value as Partial<JobsOffer>
  return offer.build === expected.build && offer.site === expected.site && typeof offer.create === "function"
}

/**
 * The jobs file hands itself to the page half of its own build in the same world, by an event on the document whose
 * detail is the offer. Nothing is written into the page.
 */
export function offerJobs(doc: Document, offer: JobsOffer): void {
  doc.dispatchEvent(new CustomEvent(pageJobsEvent, { detail: offer }))
}
