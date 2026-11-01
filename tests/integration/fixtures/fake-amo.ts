/**
 * A local AMO for the reviewer-notes tests. The script's own fetch reaches it
 * over a real socket, so Bun's redirect, timeout, TLS and logging behaviour is
 * what runs. It records each request and answers as its mode says. Its
 * answers quote the request, the worst AMO could do.
 */
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { createServer as createHttpsServer } from "node:https"
import type { AddressInfo, Socket } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"

export type AmoRequest = { method: string; path: string; authorization?: string; contentType?: string; body: string }

export type Mode =
  | "store" // echoes the notes it stored
  | "store-silently" // stores them and says nothing of them
  | "garble" // 200 with a cut-off body that quotes the notes
  | "keep-other" // answers with other notes
  | "reject" // 400 quoting the notes
  | "reset" // drops the connection once it has the request
  | "hang" // never answers
  | "redirect" // 308 to another local server, which records what reaches it

export type FakeAmo = {
  /** What the test puts in place of https://addons.mozilla.org. */
  origin: string
  requests: AmoRequest[]
  /** What reached the server the redirect points to. */
  redirected: AmoRequest[]
  close(): Promise<void>
}

export type Certificate = { key: string; cert: string; certPath: string; remove(): void }

/** A throwaway self-signed certificate for 127.0.0.1, which nothing trusts. */
export function untrustedCertificate(): Certificate {
  const dir = mkdtempSync(join(tmpdir(), "fake-amo-tls-"))
  const keyPath = join(dir, "key.pem")
  const certPath = join(dir, "cert.pem")
  const made = spawnSync("openssl", [
    "req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256", "-nodes", "-days", "1",
    "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1", "-keyout", keyPath, "-out", certPath
  ], { encoding: "utf8" })
  if (made.status !== 0) throw new Error(`openssl could not make a test certificate: ${made.stderr}`)
  return {
    key: readFileSync(keyPath, "utf8"),
    cert: readFileSync(certPath, "utf8"),
    certPath,
    remove: () => rmSync(dir, { recursive: true, force: true })
  }
}

type Answer = (request: AmoRequest, response: ServerResponse) => void

function recording(into: AmoRequest[], answer: Answer) {
  return (incoming: IncomingMessage, response: ServerResponse) => {
    let body = ""
    incoming.setEncoding("utf8")
    incoming.on("data", (chunk: string) => (body += chunk))
    incoming.on("end", () => {
      const request: AmoRequest = {
        method: incoming.method ?? "",
        path: incoming.url ?? "",
        authorization: incoming.headers.authorization,
        contentType: incoming.headers["content-type"],
        body
      }
      into.push(request)
      answer(request, response)
    })
  }
}

async function listen(server: Server, scheme: "http" | "https"): Promise<{ origin: string; close(): Promise<void> }> {
  const sockets = new Set<Socket>()
  server.on("connection", (socket: Socket) => {
    sockets.add(socket)
    socket.on("close", () => sockets.delete(socket))
  })
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo
  return {
    origin: `${scheme}://127.0.0.1:${port}`,
    close: () => {
      for (const socket of sockets) socket.destroy()
      return new Promise<void>(resolve => server.close(() => resolve()))
    }
  }
}

function sentNotes(body: string): unknown {
  try {
    return JSON.parse(body).approval_notes
  } catch {
    return body
  }
}

function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { "content-type": "application/json" })
  response.end(JSON.stringify(value))
}

/** A fake AMO over HTTP, or over HTTPS with `tls`. */
export async function startFakeAmo(mode: Mode, tls?: Pick<Certificate, "key" | "cert">): Promise<FakeAmo> {
  const requests: AmoRequest[] = []
  const redirected: AmoRequest[] = []
  const elsewhere = await listen(
    createHttpServer(recording(redirected, (request, response) => json(response, 200, { id: 1, approval_notes: sentNotes(request.body) }))),
    "http"
  )

  const answer: Answer = (request, response) => {
    const sent = sentNotes(request.body)
    switch (mode) {
      case "store": return json(response, 200, { id: 1, approval_notes: sent })
      case "store-silently": return json(response, 200, { id: 1 })
      case "garble":
        response.writeHead(200, { "content-type": "application/json" })
        return response.end(`{"approval_notes": ${JSON.stringify(sent)}`)
      case "keep-other": return json(response, 200, { id: 1, approval_notes: "Older notes." })
      case "reject": return json(response, 400, { approval_notes: [`Not accepted: ${String(sent)}`] })
      case "reset": return response.socket?.destroy()
      case "hang": return
      case "redirect":
        response.writeHead(308, { location: `${elsewhere.origin}${request.path}` })
        return response.end()
    }
  }
  const handler = recording(requests, answer)
  const amo = tls ? await listen(createHttpsServer(tls, handler), "https") : await listen(createHttpServer(handler), "http")

  return {
    origin: amo.origin,
    requests,
    redirected,
    close: async () => {
      await Promise.all([amo.close(), elsewhere.close()])
    }
  }
}
