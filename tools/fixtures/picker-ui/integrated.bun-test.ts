import { expect, test } from "bun:test"
import { render, fireEvent, within } from "@testing-library/svelte"
import { flushSync } from "svelte"
import type { Backend } from "../../../src/ui/backend/backend"
import type { DestinationExpectation } from "../../../src/shared/contracts/first-run"
import type { PickerSource } from "../../../src/shared/picker/source"
import type { PlaylistChooserProps, PickerEvent, ChooserRelease } from "../../../src/ui/picker/types"
import PlaylistChooser from "../../../src/ui/picker/PlaylistChooser.svelte"
import { createPickerText } from "../../../src/ui/picker/text"
import { createFirstRunText } from "../../../src/ui/onboarding/text"
import { createFirstRunOwner, type FirstRunServices } from "../../../src/ui/backend/first-run-owner"
import { createBrowserI18n } from "../../../src/ui/backend/browser"
import catalogue from "../../../src/public/_locales/en/messages.json"
import { startingBridge } from "./starting-bridge"
import "./synthetic-layout"
import { scriptedMessages } from "../localization/scripted"
import { pendingLists, bridgeHarness, popup, a, alpha, beta, check, success, settle, deferred } from "../ui-playlist-progressive/harness"
import { settings, created, consumerSeed } from "../ui-read-playlist-bridge/harness"

const i18n = createBrowserI18n({ i18n: scriptedMessages() }, catalogue)
const text = createPickerText(i18n)
const evidence: unknown[] = []

function session(backend: Backend, expected: DestinationExpectation, now: () => number,
 choose?: PickerSource<null>["choose"]) {
 const operation = backend.playlistList({ acct: a, site: "www" })
 const creation = backend.creation({ acct: a, site: "www" })
 const source: PickerSource<null> = {
  item: null, private: false, tab: true, creation: "available", sortAZ: false,
  privacy: null, quickSave: expected.setup === "live" ? expected.playlist : null,
  chosen: expected.setup === "live" && expected.playlist ? [expected.playlist] : [],
  keys: new Map(), marks: new Map(), now, authorized: () => true,
  cachedList: operation.cachedList, freshList: operation.freshList,
  async create(input) {
   const answer = await creation.submit(input)
   if (answer.kind === "answered" && answer.result.kind === "created") return { kind: "created", id: answer.result.id, undo: null }
   return { kind: "failed", reason: "failed" }
  },
  choose: choose ?? (async (playlist,on) => {
   if (!on) return { refused: "invalid" }
   const result = await backend.change({ kind: "setup-destination", acct: a, destination: { kind: "quick-save" }, expected, playlist })
   if (result.kind === "confirmed") return { ok: true }
   evidence.push({case:"destination-refusal-before-model-adaptation",result})
   return { refused: result.reason === "private" || result.reason === "sync-full" || result.reason === "update-needed" ? result.reason : "invalid" }
  }),
  async pin() { return { refused: "invalid" } },
  async saveSortAZ() { return { refused: "invalid" } },
  async savePrivacy() { return { refused: "invalid" } }
 }
 return { source, operation, creation, dispose() { operation.dispose(); creation.dispose() } }
}
function props(createSource: PlaylistChooserProps["createSource"], onrelease: (value: ChooserRelease) => void,
 onoutcome: (value: PickerEvent) => void = () => {}): PlaylistChooserProps {
 return { open: true, context: { account: a, site: "www", private: false, purpose: { kind: "quickSave" } },
  current: { kind: "playlist", id: alpha, title: "Alpha" }, label: "Integrated destination",
  availability: { kind: "available" }, createSource, text, platform: "linux", onrequest() {}, onoutcome, onrelease }
}
async function stable() { await settle(); flushSync(); await settle(); flushSync() }
function sent(h: ReturnType<typeof bridgeHarness>) {
 return h.network.trace().filter(e => e.event === "sent").map(e => { check(e.event === "sent", "sent message"); return JSON.parse(e.text) })
}

test("rendered chooser gets actual cached rows before native completion and refresh preserves operation identity", async () => {
 const h=pendingLists(), backend=h.open(popup(),1), events: PickerEvent[]=[], sessions: ReturnType<typeof session>[]=[]
 const p=props(() => { const s=session(backend,{setup:"live",playlist:alpha},h.h.clock.wallNow);sessions.push(s);return s.source },release=>{release.picker.close();sessions[0]?.dispose()},e=>events.push(e))
 const view=render(PlaylistChooser,{props:p})
 try {
  await h.entered;await stable()
  const dialog=within(document.body).getByRole("dialog")
  expect(within(dialog).getByRole("checkbox",{name:"Beta"}).getAttribute("aria-checked")).toBe("false")
  expect(h.resolved).toBe(false)
  expect(h.h.runs("playlists").length).toBe(1)
  const opened=await sessions[0]!.operation.opened
  check(opened.kind==="answered"&&opened.result.kind==="open","actual opening")
  const identity=opened.result.operation
  const initialRefresh=sessions[0]!.operation.refresh();h.resolve();await initialRefresh;await stable()
  expect(within(dialog).getByRole("checkbox",{name:"Alpha refreshed"}).isConnected).toBe(true)
  expect(h.h.cacheWrites).toBe(1)
  await fireEvent.click(within(dialog).getByRole("button",{name:"Refresh playlists"}));await sessions[0]!.operation.refresh();await stable()
  expect(h.h.runs("playlists").length).toBe(2)
  expect(events).toContainEqual({kind:"refresh",outcome:{kind:"refreshed"}})
  const messages=sent(h).filter(m=>m.kind==="ui.playlists")
  expect(messages.filter(m=>m.payload.action==="open").map(m=>m.payload.operation)).toEqual([identity])
  expect(messages.filter(m=>m.payload.action==="refresh").map(m=>[m.payload.operation,m.payload.generation])).toEqual([[identity,1]])
  evidence.push({case:"rendered-progressive",operation:identity,requester:popup(),native:h.h.runs("playlists"),cacheWrites:h.h.cacheWrites,messages})
 } finally {view.unmount();await h.dispose()}
 expect(h.network.listening()).toBe(0);expect(h.counts().localListeners).toBe(0);expect(h.h.clock.pending).toBe(0)
})

test("rendered native refresh reports persistence failure separately from the confirmed native read", async () => {
 const h=pendingLists(), backend=h.open(popup(),1), s=session(backend,{setup:"live",playlist:alpha},h.h.clock.wallNow)
 const view=render(PlaylistChooser,{props:props(()=>s.source,r=>{r.picker.close();s.dispose()})})
 try {
  await h.entered;await stable();h.h.fault("rejected-unchanged")
  const observed=s.operation.refresh();h.resolve();const answer=await observed;await stable()
  check(answer.kind==="answered"&&answer.result.kind==="refreshed","real refresh result")
  const result=answer.result.refresh
  check(result.kind==="listed"||result.kind==="withheld","native success separate from persistence")
  expect(result.cache?.kind).toBe("failed")
  expect(h.h.runs("playlists").length).toBe(1)
  expect(h.h.cacheWrites).toBe(1)
  evidence.push({case:"native-cache-separation",answer,stored:h.h.stored()})
 } finally {view.unmount();await h.dispose()}
})

test("fixture chooser callback drives actual confirmed first-run destination route and canonical readback", async () => {
 const h=await startingBridge(),backend=h.open(popup(),1), selection=deferred<Awaited<ReturnType<FirstRunServices["chooser"]["choose"]>>>()
 const entered=deferred<void>(),events:PickerEvent[]=[],sessions:ReturnType<typeof session>[]=[]
 const firstText=createFirstRunText(i18n)
 const first=createFirstRunOwner(backend,{account:{async read(){return {kind:"account",key:a,account:{name:"Synthetic account"}}}},
  playlists:{async title(){return "Beta"}},chooser:{async choose(){entered.resolve();return selection.promise}},open(){}},
  {browser:"chrome",os:"linux"},firstText)
 const agreed=await first.agree({displayed:firstText.disclosure,attempt:1,selected:["quick-save"],syncOn:false,permissions:Promise.resolve({music:true,browserMenu:true})})
 expect(agreed).toEqual({kind:"agreed",attempt:1,applications:[{feature:"quick-save",state:"enabled"}]})
 h.store.foreign(records=>{records[`cache:${a}`]=consumerSeed().local[`cache:${a}`]!})
 const committed=first.choosePlaylist({feature:"quick-save",purpose:"quick-save"});await entered.promise
 const view=render(PlaylistChooser,{props:props(()=>{const s=session(backend,{setup:"none"},()=>1700000000000,async(id,on)=>{
  if(!on)return {refused:"invalid"};selection.resolve({kind:"chosen",destination:{kind:"quick-save"},playlist:id})
  const outcome=await committed;return outcome.kind==="confirmed"?{ok:true}:{refused:"invalid"}
 });sessions.push(s);return s.source},r=>{r.picker.close();sessions[0]?.dispose()},e=>events.push(e))})
 try {
  const opened=await sessions[0]!.operation.opened;expect(opened).toMatchObject({kind:"answered",result:{kind:"open"}})
  const fresh=await sessions[0]!.operation.refresh();process.stdout.write(JSON.stringify({case:"first-run-list-diagnostic",opened,fresh})+"\n");await stable()
  const row=within(document.body).getByRole("checkbox",{name:"Beta"})
  await fireEvent.click(row);await stable()
  expect(await committed).toEqual({kind:"confirmed",selection:{kind:"chosen",titles:["Beta"]}})
  const readback=await h.owner.readSetup(a)
  check(readback.kind==="value"&&readback.view.kind==="live","canonical owner readback")
  expect(readback.view.setup.quickSave).toBe(beta)
  const snapshot=await backend.load({acct:a})
  check(snapshot.kind==="snapshot"&&snapshot.setup.kind==="current","canonical backend snapshot")
  expect(snapshot.setup.value.quickSave).toBe(beta)
  const destinationMessages=h.network.trace().filter(event=>event.event==="sent").map(event=>{check(event.event==="sent","sent");return JSON.parse(event.text)}).filter(m=>m.kind==="ui.change"&&m.payload.change.kind==="setup-destination")
  expect(destinationMessages.length).toBe(1)
  expect(destinationMessages[0].payload.change).toEqual({kind:"setup-destination",acct:a,destination:{kind:"quick-save"},playlist:beta,expected:{setup:"none"}})
  expect(within(document.body).getByRole("dialog").isConnected).toBe(true)
  expect(events).toContainEqual({kind:"tick",id:beta,outcome:{kind:"picked",id:beta,save:null,undo:null,choice:{ok:true}}})
  const before=structuredClone(h.store.records())
  const stale=await backend.change({kind:"setup-destination",acct:a,destination:{kind:"quick-save"},playlist:alpha,expected:{setup:"live",playlist:alpha}})
  expect(stale).toEqual({kind:"refused",reason:"stale"});expect(h.store.records()).toEqual(before)
  const privateBackend=h.open(settings(22,true))
  const refused=await privateBackend.change({kind:"setup-destination",acct:a,destination:{kind:"quick-save"},playlist:alpha,expected:{setup:"live",playlist:beta}})
  expect(refused).toEqual({kind:"refused",reason:"unavailable"});expect(h.store.records()).toEqual(before)
  const ownerPrivate=await h.owner.changeSetupDestination({kind:"ui",windowId:2,incognito:true},{acct:a,destination:{kind:"quick-save"},playlist:alpha,expected:{setup:"live",playlist:beta}})
  expect(ownerPrivate).toEqual({kind:"result",result:{refused:"private"}});expect(h.store.records()).toEqual(before)
  evidence.push({case:"first-run-commit",readback,snapshot,destinationMessages,stale,privateWire:refused,privateOwner:ownerPrivate,privateReasonWireGap:true,stored:before})
 } finally {view.unmount();first.dispose();await h.dispose()}
 expect(h.stats().nativeListeners).toBe(0);expect(h.stats().deadlines).toBe(0)
})

test("two rendered containers dispose independently and reopen creates a fresh actual operation",async()=>{
 const h=bridgeHarness(),firstBackend=h.open(popup(1),1),secondBackend=h.open(popup(1),1)
 const first:ReturnType<typeof session>[]=[],second:ReturnType<typeof session>[]=[],releases:ChooserRelease[]=[]
 const p=props(()=>{const s=session(firstBackend,{setup:"live",playlist:alpha},h.h.clock.wallNow);first.push(s);return s.source},r=>{releases.push(r);r.picker.close();first.at(-1)?.dispose()})
 const one=render(PlaylistChooser,{props:p}),two=render(PlaylistChooser,{props:props(()=>{const s=session(secondBackend,{setup:"live",playlist:alpha},h.h.clock.wallNow);second.push(s);return s.source},r=>{r.picker.close();second[0]?.dispose()})})
 try {
  await stable();expect(first.length).toBe(1);expect(second.length).toBe(1)
  const old=await first[0]!.operation.opened;await second[0]!.operation.opened;await stable()
  await one.rerender({...p,open:false});await stable()
  expect(releases.length).toBe(1);expect(releases[0]!.picker.closed).toBe(true)
  expect((await second[0]!.operation.opened).kind).toBe("answered")
  await one.rerender({...p,open:true});await stable()
  expect(first.length).toBe(2)
  const next=await first[1]!.operation.opened
  check(old.kind==="answered"&&old.result.kind==="open"&&next.kind==="answered"&&next.result.kind==="open","fresh operations")
  expect(old.result.operation===next.result.operation).toBe(false)
  evidence.push({case:"independent-reopen",old:old.result.operation,next:next.result.operation,messages:sent(h)})
 } finally {one.unmount();two.unmount();await h.dispose()}
 expect(h.network.listening()).toBe(0);expect(h.counts().localListeners).toBe(0);expect(h.h.clock.pending).toBe(0)
})

test("rendered creation recovers a lost answer through actual status without another native write",async()=>{
 const h=bridgeHarness({delivery:"queued"}),backend=h.open(popup(),1),entered=deferred<void>()
 h.h.script(async(_tab,invocation)=>{if(invocation.job.kind==="create"){entered.resolve();return success({playlistId:created})}return success([{id:alpha,title:"Alpha"}])})
 const s=session(backend,{setup:"live",playlist:alpha},h.h.clock.wallNow),events:PickerEvent[]=[]
 const view=render(PlaylistChooser,{props:props(()=>s.source,r=>{r.picker.close();s.dispose()},e=>events.push(e))})
 try {
  await h.flush();await h.flush();await stable()
  await fireEvent.click(within(document.body).getByRole("button",{name:"New playlist"}));await stable()
  await fireEvent.input(within(document.body).getByRole("textbox",{name:"Title"}),{target:{value:"One synthetic write"}})
  await fireEvent.submit(within(document.body).getByRole("form",{name:"New playlist"}));await settle()
  const queued=h.network.queued().find(m=>JSON.parse(m.text).payload?.action==="submit")
  check(queued,"actual creation submission queued");queued.lose();await entered.promise;await stable()
  expect(h.h.runs("create").length).toBe(1)
  const known=s.creation.status();await h.flush();const answer=await known
  check(answer.kind==="answered"&&answer.result.kind==="created","same operation status is an actual receipt")
  expect(answer.result.id).toBe(created);expect(h.h.runs("create").length).toBe(1)
  const calls=sent(h).filter(m=>m.kind==="ui.create")
  expect(calls.filter(m=>m.payload.action==="submit").length).toBe(1)
  expect(calls.some(m=>m.payload.action==="status")).toBe(true)
  evidence.push({case:"rendered-lost-answer",answer,events,calls,native:h.h.runs("create"),stored:h.h.stored()})
 } finally {view.unmount();await h.flush();await h.dispose()}
 expect(h.network.listening()).toBe(0);expect(h.h.clock.pending).toBe(0)
 process.stdout.write(JSON.stringify({synthetic:true,real:["canonical owner","Tabs","Playlists","authenticated catalogue/router","RPC","localized BrowserBackend","progressive playlist operation","PickerModel","PlaylistChooser","PickerPanel"],syntheticCollaborators:["native tab IO","storage IO","transport delivery","geometry","fixture-owned chooser callback","unexercised pin and preferences"],evidence})+"\n")
})
