// Preload 1 of 3. Puts happy-dom's window, document, etc. on globalThis.
// It must run before anything imports @testing-library/*, which reads
// `document` at import time (see Bun's Testing Library guide).
//
// @happy-dom/global-registrator is not a project dependency; the spike adds it
// with `bun add -d @happy-dom/global-registrator@20.14.5` and does not commit
// that. The ts-ignore keeps `bun run compile` green without it.
// @ts-ignore
import { GlobalRegistrator } from "@happy-dom/global-registrator"

GlobalRegistrator.register({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" })
