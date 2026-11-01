import { accountRemovalLocalName } from "../../../src/background/store/account-removal-execution"
import { syncJoinLocalName } from "../../../src/background/store/sync-join-execution"
import { planInterimConversion } from "../../../src/background/store/interim-conversion"
import type { InterimConversionContext, InterimConversionInput } from "../../../src/background/store/interim-conversion"
import { openInterimRecoveryReview } from "../../../src/background/store/interim-recovery-review"
import type { RecoveryObservation } from "../../../src/background/store/interim-recovery-review"
import { createInterimHarness, interimSnapshot } from "../interim-conversion/run"
import { createStartingLocalFilterWriter, StartupReadinessError } from "../../../src/background/store/local-filter-writer"
import { isInterimCanonicalKey, isInterimSourceKey, readRetainedCheckpoint } from "../../../src/background/store/interim-persistence"
import type { RecoveryHost, RecoveryOwnership } from "../../../src/background/store/interim-recovery-execution"
import type { ClaimAuthorityState } from "../../../src/background/store/local-claim-writer"
import { isJsonValue, type JsonObject } from "../../../src/shared/contracts/json"
import { isAccountKey, isPlaylistId, type PlaylistId } from "../../../src/shared/model/validation"

const clone = <T>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value))
function jsonObject(value: unknown): value is JsonObject { return value !== null && typeof value === "object" && !Array.isArray(value) && isJsonValue(value) }
export function recoveryEqual(actual: unknown, expected: unknown, label: string): void {
  const stable = (value: unknown) => JSON.stringify(value, (_, child: unknown) => child && typeof child === "object" && !Array.isArray(child)
    ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => a.localeCompare(b))) : child)
  if (stable(actual) !== stable(expected)) throw Error(label)
}
export function createRecoveryHarness(seed: JsonObject = recoveryAcceptanceFixture.seed, remoteSeed?: JsonObject) {
  const h = createInterimHarness(seed), account = "AAAAAAAAAAAAAAAA", playlist = "PL_KEPT"
  if (!isAccountKey(account) || !isPlaylistId(playlist)) throw Error("Invalid synthetic recovery identity")
  let authority: ClaimAuthorityState = { kind: "ready", authority: { acct: account, lease: "fixture-lease-1", browserSession: "fixture-browser-session-1", consentGeneration: "fixture-canonical-consent-1", signedIn: true, incognito: false } }
  let owned = true, allocation = false, forbidAllocation = false, remote = clone(remoteSeed), generation = "recovery-001"
  const playlists = new Set<PlaylistId>([playlist])
  const recovery: RecoveryHost = { kind: "fixture",
    snapshot: { async read() { h.effects.push("recovery-snapshot"); const records = h.records(); return { retained: interimSnapshot(records), history: Object.hasOwn(records, "sync") ? { kind: "present", raw: records.sync } : { kind: "absent" } } } },
    authority: { async read() { h.effects.push("recovery-authority"); return clone(authority) } },
    accounts: { async read() { h.effects.push("recovery-accounts"); return authority.kind === "ready" ? [clone(authority.authority)] : [] } },
    ownership: { async lookup(grant): Promise<RecoveryOwnership> { h.effects.push("recovery-ownership"); return owned ? { kind: "fixture-owned", authority: clone(grant), ownedPlaylistIds: new Set(playlists) } : { kind: "unavailable" } } }
  }
  const deps = { ...h.deps, recovery,
    now() { h.effects.push("stamp"); if (forbidAllocation) throw Error("Restart allocated time"); return allocation ? 200 : 100 },
    generation() { h.effects.push("generation"); if (forbidAllocation) throw Error("Restart allocated generation"); return generation },
    sync: remoteSeed ? { ...h.deps.sync, async get() { h.effects.push("sync-get"); if (!remote) throw Error("Missing synthetic remote inventory"); return clone(remote) } } : h.deps.sync
  }
  return { ...h, deps, account, playlist,
    allocateReplacement() { allocation = true }, forbidAllocation() { forbidAllocation = true }, permitAllocation() { forbidAllocation = false },
    replacementGeneration(value: string) { generation = value },
    allowPlaylist(value: string) { if (!isPlaylistId(value)) throw Error("Invalid synthetic playlist"); playlists.add(value) },
    authority(value: ClaimAuthorityState) { authority = clone(value) }, ownership(value: boolean) { owned = value },
    remote(fn: (records: JsonObject) => void) { if (!remote) throw Error("No remote fixture"); fn(remote) }
  }
}
export async function recoveryHeld(owner: ReturnType<typeof createStartingLocalFilterWriter>) {
  try { await owner.ready() } catch (error) {
    if (error instanceof StartupReadinessError && error.result.kind === "interim-held") return error.result.result
    throw error
  }
  throw Error("Recovery released ordinary readiness")
}
export const recoveryUi = { kind: "ui", windowId: 1, incognito: false } as const
export async function recoveryAgree(owner: ReturnType<typeof createStartingLocalFilterWriter>, h: ReturnType<typeof createRecoveryHarness>) {
  await recoveryHeld(owner)
  const read = await owner.readAgreement(recoveryUi)
  if (read.kind !== "review") throw Error("Actual retained disclosure unavailable")
  const result = await owner.agree(recoveryUi, { review: read.review, displayedVersion: read.version, choice: { kind: "retained-disclosure" }, access: Promise.resolve({ www: false, music: false, browserMenu: false }) })
  if (result.kind !== "committed") throw Error("Actual retained agreement failed")
  h.allocateReplacement()
  return result
}
export async function recoveryPrepare(owner: ReturnType<typeof createStartingLocalFilterWriter>) {
  const opened = await owner.readInterimRecovery()
  if (opened.kind !== "review") throw Error("Actual recovery review unavailable")
  const item = opened.view.items.find(item => item.id.sourceKey === "account:AAAAAAAAAAAAAAAA" && item.kind === "filter" && item.facts.playlist === "PL_KEPT")
  if (!item) throw Error("Retained occurrence missing")
  const prepared = await owner.prepareInterimFilterReplacement(recoveryUi, { capture: opened.capture, item: item.id })
  return { opened, item, prepared }
}
export async function observeInterimRecoveryExecution() {
  const observations: unknown[] = []
  for (const syncing of [false, true]) {
    const seed = syncing ? { ...clone(recoveryAcceptanceFixture.seed), ...clone(recoverySyncFixture.seedOverrides) } : clone(recoveryAcceptanceFixture.seed)
    const h = createRecoveryHarness(seed, syncing ? recoverySyncFixture.remoteInventory : undefined), owner = createStartingLocalFilterWriter(h.deps)
    const agreement = await recoveryAgree(owner, h), before = h.records(), effectsBeforeOpen = h.effects.length, writesBeforeOpen = h.writes.length
    const { opened, item, prepared } = await recoveryPrepare(owner)
    if (prepared.kind !== "confirmation-required") throw Error("Separate filter replacement confirmation unavailable")
    recoveryEqual(h.records(), before, "Open and preparation preserve the complete store")
    recoveryEqual(h.writes.length, writesBeforeOpen, "Preparation performs no writes")
    recoveryEqual(h.effects.slice(effectsBeforeOpen).filter(x => x === "stamp" || x === "generation" || x === "sync-get"), [], "Preparation allocates and admits nothing")
    recoveryEqual({ kind: prepared.kind, acct: prepared.acct, playlist: prepared.playlist, current: prepared.current, retained: prepared.retained, scope: prepared.scope },
      { ...recoveryAcceptanceFixture.expectedConfirmation, scope: syncing ? recoverySyncFixture.expectedScope : recoveryAcceptanceFixture.expectedConfirmation.scope }, "Both literal semantic filters are shown")
    const snapshots: JsonObject[] = []
    h.write(async (items, apply) => { apply(items); snapshots.push(h.records()) })
    const result = await owner.replaceInterimFilter(recoveryUi, prepared.confirmation)
    if (result.kind !== "committed") throw Error("Actual replacement did not commit")
    recoveryEqual(result.mutations.map(x => x.stage), ["accept", "documents", "record"], "Fixed readback-confirmed transaction stages")
    const fixed = syncing ? { ...clone(recoveryAcceptanceFixture.expectedFixedEffect), after: recoverySyncFixture.expectedFixedFilterAfter,
      history: { before: { kind: "present", raw: recoverySyncFixture.seedOverrides.sync }, after: recoverySyncFixture.expectedFixedHistoryAfter }, scope: recoverySyncFixture.expectedScope,
      admission: { kind: "synced", joined: "fixture-history", requiredRepairs: recoverySyncFixture.expectedRepairIdentities.map(x => ({ ...x, document: seed[x.name as keyof typeof seed] })) } }
      : recoveryAcceptanceFixture.expectedFixedEffect
    for (const [index, snapshot] of snapshots.entries()) {
      const read = readRetainedCheckpoint(snapshot.interimConversion)
      if (read.kind !== "recovery") throw Error("Stage did not persist validated V4")
      recoveryEqual(read.checkpoint.basis, { checkpoint: before.interimConversion, history: { kind: "present", raw: before.sync } }, "Exact immutable agreement and history basis")
      const first = read.checkpoint.resolutions[0]
      const effect = read.checkpoint.pending.kind === "filter-replacement" ? read.checkpoint.pending.effect : first?.kind === "filter-replaced" ? first.effect : undefined
      recoveryEqual(effect, fixed, "Independently expected literal fixed effect")
      const expected: JsonObject = { ...before, interimConversion: snapshot.interimConversion! }
      if (index > 0) { expected["doc:filter:AAAAAAAAAAAAAAAA:PL_KEPT"] = clone(syncing ? recoverySyncFixture.expectedFixedFilterAfter : recoveryAcceptanceFixture.expectedFixedEffect.after); expected.sync = clone(syncing ? recoverySyncFixture.expectedFixedHistoryAfter.raw : recoveryAcceptanceFixture.expectedFixedEffect.history.after.raw) }
      recoveryEqual(snapshot, expected, "Complete stage store preserves every unowned value")
      recoveryEqual(read.checkpoint.resolutions.length, index === 2 ? 1 : 0, "Receipt is recorded only at the final stage")
    }
    const serialized = JSON.stringify(h.records()), effects = clone(h.effects), writes = clone(h.writes)
    await owner.dispose()
    const reopenedHarness = createRecoveryHarness(JSON.parse(serialized), syncing ? recoverySyncFixture.remoteInventory : undefined)
    reopenedHarness.forbidAllocation()
    const reopenedOwner = createStartingLocalFilterWriter(reopenedHarness.deps), readiness = await recoveryHeld(reopenedOwner), reopened = await reopenedOwner.readInterimRecovery()
    if (reopened.kind !== "review") throw Error("Completed recovery did not reopen")
    recoveryEqual(reopened.resolved.length, 1, "Restart exposes one validated historical resolution")
    recoveryEqual(reopened.view.items.map(x => x.intent), opened.view.items.map(() => "none"), "Restart discards all drafts")
    recoveryEqual(reopenedHarness.writes, [], "Restart is read only")
    recoveryEqual(reopenedHarness.effects.filter(x => x === "stamp" || x === "generation" || x === "recovery-ownership" || x === "sync-get"), [], "Restart has no authority lookup, allocation or admission")
    recoveryEqual(reopenedHarness.records(), JSON.parse(serialized), "Serialized restart bytes remain intact")
    await reopenedOwner.dispose()
    observations.push({ syncing, agreement, before, opened, selected: item, confirmation: prepared, result, snapshots, serialized, effects, writes, readiness, reopened, restartEffects: reopenedHarness.effects })
  }
  return { mode: "synthetic-confirmed-filter-replacement", observations, activation: "held", production: "not-connected", native: "waived-and-unproven",
    limitation: "Synthetic storage, authority and ownership only. Native durability and exclusion remain unproven." }
}


export function observeInterimRecoveryReview() {
  const A = "AAAAAAAAAAAAAAAA", B = "BBBBBBBBBBBBBBBB", C = "CCCCCCCCCCCCCCCC"
  const channel = "UCaaaaaaaaaaaaaaaaaaaaaa"
  const source = {
    accountBodies: {
      [`account:${A}`]: { playlists: ["PL_SAME", "PL_SAME"], shortcutPlaylistId: "WL", filters: { PL_KEPT: { mode: "deny", enabled: false, channels: [channel] } }, labels: { [channel]: { title: "Synthetic channel", handle: "@synthetic" } }, cachedPlaylists: [], cachedAt: null },
      [`account:${C}`]: { playlists: ["PL_SAME"], shortcutPlaylistId: "WL", filters: {}, labels: {}, cachedPlaylists: [], cachedAt: null }
    },
    savedAccountKeys: [B, B], legacyClaimed: true,
    globals: { playlists: ["PL_GLOBAL"], addToPlaylistID: "WL", channelFilters: { PL_ORPHAN: { mode: "allow", enabled: false, channels: [] } } }
  }
  const input: InterimConversionInput = { schema: 1, source, canonical: { documents: {}, caches: {}, device: undefined, unclaimed: null }, historicalAuthorization: { kind: "unknown" }, priorCredentialPresence: { kind: "unknown" } }
  const context: InterimConversionContext = { deviceId: "synthetic-device", at: 123, platform: { browser: "firefox", os: "linux" }, commands: [], interimShortcutId: "conv01", documentGenerations: { "doc:settings": "settings", [`doc:setup:${A}`]: "setup-A", [`doc:setup:${C}`]: "setup-C", [`doc:filter:${A}:PL_KEPT`]: "filter" } }
  const conversion = planInterimConversion(input, context)
  const current: RecoveryObservation = { captureId: "synthetic-retained-capture", schema: input.schema, conversion, canonical: input.canonical }
  const snapshot = () => ({ schema: input.schema, source: structuredClone(source), canonical: { documents: structuredClone(input.canonical.documents), caches: structuredClone(input.canonical.caches), device: { kind: "undefined" }, unclaimed: input.canonical.unclaimed }, historicalAuthorization: input.historicalAuthorization, priorCredentialPresence: input.priorCredentialPresence })
  const before = snapshot(), reader = openInterimRecoveryReview(current), opened = reader.read(current)
  if (opened.kind !== "review") throw new Error("Synthetic command could not open review")
  const restoreItem = opened.view.items.find(item => item.id.sourceKey === `account:${A}` && item.kind === "playlist" && item.id.path[1] === 1)
  const discardItem = opened.view.items.find(item => item.id.sourceKey === `account:${A}` && item.kind === "filter")
  if (!restoreItem || !discardItem) throw new Error("Synthetic command lost individual choices")
  const restoreDraft = reader.select({ current, item: restoreItem.id, intent: "restore" })
  const discardDraft = reader.select({ current, item: discardItem.id, intent: "discard" })
  const clearedDraft = reader.select({ current, item: restoreItem.id, intent: "none" })
  const after = snapshot()
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Draft changed retained source or canonical records")
  const changed = { ...current, canonical: { ...current.canonical, unclaimed: { from: "1.5.0", autoAdd: ["PL_PENDING"], shortcutPlaylist: "WL", originalShortcutId: "orig01", filters: {}, at: 0 } } }
  const stale = reader.read(changed)
  const staleSelection = reader.select({ current: changed, item: discardItem.id, intent: "restore" })
  const returnedToOriginal = reader.read(current)
  const reopened = openInterimRecoveryReview(changed).read(changed)
  return { mode: "synthetic-read-only-item-review", before, conversion, opened, restoreDraft, discardDraft, clearedDraft, after, stale, staleSelection, returnedToOriginal, reopened,
    limitation: "In-memory comparison of caller-supplied evidence only. No native freshness, persistence, ownership or execution is proven.", production: "not-connected", native: "waived-and-unproven" }
}



export const recoveryAcceptanceFixture = {
  "purpose": "Static independently expected data for the future implementation worker. No runtime observation or executed test is claimed.",
  "seed": {
    "schema": 1,
    "device": {
      "id": "synthetic-device",
      "consent": null,
      "syncOn": false,
      "future": {
        "keep": true
      }
    },
    "doc:settings": {
      "v": 1,
      "gen": "canonical-settings",
      "at": 10,
      "by": "canonical-device",
      "data": {
        "theme": "dark"
      }
    },
    "doc:setup:AAAAAAAAAAAAAAAA": {
      "v": 1,
      "gen": "canonical-setup",
      "at": 11,
      "by": "canonical-device",
      "data": {
        "label": {
          "name": "Synthetic account"
        },
        "autoAdd": [],
        "targets": {},
        "quickSave": null,
        "musicSave": null,
        "gather": null,
        "marks": {},
        "future": [
          null,
          false
        ]
      }
    },
    "doc:filter:AAAAAAAAAAAAAAAA:PL_KEPT": {
      "v": 1,
      "gen": "canonical-filter",
      "at": 12,
      "by": "canonical-device",
      "extension": "canonical-envelope",
      "data": {
        "mode": "allow",
        "on": true,
        "channels": [
          [
            "UCaaaaaaaaaaaaaaaaaaaaaa",
            "Canonical channel",
            "@canonical"
          ],
          [
            "UCcccccccccccccccccccccc",
            "Other canonical channel"
          ]
        ],
        "extension": {
          "keep": [
            null,
            false
          ]
        }
      }
    },
    "sync": {
      "joined": null,
      "pushed": {},
      "status": "off",
      "editedSinceOff": false,
      "everEdited": false,
      "opaqueWrite": {
        "gate": {
          "kind": "held",
          "notBefore": 1060000
        },
        "diagnostic": {
          "name": "SyntheticOriginal",
          "message": "opaque"
        }
      },
      "extension": {
        "retain": [
          false,
          null
        ]
      }
    },
    "unclaimed": {
      "from": "1.5.0",
      "autoAdd": [
        "PL_PENDING"
      ],
      "shortcutPlaylist": "WL",
      "originalShortcutId": "orig01",
      "filters": {},
      "at": 0
    },
    "account:AAAAAAAAAAAAAAAA": {
      "playlists": [],
      "shortcutPlaylistId": "",
      "filters": {
        "PL_KEPT": {
          "mode": "deny",
          "enabled": false,
          "channels": [
            "UCbbbbbbbbbbbbbbbbbbbbbb"
          ]
        }
      },
      "labels": {
        "UCbbbbbbbbbbbbbbbbbbbbbb": {
          "title": "Retained channel",
          "handle": "@retained"
        }
      },
      "cachedPlaylists": [],
      "cachedAt": null
    },
    "account:BBBBBBBBBBBBBBBB": {
      "playlists": [
        "PL_SIBLING",
        "PL_SIBLING"
      ],
      "shortcutPlaylistId": "",
      "filters": {},
      "labels": {},
      "cachedPlaylists": [],
      "cachedAt": null
    },
    "savedAccountKeys": [
      "AAAAAAAAAAAAAAAA",
      "BBBBBBBBBBBBBBBB"
    ],
    "sessionConsent": 1,
    "sessionGeneration": "old-synthetic-session",
    "legacyClaimed": true,
    "playlists": [
      "PL_GLOBAL",
      "PL_GLOBAL"
    ],
    "addToPlaylistID": "WL",
    "unrelated": {
      "keep": [
        null,
        false,
        "opaque synthetic text"
      ]
    }
  },
  "ui": {
    "kind": "ui",
    "windowId": 1,
    "incognito": false
  },
  "freshAuthority": {
    "kind": "ready",
    "authority": {
      "acct": "AAAAAAAAAAAAAAAA",
      "lease": "fixture-lease-1",
      "browserSession": "fixture-browser-session-1",
      "consentGeneration": "fixture-canonical-consent-1",
      "signedIn": true,
      "incognito": false
    }
  },
  "ownershipInputForReadonlySet": [
    "PL_KEPT"
  ],
  "selectedOccurrence": {
    "sourceKey": "account:AAAAAAAAAAAAAAAA",
    "path": [
      "filters",
      "PL_KEPT"
    ]
  },
  "expectedInspection": {
    "outcomeKind": "blocked",
    "recovery": "available",
    "conversionShortcut": {
      "kind": "validated-context",
      "id": "conv01"
    },
    "selectedItem": {
      "kind": "filter",
      "intent": "none",
      "inactive": true,
      "restoration": "not-proven",
      "source": {
        "kind": "account-body",
        "account": "AAAAAAAAAAAAAAAA"
      },
      "facts": {
        "playlist": "PL_KEPT",
        "mode": "deny",
        "on": false,
        "channels": [
          [
            "UCbbbbbbbbbbbbbbbbbbbbbb",
            "Retained channel",
            "@retained"
          ]
        ],
        "kept": true
      },
      "destination": {
        "kind": "account-filter",
        "account": "AAAAAAAAAAAAAAAA",
        "path": "doc:filter:AAAAAAAAAAAAAAAA:PL_KEPT",
        "parentPath": "doc:setup:AAAAAAAAAAAAAAAA"
      }
    },
    "sourceOccurrencesThatStayIndependent": [
      {
        "sourceKey": "account:BBBBBBBBBBBBBBBB",
        "path": [
          "playlists",
          0
        ]
      },
      {
        "sourceKey": "account:BBBBBBBBBBBBBBBB",
        "path": [
          "playlists",
          1
        ]
      },
      {
        "sourceKey": "playlists",
        "path": [
          0
        ]
      },
      {
        "sourceKey": "playlists",
        "path": [
          1
        ]
      },
      {
        "sourceKey": "addToPlaylistID",
        "path": []
      }
    ]
  },
  "expectedAgreementDevice": {
    "id": "synthetic-device",
    "consent": {
      "v": 1,
      "at": 100
    },
    "syncOn": false,
    "future": {
      "keep": true
    }
  },
  "replacementAllocation": {
    "generation": "recovery-001",
    "at": 200
  },
  "expectedConfirmation": {
    "kind": "confirmation-required",
    "acct": "AAAAAAAAAAAAAAAA",
    "playlist": "PL_KEPT",
    "current": {
      "mode": "allow",
      "on": true,
      "channels": [
        [
          "UCaaaaaaaaaaaaaaaaaaaaaa",
          "Canonical channel",
          "@canonical"
        ],
        [
          "UCcccccccccccccccccccccc",
          "Other canonical channel"
        ]
      ]
    },
    "retained": {
      "mode": "deny",
      "on": false,
      "channels": [
        [
          "UCbbbbbbbbbbbbbbbbbbbbbb",
          "Retained channel",
          "@retained"
        ]
      ]
    },
    "scope": {
      "kind": "this-browser"
    }
  },
  "expectedFixedEffect": {
    "kind": "filter-replacement",
    "item": {
      "sourceKey": "account:AAAAAAAAAAAAAAAA",
      "path": [
        "filters",
        "PL_KEPT"
      ]
    },
    "key": {
      "kind": "filter",
      "acct": "AAAAAAAAAAAAAAAA",
      "playlist": "PL_KEPT"
    },
    "parent": {
      "v": 1,
      "gen": "canonical-setup",
      "at": 11,
      "by": "canonical-device",
      "data": {
        "label": {
          "name": "Synthetic account"
        },
        "autoAdd": [],
        "targets": {},
        "quickSave": null,
        "musicSave": null,
        "gather": null,
        "marks": {},
        "future": [
          null,
          false
        ]
      }
    },
    "before": {
      "v": 1,
      "gen": "canonical-filter",
      "at": 12,
      "by": "canonical-device",
      "extension": "canonical-envelope",
      "data": {
        "mode": "allow",
        "on": true,
        "channels": [
          [
            "UCaaaaaaaaaaaaaaaaaaaaaa",
            "Canonical channel",
            "@canonical"
          ],
          [
            "UCcccccccccccccccccccccc",
            "Other canonical channel"
          ]
        ],
        "extension": {
          "keep": [
            null,
            false
          ]
        }
      }
    },
    "after": {
      "v": 1,
      "gen": "recovery-001",
      "at": 200,
      "by": "synthetic-device",
      "extension": "canonical-envelope",
      "data": {
        "mode": "deny",
        "on": false,
        "channels": [
          [
            "UCbbbbbbbbbbbbbbbbbbbbbb",
            "Retained channel",
            "@retained"
          ]
        ],
        "extension": {
          "keep": [
            null,
            false
          ]
        }
      }
    },
    "history": {
      "before": {
        "kind": "present",
        "raw": {
          "joined": null,
          "pushed": {},
          "status": "off",
          "editedSinceOff": false,
          "everEdited": false,
          "opaqueWrite": {
            "gate": {
              "kind": "held",
              "notBefore": 1060000
            },
            "diagnostic": {
              "name": "SyntheticOriginal",
              "message": "opaque"
            }
          },
          "extension": {
            "retain": [
              false,
              null
            ]
          }
        }
      },
      "after": {
        "kind": "present",
        "raw": {
          "joined": null,
          "pushed": {},
          "status": "off",
          "editedSinceOff": true,
          "everEdited": true,
          "opaqueWrite": {
            "gate": {
              "kind": "held",
              "notBefore": 1060000
            },
            "diagnostic": {
              "name": "SyntheticOriginal",
              "message": "opaque"
            }
          },
          "extension": {
            "retain": [
              false,
              null
            ]
          }
        }
      }
    },
    "scope": {
      "kind": "this-browser"
    },
    "admission": {
      "kind": "off"
    }
  },
  "expectedStageChangesAfterActualAgreement": [
    {
      "stage": "open-and-prepare",
      "setKeys": [],
      "allocationCalls": 0,
      "canonicalFilter": "before",
      "checkpointVersion": 2,
      "resolutionCount": 0
    },
    {
      "stage": "accept",
      "setKeys": [
        "interimConversion"
      ],
      "canonicalFilter": "before",
      "history": "before",
      "checkpointVersion": 4,
      "pendingKind": "filter-replacement",
      "resolutionCount": 0
    },
    {
      "stage": "documents",
      "setKeys": [
        "doc:filter:AAAAAAAAAAAAAAAA:PL_KEPT",
        "sync"
      ],
      "canonicalFilter": "after",
      "history": "after",
      "checkpointVersion": 4,
      "pendingKind": "filter-replacement",
      "resolutionCount": 0
    },
    {
      "stage": "record",
      "setKeys": [
        "interimConversion"
      ],
      "canonicalFilter": "after",
      "history": "after",
      "checkpointVersion": 4,
      "pendingKind": "none",
      "resolutionCount": 1,
      "resolutionKind": "filter-replaced",
      "activation": "held"
    }
  ],
  "expectedRestartCases": [
    {
      "name": "accepted-before-before",
      "pending": true,
      "filter": "before",
      "history": "before",
      "startupWrites": 0,
      "readKind": "pending",
      "resumeSetKeys": [
        [
          "doc:filter:AAAAAAAAAAAAAAAA:PL_KEPT",
          "sync"
        ],
        [
          "interimConversion"
        ]
      ],
      "afterResolutionCount": 1
    },
    {
      "name": "accepted-after-before",
      "pending": true,
      "filter": "after",
      "history": "before",
      "startupWrites": 0,
      "readKind": "pending",
      "resumeAllowedValues": "Only the same fixed Filter and history after images, then the receipt",
      "afterResolutionCount": 1
    },
    {
      "name": "accepted-before-after",
      "pending": true,
      "filter": "before",
      "history": "after",
      "startupWrites": 0,
      "readKind": "pending",
      "resumeAllowedValues": "Only the same fixed Filter and history after images, then the receipt",
      "afterResolutionCount": 1
    },
    {
      "name": "accepted-after-after",
      "pending": true,
      "filter": "after",
      "history": "after",
      "startupWrites": 0,
      "readKind": "pending",
      "resumeSetKeys": [
        [
          "interimConversion"
        ]
      ],
      "afterResolutionCount": 1
    },
    {
      "name": "completed",
      "pending": false,
      "filter": "after",
      "history": "after",
      "startupWrites": 0,
      "readKind": "review",
      "resolvedCount": 1,
      "allDraftIntents": "none",
      "activation": "held"
    },
    {
      "name": "completed-then-later-edit",
      "pending": false,
      "filter": "laterEdit",
      "history": "after",
      "startupWrites": 0,
      "expected": "held or unavailable stale; zero installation or replacement repair writes"
    },
    {
      "name": "completed-then-tombstone",
      "pending": false,
      "filter": "laterTombstone",
      "history": "after",
      "startupWrites": 0,
      "expected": "held or unavailable stale; no resurrection"
    },
    {
      "name": "pending-then-tombstone",
      "pending": true,
      "filter": "laterTombstone",
      "history": "after",
      "startupWrites": 0,
      "resumeWrites": 0,
      "expected": "held; no resurrection"
    }
  ],
  "laterEdit": {
    "v": 1,
    "gen": "legitimate-later-edit",
    "at": 300,
    "by": "canonical-device",
    "extension": "canonical-envelope",
    "data": {
      "mode": "allow",
      "on": false,
      "channels": [],
      "extension": {
        "keep": [
          null,
          false
        ]
      }
    }
  },
  "laterTombstone": {
    "v": 1,
    "gen": "legitimate-later-deletion",
    "at": 301,
    "by": "canonical-device",
    "deleted": true
  },
  "expectedAbsentHistoryAfterChangedOffReplacement": {
    "kind": "present",
    "raw": {
      "joined": null,
      "pushed": {},
      "status": "off",
      "editedSinceOff": true,
      "everEdited": true
    }
  },
  "equalKnownFieldsVariant": {
    "instruction": "Before actual capture, replace only the canonical Filter's three known fields with these. Preserve its generation and compatible extensions.",
    "data": {
      "mode": "deny",
      "on": false,
      "channels": [
        [
          "UCbbbbbbbbbbbbbbbbbbbbbb",
          "Retained channel",
          "@retained"
        ]
      ]
    },
    "expected": {
      "kind": "unavailable",
      "reason": "already-present"
    },
    "replacementWrites": 0,
    "allocationCalls": 0,
    "resolutionCount": 0
  },
  "syncAdmissionFixturesForFutureVerifier": {
    "purpose": "Build actual inventory variants with existing sync-codec helpers. These are expected refusal outcomes, not invented remote protocol bytes.",
    "cases": [
      {
        "name": "addressed-newer-version",
        "expected": {
          "kind": "refused",
          "reason": "update-needed"
        },
        "replacementWrites": 0
      },
      {
        "name": "actual-full-inventory",
        "expected": {
          "kind": "refused",
          "reason": "sync-full"
        },
        "replacementWrites": 0
      },
      {
        "name": "reset",
        "expected": "unavailable sync-writer-required",
        "replacementWrites": 0
      },
      {
        "name": "required-repair-no-longer-proven",
        "expected": {
          "kind": "unavailable",
          "reason": "admission-debt"
        },
        "resumeWrites": 0
      }
    ]
  },
  "expectedForbiddenEffects": {
    "sourceRemovals": 0,
    "legacyCleanupCalls": 0,
    "settingsWritesAfterAgreement": 0,
    "setupWrites": 0,
    "deviceWritesAfterAgreement": 0,
    "unclaimedWrites": 0,
    "syncReadsForOffCase": 0,
    "syncSets": 0,
    "syncSubscriptions": 0,
    "timers": 0,
    "settingsChangedEvents": 0,
    "automaticRestoresOrRetries": 0,
    "production": "not-connected",
    "native": "waived-and-unproven"
  }
}

export const recoverySyncFixture = {
  "purpose": "Static sync-on variant. Start with acceptance-fixtures.json seed and replace only device and sync with seedOverrides. The future verifier must supply the literal remoteInventory through the owner's existing sync.get port. No code was executed to obtain these expectations.",
  "seedOverrides": {
    "device": {
      "id": "synthetic-device",
      "consent": null,
      "syncOn": true,
      "future": {
        "keep": true
      }
    },
    "sync": {
      "joined": "fixture-history",
      "pushed": {},
      "status": "ok",
      "editedSinceOff": false,
      "everEdited": false,
      "opaqueWrite": {
        "gate": {
          "kind": "held",
          "notBefore": 1060000
        },
        "diagnostic": {
          "name": "SyntheticOriginal",
          "message": "opaque"
        }
      },
      "extension": {
        "retain": [
          false,
          null
        ]
      }
    }
  },
  "remoteInventory": {
    "s:meta": {
      "v": 1,
      "id": "fixture-history",
      "created": 1
    },
    "s:settings": {
      "v": 1,
      "gen": "canonical-settings",
      "at": 10,
      "by": "canonical-device",
      "data": {
        "theme": "dark"
      }
    },
    "s:setup:AAAAAAAAAAAAAAAA": {
      "v": 1,
      "gen": "canonical-setup",
      "at": 11,
      "by": "canonical-device",
      "data": {
        "label": {
          "name": "Synthetic account"
        },
        "autoAdd": [],
        "targets": {},
        "quickSave": null,
        "musicSave": null,
        "gather": null,
        "marks": {},
        "future": [
          null,
          false
        ]
      }
    },
    "s:filter:AAAAAAAAAAAAAAAA:PL_KEPT": {
      "v": 1,
      "gen": "canonical-filter",
      "at": 12,
      "by": "canonical-device",
      "extension": "canonical-envelope",
      "data": {
        "mode": "allow",
        "on": true,
        "channels": [
          [
            "UCaaaaaaaaaaaaaaaaaaaaaa",
            "Canonical channel",
            "@canonical"
          ],
          [
            "UCcccccccccccccccccccccc",
            "Other canonical channel"
          ]
        ],
        "extension": {
          "keep": [
            null,
            false
          ]
        }
      }
    }
  },
  "expectedAgreementDevice": {
    "id": "synthetic-device",
    "consent": {
      "v": 1,
      "at": 100
    },
    "syncOn": true,
    "future": {
      "keep": true
    }
  },
  "expectedScope": {
    "kind": "syncing-browsers",
    "joined": "fixture-history"
  },
  "expectedRepairIdentities": [
    {
      "key": {
        "kind": "settings"
      },
      "name": "doc:settings",
      "gen": "canonical-settings"
    },
    {
      "key": {
        "kind": "setup",
        "acct": "AAAAAAAAAAAAAAAA"
      },
      "name": "doc:setup:AAAAAAAAAAAAAAAA",
      "gen": "canonical-setup"
    },
    {
      "key": {
        "kind": "filter",
        "acct": "AAAAAAAAAAAAAAAA",
        "playlist": "PL_KEPT"
      },
      "name": "doc:filter:AAAAAAAAAAAAAAAA:PL_KEPT",
      "gen": "canonical-filter"
    }
  ],
  "expectedRequiredRepairDocuments": "Each expectedRepairIdentities entry has the exact raw document shown at the corresponding remoteInventory key, which is also its unchanged local before image.",
  "expectedFixedHistoryAfter": {
    "kind": "present",
    "raw": {
      "joined": "fixture-history",
      "pushed": {
        "doc:settings": "canonical-settings",
        "doc:setup:AAAAAAAAAAAAAAAA": "canonical-setup",
        "doc:filter:AAAAAAAAAAAAAAAA:PL_KEPT": "canonical-filter"
      },
      "status": "ok",
      "editedSinceOff": false,
      "everEdited": true,
      "opaqueWrite": {
        "gate": {
          "kind": "held",
          "notBefore": 1060000
        },
        "diagnostic": {
          "name": "SyntheticOriginal",
          "message": "opaque"
        }
      },
      "extension": {
        "retain": [
          false,
          null
        ]
      }
    }
  },
  "expectedFixedFilterAfter": {
    "v": 1,
    "gen": "recovery-001",
    "at": 200,
    "by": "synthetic-device",
    "extension": "canonical-envelope",
    "data": {
      "mode": "deny",
      "on": false,
      "channels": [
        [
          "UCbbbbbbbbbbbbbbbbbbbbbb",
          "Retained channel",
          "@retained"
        ]
      ],
      "extension": {
        "keep": [
          null,
          false
        ]
      }
    }
  },
  "expectedTransport": {
    "syncSets": 0,
    "syncSubscriptions": 0,
    "timers": 0,
    "newGenerationMarkedPushed": false,
    "opaqueHoldCleared": false,
    "activation": "held"
  },
  "addressedNewerVersionOverride": {
    "s:filter:AAAAAAAAAAAAAAAA:PL_KEPT": {
      "v": 2,
      "gen": "future-filter",
      "at": 13,
      "by": "canonical-device",
      "data": {
        "mode": "allow",
        "on": true,
        "channels": []
      }
    }
  },
  "expectedNewerVersionResult": {
    "kind": "refused",
    "reason": "update-needed"
  },
  "resetMetadataOverride": {
    "s:meta": {
      "v": 1,
      "id": "fixture-history",
      "created": 1,
      "reset": true
    }
  },
  "expectedResetResult": {
    "kind": "unavailable",
    "reason": "sync-writer-required"
  },
  "repairDebtLostOnResume": {
    "instruction": "After actual acceptance, remove only s:settings from remoteInventory while leaving accepted local storage and the fixed operation unchanged.",
    "expected": {
      "kind": "unavailable",
      "reason": "admission-debt"
    },
    "localWrites": 0,
    "syncSets": 0,
    "pendingRetained": true
  }
}

export const authorityAcceptanceFixture = {
  "status": "independently-authored-unexecuted-expectations",
  "checkpointVersion": 5,
  "sourceEpoch": "fixture-interim-epoch-1",
  "handoffId": "fixture-handoff-1",
  "normalOrigin": {
    "kind": "ui",
    "windowId": 1,
    "incognito": false
  },
  "seed": {
    "device": {
      "id": "synthetic-device",
      "consent": {
        "v": 1,
        "at": 1
      },
      "syncOn": false,
      "upgradeNote": null,
      "claimNotice": null,
      "lastAccount": null,
      "newPlaylistVisibility": null,
      "pickerSortAZ": false,
      "detailedLog": false,
      "recentAdds": true,
      "legacyCleared": false,
      "extension": {
        "keep": [
          null,
          false
        ]
      }
    },
    "unclaimed": null,
    "account:AAAAAAAAAAAAAAAA": {
      "playlists": [
        "PL_ONE"
      ],
      "shortcutPlaylistId": "",
      "filters": {
        "PL_ONE": {
          "mode": "deny",
          "enabled": false,
          "channels": []
        }
      },
      "labels": {},
      "cachedPlaylists": [],
      "cachedAt": null
    },
    "savedAccountKeys": [
      "AAAAAAAAAAAAAAAA"
    ],
    "sessionConsent": 1,
    "sessionGeneration": "old-session",
    "legacyClaimed": true,
    "playlists": [
      "PL_GLOBAL",
      "PL_GLOBAL"
    ],
    "addToPlaylistID": "PL_GLOBAL_TARGET",
    "unrelated": {
      "keep": [
        "unchanged",
        null
      ]
    }
  },
  "setupProcedure": [
    "Use createInterimHarness with the literal seed, create the actual starting owner, and save the original ready promise and rejection object.",
    "Read the real disclosure and Agree with displayedVersion 1, retained-disclosure choice and resolved synthetic false access for www, music and browserMenu.",
    "Read the actual installation review and invoke installInterimConversion. It must complete installed V3 while activation remains held.",
    "Compare the entire selected canonical inventory to installedCanonical and the entire selected source inventory to seed minus device, unclaimed and unrelated.",
    "Save the complete actual V3 checkpoint before handoff. Its exact data must occur once in the V5 archive. No future expected canonical value is computed from this checkpoint."
  ],
  "installedCanonical": {
    "schema": 1,
    "device": {
      "id": "synthetic-device",
      "consent": {
        "v": 1,
        "at": 100
      },
      "syncOn": false,
      "upgradeNote": null,
      "claimNotice": null,
      "lastAccount": null,
      "newPlaylistVisibility": null,
      "pickerSortAZ": false,
      "detailedLog": false,
      "recentAdds": true,
      "legacyCleared": false,
      "extension": {
        "keep": [
          null,
          false
        ]
      }
    },
    "unclaimed": null,
    "doc:settings": {
      "v": 1,
      "gen": "synthetic-capture:doc:settings",
      "at": 123,
      "by": "synthetic-device",
      "data": {
        "theme": "system",
        "undoKey": {
          "char": "u",
          "code": "KeyU",
          "ctrl": false,
          "alt": true,
          "shift": false,
          "meta": false
        },
        "autoAdd": {
          "on": true,
          "feedback": true,
          "pct": 50,
          "toolbarTick": true,
          "toolbarPaused": true
        },
        "shortcuts": {
          "on": false,
          "feedback": true,
          "music": true,
          "preset": false,
          "picker": null,
          "list": []
        },
        "quickSave": {
          "on": false,
          "feedback": true,
          "shortsShelves": false
        },
        "queueButton": {
          "on": false,
          "feedback": true
        },
        "watchButton": {
          "on": false,
          "feedback": true,
          "shorts": false
        },
        "cardMenu": {
          "on": false,
          "keepLinkMenu": false
        },
        "browserMenu": {
          "on": false,
          "feedback": true
        },
        "musicSection": true,
        "musicActions": {
          "on": false,
          "feedback": true,
          "preset": false,
          "buttons": {
            "next": true,
            "queue": true,
            "save": false,
            "like": false,
            "remove": false,
            "bar": false,
            "library": false,
            "mix": false,
            "album": false,
            "artist": false
          }
        },
        "musicKeys": {
          "on": false,
          "feedback": true,
          "preset": false,
          "keys": {
            "next": null,
            "queue": null,
            "save": null,
            "picker": null,
            "like": null,
            "remove": null,
            "library": null,
            "mix": null,
            "album": null,
            "artist": null
          }
        },
        "anyTabKeys": {
          "on": false,
          "feedback": true
        },
        "gather": {
          "on": false,
          "feedback": true,
          "to": "player",
          "order": "newest",
          "close": false,
          "auto": {
            "unvisited": false,
            "after": "1d",
            "background": false,
            "count": false,
            "n": 10
          }
        }
      }
    },
    "doc:setup:AAAAAAAAAAAAAAAA": {
      "v": 1,
      "gen": "synthetic-capture:doc:setup:AAAAAAAAAAAAAAAA",
      "at": 123,
      "by": "synthetic-device",
      "data": {
        "label": null,
        "autoAdd": [
          {
            "pl": "PL_ONE",
            "takes": "videos"
          }
        ],
        "targets": {},
        "quickSave": null,
        "musicSave": null,
        "gather": null,
        "marks": {}
      }
    },
    "doc:filter:AAAAAAAAAAAAAAAA:PL_ONE": {
      "v": 1,
      "gen": "synthetic-capture:doc:filter:AAAAAAAAAAAAAAAA:PL_ONE",
      "at": 123,
      "by": "synthetic-device",
      "data": {
        "mode": "deny",
        "on": false,
        "channels": []
      }
    }
  },
  "handoff": {
    "before": {
      "checkpointVersion": 3,
      "installation": "installed",
      "activation": "held",
      "history": {
        "kind": "absent"
      },
      "resolutions": []
    },
    "accepted": {
      "checkpointVersion": 5,
      "archiveKind": "installed-v3",
      "handoffKind": "accepted",
      "handoffId": "fixture-handoff-1",
      "sourceEpoch": "fixture-interim-epoch-1",
      "activation": "held",
      "resolutions": [],
      "pending": {
        "kind": "none"
      }
    },
    "recorded": {
      "checkpointVersion": 5,
      "handoffKind": "canonical",
      "retirement": {
        "kind": "fixture-producers-retired",
        "handoffId": "fixture-handoff-1",
        "sourceEpoch": "fixture-interim-epoch-1"
      },
      "result": "restart-required",
      "activation": "held"
    },
    "orderedMutationTrace": [
      {
        "kind": "local-set",
        "keys": [
          "interimConversion"
        ],
        "handoffKind": "accepted"
      },
      {
        "kind": "retire",
        "handoffId": "fixture-handoff-1",
        "sourceEpoch": "fixture-interim-epoch-1"
      },
      {
        "kind": "local-set",
        "keys": [
          "interimConversion"
        ],
        "handoffKind": "canonical"
      }
    ],
    "freshConsumer": {
      "order": [
        "old-owner-dispose-drained",
        "retained-controller-release",
        "new-starting-owner",
        "exclusive-capability-acquired",
        "fresh-ready-ok"
      ],
      "oldReadyPromise": "same-promise-same-rejection-object",
      "freshReady": "ok",
      "canonicalInventory": "exactly-installedCanonical-before-ordinary-edit",
      "newRecoveryResolutions": [],
      "globalPlaylistOccurrencesStillUnresolved": [
        {
          "sourceKey": "playlists",
          "path": [
            0
          ],
          "value": "PL_GLOBAL"
        },
        {
          "sourceKey": "playlists",
          "path": [
            1
          ],
          "value": "PL_GLOBAL"
        }
      ],
      "globalTargetStillInactive": "PL_GLOBAL_TARGET"
    },
    "forbiddenEffects": [
      "source-remove",
      "device-set",
      "history-set",
      "document-set",
      "sync-get",
      "sync-set",
      "sync-subscribe",
      "timer",
      "legacy-readSnapshot",
      "legacy-removeLocal",
      "database-delete",
      "session-cleanup"
    ]
  },
  "laterOrdinaryEdit": {
    "action": {
      "acct": "AAAAAAAAAAAAAAAA",
      "playlist": "PL_ONE",
      "desired": {
        "mode": "allow",
        "on": true
      },
      "clearListedChannels": "not-confirmed"
    },
    "now": 200,
    "generation": "canonical-edit-1",
    "expectedFilter": {
      "v": 1,
      "gen": "canonical-edit-1",
      "at": 200,
      "by": "synthetic-device",
      "data": {
        "mode": "allow",
        "on": true,
        "channels": []
      }
    },
    "expectedHistory": {
      "joined": null,
      "pushed": {},
      "status": "off",
      "editedSinceOff": true,
      "everEdited": true
    },
    "restart": {
      "ready": "ok",
      "filter": "exactly-expectedFilter",
      "history": "exactly-expectedHistory",
      "archive": "byte-equivalent-to-recorded-archive",
      "source": "unchanged",
      "installationReplayWrites": []
    }
  },
  "laterCanonicalTombstone": {
    "fixtureInputAfterRelease": {
      "doc:filter:AAAAAAAAAAAAAAAA:PL_ONE": {
        "v": 1,
        "gen": "canonical-delete-1",
        "at": 300,
        "by": "synthetic-device",
        "deleted": true
      }
    },
    "expectedRestart": {
      "ready": "ok",
      "filter": {
        "v": 1,
        "gen": "canonical-delete-1",
        "at": 300,
        "by": "synthetic-device",
        "deleted": true
      },
      "replayWrites": [],
      "restoreOrDiscardReceipts": []
    },
    "qualification": "This fixture establishes post-release canonical tombstone precedence. Actual off account removal separately exercises its ordinary deletion contract."
  },
  "interruptions": [
    {
      "cut": "before-accept",
      "durable": "installed-v3",
      "freshStartup": "held",
      "automaticWrites": [],
      "explicitAction": "prepare-new-release"
    },
    {
      "cut": "accepted-before-retire",
      "durable": "v5-accepted",
      "freshStartup": "held-pending",
      "automaticWrites": [],
      "explicitAction": "resume-retained-authority",
      "resumeWrites": [
        "interimConversion:canonical"
      ],
      "newHandoffIds": 0
    },
    {
      "cut": "retired-before-record",
      "durable": "v5-accepted",
      "supervisor": "old-producers-retired",
      "freshStartup": "held-pending",
      "automaticWrites": [],
      "explicitAction": "resume-retained-authority",
      "resumeRetirement": "same-id-idempotent",
      "resumeWrites": [
        "interimConversion:canonical"
      ]
    },
    {
      "cut": "canonical-record-applied-before-promise-rejection",
      "durable": "v5-canonical",
      "completeReadback": true,
      "result": "restart-required",
      "originalRejection": "preserved-as-write-observation",
      "extraWrite": false
    },
    {
      "cut": "canonical-record-applied-readback-unreadable",
      "durable": "possibly-v5-canonical",
      "result": "unconfirmed",
      "oldOwner": "barrier-closed",
      "freshStartup": "may-ready-only-after-drain-and-full-validation-and-fresh-exclusive-acquire"
    },
    {
      "cut": "canonical-record-unchanged-rejection",
      "durable": "v5-accepted",
      "result": "failed-record-original-error",
      "automaticWrites": [],
      "explicitAction": "resume-retained-authority"
    },
    {
      "cut": "accepted-with-third-filter-generation",
      "durable": "v5-accepted",
      "freshStartup": "held",
      "explicitResume": "stale",
      "writes": []
    },
    {
      "cut": "canonical-with-later-filter-generation",
      "durable": "v5-canonical",
      "freshStartup": "ok-with-fresh-exclusive-authority",
      "writes": [],
      "historicalReplay": false
    },
    {
      "cut": "controller-still-draining",
      "durable": "v5-canonical",
      "competingFreshStartup": "unavailable",
      "maximumConcurrentWriters": 1
    },
    {
      "cut": "lost-fresh-owner-capability-before-write",
      "durable": "v5-canonical",
      "queuedOrdinaryWrites": [],
      "result": "unavailable-or-unconfirmed-according-to-observed-stage",
      "barrier": "closed-before-next-task"
    }
  ],
  "savedSyncOnControl": {
    "procedure": "Create a real confirmed V2 from the seed with Device syncOn true and supported history, without fabricating installation.",
    "expectedInstallation": {
      "kind": "unavailable",
      "reason": "sync-writer-required"
    },
    "expectedRelease": "unavailable-without-completed-installation",
    "deviceUnchanged": true,
    "sourceUnchanged": true,
    "historyUnchanged": true,
    "newMutations": [],
    "syncCalls": []
  },
  "authoredV4Extension": {
    "status": "conditional-on-separate-verification-and-ordered-integration",
    "eligible": {
      "basisCheckpointVersion": 3,
      "installation": "installed",
      "pending": {
        "kind": "none"
      },
      "scope": "this-browser"
    },
    "ineligible": {
      "basisCheckpointVersion": 2,
      "reason": "no-completed-installation-proof"
    },
    "postReleaseRecovery": "archive-source-plus-fresh-canonical-records-and-fresh-authority",
    "historicalAfterImageEqualityRequiredAfterRelease": false,
    "newDiscardOrDestinationMutationsInThisUnit": []
  }
}

export type FixtureSupervisorState = {
  readonly source: JsonObject | null
  readonly sourceEpoch: string
  readonly handoffId: string | null
  readonly retired: boolean
}
export function createAuthorityHarness(seed: JsonObject = authorityAcceptanceFixture.seed, saved?: FixtureSupervisorState) {
  const h = createRecoveryHarness(clone(seed))
  h.allowPlaylist("PL_ONE")
  let source = saved?.source ? clone(saved.source) : undefined, handoffId = saved?.handoffId ?? undefined
  const sourceEpoch = saved?.sourceEpoch ?? "fixture-interim-epoch-1"
  let retired = saved?.retired ?? false, priorStopped = !saved, serial = 0, activeWrites = 0, maxWriters = 0
  type Reservation = { readonly kind: "controller" | "canonical"; readonly actor: string; readonly identity: object }
  let reservation: Reservation | undefined
  let writeLane = Promise.resolve(), retireHook: (() => Promise<void>) | undefined, acquireHook: (() => Promise<void>) | undefined
  const pending = new Map<Promise<void>, string>(), producers = new Set<string>(), revoked = new Set<object>()
  const trace: unknown[] = []
  let remote: JsonObject = { "s:meta": { v: 1, id: "fixture-new-history", created: 10 } }
  const syncListeners = new Set<() => void>(), timers = new Set<() => void>()
  function permitted(actor: string): boolean {
    return reservation ? reservation.actor === actor && !revoked.has(reservation.identity) : !retired && priorStopped
  }
  function capability(current: Reservation) {
    return {
      async assertCurrent(): Promise<"current" | "lost"> { return reservation === current && !revoked.has(current.identity) ? "current" : "lost" },
      async release() { if (reservation === current) { trace.push({ kind: current.kind + "-release", actor: current.actor }); reservation = undefined } }
    }
  }
  function actor(name: string) {
    producers.add(name)
    const local = {
      get: h.deps.local.get,
      async set(items: Readonly<Record<string, import("../../../src/shared/contracts/json").JsonValue>>) {
        if (!permitted(name)) throw Error("Synthetic producer fenced")
        let done = () => {}
        const task = new Promise<void>(resolve => { done = resolve })
        pending.set(task, name)
        const before = writeLane
        writeLane = before.then(() => task)
        await before
        try {
          if (!permitted(name)) throw Error("Synthetic delayed producer fenced")
          if (retired && reservation?.kind === "controller") {
            const raw = items.interimConversion
            if (Object.keys(items).length !== 1 || !jsonObject(raw) || !jsonObject(raw.handoff) || raw.handoff.kind !== "canonical" || raw.handoff.handoffId !== handoffId) throw Error("Retired controller exceeded its recording right")
          }
          activeWrites++; maxWriters = Math.max(maxWriters, activeWrites)
          trace.push({ kind: "local-set", actor: name, items: clone(items) })
          await h.deps.local.set(items)
        } finally { activeWrites = Math.max(0, activeWrites - 1); pending.delete(task); done() }
      }
    }
    const canonicalAuthority: import("../../../src/background/store/interim-canonical-authority").CanonicalAuthorityHost = {
      kind: "fixture",
      async observeSource(input) {
        if (!source) source = clone(input.source)
        try { recoveryEqual(source, input.source, "Epoch source identity") } catch { return { kind: "unavailable" } }
        return { kind: "source-epoch", sourceEpoch }
      },
      async begin(input) {
        if (!source || input.sourceEpoch !== sourceEpoch || reservation || !priorStopped || retired && input.kind === "new") return { kind: "unavailable" }
        if (input.kind === "resume") { if (!handoffId || input.handoffId !== handoffId) return { kind: "unavailable" } }
        else handoffId = `fixture-handoff-${++serial}`
        if (!handoffId) return { kind: "unavailable" }
        const current: Reservation = { kind: "controller", actor: name, identity: {} }; reservation = current
        trace.push({ kind: "begin", actor: name, input: clone(input), handoffId })
        return { kind: "controller", sourceEpoch, handoffId, capability: capability(current) }
      },
      async retire(input) {
        if (input.sourceEpoch !== sourceEpoch || input.handoffId !== handoffId || reservation?.kind !== "controller" || reservation.actor !== name || revoked.has(reservation.identity)) return { kind: "unconfirmed" }
        retired = true
        trace.push({ kind: "retire", ...input, producers: [...producers].sort() })
        await retireHook?.()
        await Promise.all([...pending].filter(([, owner]) => owner !== name).map(([task]) => task))
        if (reservation?.kind !== "controller" || reservation.actor !== name || revoked.has(reservation.identity)) return { kind: "unconfirmed" }
        trace.push({ kind: "producers-drained", ...input })
        return { kind: "retired", receipt: { kind: "fixture-producers-retired", ...input } }
      },
      async acquire(input) {
        await acquireHook?.()
        if (!priorStopped || !retired || reservation || input.sourceEpoch !== sourceEpoch || input.handoffId !== handoffId) return { kind: "unavailable" }
        const current: Reservation = { kind: "canonical", actor: name, identity: {} }; reservation = current
        trace.push({ kind: "exclusive-acquired", actor: name })
        return { kind: "exclusive", capability: capability(current) }
      }
    }
    const session = {
      async get() { h.effects.push("session-get"); if (!permitted(name)) throw Error("Session actor fenced"); return {} },
      async set(_items: unknown) { if (!permitted(name)) throw Error("Session actor fenced"); h.effects.push("session-set") },
      async remove(_keys: unknown) { if (!permitted(name)) throw Error("Session actor fenced"); h.effects.push("session-remove") }
    }
    const removal: import("../../../src/background/store/account-removal-execution").AccountRemovalHost = { kind: "fixture", session,
      async removeLocal(keys) {
        if (!permitted(name)) throw Error("Removal actor fenced")
        const names = keys.map(key => accountRemovalLocalName(key, h.account))
        trace.push({ kind: "ordinary-remove", keys: names })
        h.foreign(records => { for (const key of names) delete records[key] })
      }
    }
    const join: import("../../../src/background/store/sync-join-execution").SyncJoinHost = { kind: "fixture", session,
      async removeLocal(keys) {
        if (!permitted(name)) throw Error("Join actor fenced")
        h.foreign(records => { for (const key of keys.map(syncJoinLocalName)) delete records[key] })
      }
    }
    const claim: import("../../../src/background/store/local-claim-writer").ClaimHost = { kind: "fixture", authority: h.deps.recovery.authority,
      session: { async takeLookup() { h.effects.push("claim-lookup-taken"); return true } },
      ownership: { async lookup(authority) {
        if (h.deps.recovery.kind !== "fixture") return { kind: "unavailable" }
        const owned = await h.deps.recovery.ownership.lookup(authority)
        return owned.kind === "fixture-owned" ? { ...owned, lineage: "local-migration-only" } : owned
      } }
    }
    return { ...h.deps, local, canonicalAuthority, removal, join, claim,
      startup: { ...h.deps.startup, async readSnapshot(): Promise<never> { h.effects.push("legacy-readSnapshot"); throw Error("Released archive reached legacy startup") } },
      sync: { async get() { h.effects.push("sync-get"); return clone(remote) }, async set(items: Readonly<Record<string, import("../../../src/shared/contracts/json").JsonValue>>) { if (!permitted(name)) throw Error("Sync actor fenced"); h.effects.push("sync-set"); remote = { ...remote, ...clone(items) } }, subscribe(listener: () => void) { h.effects.push("sync-subscribe"); syncListeners.add(listener); return () => { syncListeners.delete(listener) } } },
      syncClock: { ...h.deps.syncClock, after(_delay: number, callback: () => void) { h.effects.push("timer"); timers.add(callback); return () => { timers.delete(callback) } } }
    }
  }
  return { ...h, actor, trace,
    delayedProducer(name: string, wait: Promise<void>, items: JsonObject) {
      const port = actor(name)
      let drained = () => {}
      const drain = new Promise<void>(resolve => { drained = resolve })
      pending.set(drain, name)
      return (async () => {
        try { await wait; await port.local.set(items); return { kind: "written" } as const }
        catch { return { kind: "fenced" } as const }
        finally { pending.delete(drain); drained() }
      })()
    },
    supervisor(): FixtureSupervisorState { return { source: source ? clone(source) : null, sourceEpoch, handoffId: handoffId ?? null, retired } },
    stopPriorProducers() { priorStopped = true; trace.push({ kind: "prior-producers-stopped" }) },
    retire(fn: typeof retireHook) { retireHook = fn }, acquire(fn: typeof acquireHook) { acquireHook = fn },
    revoke() { if (reservation) revoked.add(reservation.identity) },
    maximumWriters: () => maxWriters,
    remote(value: JsonObject) { remote = clone(value) },
    resources: () => ({ pending: pending.size, listeners: syncListeners.size, timers: timers.size, reservation: reservation?.kind ?? "none" })
  }
}
export async function installAuthorityFixture(h: ReturnType<typeof createAuthorityHarness>) {
  const owner = createStartingLocalFilterWriter(h.actor("retained")), ready = owner.ready()
  let rejection: unknown
  try { await ready } catch (error) { rejection = error }
  if (!rejection) throw Error("Installation unexpectedly released readiness")
  const agreement = await owner.readAgreement(recoveryUi)
  if (agreement.kind !== "review") throw Error("No actual retained disclosure")
  const agreed = await owner.agree(recoveryUi, { review: agreement.review, displayedVersion: 1, choice: { kind: "retained-disclosure" }, access: Promise.resolve({ www: false, music: false, browserMenu: false }) })
  if (agreed.kind !== "committed") throw Error("No actual confirmed agreement")
  const installation = await owner.readInterimInstallation(recoveryUi)
  if (installation.kind !== "review") throw Error("No actual installation review")
  const installed = await owner.installInterimConversion(recoveryUi, installation.review)
  if (installed.kind !== "committed") throw Error("No actual installed V3")
  return { owner, ready, rejection, agreed, installed }
}
export async function releaseAuthorityFixture(h: ReturnType<typeof createAuthorityHarness>, owner: ReturnType<typeof createStartingLocalFilterWriter>) {
  const shown = await owner.readCanonicalAuthority(recoveryUi)
  if (shown.kind !== "review") throw Error("Authority review unavailable " + JSON.stringify(shown))
  return owner.releaseRetainedAuthority(recoveryUi, shown.review)
}
export async function observeCanonicalAuthorityExecution() {
  const h = createAuthorityHarness(), initial = await installAuthorityFixture(h)
  const before = h.records(), startWrites = h.writes.length, startEffects = h.effects.length
  recoveryEqual(Object.fromEntries(Object.entries(before).filter(([key]) => isInterimCanonicalKey(key))), authorityAcceptanceFixture.installedCanonical, "Independent installed canonical oracle")
  const released = await releaseAuthorityFixture(h, initial.owner)
  if (released.kind !== "restart-required") throw Error("Release did not require a fresh owner " + JSON.stringify(released))
  recoveryEqual(released.mutations.map(x => x.stage), ["accept", "retire", "record"], "Exact handoff stages")
  const recorded = h.records(), writes = clone(h.writes.slice(startWrites)), handoffEffects = clone(h.effects.slice(startEffects))
  recoveryEqual(writes.map(x => Object.keys(x)), [["interimConversion"], ["interimConversion"]], "Release writes only the checkpoint twice")
  const blocked = createStartingLocalFilterWriter(h.actor("too-early")); await recoveryHeld(blocked); await blocked.dispose()
  await initial.owner.dispose()
  recoveryEqual(initial.owner.ready() === initial.ready, true, "Old readiness promise identity")
  let rejection: unknown; try { await initial.ready } catch (error) { rejection = error }
  recoveryEqual(rejection === initial.rejection, true, "Old readiness rejection object identity")
  const fresh = createStartingLocalFilterWriter(h.actor("canonical"))
  recoveryEqual(await fresh.ready(), "ok", "Fresh exclusive owner ready")
  recoveryEqual(h.records(), recorded, "Fresh startup performs no replay")
  const archive = readRetainedCheckpoint(recorded.interimConversion)
  if (archive.kind !== "authority") throw Error("No validated V5")
  recoveryEqual(archive.checkpoint.archive, { kind: "installed-v3", checkpoint: before.interimConversion }, "Exact single historical checkpoint")
  const review = await fresh.readInterimRecovery()
  if (review.kind !== "review" || review.activation !== "canonical") throw Error("No canonical archived recovery review")
  recoveryEqual(review.resolved, [], "Release does not invent resolutions")
  const globals = review.view.items.filter(x => x.id.sourceKey === "playlists")
  recoveryEqual(globals.map(x => x.id.path), [[0], [1]], "Duplicate global occurrences remain unresolved")
  h.allocateReplacement(); h.replacementGeneration("canonical-edit-1")
  const playlist = "PL_ONE"; if (!isPlaylistId(playlist)) throw Error("Invalid fixture playlist")
  const edit = await fresh.change(recoveryUi, { acct: h.account, playlist, desired: { mode: "allow", on: true }, clearListedChannels: "not-confirmed" })
  recoveryEqual(h.records()["doc:filter:AAAAAAAAAAAAAAAA:PL_ONE"], authorityAcceptanceFixture.laterOrdinaryEdit.expectedFilter, "Real ordinary edit oracle")
  recoveryEqual(h.records().sync, authorityAcceptanceFixture.laterOrdinaryEdit.expectedHistory, "Real first-edit provenance oracle")
  recoveryEqual(h.records().interimConversion, recorded.interimConversion, "Ordinary edit preserves historical checkpoint")
  await fresh.dispose()
  const serialized = JSON.stringify(h.records()), supervisor = h.supervisor(), restart = createAuthorityHarness(JSON.parse(serialized), supervisor)
  restart.stopPriorProducers(); restart.forbidAllocation()
  const reopened = createStartingLocalFilterWriter(restart.actor("restart"))
  recoveryEqual(await reopened.ready(), "ok", "Serialized edited state restarts")
  recoveryEqual(restart.records(), JSON.parse(serialized), "Edited state survives without replay")
  restart.permitAllocation()
  const settings = await reopened.read("settings"), settingChange = await reopened.changeSharedSetting(recoveryUi, { kind: "theme", value: "system" })
  const notice = await reopened.readClaimNotice(), claim = await reopened.claim(), agreement = await reopened.readAgreement(recoveryUi), join = await reopened.readSyncJoin(recoveryUi)
  if (agreement.kind !== "review") throw Error("Canonical agreement review refused archive")
  const agreed = await reopened.agree(recoveryUi, { review: agreement.review, displayedVersion: 1, choice: { kind: "disclosure" }, access: Promise.resolve({ www: false, music: false, browserMenu: false }) })
  if (agreed.kind !== "unchanged" && agreed.kind !== "committed") throw Error("Canonical Agree refused archive " + JSON.stringify(agreed))
  const expectedNotice = { acct: restart.account, dropped: 2 }
  restart.foreign(records => { if (!jsonObject(records.device)) throw Error("No device"); records.device.claimNotice = clone(expectedNotice) })
  const pendingNotice = await reopened.readClaimNotice(), acknowledged = await reopened.acknowledgeClaimNotice(recoveryUi, expectedNotice)
  if (acknowledged.kind !== "committed") throw Error("Canonical notice acknowledgement failed " + JSON.stringify(acknowledged))
  const settingsDocument = restart.records()["doc:settings"]
  if (!jsonObject(settingsDocument) || !jsonObject(settingsDocument.data)) throw Error("No canonical settings")
  restart.remote({ "s:meta": { v: 1, id: "fixture-new-history", created: 10 }, "s:settings": { ...settingsDocument, gen: "remote-settings", data: { ...settingsDocument.data, theme: "dark" } } })
  const operation = reopened.beginSyncJoin(recoveryUi), preparation = await operation.result
  if (preparation.kind !== "choice-required") throw Error("Unknown provenance did not require explicit join choice " + JSON.stringify(preparation))
  const cancelled = await reopened.cancelSyncJoin(recoveryUi)
  recoveryEqual(cancelled, { kind: "cancelled" }, "Explicit join cancellation preserves sync off")
  const joinResume = await reopened.resumeSyncJoin(recoveryUi)
  recoveryEqual(joinResume, { kind: "unavailable", reason: "pending-join" }, "No fabricated join continuation")
  const receive = await reopened.receiveSyncDocument({ kind: "filter", acct: restart.account, playlist })
  await reopened.startSync()
  const removal = await reopened.prepareAccountRemoval(recoveryUi, restart.account)
  if (removal.kind !== "confirmation-required") throw Error("Ordinary removal still refused archived source " + JSON.stringify(removal))
  const removed = await reopened.removeAccountSetup(recoveryUi, removal.confirmation)
  if (removed.kind !== "committed") throw Error("Ordinary removal failed " + JSON.stringify(removed))
  recoveryEqual(restart.records().interimConversion, recorded.interimConversion, "Account removal preserves archive")
  recoveryEqual(Object.fromEntries(Object.entries(restart.records()).filter(([key]) => isInterimSourceKey(key))), Object.fromEntries(Object.entries(before).filter(([key]) => isInterimSourceKey(key))), "Account removal preserves every raw source value")
  await reopened.dispose()
  return { mode: "synthetic-canonical-authority", initial: { agreed: initial.agreed, installed: initial.installed }, before, released, recorded, writes, handoffEffects, recovery: review, edit, serialized, supervisor, restart: { settings, settingChange, notice, claim, agreement, agreed, pendingNotice, acknowledged, join, preparation, cancelled, joinResume, receive, removed, records: restart.records(), writes: restart.writes, effects: restart.effects, trace: restart.trace }, trace: h.trace, effects: h.effects, maximumWriters: h.maximumWriters(), resources: h.resources(), restartResources: restart.resources(), production: "not-connected", native: "waived-and-unproven" }
}


export async function recoveryDiscardSelection(owner: ReturnType<typeof createStartingLocalFilterWriter>, sourceKey: string, path: readonly (string | number)[]) {
  const opened = await owner.readInterimRecovery()
  if (opened.kind !== "review") throw Error("No actual discard review " + JSON.stringify(opened))
  const item = opened.view.items.find(row => row.id.sourceKey === sourceKey && JSON.stringify(row.id.path) === JSON.stringify(path))
  if (!item) throw Error("No actual discard occurrence " + sourceKey + JSON.stringify(path))
  return { opened, item }
}
export async function observeInterimRecoveryDiscard() {
  const forbidden = ["stamp", "generation", "recovery-ownership", "sync-get", "sync-set", "sync-subscribe", "timer"]
  const unchanged = (before: JsonObject, after: JsonObject) => recoveryEqual({ ...after, interimConversion: before.interimConversion }, before, "Discard preserves the complete store except its checkpoint")
  const seed = clone(recoveryAcceptanceFixture.seed)
  seed.playlists = ["PL_GLOBAL", "PL_GLOBAL"]
  const held = createRecoveryHarness(seed), heldOwner = createStartingLocalFilterWriter(held.deps)
  const agreement = await recoveryAgree(heldOwner, held), v2 = held.records()
  const first = await recoveryDiscardSelection(heldOwner, "playlists", [0]), heldStart = held.writes.length, heldEffects = held.effects.length
  held.ownership(false); held.forbidAllocation()
  const firstResult = await heldOwner.discardInterimItem(recoveryUi, { capture: first.opened.capture, item: first.item.id })
  recoveryEqual(firstResult, { kind: "committed", item: first.item.id, activation: "held", mutations: [{ stage: "record", write: { kind: "resolved" } }] }, "V2 discard confirms exactly one checkpoint write")
  const afterFirst = held.records(), literal = { kind: "discarded", item: { sourceKey: "playlists", path: [0] } }
  recoveryEqual(held.writes.slice(heldStart), [{ interimConversion: { v: 4, kind: "retained-interim", basis: { checkpoint: v2.interimConversion, history: { kind: "present", raw: v2.sync } }, resolutions: [literal], pending: { kind: "none" } } }], "Literal single-occurrence V4 receipt")
  unchanged(v2, afterFirst)
  recoveryEqual(held.effects.slice(heldEffects).filter(x => forbidden.includes(String(x))), [], "Discard allocates nothing and proves no destination")
  const sibling = first.opened.view.items.find(row => row.id.sourceKey === "playlists" && row.id.path[0] === 1)
  if (!sibling) throw Error("Missing literal equal sibling")
  const reused = await heldOwner.discardInterimItem(recoveryUi, { capture: first.opened.capture, item: sibling.id })
  recoveryEqual(reused, { kind: "unavailable", reason: "stale" }, "Each sibling needs a fresh explicit action")
  await heldOwner.dispose()
  const heldSerialized = JSON.stringify(held.records()), heldRestart = createRecoveryHarness(JSON.parse(heldSerialized)); heldRestart.forbidAllocation()
  const reopenedHeld = createStartingLocalFilterWriter(heldRestart.deps), heldReadiness = await recoveryHeld(reopenedHeld), heldReview = await reopenedHeld.readInterimRecovery()
  if (heldReview.kind !== "review") throw Error("V4 discard did not reopen")
  recoveryEqual(heldReview.view.items.filter(row => row.id.sourceKey === "playlists").map(row => ({ path: row.id.path, intent: row.intent, inactive: row.inactive })), [{ path: [1], intent: "none", inactive: true }], "Restart suppresses exactly the confirmed occurrence")
  recoveryEqual(heldRestart.writes, [], "V4 restart never retries discard")
  recoveryEqual(heldRestart.records(), JSON.parse(heldSerialized), "V4 restart preserves every byte value")
  await reopenedHeld.dispose()

  const h = createAuthorityHarness(), installed = await installAuthorityFixture(h), v3 = h.records()
  const archivedSelection = await recoveryDiscardSelection(installed.owner, "playlists", [0]), v3Start = h.writes.length
  const archivedResult = await installed.owner.discardInterimItem(recoveryUi, { capture: archivedSelection.opened.capture, item: archivedSelection.item.id })
  recoveryEqual(archivedResult.kind, "committed", "Actual installed V3 advances to completed V4")
  const v4 = h.records(); unchanged(v3, v4)
  recoveryEqual(h.writes.slice(v3Start).map(write => Object.keys(write)), [["interimConversion"]], "Installed discard has one record write")
  const release = await releaseAuthorityFixture(h, installed.owner)
  recoveryEqual(release.kind, "restart-required", "Nonempty completed V4 releases through the actual handoff")
  const released = h.records()
  if (!jsonObject(released.interimConversion)) throw Error("No actual V5 checkpoint")
  recoveryEqual(released.interimConversion.archive, { kind: "completed-v4", checkpoint: v4.interimConversion }, "Nonempty V4 archive bytes stay exact")
  await installed.owner.dispose()
  const fresh = createStartingLocalFilterWriter(h.actor("discard-canonical"))
  recoveryEqual(await fresh.ready(), "ok", "Discard uses a fresh exclusive canonical owner")
  h.allocateReplacement(); h.replacementGeneration("canonical-edit-1")
  const playlist = "PL_ONE"; if (!isPlaylistId(playlist)) throw Error("Invalid discard fixture playlist")
  const edit = await fresh.change(recoveryUi, { acct: h.account, playlist, desired: { mode: "allow", on: true }, clearListedChannels: "not-confirmed" })
  recoveryEqual(edit, { kind: "result", result: { ok: true } }, "Current canonical edit succeeds before discard")
  const beforeSuffix = h.records(), suffix = await recoveryDiscardSelection(fresh, "playlists", [1]), suffixStart = h.writes.length, suffixEffects = h.effects.length
  h.ownership(false); h.forbidAllocation()
  const suffixResult = await fresh.discardInterimItem(recoveryUi, { capture: suffix.opened.capture, item: suffix.item.id })
  recoveryEqual(suffixResult, { kind: "committed", item: suffix.item.id, activation: "canonical", mutations: [{ stage: "record", write: { kind: "resolved" } }] }, "V5 appends one flat suffix discard")
  const afterSuffix = h.records(); unchanged(beforeSuffix, afterSuffix)
  recoveryEqual(h.writes.slice(suffixStart), [{ interimConversion: { ...released.interimConversion, resolutions: [{ kind: "discarded", item: { sourceKey: "playlists", path: [1] } }] } }], "V5 preserves exact archive and handoff")
  recoveryEqual(h.effects.slice(suffixEffects).filter(x => forbidden.includes(String(x))), [], "V5 discard changes no history or allocation")
  h.permitAllocation()
  const removal = await fresh.prepareAccountRemoval(recoveryUi, h.account)
  if (removal.kind !== "confirmation-required") throw Error("No current canonical removal")
  const removed = await fresh.removeAccountSetup(recoveryUi, removal.confirmation)
  recoveryEqual(removed.kind, "committed", "Current canonical tombstones survive discard")
  await fresh.dispose()
  const serialized = JSON.stringify(h.records()), supervisor = h.supervisor(), restart = createAuthorityHarness(JSON.parse(serialized), supervisor)
  restart.stopPriorProducers(); restart.forbidAllocation()
  const reopened = createStartingLocalFilterWriter(restart.actor("discard-restart"))
  recoveryEqual(await reopened.ready(), "ok", "Serialized discard reacquires fresh authority")
  const review = await reopened.readInterimRecovery()
  if (review.kind !== "review") throw Error("No reopened V5 discard review")
  recoveryEqual(review.discarded.map(item => ({ sourceKey: item.sourceKey, path: item.path })), [{ sourceKey: "playlists", path: [0] }, { sourceKey: "playlists", path: [1] }], "Archive and suffix are both resolved")
  recoveryEqual(review.view.items.filter(row => row.id.sourceKey === "playlists"), [], "Discarded siblings never reappear")
  recoveryEqual(restart.records(), JSON.parse(serialized), "Current edits and tombstones survive without historical replay")
  recoveryEqual(restart.writes, [], "Released restart performs no automatic IO")
  await reopened.dispose()
  const resources = h.resources(), restartResources = restart.resources()
  recoveryEqual(resources, { pending: 0, listeners: 0, timers: 0, reservation: "none" }, "Discard owner disposes every resource")
  recoveryEqual(restartResources, resources, "Restart owner disposes every resource")
  const checkpoint = afterSuffix.interimConversion
  if (!jsonObject(checkpoint) || !Array.isArray(checkpoint.resolutions)) throw Error("No discard parser control checkpoint")
  const parserControls = []
  for (const receipt of [{ kind: "discarded", item: { path: [0], sourceKey: "playlists" } },
    { kind: "discarded", item: { sourceKey: "playlists", path: [] } }, { kind: "discarded", item: { sourceKey: "playlists", path: ["1"] } }]) {
    const result = readRetainedCheckpoint({ ...checkpoint, resolutions: [...checkpoint.resolutions, receipt] })
    recoveryEqual(result, { kind: "invalid" }, "Discard parser rejects duplicate archive locators and invented occurrences")
    parserControls.push({ receipt, result })
  }
  const faults = []
  for (const mode of ["rejected-unchanged", "rejected-applied", "resolved-missing", "corrupt", "read-failed"] as const) {
    const f = createRecoveryHarness(), owner = createStartingLocalFilterWriter(f.deps)
    await recoveryAgree(owner, f)
    const selection = await recoveryDiscardSelection(owner, "playlists", [0]), before = f.records(), start = f.writes.length
    f.forbidAllocation()
    if (mode === "corrupt" || mode === "read-failed") f.write(async (items, apply) => {
      apply(items)
      if (mode === "corrupt") f.foreign(records => { records.unrelated = { divergent: true } })
      else f.get(async () => { throw f.readError })
    })
    else f.mode(mode)
    const result = await owner.discardInterimItem(recoveryUi, { capture: selection.opened.capture, item: selection.item.id })
    recoveryEqual(result.kind, mode === "rejected-unchanged" ? "failed" : mode === "rejected-applied" ? "committed" : "unconfirmed", "Discard outcome follows actual storage " + mode)
    if (mode === "rejected-unchanged") {
      recoveryEqual(f.records(), before, "Unapplied rejected discard preserves storage")
      recoveryEqual(await owner.discardInterimItem(recoveryUi, { capture: selection.opened.capture, item: selection.item.id }), { kind: "unavailable", reason: "stale" }, "Failed discard consumes its private capture")
    }
    recoveryEqual(f.writes.slice(start).map(write => Object.keys(write)), [["interimConversion"]], "Every discard fault attempts only one record write")
    const stored = JSON.stringify(f.records()); await owner.dispose()
    const reopenedHarness = createRecoveryHarness(JSON.parse(stored)); reopenedHarness.forbidAllocation()
    const reopenedOwner = createStartingLocalFilterWriter(reopenedHarness.deps), readiness = await recoveryHeld(reopenedOwner), reopenedReview = await reopenedOwner.readInterimRecovery()
    recoveryEqual(reopenedHarness.writes, [], "Fault restart never retries discard")
    if (reopenedReview.kind !== "review") throw Error("No fault restart review " + mode)
    recoveryEqual(reopenedReview.discarded.length, mode === "rejected-unchanged" || mode === "resolved-missing" ? 0 : 1, "Restart uses the actual complete checkpoint")
    await reopenedOwner.dispose()
    faults.push({ mode, before, result, stored, writes: f.writes.slice(start), effects: f.effects, restart: { readiness, review: reopenedReview, records: reopenedHarness.records(), writes: reopenedHarness.writes, effects: reopenedHarness.effects } })
  }
  return { mode: "synthetic-exact-occurrence-discard", held: { agreement, v2, first: first.opened, firstResult, afterFirst, reused, writes: held.writes, effects: held.effects, serialized: heldSerialized, restart: { readiness: heldReadiness, review: heldReview, records: heldRestart.records(), writes: heldRestart.writes, effects: heldRestart.effects } }, canonical: { agreed: installed.agreed, installed: installed.installed, v3, archivedResult, v4, release, released, edit, beforeSuffix, suffixResult, afterSuffix, removed, serialized, supervisor, writes: h.writes, effects: h.effects, trace: h.trace, restart: { review, records: restart.records(), writes: restart.writes, effects: restart.effects, trace: restart.trace }, resources, restartResources }, parserControls, faults, production: "not-connected", native: "waived-and-unproven" }
}

export function createGlobalPlaylistRestoreHarness(seed?: JsonObject, saved?: FixtureSupervisorState) {
  const initial: JsonObject = seed ? clone(seed) : clone(authorityAcceptanceFixture.seed)
  const accountB = "BBBBBBBBBBBBBBBB"
  if (!isAccountKey(accountB)) throw Error("Invalid second fixture owner")
  if (!seed) {
    initial.savedAccountKeys = ["AAAAAAAAAAAAAAAA", accountB]
    initial[`account:${accountB}`] = { playlists: ["PL_TWO"], shortcutPlaylistId: "", filters: {}, labels: {}, cachedPlaylists: [], cachedAt: null }
  }
  const h = createAuthorityHarness(initial, saved)
  h.allowPlaylist("PL_GLOBAL")
  const authorityA = { acct: h.account, lease: "fixture-lease-1", browserSession: "fixture-browser-session-1", consentGeneration: "fixture-canonical-consent-1", signedIn: true, incognito: false } as const
  const authorityB = { ...authorityA, acct: accountB, lease: "fixture-lease-B", browserSession: "fixture-browser-session-B" }
  let accounts = [authorityA, authorityB]
  h.deps.recovery.accounts.read = async () => { h.effects.push("recovery-accounts"); return clone(accounts) }
  return { ...h, accountB, authorityA, authorityB, accounts(value: typeof accounts) { accounts = clone(value) } }
}
export async function globalPlaylistRestoreSelection(owner: ReturnType<typeof createStartingLocalFilterWriter>, index: number) {
  const selection = await recoveryDiscardSelection(owner, "playlists", [index])
  const prepared = await owner.prepareInterimPlaylistRestore(recoveryUi, { capture: selection.opened.capture, item: selection.item.id })
  if (prepared.kind !== "destination-required") throw Error("No explicit playlist destination " + JSON.stringify(prepared))
  return { ...selection, prepared }
}
export async function observeGlobalPlaylistRestore() {
  const cases = []
  for (const order of ["B-then-A", "A-then-B"] as const) {
    const h = createGlobalPlaylistRestoreHarness(), installed = await installAuthorityFixture(h)
    const released = await releaseAuthorityFixture(h, installed.owner)
    recoveryEqual(released.kind, "restart-required", "Restore requires actual authority handoff")
    await installed.owner.dispose()
    const owner = createStartingLocalFilterWriter(h.actor("playlist-" + order))
    recoveryEqual(await owner.ready(), "ok", "Restore acquires a fresh canonical owner")
    h.allocateReplacement()
    const before = h.records(), start = h.writes.length, steps = []
    for (const index of [0, 1]) {
      const acct = order === "B-then-A" ? index === 0 ? h.accountB : h.account : index === 0 ? h.account : h.accountB
      const selected = await globalPlaylistRestoreSelection(owner, index)
      recoveryEqual(Object.keys(selected.prepared).sort(), ["kind", "choice", "item", "entry", "owners", "scope"].sort(), "Choice has no default destination")
      recoveryEqual(selected.prepared.owners.map(row => row.acct), [h.account, h.accountB], "Two stable verified owners")
      recoveryEqual(selected.prepared.owners.find(row => row.acct === acct)?.status, "available", "Chosen live Setup is selectable")
      const prior = h.records(), name = `doc:setup:${acct}`, setup = prior[name], writeStart = h.writes.length
      if (!jsonObject(setup) || !jsonObject(setup.data) || !Array.isArray(setup.data.autoAdd)) throw Error("Missing literal live Setup")
      h.replacementGeneration(`playlist-${order}-${index}`)
      const result = await owner.restoreInterimPlaylist(recoveryUi, { choice: selected.prepared.choice, acct })
      recoveryEqual(result.kind, "committed", "Explicit destination restores its exact retained occurrence")
      if (result.kind !== "committed") throw Error("Restore failed")
      recoveryEqual(result.mutations.map(row => row.stage), ["accept", "documents", "record"], "Restore confirms every fixed stage")
      const after = h.records(), expected = { ...setup, v: 1, gen: `playlist-${order}-${index}`, at: 200, by: "synthetic-device", data: { ...setup.data, autoAdd: [...setup.data.autoAdd, { pl: "PL_GLOBAL", takes: "videos" }] } }
      recoveryEqual(after[name], expected, "Exact append uses the shared default percentage")
      recoveryEqual({ ...after, [name]: prior[name], sync: prior.sync, interimConversion: prior.interimConversion }, prior, "Restore preserves every unrelated record and source position")
      const checkpoint = prior.interimConversion
      if (!jsonObject(checkpoint) || !Array.isArray(checkpoint.resolutions)) throw Error("No flat fixture checkpoint")
      const expectedHistory = { joined: null, pushed: {}, status: "off", editedSinceOff: true, everEdited: true }
      const effect = { kind: "playlist-restore", item: { sourceKey: "playlists", path: [index] }, key: { kind: "setup", acct }, before: setup, after: expected,
        history: { before: Object.hasOwn(prior, "sync") ? { kind: "present", raw: prior.sync } : { kind: "absent" }, after: { kind: "present", raw: expectedHistory } }, scope: { kind: "this-browser" }, admission: { kind: "off" } }
      const accepted = { ...checkpoint, pending: { kind: "playlist-restore", effect } }
      const completed = { ...checkpoint, resolutions: [...checkpoint.resolutions, { kind: "playlist-restored", effect }], pending: { kind: "none" } }
      recoveryEqual(after, { ...prior, [name]: expected, sync: expectedHistory, interimConversion: completed }, "Complete restore store preserves archive, handoff and prior receipt bytes")
      recoveryEqual(h.writes.slice(writeStart), [{ interimConversion: accepted }, { [name]: expected, sync: expectedHistory }, { interimConversion: completed }], "All three writes match the literal fixed document and history effect")
      const reused = await owner.restoreInterimPlaylist(recoveryUi, { choice: selected.prepared.choice, acct })
      recoveryEqual(reused, { kind: "unavailable", reason: "stale" }, "A choice is consumed once")
      steps.push({ acct, selected: selected.prepared, result, prior, after, reused })
    }
    const raw = h.records().interimConversion
    if (!jsonObject(raw) || !Array.isArray(raw.resolutions)) throw Error("Missing flat restore receipts")
    recoveryEqual(raw.resolutions.map(receipt => jsonObject(receipt) && receipt.kind), ["playlist-restored", "playlist-restored"], "Equal sibling occurrences have independent receipts")
    const serialized = JSON.stringify(h.records()), supervisor = h.supervisor()
    await owner.dispose()
    const restart = createGlobalPlaylistRestoreHarness(JSON.parse(serialized), supervisor)
    restart.stopPriorProducers(); restart.forbidAllocation()
    const reopened = createStartingLocalFilterWriter(restart.actor("playlist-restart"))
    recoveryEqual(await reopened.ready(), "ok", "Serialized restore reacquires the current canonical owner")
    const read = await reopened.readInterimRecovery()
    recoveryEqual(read.kind === "review" && read.view.items.filter(row => row.id.sourceKey === "playlists"), [], "Both exact occurrences remain consumed")
    recoveryEqual(restart.records(), JSON.parse(serialized), "Restart preserves complete current records")
    recoveryEqual(restart.writes, [], "Restart performs no replay")
    recoveryEqual(restart.effects.filter(effect => ["stamp", "generation", "recovery-ownership", "recovery-accounts"].includes(String(effect))), [], "Restart performs no restore allocation or ownership lookup")
    await reopened.dispose()
    recoveryEqual(h.resources(), { pending: 0, listeners: 0, timers: 0, reservation: "none" }, "Restore releases its resources")
    recoveryEqual(restart.resources(), h.resources(), "Restart releases its resources")
    cases.push({ order, released, before, steps, serialized, writes: h.writes.slice(start), effects: h.effects, trace: h.trace, restart: { records: restart.records(), writes: restart.writes, effects: restart.effects, read }, resources: h.resources() })
  }
  return { mode: "synthetic-explicit-global-playlist-restore", cases, native: "waived-and-unproven", production: "not-connected" }
}

if (import.meta.main) process.stdout.write(JSON.stringify({ review: observeInterimRecoveryReview(), execution: await observeInterimRecoveryExecution(), authority: await observeCanonicalAuthorityExecution(), discard: await observeInterimRecoveryDiscard(), playlistRestore: await observeGlobalPlaylistRestore() }, null, 2) + "\n")
