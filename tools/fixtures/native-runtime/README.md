# Native runtime fixture

This command drives the background runtime adapter (`src/background/adapters/runtime.ts`) and the real `shared/rpc` core over the prepared `fakeBrowser` runtime. A tab endpoint and a UI endpoint each listen through `runtimeTransport(fakeBrowser.runtime)` and authenticate through the real `resolveSenderOrigin`. A legacy-style `{ action }` listener shares the bus. The fake's own `sendMessage` always supplies the sender `{}`, so each caller here routes its envelope through `fakeBrowser.runtime.onMessage.trigger` with a native-shaped sender built from fake windows and tabs. That routing copies the fake's true-gated reply rule.

```sh
bun --no-env-file --no-install tools/fixtures/native-runtime/run.ts
```

Tab and window IDs are printed as names (`www-tab`, `normal`, `private`), so the output does not depend on the fake's ID allocation. The contract requires exactly these 14 lines, in this order:

```jsonl
{"call":"www tab claims music","claims":[[true,false,false]],"outcome":{"kind":"answered","result":{"site":"www","tabId":"www-tab","windowId":"normal","incognito":false}}}
{"call":"private music tab","claims":[[true,false,false]],"outcome":{"kind":"answered","result":{"site":"music","tabId":"music-tab","windowId":"private","incognito":true}}}
{"call":"www subframe","claims":[[true,false,false]],"outcome":{"kind":"failed","failure":"invalid-answer"}}
{"call":"popup sends a tab call","claims":[[true,false,false]],"outcome":{"kind":"failed","failure":"invalid-answer"}}
{"call":"private first-run page claims the normal window","claims":[[false,true,false]],"outcome":{"kind":"answered","result":{"page":"onboarding","windowId":"private","incognito":true}}}
{"call":"popup in the private window","claims":[[false,true,false]],"outcome":{"kind":"answered","result":{"page":"popup","windowId":"private","incognito":true}}}
{"call":"popup claims an unknown window","claims":[[false,true,false]],"outcome":{"kind":"failed","failure":"invalid-answer"}}
{"call":"www tab sends a UI call","claims":[[false,true,false]],"outcome":{"kind":"failed","failure":"invalid-answer"}}
{"call":"settings claims the private window","claims":[[false,true,false]],"outcome":{"kind":"answered","result":{"page":"settings","windowId":"normal","incognito":false}}}
{"call":"legacy action","claims":[[false,false,true]],"outcome":{"legacy":"fixture.legacy"}}
{"call":"sender-less fake delivery","claims":[],"outcome":{"kind":"failed","failure":"invalid-answer"}}
{"tabTarget":{"sent":[{"tabId":"www-tab","message":{"v":1,"build":"fixture-build","id":"1","kind":"fixture.ping","payload":null},"options":{"frameId":0}}],"answered":null,"rejected":"rejected","keys":["send"]}}
{"qualifiedCaller":{"sent":[{"tabId":"www-tab","message":{"v":1,"build":"fixture-build","id":"1","kind":"fixture.hello","payload":{"site":"music"}},"options":{"frameId":0}}],"claims":[[true,false,false]],"outcome":{"kind":"answered","result":{"site":"www","tabId":"www-tab","windowId":"normal","incognito":false}},"afterDisposal":{"kind":"failed","failure":"disposed"},"targetKeys":["send"],"callerKeys":["call","dispose"]}}
{"handled":["hello www","hello music","window onboarding","window popup","window settings","hello www"],"afterDisposal":{"kind":"failed","failure":"transport"},"listening":false,"unhandledRejections":[]}
```

Each `claims` entry is the literal value each listener returned, in registration order: tab endpoint, UI endpoint, legacy listener. Only literal `true` claims a message. The body's `site` and window ID never change the native answer. A rejected sender is claimed and then answered with `undefined`, which the caller reads as `invalid-answer` straight away. The tab target sends only through the scripted `tabs.sendMessage` port with `{ frameId: 0 }` and has no listener. After both endpoints are disposed and the legacy listener is removed, nothing listens and a call fails with `transport`.

The qualified caller uses `createRpcCaller(tabTarget(...))`. Its serialized envelope, top-frame option, native authentication result and disposed failure are included above. Qualification compares two complete executions against these lines through EOF. Fake senders are synthetic, native-shaped claims. They do not prove native sender provenance, Chrome or Firefox listener semantics, or service-worker lifetime.
