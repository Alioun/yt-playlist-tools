import { isJob, supportsJob } from "../shared/contracts"
import type { BreakageSignal, DiagnosticVocabulary, Job } from "../shared/contracts"
import type { PageAccountData, PageJobResult } from "../shared/contracts/page"
import type { PageGatewayOperations } from "./channel"
import type { Jobs, JobContext } from "./jobs-port"
import type { ReadGateway } from "./read-gateway"

export interface Gateway extends PageGatewayOperations {
  readonly disposed: boolean
  readonly vocabulary: DiagnosticVocabulary
  /** The identity pinned at creation, or null when the page config didn't name one. */
  readonly account: PageAccountData | null
  run<J extends Job>(job: J, ctx?: JobContext): Promise<PageJobResult<J>>
  onSignal(listener: (signal: BreakageSignal) => void): () => void
  dispose(): void
}

/**
 * One gateway from its two halves: the reads the read half serves and the streams go to it, every other job and the
 * probe to the jobs half. A job its site doesn't support never reaches the jobs half, so it never loads the jobs file.
 */
export function composeGateway(reads: ReadGateway, jobs: Jobs): Gateway {
  return {
    get disposed() {
      return reads.disposed
    },
    get vocabulary() {
      return jobs.vocabulary
    },
    account: reads.account,
    run(job, ctx) {
      if (reads.disposed || !isJob(job) || !supportsJob(reads.site, job.kind) || reads.serves(job, ctx)) return reads.run(job, ctx)
      return jobs.run(job, ctx)
    },
    watch: (stream, onData) => reads.watch(stream, onData),
    probe: () => jobs.probe(),
    onSignal: listener => reads.onSignal(listener),
    dispose() {
      try {
        jobs.dispose()
      } finally {
        reads.dispose()
      }
    }
  }
}
