import { pendingSyncJoinKey, readSyncJoinCheckpoint } from "../../../src/background/store/sync-join-persistence"
import { syncJoinLocalName, joinEffectCompatible, type SyncJoinHost } from "../../../src/background/store/sync-join-execution"
import { isInterimSourceKey, isInterimCanonicalKey, type StoreStartupHost } from "../../../src/background/store/interim-persistence"
import {
  defaultDevice, defaultSettings, defaultSetup, documentKey, isAccountKey, isPlaylistId, isShortcutId,
  type DocumentKey, type Filter, type PlaylistId
} from "../../../src/shared/model"
import { isJsonValue, type JsonObject, type JsonValue } from "../../../src/shared/contracts/json"
import { planSetupRemoval, removeSharedShortcut } from "../../../src/background/store/accounts"
import { createLocalFilterWriter, createStartingLocalFilterWriter } from "../../../src/background/store/local-filter-writer"
import { encodeSyncDocument, projectSyncWrite } from "../../../src/background/store/sync-codec"
import { planSyncWrite, type SyncWritePlanInput } from "../../../src/background/store/sync-write-admission"

type Candidate = Extract<SyncWritePlanInput["intent"], { kind: "changed-batch" }>["documents"][number]
function account(value: string) { if (!isAccountKey(value)) throw Error("Invalid fixture account"); return value }
function list(value: string) { if (!isPlaylistId(value)) throw Error("Invalid fixture playlist"); return value }
function shortcutId(value: string) { if (!isShortcutId(value)) throw Error("Invalid fixture shortcut"); return value }
const acct = account("AAAAAAAAAAAAAAAA"), retained = account("BBBBBBBBBBBBBBBB"), empty = account("CCCCCCCCCCCCCCCC")
const playlist = list("PL_selected"), kept = list("PL_kept"), shortcut = shortcutId("orig01")
const setupKey: DocumentKey = { kind: "setup", acct }
const selectedKey: DocumentKey = { kind: "filter", acct, playlist }
const keptKey: DocumentKey = { kind: "filter", acct, playlist: kept }
const pendingKey: DocumentKey = { kind: "settings" }
const restorationKey: DocumentKey = { kind: "setup", acct: retained }
const metadata = { v: 1, id: "fixture-history", created: 0, extension: { keep: true } }
const filter: Filter = { mode: "deny", on: false, channels: [] }
const setup = { ...defaultSetup(), autoAdd: [{ pl: playlist, takes: "videos" as const }] }
const bodies = { setup, filters: { [playlist]: filter, [kept]: filter } }

function json(value: unknown): JsonObject {
  if (!isJsonValue(value) || value === null || typeof value !== "object" || Array.isArray(value)) throw Error("Invalid fixture JSON")
  return value
}
function copy(value: JsonObject): JsonObject { return json(JSON.parse(JSON.stringify(value))) }
function envelope(data: unknown, gen = "old"): JsonObject {
  return json({ v: 1, gen, at: 1, by: "fixture-old", extension: { nested: [null, true] },
    ...JSON.parse('{"__proto__":{"preserve":true},"toJSON":"inert"}'), data })
}
function tombstone(raw: JsonObject, gen: string): JsonObject {
  const next = { ...raw, gen, at: 100, by: "fixture-device", deleted: true }
  Reflect.deleteProperty(next, "data")
  return next
}
function wire(key: DocumentKey, document: JsonObject) {
  const result = encodeSyncDocument({ key, document })
  if (result.kind !== "encoded") throw Error("Fixture did not encode")
  return result.encoded.items
}
function base(key: DocumentKey) { return `s:${documentKey(key).slice(4)}` }
function baseline(entries: readonly Candidate[]) {
  const local = json({ schema: 1, device: { ...defaultDevice("fixture-device"), consent: { v: 1, at: 1 }, syncOn: true,
    lastAccount: acct, extension: "keep-device" },
    sync: { joined: "fixture-history", pushed: Object.fromEntries(entries.map(({ key, document }) => [documentKey(key), document.gen])),
      status: "ok", editedSinceOff: false, extension: { keep: true } },
    [`cache:${acct}`]: { fixture: "untouched-cache" }, [`progress:${acct}:0`]: { fixture: "untouched-progress" },
    fixtureSession: { fixture: "untouched-session" }, unclaimed: { originalShortcutId: shortcut },
    ...Object.fromEntries(entries.map(({ key, document }) => [documentKey(key), document])) })
  const sync = json({ "s:meta": metadata, ...Object.fromEntries(entries.flatMap(({ key, document }) => wire(key, document)).map(item => [item.key, item.value])) })
  return { local, sync }
}
function batch(documents: readonly [Candidate, ...Candidate[]]): SyncWritePlanInput["intent"] {
  return { kind: "changed-batch", documents }
}
function physical(records: JsonObject) { return Object.entries(records).map(([key, value]) => ({ key, value })) }
const oldEntries = [
  { key: setupKey, document: envelope(setup) }, { key: selectedKey, document: envelope(filter) },
  { key: keptKey, document: envelope(filter) }
]

function literalJoinFixtures() {
  const raw: unknown = JSON.parse("[{\"id\":\"first-join-use-synced\",\"localBefore\":{\"schema\":1,\"device\":{\"id\":\"browser-L\",\"consent\":{\"v\":1,\"at\":1},\"syncOn\":false,\"lastAccount\":\"DDDDDDDDDDDDDDDD\",\"extension\":{\"keep\":\"device\"}},\"sync\":{\"joined\":null,\"pushed\":{},\"status\":\"off\",\"editedSinceOff\":false,\"extension\":{\"keep\":[null,true]}},\"doc:settings\":{\"v\":1,\"gen\":\"settings-L\",\"at\":10,\"by\":\"browser-L\",\"data\":{\"theme\":\"light\",\"autoAdd\":{\"on\":true}},\"extension\":{\"keep\":\"L\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:setup:AAAAAAAAAAAAAAAA\":{\"v\":1,\"gen\":\"setup-AL\",\"at\":11,\"by\":\"browser-L\",\"data\":{\"gather\":\"PL_local_A\"},\"extension\":{\"keep\":\"AL\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:setup:BBBBBBBBBBBBBBBB\":{\"v\":1,\"gen\":\"setup-BL\",\"at\":12,\"by\":\"browser-L\",\"data\":{\"gather\":\"PL_local_B\"},\"extension\":{\"keep\":\"BL\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:setup:DDDDDDDDDDDDDDDD\":{\"v\":1,\"gen\":\"setup-DL\",\"at\":13,\"by\":\"browser-L\",\"data\":{\"gather\":\"PL_local_D\"},\"extension\":{\"keep\":\"DL\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:filter:AAAAAAAAAAAAAAAA:PL_keep\":{\"v\":1,\"gen\":\"filter-AL\",\"at\":14,\"by\":\"browser-L\",\"data\":{\"mode\":\"allow\",\"on\":true,\"channels\":[]},\"extension\":{\"keep\":\"FL\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:filter:AAAAAAAAAAAAAAAA:PL_drop\":{\"v\":1,\"gen\":\"filter-drop-L\",\"at\":15,\"by\":\"browser-L\",\"data\":{\"on\":true,\"channels\":[]},\"extension\":{\"keep\":\"drop\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:filter:DDDDDDDDDDDDDDDD:PL_kept\":{\"v\":1,\"gen\":\"filter-DL\",\"at\":16,\"by\":\"browser-L\",\"data\":{\"on\":true,\"channels\":[]},\"extension\":{\"keep\":\"DF\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"cache:DDDDDDDDDDDDDDDD\":{\"at\":1,\"fixture\":\"deleted-account-cache\"},\"cache:BBBBBBBBBBBBBBBB\":{\"at\":1,\"fixture\":\"other-account-cache\"},\"progress:DDDDDDDDDDDDDDDD:0\":{\"abcdefghijk\":{\"len\":100,\"parts\":[[0,10]],\"at\":1}},\"unclaimed\":{\"from\":\"1.5.0\",\"autoAdd\":[],\"shortcutPlaylist\":null,\"filters\":{},\"at\":1},\"unrelated\":{\"keep\":true}},\"sessionBefore\":{\"skips:DDDDDDDDDDDDDDDD\":{\"abcdefghijk\":\"all\"},\"cooldown:DDDDDDDDDDDDDDDD\":100,\"cooldown:BBBBBBBBBBBBBBBB\":200,\"recent\":[{\"acct\":\"DDDDDDDDDDDDDDDD\",\"playlist\":\"PL_local_D\",\"video\":\"abcdefghijk\",\"at\":1},{\"acct\":\"BBBBBBBBBBBBBBBB\",\"playlist\":\"PL_local_B\",\"video\":\"abcdefghijk\",\"at\":2}],\"shown\":{\"v\":1,\"global\":{\"keep\":true},\"accounts\":{\"DDDDDDDDDDDDDDDD\":{\"once\":true},\"BBBBBBBBBBBBBBBB\":{\"once\":true}}}},\"syncBefore\":{\"s:meta\":{\"v\":1,\"id\":\"H\",\"created\":0,\"extension\":{\"keep\":\"metadata\"}},\"s:settings\":{\"v\":1,\"gen\":\"settings-R\",\"at\":20,\"by\":\"browser-R\",\"data\":{\"theme\":\"dark\",\"autoAdd\":{\"on\":true}},\"extension\":{\"keep\":\"R\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"s:setup:AAAAAAAAAAAAAAAA\":{\"v\":1,\"gen\":\"setup-AR\",\"at\":21,\"by\":\"browser-R\",\"data\":{\"gather\":\"PL_remote_A\"},\"extension\":{\"keep\":\"AR\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"s:setup:CCCCCCCCCCCCCCCC\":{\"v\":1,\"gen\":\"setup-CR\",\"at\":22,\"by\":\"browser-R\",\"data\":{\"gather\":\"PL_remote_C\"},\"extension\":{\"keep\":\"CR\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"s:setup:DDDDDDDDDDDDDDDD\":{\"v\":1,\"gen\":\"setup-D-deleted\",\"at\":23,\"by\":\"browser-R\",\"extension\":{\"keep\":\"DL\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\",\"deleted\":true},\"s:filter:AAAAAAAAAAAAAAAA:PL_keep\":{\"v\":1,\"gen\":\"filter-AR\",\"at\":24,\"by\":\"browser-R\",\"data\":{\"mode\":\"deny\",\"on\":false,\"channels\":[]},\"extension\":{\"keep\":\"FR\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"s:filter:AAAAAAAAAAAAAAAA:PL_extra\":{\"v\":1,\"gen\":\"filter-extra-R\",\"at\":25,\"by\":\"browser-R\",\"data\":{\"on\":false,\"channels\":[]},\"extension\":{\"keep\":\"extra\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"s:filter:AAAAAAAAAAAAAAAA:PL_dead\":{\"v\":1,\"gen\":\"filter-dead-R\",\"at\":26,\"by\":\"browser-R\",\"extension\":{\"keep\":\"dead\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\",\"deleted\":true},\"unknown:occupied\":{\"keep\":true},\"s:filter:AAAAAAAAAAAAAAAA:PL_keep@old.0\":\"retained old fragment\"},\"expectedSelectedDocuments\":{\"doc:settings\":{\"v\":1,\"gen\":\"settings-R\",\"at\":20,\"by\":\"browser-R\",\"data\":{\"theme\":\"dark\",\"autoAdd\":{\"on\":true}},\"extension\":{\"keep\":\"R\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:setup:AAAAAAAAAAAAAAAA\":{\"v\":1,\"gen\":\"setup-AR\",\"at\":21,\"by\":\"browser-R\",\"data\":{\"gather\":\"PL_remote_A\"},\"extension\":{\"keep\":\"AR\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:setup:CCCCCCCCCCCCCCCC\":{\"v\":1,\"gen\":\"setup-CR\",\"at\":22,\"by\":\"browser-R\",\"data\":{\"gather\":\"PL_remote_C\"},\"extension\":{\"keep\":\"CR\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:setup:DDDDDDDDDDDDDDDD\":{\"v\":1,\"gen\":\"setup-D-deleted\",\"at\":23,\"by\":\"browser-R\",\"extension\":{\"keep\":\"DL\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\",\"deleted\":true},\"doc:filter:AAAAAAAAAAAAAAAA:PL_keep\":{\"v\":1,\"gen\":\"filter-AR\",\"at\":24,\"by\":\"browser-R\",\"data\":{\"mode\":\"deny\",\"on\":false,\"channels\":[]},\"extension\":{\"keep\":\"FR\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:filter:AAAAAAAAAAAAAAAA:PL_extra\":{\"v\":1,\"gen\":\"filter-extra-R\",\"at\":25,\"by\":\"browser-R\",\"data\":{\"on\":false,\"channels\":[]},\"extension\":{\"keep\":\"extra\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:filter:AAAAAAAAAAAAAAAA:PL_dead\":{\"v\":1,\"gen\":\"filter-dead-R\",\"at\":26,\"by\":\"browser-R\",\"extension\":{\"keep\":\"dead\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\",\"deleted\":true},\"doc:setup:BBBBBBBBBBBBBBBB\":{\"v\":1,\"gen\":\"setup-BL\",\"at\":12,\"by\":\"browser-L\",\"data\":{\"gather\":\"PL_local_B\"},\"extension\":{\"keep\":\"BL\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:filter:AAAAAAAAAAAAAAAA:PL_drop\":{\"v\":1,\"gen\":\"suppress-A-drop\",\"at\":100,\"by\":\"browser-L\",\"extension\":{\"keep\":\"drop\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\",\"deleted\":true},\"doc:filter:DDDDDDDDDDDDDDDD:PL_kept\":{\"v\":1,\"gen\":\"suppress-D-filter\",\"at\":100,\"by\":\"browser-L\",\"extension\":{\"keep\":\"DF\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\",\"deleted\":true}},\"expectedHistoryAtLocalCompletion\":{\"joined\":\"H\",\"pushed\":{\"doc:settings\":\"settings-R\",\"doc:setup:AAAAAAAAAAAAAAAA\":\"setup-AR\",\"doc:setup:CCCCCCCCCCCCCCCC\":\"setup-CR\",\"doc:setup:DDDDDDDDDDDDDDDD\":\"setup-D-deleted\",\"doc:filter:AAAAAAAAAAAAAAAA:PL_keep\":\"filter-AR\",\"doc:filter:AAAAAAAAAAAAAAAA:PL_extra\":\"filter-extra-R\",\"doc:filter:AAAAAAAAAAAAAAAA:PL_dead\":\"filter-dead-R\"},\"status\":\"joining\",\"editedSinceOff\":false,\"extension\":{\"keep\":[null,true]}},\"expectedFinalLocalAfterNativeConfirmation\":{\"schema\":1,\"device\":{\"id\":\"browser-L\",\"consent\":{\"v\":1,\"at\":1},\"syncOn\":true,\"lastAccount\":null,\"extension\":{\"keep\":\"device\"}},\"sync\":{\"joined\":\"H\",\"pushed\":{\"doc:settings\":\"settings-R\",\"doc:setup:AAAAAAAAAAAAAAAA\":\"setup-AR\",\"doc:setup:CCCCCCCCCCCCCCCC\":\"setup-CR\",\"doc:setup:DDDDDDDDDDDDDDDD\":\"setup-D-deleted\",\"doc:filter:AAAAAAAAAAAAAAAA:PL_keep\":\"filter-AR\",\"doc:filter:AAAAAAAAAAAAAAAA:PL_extra\":\"filter-extra-R\",\"doc:filter:AAAAAAAAAAAAAAAA:PL_dead\":\"filter-dead-R\",\"doc:setup:BBBBBBBBBBBBBBBB\":\"setup-BL\",\"doc:filter:AAAAAAAAAAAAAAAA:PL_drop\":\"suppress-A-drop\",\"doc:filter:DDDDDDDDDDDDDDDD:PL_kept\":\"suppress-D-filter\"},\"status\":\"ok\",\"editedSinceOff\":false,\"extension\":{\"keep\":[null,true]}},\"cache:BBBBBBBBBBBBBBBB\":{\"at\":1,\"fixture\":\"other-account-cache\"},\"unclaimed\":{\"from\":\"1.5.0\",\"autoAdd\":[],\"shortcutPlaylist\":null,\"filters\":{},\"at\":1},\"unrelated\":{\"keep\":true},\"doc:settings\":{\"v\":1,\"gen\":\"settings-R\",\"at\":20,\"by\":\"browser-R\",\"data\":{\"theme\":\"dark\",\"autoAdd\":{\"on\":true}},\"extension\":{\"keep\":\"R\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:setup:AAAAAAAAAAAAAAAA\":{\"v\":1,\"gen\":\"setup-AR\",\"at\":21,\"by\":\"browser-R\",\"data\":{\"gather\":\"PL_remote_A\"},\"extension\":{\"keep\":\"AR\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:setup:CCCCCCCCCCCCCCCC\":{\"v\":1,\"gen\":\"setup-CR\",\"at\":22,\"by\":\"browser-R\",\"data\":{\"gather\":\"PL_remote_C\"},\"extension\":{\"keep\":\"CR\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:setup:DDDDDDDDDDDDDDDD\":{\"v\":1,\"gen\":\"setup-D-deleted\",\"at\":23,\"by\":\"browser-R\",\"extension\":{\"keep\":\"DL\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\",\"deleted\":true},\"doc:filter:AAAAAAAAAAAAAAAA:PL_keep\":{\"v\":1,\"gen\":\"filter-AR\",\"at\":24,\"by\":\"browser-R\",\"data\":{\"mode\":\"deny\",\"on\":false,\"channels\":[]},\"extension\":{\"keep\":\"FR\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:filter:AAAAAAAAAAAAAAAA:PL_extra\":{\"v\":1,\"gen\":\"filter-extra-R\",\"at\":25,\"by\":\"browser-R\",\"data\":{\"on\":false,\"channels\":[]},\"extension\":{\"keep\":\"extra\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:filter:AAAAAAAAAAAAAAAA:PL_dead\":{\"v\":1,\"gen\":\"filter-dead-R\",\"at\":26,\"by\":\"browser-R\",\"extension\":{\"keep\":\"dead\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\",\"deleted\":true},\"doc:setup:BBBBBBBBBBBBBBBB\":{\"v\":1,\"gen\":\"setup-BL\",\"at\":12,\"by\":\"browser-L\",\"data\":{\"gather\":\"PL_local_B\"},\"extension\":{\"keep\":\"BL\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:filter:AAAAAAAAAAAAAAAA:PL_drop\":{\"v\":1,\"gen\":\"suppress-A-drop\",\"at\":100,\"by\":\"browser-L\",\"extension\":{\"keep\":\"drop\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\",\"deleted\":true},\"doc:filter:DDDDDDDDDDDDDDDD:PL_kept\":{\"v\":1,\"gen\":\"suppress-D-filter\",\"at\":100,\"by\":\"browser-L\",\"extension\":{\"keep\":\"DF\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\",\"deleted\":true}},\"expectedFinalSession\":{\"cooldown:BBBBBBBBBBBBBBBB\":200,\"recent\":[{\"acct\":\"BBBBBBBBBBBBBBBB\",\"playlist\":\"PL_local_B\",\"video\":\"abcdefghijk\",\"at\":2}],\"shown\":{\"v\":1,\"global\":{\"keep\":true},\"accounts\":{\"BBBBBBBBBBBBBBBB\":{\"once\":true}}}}},{\"id\":\"first-join-use-this-browser\",\"localBefore\":{\"schema\":1,\"device\":{\"id\":\"browser-L\",\"consent\":{\"v\":1,\"at\":1},\"syncOn\":false,\"lastAccount\":\"DDDDDDDDDDDDDDDD\",\"extension\":{\"keep\":\"device\"}},\"sync\":{\"joined\":null,\"pushed\":{},\"status\":\"off\",\"editedSinceOff\":false,\"extension\":{\"keep\":[null,true]}},\"doc:settings\":{\"v\":1,\"gen\":\"settings-L\",\"at\":10,\"by\":\"browser-L\",\"data\":{\"theme\":\"light\",\"autoAdd\":{\"on\":true}},\"extension\":{\"keep\":\"L\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:setup:AAAAAAAAAAAAAAAA\":{\"v\":1,\"gen\":\"setup-AL\",\"at\":11,\"by\":\"browser-L\",\"data\":{\"gather\":\"PL_local_A\"},\"extension\":{\"keep\":\"AL\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:setup:BBBBBBBBBBBBBBBB\":{\"v\":1,\"gen\":\"setup-BL\",\"at\":12,\"by\":\"browser-L\",\"data\":{\"gather\":\"PL_local_B\"},\"extension\":{\"keep\":\"BL\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:setup:DDDDDDDDDDDDDDDD\":{\"v\":1,\"gen\":\"setup-DL\",\"at\":13,\"by\":\"browser-L\",\"data\":{\"gather\":\"PL_local_D\"},\"extension\":{\"keep\":\"DL\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:filter:AAAAAAAAAAAAAAAA:PL_keep\":{\"v\":1,\"gen\":\"filter-AL\",\"at\":14,\"by\":\"browser-L\",\"data\":{\"mode\":\"allow\",\"on\":true,\"channels\":[]},\"extension\":{\"keep\":\"FL\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:filter:AAAAAAAAAAAAAAAA:PL_drop\":{\"v\":1,\"gen\":\"filter-drop-L\",\"at\":15,\"by\":\"browser-L\",\"data\":{\"on\":true,\"channels\":[]},\"extension\":{\"keep\":\"drop\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:filter:DDDDDDDDDDDDDDDD:PL_kept\":{\"v\":1,\"gen\":\"filter-DL\",\"at\":16,\"by\":\"browser-L\",\"data\":{\"on\":true,\"channels\":[]},\"extension\":{\"keep\":\"DF\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"cache:DDDDDDDDDDDDDDDD\":{\"at\":1,\"fixture\":\"deleted-account-cache\"},\"cache:BBBBBBBBBBBBBBBB\":{\"at\":1,\"fixture\":\"other-account-cache\"},\"progress:DDDDDDDDDDDDDDDD:0\":{\"abcdefghijk\":{\"len\":100,\"parts\":[[0,10]],\"at\":1}},\"unclaimed\":{\"from\":\"1.5.0\",\"autoAdd\":[],\"shortcutPlaylist\":null,\"filters\":{},\"at\":1},\"unrelated\":{\"keep\":true}},\"sessionBefore\":{\"skips:DDDDDDDDDDDDDDDD\":{\"abcdefghijk\":\"all\"},\"cooldown:DDDDDDDDDDDDDDDD\":100,\"cooldown:BBBBBBBBBBBBBBBB\":200,\"recent\":[{\"acct\":\"DDDDDDDDDDDDDDDD\",\"playlist\":\"PL_local_D\",\"video\":\"abcdefghijk\",\"at\":1},{\"acct\":\"BBBBBBBBBBBBBBBB\",\"playlist\":\"PL_local_B\",\"video\":\"abcdefghijk\",\"at\":2}],\"shown\":{\"v\":1,\"global\":{\"keep\":true},\"accounts\":{\"DDDDDDDDDDDDDDDD\":{\"once\":true},\"BBBBBBBBBBBBBBBB\":{\"once\":true}}}},\"syncBefore\":{\"s:meta\":{\"v\":1,\"id\":\"H\",\"created\":0,\"extension\":{\"keep\":\"metadata\"}},\"s:settings\":{\"v\":1,\"gen\":\"settings-R\",\"at\":20,\"by\":\"browser-R\",\"data\":{\"theme\":\"dark\",\"autoAdd\":{\"on\":true}},\"extension\":{\"keep\":\"R\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"s:setup:AAAAAAAAAAAAAAAA\":{\"v\":1,\"gen\":\"setup-AR\",\"at\":21,\"by\":\"browser-R\",\"data\":{\"gather\":\"PL_remote_A\"},\"extension\":{\"keep\":\"AR\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"s:setup:CCCCCCCCCCCCCCCC\":{\"v\":1,\"gen\":\"setup-CR\",\"at\":22,\"by\":\"browser-R\",\"data\":{\"gather\":\"PL_remote_C\"},\"extension\":{\"keep\":\"CR\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"s:setup:DDDDDDDDDDDDDDDD\":{\"v\":1,\"gen\":\"setup-D-deleted\",\"at\":23,\"by\":\"browser-R\",\"extension\":{\"keep\":\"DL\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\",\"deleted\":true},\"s:filter:AAAAAAAAAAAAAAAA:PL_keep\":{\"v\":1,\"gen\":\"filter-AR\",\"at\":24,\"by\":\"browser-R\",\"data\":{\"mode\":\"deny\",\"on\":false,\"channels\":[]},\"extension\":{\"keep\":\"FR\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"s:filter:AAAAAAAAAAAAAAAA:PL_extra\":{\"v\":1,\"gen\":\"filter-extra-R\",\"at\":25,\"by\":\"browser-R\",\"data\":{\"on\":false,\"channels\":[]},\"extension\":{\"keep\":\"extra\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"s:filter:AAAAAAAAAAAAAAAA:PL_dead\":{\"v\":1,\"gen\":\"filter-dead-R\",\"at\":26,\"by\":\"browser-R\",\"extension\":{\"keep\":\"dead\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\",\"deleted\":true},\"unknown:occupied\":{\"keep\":true},\"s:filter:AAAAAAAAAAAAAAAA:PL_keep@old.0\":\"retained old fragment\"},\"expectedSelectedDocuments\":{\"doc:settings\":{\"v\":1,\"gen\":\"settings-L\",\"at\":10,\"by\":\"browser-L\",\"data\":{\"theme\":\"light\",\"autoAdd\":{\"on\":true}},\"extension\":{\"keep\":\"L\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:setup:AAAAAAAAAAAAAAAA\":{\"v\":1,\"gen\":\"setup-AL\",\"at\":11,\"by\":\"browser-L\",\"data\":{\"gather\":\"PL_local_A\"},\"extension\":{\"keep\":\"AL\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:setup:BBBBBBBBBBBBBBBB\":{\"v\":1,\"gen\":\"setup-BL\",\"at\":12,\"by\":\"browser-L\",\"data\":{\"gather\":\"PL_local_B\"},\"extension\":{\"keep\":\"BL\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:setup:DDDDDDDDDDDDDDDD\":{\"v\":1,\"gen\":\"setup-DL\",\"at\":13,\"by\":\"browser-L\",\"data\":{\"gather\":\"PL_local_D\"},\"extension\":{\"keep\":\"DL\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:filter:AAAAAAAAAAAAAAAA:PL_keep\":{\"v\":1,\"gen\":\"filter-AL\",\"at\":14,\"by\":\"browser-L\",\"data\":{\"mode\":\"allow\",\"on\":true,\"channels\":[]},\"extension\":{\"keep\":\"FL\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:filter:AAAAAAAAAAAAAAAA:PL_drop\":{\"v\":1,\"gen\":\"filter-drop-L\",\"at\":15,\"by\":\"browser-L\",\"data\":{\"on\":true,\"channels\":[]},\"extension\":{\"keep\":\"drop\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:filter:DDDDDDDDDDDDDDDD:PL_kept\":{\"v\":1,\"gen\":\"filter-DL\",\"at\":16,\"by\":\"browser-L\",\"data\":{\"on\":true,\"channels\":[]},\"extension\":{\"keep\":\"DF\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:setup:CCCCCCCCCCCCCCCC\":{\"v\":1,\"gen\":\"setup-CR\",\"at\":22,\"by\":\"browser-R\",\"data\":{\"gather\":\"PL_remote_C\"},\"extension\":{\"keep\":\"CR\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:filter:AAAAAAAAAAAAAAAA:PL_dead\":{\"v\":1,\"gen\":\"filter-dead-R\",\"at\":26,\"by\":\"browser-R\",\"extension\":{\"keep\":\"dead\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\",\"deleted\":true},\"doc:filter:AAAAAAAAAAAAAAAA:PL_extra\":{\"v\":1,\"gen\":\"suppress-A-extra\",\"at\":100,\"by\":\"browser-L\",\"extension\":{\"keep\":\"extra\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\",\"deleted\":true}},\"expectedHistoryAtLocalCompletion\":{\"joined\":\"H\",\"pushed\":{\"doc:setup:CCCCCCCCCCCCCCCC\":\"setup-CR\",\"doc:filter:AAAAAAAAAAAAAAAA:PL_dead\":\"filter-dead-R\"},\"status\":\"joining\",\"editedSinceOff\":false,\"extension\":{\"keep\":[null,true]}},\"expectedFinalLocalAfterNativeConfirmation\":{\"schema\":1,\"device\":{\"id\":\"browser-L\",\"consent\":{\"v\":1,\"at\":1},\"syncOn\":true,\"lastAccount\":\"DDDDDDDDDDDDDDDD\",\"extension\":{\"keep\":\"device\"}},\"sync\":{\"joined\":\"H\",\"pushed\":{\"doc:settings\":\"settings-L\",\"doc:setup:AAAAAAAAAAAAAAAA\":\"setup-AL\",\"doc:setup:BBBBBBBBBBBBBBBB\":\"setup-BL\",\"doc:setup:DDDDDDDDDDDDDDDD\":\"setup-DL\",\"doc:filter:AAAAAAAAAAAAAAAA:PL_keep\":\"filter-AL\",\"doc:filter:AAAAAAAAAAAAAAAA:PL_drop\":\"filter-drop-L\",\"doc:filter:DDDDDDDDDDDDDDDD:PL_kept\":\"filter-DL\",\"doc:setup:CCCCCCCCCCCCCCCC\":\"setup-CR\",\"doc:filter:AAAAAAAAAAAAAAAA:PL_dead\":\"filter-dead-R\",\"doc:filter:AAAAAAAAAAAAAAAA:PL_extra\":\"suppress-A-extra\"},\"status\":\"ok\",\"editedSinceOff\":false,\"extension\":{\"keep\":[null,true]}},\"cache:DDDDDDDDDDDDDDDD\":{\"at\":1,\"fixture\":\"deleted-account-cache\"},\"cache:BBBBBBBBBBBBBBBB\":{\"at\":1,\"fixture\":\"other-account-cache\"},\"progress:DDDDDDDDDDDDDDDD:0\":{\"abcdefghijk\":{\"len\":100,\"parts\":[[0,10]],\"at\":1}},\"unclaimed\":{\"from\":\"1.5.0\",\"autoAdd\":[],\"shortcutPlaylist\":null,\"filters\":{},\"at\":1},\"unrelated\":{\"keep\":true},\"doc:settings\":{\"v\":1,\"gen\":\"settings-L\",\"at\":10,\"by\":\"browser-L\",\"data\":{\"theme\":\"light\",\"autoAdd\":{\"on\":true}},\"extension\":{\"keep\":\"L\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:setup:AAAAAAAAAAAAAAAA\":{\"v\":1,\"gen\":\"setup-AL\",\"at\":11,\"by\":\"browser-L\",\"data\":{\"gather\":\"PL_local_A\"},\"extension\":{\"keep\":\"AL\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:setup:BBBBBBBBBBBBBBBB\":{\"v\":1,\"gen\":\"setup-BL\",\"at\":12,\"by\":\"browser-L\",\"data\":{\"gather\":\"PL_local_B\"},\"extension\":{\"keep\":\"BL\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:setup:DDDDDDDDDDDDDDDD\":{\"v\":1,\"gen\":\"setup-DL\",\"at\":13,\"by\":\"browser-L\",\"data\":{\"gather\":\"PL_local_D\"},\"extension\":{\"keep\":\"DL\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:filter:AAAAAAAAAAAAAAAA:PL_keep\":{\"v\":1,\"gen\":\"filter-AL\",\"at\":14,\"by\":\"browser-L\",\"data\":{\"mode\":\"allow\",\"on\":true,\"channels\":[]},\"extension\":{\"keep\":\"FL\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:filter:AAAAAAAAAAAAAAAA:PL_drop\":{\"v\":1,\"gen\":\"filter-drop-L\",\"at\":15,\"by\":\"browser-L\",\"data\":{\"on\":true,\"channels\":[]},\"extension\":{\"keep\":\"drop\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:filter:DDDDDDDDDDDDDDDD:PL_kept\":{\"v\":1,\"gen\":\"filter-DL\",\"at\":16,\"by\":\"browser-L\",\"data\":{\"on\":true,\"channels\":[]},\"extension\":{\"keep\":\"DF\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:setup:CCCCCCCCCCCCCCCC\":{\"v\":1,\"gen\":\"setup-CR\",\"at\":22,\"by\":\"browser-R\",\"data\":{\"gather\":\"PL_remote_C\"},\"extension\":{\"keep\":\"CR\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\"},\"doc:filter:AAAAAAAAAAAAAAAA:PL_dead\":{\"v\":1,\"gen\":\"filter-dead-R\",\"at\":26,\"by\":\"browser-R\",\"extension\":{\"keep\":\"dead\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\",\"deleted\":true},\"doc:filter:AAAAAAAAAAAAAAAA:PL_extra\":{\"v\":1,\"gen\":\"suppress-A-extra\",\"at\":100,\"by\":\"browser-L\",\"extension\":{\"keep\":\"extra\"},\"__proto__\":{\"inert\":true},\"toJSON\":\"inert\",\"deleted\":true}},\"expectedFinalSession\":{\"skips:DDDDDDDDDDDDDDDD\":{\"abcdefghijk\":\"all\"},\"cooldown:DDDDDDDDDDDDDDDD\":100,\"cooldown:BBBBBBBBBBBBBBBB\":200,\"recent\":[{\"acct\":\"DDDDDDDDDDDDDDDD\",\"playlist\":\"PL_local_D\",\"video\":\"abcdefghijk\",\"at\":1},{\"acct\":\"BBBBBBBBBBBBBBBB\",\"playlist\":\"PL_local_B\",\"video\":\"abcdefghijk\",\"at\":2}],\"shown\":{\"v\":1,\"global\":{\"keep\":true},\"accounts\":{\"DDDDDDDDDDDDDDDD\":{\"once\":true},\"BBBBBBBBBBBBBBBB\":{\"once\":true}}}}}]")
  if (!Array.isArray(raw) || !raw.every(isJoinObject)) throw Error("Invalid literal join fixtures")
  return raw
}
const joinLiterals = literalJoinFixtures()
export function syncJoinHarness(seed: { local: JsonObject; sync: JsonObject; session?: JsonObject }, candidate = "candidate", api = { create: createStartingLocalFilterWriter, preinitialized: createLocalFilterWriter }) {
  let local = copy(seed.local), sync = copy(seed.sync), session = copy(seed.session ?? {}), mono = 0, at = 100, gen = 0, reads = 0, nowCalls = 0, syncReads = 0, clockCalls = 0
  const effects: unknown[] = [], localSets: JsonObject[] = [], nativeSets: JsonObject[] = [], sessionSets: JsonObject[] = [], removals: unknown[] = [], allocated: string[] = []
  const listeners = new Set<() => void>(), timers = new Set<{ due: number; run(): void }>()
  let fault: { stage: string; mode: string; used: boolean } | undefined, failRead = false
  const writeError = new Error("Synthetic join write"), readError = new Error("Synthetic join readback")
  let generations: string[] = []
  let owner: ReturnType<typeof createStartingLocalFilterWriter> | undefined
  async function mutate(stage: string, apply: () => void, partial?: () => void) {
    const active = fault && !fault.used && fault.stage === stage ? fault : undefined
    if (active) active.used = true
    effects.push({ mutation: stage, mode: active?.mode ?? "normal", mono })
    if (active?.mode === "disposed-before") { void owner?.dispose(); return }
    if (active?.mode === "rejected-unchanged") throw writeError
    if (active?.mode === "ignored") return
    if (active?.mode === "partial") { if (partial) partial(); else local.foreignPartial = true }
    else apply()
    if (active?.mode === "divergent") local.foreignDivergence = true
    if (active?.mode === "read-failed" || active?.mode === "rejected-read-failed") failRead = true
    if (active?.mode === "disposed-after") void owner?.dispose()
    if (active?.mode === "rejected-applied" || active?.mode === "rejected-read-failed") throw writeError
  }
  const localPort = { async get(keys: readonly string[] | null) { reads++; effects.push({ get: keys }); if (failRead) { failRead = false; throw readError }; return copy(keys === null ? local : Object.fromEntries(Object.entries(local).filter(([k]) => keys.includes(k)))) },
    async set(items: Readonly<Record<string, JsonValue>>) {
      const batch = copy(json(items)); localSets.push(batch)
      const checkpoint = batch[pendingSyncJoinKey]
      const stage = isJoinObject(checkpoint) && checkpoint.phase === "accepted" ? "accept" : isJoinObject(checkpoint) && checkpoint.phase === "outbound" ? "debt" : isJoinObject(checkpoint) && checkpoint.phase === "choice" ? "choice" : Object.hasOwn(batch,"device") || Object.keys(batch).some(k => k.startsWith("doc:")) ? "materialize" : isJoinObject(batch.sync) && batch.sync.status === "ok" ? "acknowledge" : "prearm"
      await mutate(stage, () => { local = { ...local, ...batch } }, stage === "materialize" ? () => { const entry = Object.entries(batch).find(([key]) => key.startsWith("doc:")); if (entry) local[entry[0]] = entry[1] } : undefined)
    } }
  const join: SyncJoinHost = { kind: "fixture", async removeLocal(keys) {
    const names = keys.map(syncJoinLocalName); removals.push(copy(json({ keys })))
    await mutate(keys.some(k => k.kind === "continuation") ? "retire" : "local-cleanup", () => { names.forEach(k => { delete local[k] }) }, names.length > 1 ? () => { delete local[names[0]!] } : undefined)
  }, session: { async get() { effects.push("session-get"); if (failRead) { failRead = false; throw readError }; return copy(session) },
    async set(items) { const batch = copy(json(items)); sessionSets.push(batch); await mutate("session-cleanup", () => { session = { ...session, ...batch } }) },
    async remove(keys) { removals.push(copy(json({ session: keys }))); await mutate("session-cleanup", () => { keys.forEach(k => { delete session[`${k.kind}:${k.acct}`] }) }) } } }
  const startup: StoreStartupHost = {
    context: { deviceId: candidate, settingsGen: candidate, at: 999, shortcutId: "orig01", platform: { browser: "chrome", os: "linux" }, commands: [] },
    async readInterimSnapshot() { effects.push("interim-snapshot"); return { source: Object.fromEntries(Object.entries(local).filter(([k]) => isInterimSourceKey(k))), canonical: Object.fromEntries(Object.entries(local).filter(([k]) => isInterimCanonicalKey(k))), checkpoint: Object.hasOwn(local,"interimConversion") ? { kind: "present", value: local.interimConversion } : { kind: "absent" }, historicalAuthorization: { kind: "unknown" }, priorCredentialPresence: { kind: "unknown" } } },
    async readSnapshot() { effects.push("startup-snapshot"); return { schema: local.schema, device: local.device, settingsDocument: local["doc:settings"], unclaimed: local.unclaimed, legacy: { presentKeys: [], values: {}, refreshTokenWasNonempty: false }, interimKeysPresent: [] } },
    async removeLocal(keys) { effects.push({ legacyRemove: keys }); keys.forEach(k => { delete local[k] }) }, async deleteDatabase(name) { effects.push({ deleteDatabase: name }) }, async removeSession(keys) { effects.push({ legacySession: keys }) }
  }
  const deps = { local: localPort, join, startup, claim: { kind: "unavailable" as const },
    sync: { async get() { syncReads++; effects.push("sync-get"); return copy(sync) }, async set(items: Readonly<Record<string, JsonValue>>) { const batch = copy(json(items)); nativeSets.push(batch); await mutate("native", () => { sync = { ...sync, ...batch } }, () => { const first = Object.entries(batch)[0]; if (first) sync[first[0]] = first[1] }) }, subscribe(fn: () => void) { effects.push("subscribe"); listeners.add(fn); return () => { listeners.delete(fn); effects.push("unsubscribe") } } },
    now() { nowCalls++; return at }, generation() { gen++; const value = generations.shift() ?? `${candidate}-${gen}`; allocated.push(value); return value },
    syncClock: { now() { clockCalls++; return mono }, wallNow() { clockCalls++; return 1000000 + mono }, after(ms: number, run: () => void) { effects.push({ timer: ms }); const timer = { due: mono + ms, run }; timers.add(timer); return () => { timers.delete(timer); effects.push({ cancelTimer: ms }) } } }, onSyncResult(result: unknown) { effects.push({ automatic: result }) } }
  async function drain() { for (let i = 0; i < 120; i++) await Promise.resolve() }
  return { deps, effects, localSets, nativeSets, removals, sessionSets, writeError, readError,
    owner(starting = true) { owner = starting ? api.create(deps) : { ...api.preinitialized(deps), ready: () => Promise.resolve("ok" as const) }; return owner },
    state() { return { local: copy(local), sync: copy(sync), session: copy(session) } },
    counters() { return { gen, nowCalls, reads, syncReads, clockCalls, timers: timers.size, listeners: listeners.size, allocated: [...allocated] } },
    time(value: number) { at = value }, stamps(values: string[]) { generations = [...values] }, fault(stage: string, mode: string) { fault = { stage, mode, used: false } },
    foreign(fn: (raw: JsonObject) => void) { fn(local) }, remote(fn: (raw: JsonObject) => void) { fn(sync) },
    async event() { for (const listener of [...listeners]) listener(); await drain() },
    async tick(value: number, run = true) { mono = value; if (run) for (const timer of [...timers]) if (timer.due <= mono) { timers.delete(timer); timer.run() }; await drain() }, drain }
}
function isJoinObject(value: unknown): value is JsonObject { return value !== null && typeof value === "object" && !Array.isArray(value) && isJsonValue(value) }
export async function runSyncJoinObservations(api = { create: createStartingLocalFilterWriter, preinitialized: createLocalFilterWriter }) {
  const observations: unknown[] = [], assertions: string[] = []
  const stable = (value: unknown): string => JSON.stringify(value, (_, item: unknown) => item instanceof Error ? { name: item.name, message: item.message } : item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a],[b]) => a.localeCompare(b))) : item)
  function check(value: unknown, label: string): asserts value { assertions.push(label); if (!value) throw Error(label) }
  function equal(actual: unknown, expected: unknown, label: string) { check(stable(actual) === stable(expected), `${label}${stable(actual) === stable(expected) ? "" : ": " + stable(actual) + " != " + stable(expected)}`) }
  const ui = { kind: "ui", windowId: 1, incognito: false } as const
  for (const fixture of joinLiterals) {
    const h = syncJoinHarness({ local: json(fixture.localBefore), sync: json(fixture.syncBefore), session: json(fixture.sessionBefore) }, "fresh-candidate", api)
    h.stamps(fixture.id === "first-join-use-synced" ? ["suppress-A-drop", "suppress-D-filter"] : ["suppress-A-extra"])
    const owner = h.owner(); check(await owner.ready() === "ok", "join real starting owner ready")
    const preparation = await owner.beginSyncJoin(ui).result
    check(preparation.kind === "choice-required" && preparation.reason === "unknown-provenance", "unknown provenance requires actual private choice")
    equal(h.localSets, [], "preparation writes no draft")
    const choice = fixture.id === "first-join-use-synced" ? "use-synced" : "use-this-browser"
    const result = await owner.applySyncJoin(ui, { kind: "choice", review: preparation.review, choice })
    check(result.kind === "committed" && result.replication === "pending", "complete confirmed local join remains native debt")
    const localComplete = h.state()
    equal(Object.fromEntries(Object.entries(localComplete.local).filter(([n]) => n.startsWith("doc:"))), fixture.expectedSelectedDocuments, "literal whole-account selection and suppression")
    equal(localComplete.local.sync, fixture.expectedHistoryAtLocalCompletion, "literal truthful target acknowledgements")
    equal(localComplete.session, fixture.expectedFinalSession, "literal actual session sibling cleanup")
    equal(h.nativeSets, [], "local completion has zero native sets")
    equal(await owner.readSyncJoin(ui), { kind: "joining" }, "status exposes real pending debt")
    await owner.startSync(); check(h.nativeSets.length === 0, "existing driver retains five second first floor")
    await h.tick(4999); check(h.nativeSets.length === 0, "no early first native attempt")
    await h.tick(5000)
    equal(h.nativeSets.length, 1, "existing paced driver performs one complete first push")
    equal(h.state().local, fixture.expectedFinalLocalAfterNativeConfirmation, "literal final local inventory after actual native acknowledgement")
    equal(h.state().session, fixture.expectedFinalSession, "native phase preserves session cleanup")
    equal(await owner.readSyncJoin(ui), { kind: "joined", status: "ok" }, "native exact readback retires debt")
    await owner.dispose()
    observations.push({ case: fixture.id, preparation, result, localComplete, final: h.state(), localSets: h.localSets, nativeSets: h.nativeSets, removals: h.removals, sessionSets: h.sessionSets, effects: h.effects, counters: h.counters() })
  }
  const simpleLocal = (): JsonObject => ({ schema: 1, device: { id: "browser-L", consent: { v: 1, at: 1 }, syncOn: false }, sync: { joined: null, pushed: {}, status: "off", editedSinceOff: false }, "doc:settings": { v: 1, gen: "settings-L", at: 10, by: "browser-L", data: { theme: "light" } } })
  const simpleRemote = (): JsonObject => ({ "s:meta": { v: 1, id: "H", created: 0 }, "s:settings": { v: 1, gen: "settings-R", at: 20, by: "browser-R", data: { theme: "dark" } } })
  async function choose(owner: ReturnType<typeof createLocalFilterWriter>, side: "use-synced" | "use-this-browser" = "use-synced") {
    const prepared = await owner.beginSyncJoin(ui).result
    check(prepared.kind === "choice-required", "actual matrix private review")
    return owner.applySyncJoin(ui, { kind: "choice", review: prepared.review, choice: side })
  }
  {
    const h = syncJoinHarness({ local: simpleLocal(), sync: simpleRemote() }, "cancel", api), owner = h.owner(); await owner.ready()
    const before = h.state(), preparation = await owner.beginSyncJoin(ui).result; check(preparation.kind === "choice-required", "initial cancel review")
    equal(await owner.cancelSyncJoin(ui), { kind: "cancelled" }, "initial cancel result")
    equal(h.state(), before, "initial cancel keeps all stored presence and bytes")
    equal(h.localSets, [], "initial cancel zero local effects"); equal(h.nativeSets, [], "initial cancel zero remote effects")
    equal(await owner.applySyncJoin(ui, { kind: "choice", review: preparation.review, choice: "use-synced" }), { kind: "unavailable", reason: "stale" }, "cancel revokes review")
    await owner.dispose(); observations.push({ case: "initial-cancel", preparation, final: h.state(), effects: h.effects, counters: h.counters() })
  }
  {
    const h = syncJoinHarness({ local: simpleLocal(), sync: simpleRemote() }, "same-owner-resume", api), owner = h.owner(); await owner.ready()
    h.fault("materialize", "rejected-unchanged")
    const failed = await choose(owner, "use-this-browser")
    check(failed.kind === "failed" && failed.stage === "materialize", "known unchanged materialization retains its failed result")
    const pending = await owner.readSyncJoin(ui)
    equal(pending, { kind: "pending", action: "resume-join" }, "known unchanged rejection preserves same-owner pending status")
    check((await owner.changeSharedSetting(ui, { kind: "theme", value: "dark" })).kind === "unavailable", "accepted fixed work still gates ordinary edits")
    const before = h.counters(), resumed = await owner.resumeSyncJoin(ui)
    check(resumed.kind === "committed", "same owner explicitly resumes known unchanged failure")
    equal({ gen: h.counters().gen, now: h.counters().nowCalls }, { gen: before.gen, now: before.nowCalls }, "same-owner resume reuses fixed stamps and time")
    equal(h.nativeSets, [], "explicit resume earns no native mutation opportunity")
    await owner.dispose(); observations.push({ case: "known-failure-same-owner-resume", failed, pending, resumed, final: h.state(), localSets: h.localSets, nativeSets: h.nativeSets, removals: h.removals, sessionSets: h.sessionSets, effects: h.effects, counters: h.counters() })
  }
  for (const stage of ["accept", "materialize", "local-cleanup", "session-cleanup", "debt", "native", "acknowledge", "retire"]) for (const mode of ["rejected-unchanged", "rejected-applied", "ignored", "partial", "divergent", "read-failed", "rejected-read-failed", "disposed-before", "disposed-after"]) {
    const fixture = joinLiterals[0]!, h = syncJoinHarness({ local: json(fixture.localBefore), sync: json(fixture.syncBefore), session: json(fixture.sessionBefore) }, "fixed", api)
    h.stamps(["suppress-A-drop", "suppress-D-filter"])
    const owner = h.owner(); await owner.ready(); h.fault(stage, mode)
    const result = await choose(owner)
    let flush: unknown
    if (stage === "native" || stage === "acknowledge" || stage === "retire") {
      check(result.kind === "committed", "native interruption follows complete local outcome")
      await h.tick(5000, false); flush = await owner.flushSync()
      check(stage !== "native" && mode === "rejected-applied" ? (flush as { kind?: string }).kind === "pushed" : (flush as { kind?: string }).kind !== "pushed", "exact acknowledgement or retirement classification " + stage + " " + mode)
    } else if (mode === "rejected-applied") check(result.kind === "committed", "exact applied rejected stage confirms coherent outcome")
    else check(result.kind !== "committed", "interrupted stage cannot claim complete local outcome")
    if (mode === "rejected-unchanged" && stage !== "native" && stage !== "acknowledge" && stage !== "retire") check(result.kind === "failed" && "write" in result && result.write.error === h.writeError, "unchanged rejected join preserves exact original error")
    if (mode === "rejected-read-failed" && stage !== "native" && stage !== "acknowledge" && stage !== "retire") check(result.kind === "unconfirmed" && result.write.kind === "rejected" && result.write.error === h.writeError && result.cause.kind === "read-failed" && result.cause.error === h.readError, "join read and write errors retain independent identity")
    if (stage === "native") {
      const original = flush as { kind?: string; error?: unknown }
      if (mode.startsWith("rejected")) check(original.kind === "sync-set-failed" && original.error === h.writeError, "native join preserves rejection and original error")
      check(readSyncJoinCheckpoint(h.state().local[pendingSyncJoinKey]).kind === "valid", "uncertain native set retains durable debt")
      check(json(h.state().local.sync).status === "joining", "uncertain native set never publishes confirmed status")
    }
    const uncertain = (flush ?? result) as { kind?: string }
    let barrier: unknown
    if (uncertain.kind === "unconfirmed") {
      const before = { reads: h.counters().reads, sets: h.localSets.length, nativeSets: h.nativeSets.length }
      barrier = await Promise.allSettled([owner.readAgreement(ui), owner.read("settings"), owner.readSyncJoin(ui), owner.flushSync(), owner.startSync()])
      await h.event()
      equal({ reads: h.counters().reads, sets: h.localSets.length, nativeSets: h.nativeSets.length }, before, "unconfirmed join closes queued ordinary and automatic IO")
    }
    const serialized = JSON.stringify(h.state()), stamps = h.counters().allocated
    await owner.dispose()
    const fresh = syncJoinHarness(JSON.parse(serialized), "different-restart-candidate", api), restarted = fresh.owner()
    const ready = await restarted.ready().then(value => ({ kind: "ready" as const, value }), error => ({ kind: "held", result: error.result }))
    const checkpoint = readSyncJoinCheckpoint(fresh.state().local[pendingSyncJoinKey])
    let status: unknown, resumed: unknown, native: unknown
    if (checkpoint.kind === "valid" && checkpoint.checkpoint.phase === "accepted") {
      check(ready.kind === "held" && ready.result.kind === "pending-join", "accepted checkpoint rejects ordinary readiness before startup")
      equal(fresh.localSets, [], "accepted startup performs zero schema or replay sets")
      equal(fresh.counters().gen, 0, "accepted startup allocates no stamps")
      status = await restarted.readSyncJoin(ui); equal(status, { kind: "pending", action: "resume-join" }, "fresh owner exposes explicit pending join")
      const fixed = checkpoint.checkpoint.effect
      const compatible = joinEffectCompatible(fixed, fresh.state().local)
      resumed = await restarted.resumeSyncJoin(ui)
      if (compatible) {
        check((resumed as { kind?: string }).kind === "committed", "fresh owner finishes only accepted fixed local effects")
        equal(fresh.counters().gen, 0, "explicit resume reuses fixed stamps")
        await fresh.tick(5000, false); native = await restarted.flushSync()
        equal(fresh.state().local, { ...json(fixture.expectedFinalLocalAfterNativeConfirmation), ...(Object.hasOwn(fresh.state().local, "foreignDivergence") ? { foreignDivergence: true } : {}), ...(Object.hasOwn(fresh.state().local, "foreignPartial") ? { foreignPartial: true } : {}) }, "resumed fixed literal selected state matches final")
      } else check((resumed as { kind?: string }).kind !== "committed", "third local values stay held")
    } else if (checkpoint.kind === "valid" && checkpoint.checkpoint.phase === "outbound") {
      check(ready.kind === "held" && ready.result.kind === "pending-join", "outbound checkpoint rejects ordinary readiness before startup")
      equal(fresh.localSets, [], "outbound startup does not replay local effects")
      const held = isJoinObject(fresh.state().local.sync) && isJoinObject(json(fresh.state().local.sync).opaqueWrite) && isJoinObject(json(json(fresh.state().local.sync).opaqueWrite).gate)
      await restarted.startSync(); equal(fresh.nativeSets, [], "restart makes no immediate native attempt")
      await fresh.tick(60000)
      if (held) equal(fresh.nativeSets, [], "elapsed deadline and old start event cannot retry")
      await fresh.event()
      if (stage === "native" && mode === "rejected-applied") equal(fresh.nativeSets, [], "observed rejected native application acknowledges without resending")
      equal(fresh.state().local["doc:settings"], json(fixture.expectedSelectedDocuments)["doc:settings"], "restarted native phase keeps selection")
    }
    await restarted.dispose()
    observations.push({ case: `interruption-${stage}-${mode}`, result, flush, barrier, serialized, acceptedStamps: stamps, ready, status, resumed, native, final: fresh.state(), original: { state: h.state(), effects: h.effects, sets: h.localSets, nativeSets: h.nativeSets, sessionSets: h.sessionSets, removals: h.removals, counters: h.counters() }, restart: { effects: fresh.effects, sets: fresh.localSets, nativeSets: fresh.nativeSets, sessionSets: fresh.sessionSets, removals: fresh.removals, counters: fresh.counters() } })
  }
  {
    const h = syncJoinHarness({ local: simpleLocal(), sync: {} }, "created-history", api), owner = h.owner(); await owner.ready()
    const operation = owner.beginSyncJoin(ui); await h.drain(); equal(h.localSets, [], "empty lookup stores no initial draft")
    await h.tick(9999); equal(h.localSets, [], "original ten second creation wait")
    await h.tick(10000); const preparation = await operation.result; check(preparation.kind === "automatic" && preparation.reason === "empty-copy", "bounded absence produces automatic create capability")
    const result = await owner.applySyncJoin(ui, { kind: "automatic", review: preparation.review }); check(result.kind === "committed", "real empty join local commit")
    equal(json(h.state().local.sync).pushed, {}, "creation has no invented acknowledgements")
    await owner.startSync(); await h.tick(10000)
    check(h.nativeSets.length === 1 && Object.hasOwn(h.nativeSets[0]!, "s:meta") && Object.hasOwn(h.nativeSets[0]!, "s:settings"), "new metadata and all documents share one existing driver call")
    await owner.dispose(); observations.push({ case: "empty-copy-create", preparation, result, final: h.state(), sets: h.localSets, nativeSets: h.nativeSets, effects: h.effects, counters: h.counters() })
  }
  for (const branch of ["proven-never-edited", "same-history-ever-true", "same-history-unknown", "private", "third-generation", "later-history", "cancel-debt", "R155", "stale-queued-R155", "stale-local-aba", "stale-remote-aba"] as const) {
    const initial = simpleLocal()
    if (branch === "proven-never-edited") json(initial.sync).everEdited = false
    if (branch.startsWith("same-history")) initial.sync = { joined: "H", pushed: {}, status: "off", editedSinceOff: false, ...(branch === "same-history-ever-true" ? { everEdited: true } : {}) }
    if (branch === "R155" || branch === "stale-queued-R155") initial.sync = { ...json(initial.sync), opaqueWrite: { gate: { kind: "held", notBefore: 1060000, future: [null] }, diagnostic: { name: "Original", message: "opaque", future: [null] } } }
    const h = syncJoinHarness({ local: initial, sync: simpleRemote() }, "branch", api), owner = h.owner(); await owner.ready()
    const origin = branch === "private" ? { ...ui, incognito: true } : ui
    const preparation = await owner.beginSyncJoin(origin).result
    let result: unknown, native: unknown, cancelled: unknown, status: unknown
    if (branch.startsWith("same-history")) equal(preparation, { kind: "unavailable", reason: "same-history-rejoin-required" }, "excluded same-history branch has no extra question")
    else {
      check(preparation.kind === "choice-required" || preparation.kind === "automatic", "branch has real capability")
      if (branch === "stale-local-aba") {
        h.foreign(raw => { raw.extra = true }); await owner.readAgreement(ui); h.foreign(raw => { delete raw.extra }); await owner.readAgreement(ui)
      }
      if (branch === "stale-remote-aba") { h.remote(raw => { raw.extra = true }); await h.event(); h.remote(raw => { delete raw.extra }); await h.event() }
      result = await owner.applySyncJoin(origin, preparation.kind === "automatic" ? { kind: "automatic", review: preparation.review } : { kind: "choice", review: preparation.review, choice: branch === "third-generation" || branch === "later-history" || branch === "cancel-debt" || branch === "R155" || branch === "stale-queued-R155" ? "use-this-browser" : "use-synced" })
      if (branch === "stale-local-aba" || branch === "stale-remote-aba") { equal(result, { kind: "unavailable", reason: "stale" }, "observed A-B-A permanently invalidates join review"); equal(h.localSets, [], "stale review zero writes") }
      else {
        check((result as { kind?: string }).kind === "committed", "real branch commit")
        if (branch === "proven-never-edited") equal(json(h.state().local.sync).everEdited, false, "adoption preserves existing false without initialization")
        if (branch === "private") { check((await owner.claim()).kind === "unavailable", "private adoption gives no claim host"); const removal = await owner.prepareAccountRemoval(origin, acct); check(removal.kind === "result" && "refused" in removal.result && removal.result.refused === "private", "private shared adoption grants no explicit removal") }
        if (branch === "third-generation") { h.remote(raw => { json(raw["s:settings"]).gen = "third" }); await h.tick(5000, false); native = await owner.flushSync(); equal(h.nativeSets, [], "third generation cannot reuse old overwrite authority") }
        if (branch === "later-history") {
          await owner.startSync(); h.remote(raw => { raw["s:meta"] = { v: 1, id: "foreign", created: 0 } }); await h.event()
          status = await owner.readSyncJoin(ui); equal(status, { kind: "waiting", action: "review-join" }, "later history persists waiting without a page")
          const cp = readSyncJoinCheckpoint(h.state().local[pendingSyncJoinKey]); check(cp.kind === "valid" && cp.checkpoint.phase === "choice" && cp.checkpoint.suspended.kind === "outbound", "later choice preserves bounded suspended debt")
          equal(h.nativeSets, [], "later history never sends old choice")
          h.remote(raw => { raw["s:meta"] = { v: 1, id: "foreign-again", created: 1 } }); await h.event()
          const updated = readSyncJoinCheckpoint(h.state().local[pendingSyncJoinKey])
          check(updated.kind === "valid" && updated.checkpoint.phase === "choice" && updated.checkpoint.observedMetadata.id === "foreign-again" && updated.checkpoint.suspended.kind === "outbound", "later histories update one bounded suspended indication")
        }
        if (branch === "cancel-debt") {
          cancelled = await owner.cancelSyncJoin(ui); equal(cancelled, { kind: "cancelled" }, "cancel accepted debt finishes coherent off state")
          equal(h.state().local[pendingSyncJoinKey], { v: 1, kind: "sync-join", phase: "off", unfinishedTarget: "H" }, "cancel strips all retained document bodies to off marker")
          native = await owner.flushSync(); equal(h.nativeSets, [], "off marker grants zero sync IO")
          const edited = await owner.changeSharedSetting(ui, { kind: "theme", value: "dark" }); check(edited.kind === "committed", "ordinary off edits remain allowed")
        }
        if (branch === "R155") {
          equal(json(h.state().local.sync).opaqueWrite, json(initial.sync).opaqueWrite, "side selection retains exact raw R155 diagnostics and deadline")
          await owner.startSync(); await h.tick(60000); equal(h.nativeSets, [], "choice and elapsed time earn no R155 attempt")
          h.fault("native", "rejected-unchanged"); await h.event(); equal(h.nativeSets.length, 1, "one later external event admits one actual attempt")
          const gate = json(json(json(h.state().local.sync).opaqueWrite).gate); equal(gate.notBefore, 1120000, "native failure renews sixty second hold")
        }
        if (branch === "stale-queued-R155") {
          await owner.flushSync()
          const get = h.deps.local.get
          let release = () => {}, entered = () => {}, once = true
          const held = new Promise<void>(done => { release = done }), waiting = new Promise<void>(done => { entered = done })
          h.deps.local.get = async keys => { if (once) { once = false; entered(); await held }; return get(keys) }
          const reading = owner.readSyncJoin(ui); await waiting
          const stale = owner.flushSync(); await h.tick(60000, false); release(); await reading
          native = await stale
          equal(h.nativeSets, [], "a queued pre-hold event cannot spend the later mutation opportunity")
          const current = await owner.flushSync()
          equal(h.nativeSets.length, 1, "only a new post-hold event admits the first native push")
          native = { stale: native, current }
        }
      }
    }
    const serialized = JSON.stringify(h.state()); await owner.dispose()
    const fresh = syncJoinHarness(JSON.parse(serialized), "other-candidate", api), restarted = fresh.owner(), ready = await restarted.ready().then(value => ({ value }), error => ({ result: error.result }))
    const freshStatus = await restarted.readSyncJoin(ui); equal(fresh.localSets, [], "serialized restart never automatically joins or replays")
    await restarted.dispose(); observations.push({ case: branch, preparation, result, native, cancelled, status, serialized, ready, freshStatus, original: { state: h.state(), effects: h.effects, sets: h.localSets, nativeSets: h.nativeSets, counters: h.counters() }, restart: { state: fresh.state(), effects: fresh.effects, counters: fresh.counters() } })
  }

  return { productionConnected: false, native: "waived-unproven", assertions, observations }
}

export async function runAccountRemovalAdmission() {
  const assertions: string[] = []
  function check(value: unknown, label: string): asserts value {
    assertions.push(label)
    if (!value) throw Error(label)
  }
  const stable = (value: unknown): string => JSON.stringify(value, (_, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
  function equal(actual: unknown, expected: unknown, label: string) { const match = stable(actual) === stable(expected); check(match, match ? label : `${label}: ${stable(actual)} != ${stable(expected)}`) }
  const observations: unknown[] = []
  function plan(input: SyncWritePlanInput) {
    const result = planSyncWrite(input)
    observations.push({ case: "admission-snapshot", ...copy(json({ input, result })) })
    return result
  }
  const seed = baseline(oldEntries)
  const removal = planSetupRemoval({ acct, current: { kind: "present", bodies } })
  check(removal.kind === "remove", "Setup removal has complete selected and kept Filter inventory")
  equal(removal.removal.documents, [setupKey, selectedKey, keptKey], "exact account removal documents")
  equal(removal.removal.progressKeys.length, 16, "semantic removal names sixteen shards without deleting them")
  const proposed = removal.removal.documents.map((key, i) => {
    const raw = seed.local[documentKey(key)]
    return { key, document: tombstone(json(raw), `removed-${i}`) }
  })
  const [first, ...rest] = proposed
  check(first, "nonempty account tombstones")
  const intent = batch([first, ...rest])
  for (const item of proposed) {
    equal(item.document.extension, json(seed.local[documentKey(item.key)]).extension, "tombstone preserves envelope extensions")
    check(!Object.hasOwn(item.document, "data") && Object.hasOwn(item.document, "__proto__"), "tombstone drops superseded body and retains own fields")
  }
  const pending = envelope(defaultSettings(), "pending-settings")
  const restoration = envelope({ ...defaultSetup(), gather: "PL_restore" }, "acknowledged-restoration")
  seed.local[documentKey(pendingKey)] = pending
  seed.local[documentKey(restorationKey)] = restoration
  json(json(seed.local.sync).pushed)[documentKey(restorationKey)] = restoration.gen!
  const original = copy(json(seed))
  const admission = plan({ ...seed, intent })
  check(admission.kind === "planned", "complete removal candidate set admitted")
  const expectedDocuments = [...proposed, { key: pendingKey, document: pending }, { key: restorationKey, document: restoration }]
  const expectedSent = expectedDocuments.map(({ key, document }) => ({ key, name: documentKey(key), gen: document.gen, document }))
  equal(admission.sent, expectedSent.slice(3).concat(expectedSent.slice(0, 3)), "exact batch candidates plus independent pending and disappeared restoration")
  equal(admission.items, admission.sent.flatMap(({ key, document }) => wire(key, document)), "exact combined outgoing wire records")
  equal(admission.repairs, [], "planning does not acknowledge candidates")
  equal(admission.metadata, metadata, "raw metadata extensions preserved")
  equal(seed, original, "admission leaves full snapshots unchanged")

  function ownerHarness(initial: { local: JsonObject; sync: JsonObject }) {
    let local = copy(initial.local), sync = copy(initial.sync), now = 0, generations = 0
    const localSets: JsonObject[] = [], syncSets: JsonObject[] = [], schedules: number[] = []
    const ports = {
      local: { async get() { return copy(local) }, async set(items: Readonly<Record<string, JsonValue>>) {
        localSets.push(copy(json(items))); local = { ...local, ...copy(json(items)) }
      } },
      sync: { async get() { return copy(sync) }, async set(items: Readonly<Record<string, JsonValue>>) {
        syncSets.push(copy(json(items))); sync = { ...sync, ...copy(json(items)) }
      }, subscribe() { return () => {} } },
      claim: { kind: "unavailable" as const }, now: () => 100, generation: () => `filter-edit-${++generations}`,
      syncClock: { now: () => now, wallNow: () => 1000000 + now, after(ms: number) { schedules.push(ms); return () => {} } },
      onSyncResult() {}
    }
    return { ports, localSets, syncSets, schedules, clock(value: number) { now = value },
      state: () => ({ local: copy(local), sync: copy(sync) }), counts: () => ({ generations }) }
  }
  const h = ownerHarness(seed), owner = createLocalFilterWriter(h.ports)
  const staging = json(Object.fromEntries(proposed.map(({ key, document }) => [documentKey(key), document])))
  await h.ports.local.set(staging)
  equal(await h.ports.local.get(), { ...seed.local, ...staging }, "fixture staging confirms full exact local readback")
  const staged = h.state()
  equal(await owner.flushSync(), { kind: "deferred", notBefore: 5000 }, "actual owner first defers until shared opportunity")
  equal(h.syncSets, [], "deferred owner sends nothing")
  h.clock(5000)
  const flushed = await owner.flushSync()
  equal(flushed, { kind: "pushed", sent: expectedSent, repaired: [] }, "actual owner sends all admitted candidates and independent records")
  equal(h.syncSets, [Object.fromEntries(admission.items.map(item => [item.key, item.value]))], "one exact combined sync set")
  const acknowledged = h.state()
  const pushed = { ...json(json(seed.local.sync).pushed), ...Object.fromEntries(admission.sent.map(item => [item.name, item.gen])) }
  equal(acknowledged.local, { ...staged.local, sync: { ...json(seed.local.sync), pushed } }, "exact acknowledgement readback without local cleanup")
  await owner.dispose()
  const serialized = JSON.stringify(acknowledged)
  const restart = ownerHarness(JSON.parse(serialized)), restarted = createLocalFilterWriter(restart.ports)
  equal(await restarted.flushSync(), { kind: "idle" }, "serialized restart is idle without duplicate push")
  equal(restart.syncSets, [], "restart performs no sync set")
  await restarted.dispose()
  observations.push({ case: "account-removal", removal, admission, before: original, "fixture-staged-documents": staging,
    staged, "owner-flush-result": flushed, acknowledged, localSets: h.localSets, syncSets: h.syncSets, serialized, restart: restart.state() })

  const refused = { kind: "refused", reason: "sync-full" }, unavailable = { kind: "unavailable" }
  const debtCases: [string, JsonValue, unknown][] = [
    ["addressed newer", { v: 2, gen: "future", at: 2, by: "other", data: {} }, { kind: "refused", reason: "update-needed" }],
    ["addressed malformed", {}, unavailable], ["addressed present null", null, unavailable],
    ["addressed incomplete", { v: 1, gen: "parts", at: 2, by: "other", n: 2 }, unavailable],
    ["same generation divergence", { ...oldEntries[1]!.document, extra: true }, unavailable],
    ["unresolved lineage", envelope(filter, "other-history"), unavailable]
  ]
  for (const [label, value, expected] of debtCases) {
    const state = baseline(oldEntries); state.sync[base(selectedKey)] = value
    const before = JSON.stringify(state), result = plan({ ...state, intent })
    equal(result, expected, `${label} rejects whole batch`)
    equal(JSON.stringify(state), before, `${label} leaves raw state byte-for-byte unchanged`)
    observations.push({ case: label, result, before: JSON.parse(before), after: state, "fixture-staged-documents": null })
  }
  const futureState = baseline(oldEntries)
  futureState.sync["s:setup:DDDDDDDDDDDDDDDD"] = { v: 2, gen: "future", at: 2, by: "other", data: {} }
  check(plan({ ...futureState, intent }).kind === "planned", "unrelated newer remote remains protected occupancy")
  const invalidBaseline = baseline(oldEntries); invalidBaseline.local[documentKey(selectedKey)] = { bad: true }
  equal(plan({ ...invalidBaseline, intent }), unavailable, "candidate overlay cannot repair malformed local baseline")

  const large = proposed.map(item => ({ ...item, document: { ...item.document, extension: "x".repeat(51000) } }))
  const [largeFirst, ...largeRest] = large
  check(largeFirst, "large batch nonempty")
  for (const item of large) check(plan({ ...baseline(oldEntries), intent: { kind: "changed", ...item } }).kind === "planned", "each proposed replacement fits independently")
  const combined = baseline(oldEntries), combinedBefore = JSON.stringify(combined)
  const combinedResult = plan({ ...combined, intent: batch([largeFirst, ...largeRest]) })
  equal(combinedResult, refused, "combined quota refuses independently fitting candidates")
  equal(JSON.stringify(combined), combinedBefore, "combined quota refusal stages nothing")
  observations.push({ case: "combined-budget", before: JSON.parse(combinedBefore), result: combinedResult, after: combined, "fixture-staged-documents": null })

  const superseded = baseline(oldEntries)
  for (const item of oldEntries) superseded.local[documentKey(item.key)] = { ...item.document, gen: "unsent-huge", extension: "x".repeat(100000) }
  superseded.sync = { "s:meta": metadata }
  const replaced = plan({ ...superseded, intent })
  check(replaced.kind === "planned", "replace every superseded oversized candidate before encoding")
  const retainedChunks = baseline(oldEntries)
  const hugeOld = { ...oldEntries[0]!.document, extension: "x".repeat(100000) }
  retainedChunks.local[documentKey(setupKey)] = hugeOld
  retainedChunks.sync = { ...retainedChunks.sync, ...Object.fromEntries(wire(setupKey, hugeOld).map(item => [item.key, item.value])) }
  equal(plan({ ...retainedChunks, intent }), refused, "retained old chunks earn no speculative quota credit")
  const smallChunked = { ...oldEntries[0]!.document, extension: "x".repeat(15000) }
  const chunkState = baseline(oldEntries)
  chunkState.local[documentKey(setupKey)] = smallChunked
  chunkState.sync = { ...chunkState.sync, ...Object.fromEntries(wire(setupKey, smallChunked).map(item => [item.key, item.value])) }
  const chunkPlan = plan({ ...chunkState, intent })
  check(chunkPlan.kind === "planned", "retained chunks can fit with admitted tombstones")
  const chunkOwner = ownerHarness(chunkState)
  await chunkOwner.ports.local.set(staging)
  const chunkWriter = createLocalFilterWriter(chunkOwner.ports)
  chunkOwner.clock(5000)
  equal(await chunkWriter.flushSync(), { kind: "pushed", sent: chunkPlan.sent, repaired: [] }, "owner sends tombstones over chunked remote")
  const chunkAfter = chunkOwner.state()
  for (const [key, value] of Object.entries(chunkState.sync).filter(([key]) => key.includes("@"))) equal(chunkAfter.sync[key], value, "actual owner retains exact old physical chunk")
  await chunkWriter.dispose()
  observations.push({ case: "retained-chunks", before: chunkState, admission: chunkPlan, after: chunkAfter, syncSets: chunkOwner.syncSets })

  const occupancy = baseline(oldEntries)
  Object.assign(occupancy.sync, Object.fromEntries(Array.from({ length: 476 }, (_, i) => [`unknown:${i}`, 0])))
  check(plan({ ...occupancy, intent }).kind === "planned", "exact 480 physical items admitted")
  occupancy.sync.excess = 0
  equal(plan({ ...occupancy, intent }), refused, "481 physical items refuse whole batch")
  const itemLimit = baseline(oldEntries); itemLimit.sync.unknown = "x".repeat(8192)
  equal(plan({ ...itemLimit, intent }), refused, "unknown physical per-item excess refuses whole batch")
  const debt = baseline(oldEntries)
  debt.local[documentKey(pendingKey)] = envelope({ future: "x".repeat(51000) }, "large-pending")
  debt.local[documentKey(restorationKey)] = tombstone(envelope({}, "large-restoration"), "large-restoration")
  json(debt.local[documentKey(restorationKey)]).extension = "x".repeat(51000)
  json(json(debt.local.sync).pushed)[documentKey(restorationKey)] = "large-restoration"
  for (const key of [pendingKey, restorationKey]) {
    const document = json(debt.local[documentKey(key)])
    check(projectSyncWrite({ current: physical(debt.sync), set: [...wire(key, document), ...proposed.flatMap(item => wire(item.key, item.document))] }).kind === "fits", "pending or acknowledged disappearance fits alone with candidates")
  }
  equal(plan({ ...debt, intent }), refused, "pending plus acknowledged disappearance exceed combined budget")
  observations.push({ case: "pending-restoration-budget", before: debt, result: plan({ ...debt, intent }), "fixture-staged-documents": null })

  const settings = defaultSettings()
  settings.shortcuts.list = [{ id: shortcut, key: null, label: "Edited label", watchLaterOnEveryAccount: false }]
  const accounts = [
    { acct, current: { kind: "present" as const, bodies: { setup: { ...defaultSetup(), targets: { [shortcut]: playlist }, gather: kept }, filters: {} } }, additionalChosenPlaylists: new Set<PlaylistId>() },
    { acct: retained, current: { kind: "present" as const, bodies: { setup: { ...defaultSetup(), targets: { [shortcut]: playlist } }, filters: { [kept]: filter } } }, additionalChosenPlaylists: new Set<PlaylistId>() },
    { acct: empty, current: { kind: "present" as const, bodies: { setup: { ...defaultSetup(), targets: { [shortcut]: playlist } }, filters: {} } }, additionalChosenPlaylists: new Set<PlaylistId>() }
  ]
  const shared = removeSharedShortcut({ settings, shortcut, accounts })
  check(shared.kind === "removed", "shared shortcut removal planned by existing helper")
  equal(shared.accounts.map(item => item.kind), ["save", "save", "remove"], "shared removal saves choices and off empty kept Filter account but removes empty Setup")
  const sharedEntries: Candidate[] = [{ key: pendingKey, document: envelope(settings) },
    ...accounts.map(item => ({ key: { kind: "setup" as const, acct: item.acct }, document: envelope(item.current.bodies.setup) })),
    { key: { kind: "filter", acct: retained, playlist: kept }, document: envelope(filter) }]
  const sharedState = baseline(sharedEntries)
  const sharedCandidates: [Candidate, ...Candidate[]] = [{ key: pendingKey, document: envelope(shared.settings, "shared-settings") }]
  for (const effect of shared.accounts) {
    if (effect.kind === "save") sharedCandidates.push({ key: { kind: "setup", acct: effect.acct }, document: envelope(effect.bodies.setup, `shared-${effect.acct}`) })
    else for (const key of effect.removal.documents) sharedCandidates.push({ key, document: tombstone(json(sharedState.local[documentKey(key)]), `shared-${documentKey(key)}`) })
  }
  const sharedBefore = JSON.stringify(sharedState), sharedPlan = plan({ ...sharedState, intent: batch(sharedCandidates) })
  check(sharedPlan.kind === "planned", "Settings row removal and affected saved or empty Setups admitted together")
  equal(JSON.stringify(sharedState), sharedBefore, "pure shared planning stages nothing")
  const identity = settings.shortcuts.list[0], provenance = sharedState.local.unclaimed
  const noOp = removeSharedShortcut({ settings: shared.settings, shortcut, accounts })
  equal(noOp, { kind: "unchanged" }, "missing shared shortcut is no-op")
  check(settings.shortcuts.list[0] === identity && sharedState.local.unclaimed === provenance, "no-op preserves original identity and provenance references")
  equal(JSON.stringify(sharedState), sharedBefore, "missing shortcut leaves full raw state unchanged")
  observations.push({ case: "shared-shortcut-pure-input", shared, candidates: sharedCandidates, result: sharedPlan, noOp, before: JSON.parse(sharedBefore), after: sharedState, "fixture-staged-documents": null })

  const editState = baseline(oldEntries), edit = ownerHarness(editState), editor = createLocalFilterWriter(edit.ports)
  const change = { acct, playlist, desired: { mode: "deny" as const, on: true }, clearListedChannels: "not-confirmed" as const }
  equal(await editor.change({ kind: "ui", windowId: 1, incognito: false }, change), { kind: "result", result: { ok: true } }, "actual Filter singleton transaction uses generalized admission")
  equal(edit.counts(), { generations: 1 }, "real Filter edit creates one stamp")
  equal(await editor.flushSync(), { kind: "deferred", notBefore: 5000 }, "singleton preserves debounce and pacing")
  edit.clock(5000)
  const editFlush = await editor.flushSync()
  check(editFlush.kind === "pushed" && editFlush.sent.length === 1, "actual singleton flush sends one Filter")
  const edited = edit.state(), localWrites = edit.localSets.length
  equal(await editor.change({ kind: "ui", windowId: 1, incognito: false }, change), { kind: "result", result: { ok: true } }, "achieved Filter change stays no-op")
  equal(edit.localSets.length, localWrites, "singleton no-op writes nothing")
  equal(edit.counts(), { generations: 1 }, "singleton no-op generates no stamp")
  await editor.dispose()
  observations.push({ case: "actual-filter-singleton", before: editState, "owner-flush-result": editFlush, after: edited, localSets: edit.localSets, syncSets: edit.syncSets, schedules: edit.schedules })
  return { fixture: "exclusive-synthetic", boundary: "production-removal-not-implemented", localCleanup: "not-implemented",
    native: "waived-unproven", assertions, observations, joinObservations: await runSyncJoinObservations() }
}

export const fixtureRun = import.meta.main ? runAccountRemovalAdmission() : Promise.resolve(undefined)
if (import.meta.main) fixtureRun.then(result => console.log(JSON.stringify(result, (_, value: unknown) => value instanceof Error ? { name: value.name, message: value.message } : value)))
