/**
 * Preloaded into amo-reviewer-notes.ts by the tests: replaces fetch with a
 * fake AMO that records each request to FAKE_AMO_LOG and answers as
 * FAKE_AMO_MODE says. Its failures quote the request, the worst AMO could do.
 */
import { appendFileSync } from "node:fs"

const mode = process.env.FAKE_AMO_MODE ?? "store"

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init)
  const body = await request.text()
  appendFileSync(process.env.FAKE_AMO_LOG!, JSON.stringify({
    method: request.method,
    url: request.url,
    authorization: request.headers.get("authorization"),
    contentType: request.headers.get("content-type"),
    body
  }) + "\n")
  const sent: unknown = JSON.parse(body).approval_notes
  switch (mode) {
    case "store": return Response.json({ id: 1, approval_notes: sent })
    case "store-silently": return Response.json({ id: 1 })
    case "garble": return new Response(`{"approval_notes": ${JSON.stringify(sent)}`, { headers: { "content-type": "application/json" } })
    case "keep-other": return Response.json({ id: 1, approval_notes: "Older notes." })
    case "reject": return Response.json({ approval_notes: [`Not accepted: ${sent}`] }, { status: 400 })
    case "unreachable": throw new Error(`connection reset while sending ${body}`)
    case "explode": return { ok: true, status: 200, json() { throw new Error(`unexpected answer to ${body}`) } }
  }
  throw new Error(`fake AMO has no mode ${mode}`)
}) as typeof fetch
