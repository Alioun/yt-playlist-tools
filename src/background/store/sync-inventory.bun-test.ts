import { expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, resolve } from "node:path"
// TypeScript 7's package has no compiler API, so this parser uses the TypeScript 6 alias.
import ts from "typescript6"
import { isAccountKey, isPlaylistId, type DocumentKey } from "../../shared/model"
import type { RawSyncItem, ReadSyncResult, SyncProjection, WireInvalid } from "./sync-codec"
import { readSyncInventory, type SyncInventoryDocument, type SyncInventoryResult } from "./sync-inventory"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Check<T extends true> = T
export type InventoryProofs = [
  Check<Equal<keyof typeof import("./sync-inventory"), "readSyncInventory">>,
  Check<Equal<typeof readSyncInventory, (input: { readonly items: readonly RawSyncItem[] }) => SyncInventoryResult>>,
  Check<Equal<SyncInventoryDocument, { readonly key: DocumentKey; readonly baseKey: string; readonly result: ReadSyncResult }>>,
  Check<
    Equal<
      SyncInventoryResult,
      | WireInvalid
      | {
          readonly kind: "read"
          readonly documents: readonly SyncInventoryDocument[]
          readonly occupancy: Exclude<SyncProjection, WireInvalid>
        }
    >
  >
]

const matrix = String.raw`(api => {
  let assertions = 0;
  const check = (ok, name) => { assertions++; if (!ok) throw Error(name); };
  const equal = (actual, expected, name) => check(JSON.stringify(actual) === JSON.stringify(expected), name);
  equal(Object.keys(api), ["readSyncInventory"], "only runtime export");
  const metadata = {v:1,id:"H",created:1,extension:{retained:true}};
  const oldPointer = {v:1,gen:"g0",at:10,by:"device-a",n:2};
  const oldChunks = [
    {key:"s:settings@g0.0",value:'{"v":1,"gen":"g0","at":10,"by":"device-a","data":'},
    {key:"s:settings@g0.1",value:'{"future":"retained"}}'}
  ];
  const rawOld = {v:1,gen:"g0",at:10,by:"device-a",data:{future:"retained"}};
  const replacement = {v:1,gen:"g1",at:20,by:"device-a",data:{future:"retained"}};
  const tombstone = {v:1,gen:"gone",at:30,by:"device-a",deleted:true};
  const snapshot = (base = oldPointer) => [{key:"s:meta",value:metadata},{key:"s:settings",value:base},...oldChunks];
  const read = (items, reader = api.readSyncInventory) => {
    const result = reader({items}); check(result.kind === "read", "readable inventory"); return result;
  };
  const document = (items, reader) => read(items, reader).documents[0].result;
  const complete = (result, raw, kind = "value") => {
    equal(result.kind, kind, "complete variant"); equal(result.json, raw, "exact raw envelope");
    if (kind === "value") {
      equal(result.value.kind, "settings", "settings variant");
      equal(result.value.document.data.future, "retained", "decoded additive data");
      equal(result.value.document.data.theme, "system", "codec defaults remain decoded only");
      check(!Object.hasOwn(result.json.data, "theme"), "raw data never normalized");
    } else equal(result.document, raw, "exact deleted document");
  };
  const baseline = read(snapshot());
  equal(baseline.documents.map(({key,baseKey})=>({key,baseKey})), [{key:{kind:"settings"},baseKey:"s:settings"}], "literal canonical settings");
  complete(baseline.documents[0].result, rawOld);
  equal(baseline.occupancy, {kind:"fits",usage:{bytes:261,items:4,perItem:[
    {key:"s:meta",bytes:68},{key:"s:settings",bytes:62},
    {key:"s:settings@g0.0",bytes:84},{key:"s:settings@g0.1",bytes:47}
  ]}}, "literal pointer physical byte charges");
  const replaced = read(snapshot(replacement));
  complete(replaced.documents[0].result, replacement);
  equal(replaced.occupancy, {kind:"fits",usage:{bytes:284,items:4,perItem:[
    {key:"s:meta",bytes:68},{key:"s:settings",bytes:85},
    {key:"s:settings@g0.0",bytes:84},{key:"s:settings@g0.1",bytes:47}
  ]}}, "literal replacement retains old chunk charges");
  equal(document(snapshot().slice(0,-1)), {kind:"incomplete",gen:"g0",expected:2,received:1}, "exact incomplete");
  equal(document(snapshot({...oldPointer,by:"device-b"})), {kind:"invalid",field:"chunks",reason:"stamp-mismatch"}, "mismatched author");
  const other = snapshot({...oldPointer,by:"device-b"}).map(item => typeof item.value === "string" ? {...item,value:item.value.replace("device-a","device-b")} : item);
  complete(document(other), {...rawOld,by:"device-b"});
  for (const at of [30,0]) complete(document(snapshot({...tombstone,at})), {...tombstone,at}, "deleted");
  const future = {...oldPointer,v:2,extension:{opaque:true}};
  equal(document(snapshot(future).map(item=>item.key.endsWith(".0") ? {...item,value:0} : item)), {kind:"newer-version",version:2,raw:future}, "opaque future pointer");
  const additive = {...replacement,extension:{toJSON:"inert",retained:true}};
  complete(document(snapshot(additive)), additive);
  const orphanCase = reader => {
    const result = read([{key:"s:meta",value:metadata},...oldChunks],reader);
    equal(result.documents, [], "orphan chunks never invent bases"); equal(result.occupancy.usage.items,3,"orphan occupancy");
  };
  orphanCase(api.readSyncInventory);
  const nullCase = reader => {
    const result = read(snapshot(null),reader);
    equal(result.documents,[{key:{kind:"settings"},baseKey:"s:settings",result:{kind:"absent"}}],"present null remains observed");
    equal(result.occupancy.usage.items,4,"null occupancy");
  };
  nullCase(api.readSyncInventory);
  equal(api.readSyncInventory({items:[]}), {kind:"read",documents:[],occupancy:{kind:"fits",usage:{bytes:0,items:0,perItem:[]}}}, "empty physical snapshot");
  for (const meta of [null,{bad:true},{v:2,id:"H",created:1},{...metadata,reset:true},{...metadata,id:"other"}]) {
    const items = snapshot(replacement).map(item=>item.key === "s:meta" ? {...item,value:meta} : item);
    items.push({key:"s:new-document",value:{unknown:true}});
    const result = read(items); complete(result.documents[0].result,replacement); equal(result.occupancy.usage.items,5,"metadata is occupancy only");
  }
  const history={joined:"H",pushed:{"doc:settings":"g0"},status:"ok",editedSinceOff:false,extension:{retained:true}};
  const withHistory=read([...snapshot(replacement),{key:"sync",value:history}]);
  complete(withHistory.documents[0].result,replacement);
  equal(withHistory.occupancy.usage.items,5,"history-shaped unknown data is only occupancy");
  const acct="AAAAAAAAAAAAAAAA", playlist="PL_P";
  const setup="s:setup:"+acct, filter="s:filter:"+acct+":"+playlist;
  const setupRaw={v:1,gen:"setup",at:1,by:"b",data:{}};
  const filterRaw={v:1,gen:"filter",at:1,by:"b",data:{on:true,mode:"deny",channels:[]}};
  const unordered=[{key:filter,value:filterRaw},{key:"s:settings@stray.0",value:"stray"},
    {key:setup,value:setupRaw},{key:"s:settings",value:replacement},
    ...["s:settings:","s:settings@x.0","s:setup:"+acct+":","s:setup:short","s:filter:"+acct+":P","s:filter:"+acct+":PL_P:","doc:settings","x:s:settings","s:meta","s:unknown"].map(key=>({key,value:0}))];
  const named=read(unordered);
  equal(named.documents.map(({key,baseKey})=>({key,baseKey})),[
    {key:{kind:"filter",acct,playlist},baseKey:filter},{key:{kind:"setup",acct},baseKey:setup},
    {key:{kind:"settings"},baseKey:"s:settings"}
  ], "exact canonical bases in input order");
  equal(named.documents[0].result,{kind:"value",value:{kind:"filter",document:filterRaw},json:filterRaw},"filter result");
  equal(named.documents[1].result,{kind:"value",value:{kind:"setup",document:{...setupRaw,data:{label:null,autoAdd:[],targets:{},quickSave:null,musicSave:null,gather:null,marks:{}}}},json:setupRaw},"setup result without local selection");
  const invalidCase = reader => {
    const result=read([{key:"s:settings",value:{}},{key:filter,value:filterRaw}],reader);
    equal(result.documents.map(d=>d.result.kind),["invalid","value"],"bad known document does not hide another");
    equal(result.documents[0].result,{kind:"invalid",field:"document",reason:"shape"},"exact semantic invalid");
  };
  invalidCase(api.readSyncInventory);
  const weird="g@part.1.é🙂";
  const weirdItems=[{key:"s:settings",value:{v:1,gen:weird,at:10,by:"device-a",n:2}},
    {key:"s:settings@"+weird+".1",value:'{"future":"retained"}}'},
    {key:"s:settings@"+weird+".0",value:'{"v":1,"gen":"g@part.1.é🙂","at":10,"by":"device-a","data":'}];
  complete(document(weirdItems),{...rawOld,gen:weird});
  for(const index of ["01","-1","2","9007199254740992",""]) {
    equal(document([...snapshot(),{key:"s:settings@g0."+index,value:"x"}]),{kind:"invalid",field:"chunks",reason:"chunk-index"},"malformed chunk index "+index);
  }
  complete(document([...snapshot(),{key:"s:settings@g0.1.0",value:"unrelated generation"}]),rawOld);
  for(const value of [0,""]) equal(document([...snapshot().slice(0,-1),{key:"s:settings@g0.1",value}]),{kind:"invalid",field:"chunks",reason:"shape"},"invalid chunk value");
  equal(document([...snapshot().slice(0,-1),{key:"s:settings@g0.1",value:"bad"}]),{kind:"invalid",field:"chunks",reason:"json"},"invalid assembled JSON");
  for(const duplicate of [oldChunks[0],{key:"unknown",value:0},{key:"s:settings",value:replacement}]) {
    const items=duplicate.key==="unknown" ? [...snapshot(),duplicate,duplicate] : [...snapshot(),duplicate];
    equal(api.readSyncInventory({items}),{kind:"invalid",field:"items",reason:"duplicate-key"},"physical duplicate invalidates inventory");
  }
  let hooks=0;
  const getter=Object.defineProperty({},"bad",{enumerable:true,get(){hooks++;throw Error("getter");}});
  const hidden=Object.defineProperty({},"bad",{value:1});
  const cycle={};cycle.self=cycle;
  for(const value of [getter,hidden,undefined,NaN,()=>{hooks++;},[,,],cycle,{toJSON(){hooks++;}}]) {
    equal(api.readSyncInventory({items:[...snapshot(),{key:"unknown",value}]}),{kind:"invalid",field:"items",reason:"json"},"physical JSON boundary");
  }
  equal(hooks,0,"no accessor or serialization hook call");
  const own=JSON.parse('{"v":1,"gen":"g1","at":20,"by":"device-a","data":{"future":"retained","__proto__":{"safe":true},"toJSON":"inert"},"__proto__":{"retained":true},"toJSON":"inert"}');
  const ownResult=document(snapshot(own)); complete(ownResult,own);
  check(Object.hasOwn(ownResult.json,"__proto__") && Object.hasOwn(ownResult.json.data,"__proto__"),"own proto data retained");
  check(ownResult.json===own,"raw identity retained");
  let inheritedReads=0,hooked;
  Object.defineProperty(Object.prototype,"toJSON",{configurable:true,get(){inheritedReads++;throw Error("inherited serialization hook");}});
  try { hooked=api.readSyncInventory({items:snapshot(replacement)}); }
  finally { delete Object.prototype.toJSON; }
  equal(inheritedReads,0,"inherited serialization hook never read");
  complete(hooked.documents[0].result,replacement);
  const fullCase = reader => {
    const result=read([...snapshot(replacement),...Array.from({length:477},(_,i)=>({key:"unknown:"+i,value:0}))],reader);
    equal(result.occupancy.kind,"full","over-budget inventory remains readable");
    equal(result.occupancy.usage.items,481,"all 481 physical keys counted");
    equal(result.occupancy.exceeded,["items"],"exact exceeded item bound");
    complete(result.documents[0].result,replacement);
  };
  fullCase(api.readSyncInventory);
  for(const size of [8190,99000]) {
    const result=read([...snapshot(replacement),{key:"unknown",value:"x".repeat(size)}]);
    equal(result.occupancy.exceeded,size===8190 ? ["item-bytes"] : ["bytes","item-bytes"],"other full variants retained");
    complete(result.documents[0].result,replacement);
  }
  const freeze=value=>{if(value && typeof value==="object"){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
  const frozen=freeze(snapshot(own));const before=JSON.stringify(frozen);
  equal(api.readSyncInventory({items:frozen}),api.readSyncInventory({items:frozen}),"repeat has no retained cache");
  equal(JSON.stringify(frozen),before,"frozen input unchanged");
  const stale=snapshot(replacement);const first=api.readSyncInventory({items:stale});
  stale[0]={key:"s:meta",value:{...metadata,id:"new-history"}};
  stale[1]={key:"s:settings",value:tombstone};
  complete(document(stale),tombstone,"deleted"); complete(first.documents[0].result,replacement);
  let controls=0;const caught=[];
  const reject=(name,probe,wrong,expected)=>{let message;try{probe(input=>wrong(api.readSyncInventory(input)));}catch(error){message=error.message;}equal(message,expected,"reject wrong alternative "+name);caught.push({name,message});controls++;};
  reject("orphan synthesis",orphanCase,r=>({...r,documents:[{key:{kind:"settings"},baseKey:"s:settings",result:{kind:"absent"}}]}),"orphan chunks never invent bases");
  reject("null omission",nullCase,r=>({...r,documents:[]}),"present null remains observed");
  reject("semantic invalid hides others",invalidCase,r=>({...r,documents:r.documents.slice(0,1)}),"bad known document does not hide another");
  reject("old chunks earn capacity",fullCase,r=>({...r,occupancy:{kind:"fits",usage:{...r.occupancy.usage,items:479}}}),"over-budget inventory remains readable");
  return {assertions,controls,caught};
})`

const guards = String.raw`
  const forbidden=["Date","performance","crypto","process","Bun","Deno","browser","chrome","window","document","navigator","indexedDB","localStorage","sessionStorage","fetch","XMLHttpRequest","setTimeout","setInterval","queueMicrotask"];
  for(const name of forbidden) Object.defineProperty(globalThis,name,{configurable:true,get(){throw Error("ambient read "+name);}});
  Math.random=()=>{throw Error("random");};
`

async function sourceProgram(): Promise<string> {
  const modules: Record<string, string> = {}
  const links: Record<string, Record<string, string>> = {}
  const entry = resolve(import.meta.dir, "sync-inventory.ts")
  async function visit(file: string): Promise<void> {
    if (Object.hasOwn(modules, file)) return
    const source = await readFile(file, "utf8")
    modules[file] = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.CommonJS } }).outputText
    const imports: Record<string, string> = {}
    links[file] = imports
    for (const imported of new Bun.Transpiler({ loader: "ts" }).scanImports(source)) {
      if (!imported.path.startsWith(".")) throw Error(`Nonlocal pure import ${imported.path}`)
      const base = resolve(dirname(file), imported.path)
      const target = (await Bun.file(`${base}.ts`).exists()) ? `${base}.ts` : resolve(base, "index.ts")
      imports[imported.path] = target
      await visit(target)
    }
  }
  await visit(entry)
  return `const modules=${JSON.stringify(modules)},links=${JSON.stringify(links)},cache={};
    function load(file){if(cache[file])return cache[file].exports;const module={exports:{}};cache[file]=module;
      new Function("module","exports","require",modules[file])(module,module.exports,name=>load(links[file][name]));return module.exports;}
    const api=load(${JSON.stringify(entry)});`
}

function nodeVM(script: string): { assertions: number; controls: number; caught: unknown[] } {
  return JSON.parse(
    execFileSync(
      "node",
      [
        "--input-type=module",
        "-e",
        'import {readFileSync} from "node:fs";import {runInNewContext} from "node:vm";console.log(JSON.stringify(runInNewContext(readFileSync(0,"utf8"),{}, {timeout:30000})));'
      ],
      { input: script, encoding: "utf8", timeout: 35000 }
    )
  )
}

test("exact public source API accepts validated synthetic canonical IDs", () => {
  const acct = "AAAAAAAAAAAAAAAA",
    playlist = "PL_P"
  if (!isAccountKey(acct) || !isPlaylistId(playlist)) throw Error("Invalid synthetic brands")
  const result = readSyncInventory({ items: [{ key: `s:filter:${acct}:${playlist}`, value: null }] })
  expect(result).toEqual({
    kind: "read",
    documents: [{ key: { kind: "filter", acct, playlist }, baseKey: `s:filter:${acct}:${playlist}`, result: { kind: "absent" } }],
    occupancy: { kind: "fits", usage: { bytes: 38, items: 1, perItem: [{ key: `s:filter:${acct}:${playlist}`, bytes: 38 }] } }
  })
})

test("literal matrix executes source and saved minified browser bytes in fresh Node VMs", async () => {
  const folder = await mkdtemp(resolve(tmpdir(), "sync-inventory-"))
  try {
    const build = await Bun.build({ entrypoints: [resolve(import.meta.dir, "sync-inventory.ts")], target: "browser", format: "cjs", minify: true })
    expect(build.success).toBe(true)
    expect(build.outputs).toHaveLength(1)
    const saved = resolve(folder, "browser.cjs")
    await writeFile(saved, await build.outputs[0]!.arrayBuffer().then(bytes => new Uint8Array(bytes)))
    const artifact = await readFile(saved, "utf8")
    const source = guards + (await sourceProgram()) + `(${matrix})(api)`
    const emitted = guards + `const module={exports:{}};${artifact};(${matrix})(module.exports)`
    const sourceResult = nodeVM(source)
    const emittedResult = nodeVM(emitted)
    expect(sourceResult.assertions).toBeGreaterThan(150)
    expect(sourceResult.controls).toBe(4)
    expect(emittedResult).toEqual(sourceResult)
    expect(nodeVM(emitted)).toEqual(emittedResult)
    console.log(JSON.stringify({ source: sourceResult, emitted: emittedResult }))
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
})
