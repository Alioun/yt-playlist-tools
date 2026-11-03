import type { AgreementOutcome, FeatureApplication, FirstRunOwner, SetupRow } from "./owner"
import type { DisclosureText } from "./text"
import type { PageFeatureId } from "./features"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Check<T extends true> = T
export type FirstRunOwnerProofs = [
  Check<Equal<Parameters<FirstRunOwner["agree"]>[0]["displayed"], DisclosureText>>,
  Check<Equal<Parameters<FirstRunOwner["agree"]>[0]["permissions"], Promise<{ readonly music: boolean; readonly browserMenu: boolean }>>>,
  Check<Equal<Extract<FeatureApplication, { feature: "shortcuts" }>["state"], "enabled">>,
  Check<Equal<Extract<AgreementOutcome, { kind: "agreed" }>["attempt"], number>>
]

const held: FeatureApplication = { feature: "music-actions", state: "held-site-access" }
const shortcuts: FeatureApplication = { feature: "shortcuts", state: "enabled", alsoOnMusic: "held-site-access" }
const ready: SetupRow = { feature: "gather" }
void [held, shortcuts, ready]

function boundaries(outcome: AgreementOutcome, id: PageFeatureId) {
  // @ts-expect-error First run never turns a ticked feature off after a denied prompt.
  const off: FeatureApplication = { feature: "music-actions", state: "off-denied-access" }
  // @ts-expect-error Playlist shortcuts runs on YouTube even when its YouTube Music part is held.
  const heldShortcuts: FeatureApplication = { feature: "shortcuts", state: "held-site-access", alsoOnMusic: "held-site-access" }
  // @ts-expect-error Settings sync is the sync switch, not a page feature.
  const sync: PageFeatureId = "sync"
  // @ts-expect-error A shortcut's row names its own key.
  const keyless: SetupRow = { feature: "shortcuts", target: { purpose: "shortcut", selection: { kind: "none" } } }
  // @ts-expect-error An outcome is correlated with the attempt that asked for it.
  const uncorrelated: AgreementOutcome = { kind: "agreed", applications: [] }
  if (outcome.kind === "not-agreed") {
    // @ts-expect-error A refusal carries no applications.
    void outcome.applications
  }
  void [off, heldShortcuts, sync, keyless, uncorrelated, id]
}
void boundaries
