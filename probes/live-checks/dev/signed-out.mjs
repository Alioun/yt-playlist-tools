// Signed-out check of the probe's shared library against live YouTube.
// Run: node probes/live-checks/dev/signed-out.mjs
//
// It loads lib.js the way the page does (one global), reads ytcfg from the
// real watch and YouTube Music pages, then sends the requests the probe sends
// with FAKE cookies. Signed out, every one must read as signed out, and the
// report scrubber must remove every fake secret. Nothing here signs in.
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import vm from "node:vm"

const libPath = new URL("../lib.js", import.meta.url)
vm.runInThisContext(readFileSync(libPath, "utf8"), { filename: "lib.js" })
const L = globalThis.__ytptProbeLib

let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? `  ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`)
  if (!ok) failures++
}

// ---------- ytcfg from the live pages ----------

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
const balanced = (text, start) => {
  let depth = 0
  let inStr = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inStr) {
      if (c === "\\") i++
      else if (c === '"') inStr = false
    } else if (c === '"') inStr = true
    else if (c === "{") depth++
    else if (c === "}" && --depth === 0) return text.slice(start, i + 1)
  }
  return null
}
const ytcfgOf = async (url) => {
  const html = await (await fetch(url, { headers: { Cookie: "SOCS=CAI", "User-Agent": UA } })).text()
  const data = {}
  let i = -1
  while ((i = html.indexOf("ytcfg.set({", i + 1)) !== -1) {
    const obj = balanced(html, i + "ytcfg.set(".length)
    try {
      Object.assign(data, JSON.parse(obj))
    } catch {}
  }
  return data
}

const FAKE = {
  SAPISID: "fakeSapisidValue123/AbCdEfGhIjKlMn",
  P1: "fake1PapisidValue456/OpQrStUvWx",
  P3: "fake3PapisidValue789/YzAbCdEfGh",
  USID: "123456789012345678901",
  DSID: "123456789012345678901||"
}
const cookies = `SAPISID=${FAKE.SAPISID}; __Secure-1PAPISID=${FAKE.P1}; __Secure-3PAPISID=${FAKE.P3}; SOCS=CAI`

for (const [host, page] of [
  ["www.youtube.com", "https://www.youtube.com/watch?v=jNQXAC9IVRw"],
  ["music.youtube.com", "https://music.youtube.com/"]
]) {
  const origin = `https://${host}`
  const data = await ytcfgOf(page)
  const get = L.ytcfgGetter({ ytcfg: { data_: data } })
  check(`${host}: ytcfg read`, Boolean(get("INNERTUBE_CLIENT_VERSION")), `${get("INNERTUBE_CLIENT_NAME")} ${get("INNERTUBE_CLIENT_VERSION")}, LOGGED_IN ${get("LOGGED_IN")}, DATASYNC_ID form ${/^V[0-9a-f]+\|\|$/.test(get("DATASYNC_ID")) ? "visitor" : "?"}`)
  const cfg = { ...L.clientConfig(get, origin, cookies), userSessionId: FAKE.USID }
  const fetchImpl = (url, init) => fetch(url, { ...init, headers: { ...init.headers, Origin: origin, Cookie: cookies, "User-Agent": UA } })
  const it = (path, body, opts = {}) => L.innertube(cfg, path, body, { ...opts, fetchImpl })

  // The auth header is YouTube's / yt-dlp's construction.
  const ts = 1760000000
  const header = await L.authHeader({ cookies, origin, userSessionId: FAKE.USID, ts })
  const expect = (scheme, sid) => `${scheme} ${ts}_${createHash("sha1").update(`${FAKE.USID} ${ts} ${sid} ${origin}`).digest("hex")}_u`
  check(`${host}: three-part auth header`, header === [expect("SAPISIDHASH", FAKE.SAPISID), expect("SAPISID1PHASH", FAKE.P1), expect("SAPISID3PHASH", FAKE.P3)].join(" "), L.authStructure(header))
  const single = await L.authHeader({ cookies, origin, userSessionId: FAKE.USID, ts, mode: "single" })
  check(`${host}: single-hash form`, single === `SAPISIDHASH ${ts}_${createHash("sha1").update(`${ts} ${FAKE.SAPISID} ${origin}`).digest("hex")}`, L.authStructure(single))

  // Requests the probe sends, signed out with fake cookies.
  const marker = `${L.nonce()}-devcheck`
  const url = host === "music.youtube.com" ? `https://music.youtube.com/channel/UCBR8-60-B28hp2BmDPdntcQ?ytptprobe=${marker}` : `https://www.youtube.com/@YouTube?ytptprobe=${marker}`
  const resolve = L.summarize(await it("navigation/resolve_url", { url }), get("DATASYNC_ID"))
  check(`${host}: resolve_url with marker answers, reads as signed out`, resolve.status === 200 && !L.signedIn(resolve), resolve)
  const bare = L.summarize(await it("navigation/resolve_url", { url }, { auth: "none" }), get("DATASYNC_ID"))
  check(`${host}: cookies-only resolve_url reads as signed out`, bare.status === 200 && !L.signedIn(bare), bare)
  const gap = await it("playlist/get_add_to_playlist", { videoIds: [L.TEST_VIDEO], excludeWatchLater: false })
  check(`${host}: get_add_to_playlist signed out is 401`, gap.status === 401, L.summarize(gap))
  check(`${host}: analyzer copes with an error body`, L.analyzeAddToPlaylist(gap.json).shape === "neither")
  for (const [label, opts] of [["B other origin", { hashOrigin: "https://example.com", xOrigin: "https://example.com" }], ["D no X-Origin", { xOrigin: null }], ["F single", { auth: "single" }]]) {
    const r = await it("playlist/get_add_to_playlist", { videoIds: [L.TEST_VIDEO], excludeWatchLater: false }, opts)
    check(`${host}: hash variant ${label} sends and fails cleanly`, r.status === 401 && r.sent.headerNames.includes("Content-Type"), { status: r.status, sent: r.sent })
  }
  const menu = await it("account/account_menu", {})
  check(`${host}: account_menu signed out has no active-account header`, menu.status === 200 && !L.findKey(menu.json, "activeAccountHeaderRenderer").length, L.summarize(menu))
  const create = await it("playlist/create", { title: L.PLAYLIST_TITLE, privacyStatus: "PRIVATE" })
  check(`${host}: create signed out is refused`, create.status === 401 && !create.json?.playlistId, L.summarize(create))
  const edit = await it("browse/edit_playlist", { playlistId: "PLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", actions: [{ action: "ACTION_ADD_VIDEO", addedVideoId: L.TEST_VIDEO }] })
  check(`${host}: edit_playlist signed out does not succeed`, L.summarize(edit).bodyStatus !== "STATUS_SUCCEEDED", L.summarize(edit))
  const del = await it("playlist/delete", { playlistId: "PLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" })
  check(`${host}: delete signed out is 401`, del.status === 401)
  if (host === "music.youtube.com") {
    const q = await it("music/get_queue", { playlistId: "PLw-VjHDlEOgvIaXEz6xErW8uo2gqg5xmx" })
    check("music: get_queue for the 500-song fallback playlist", q.status === 200 && Array.isArray(q.json?.queueDatas), `${q.json?.queueDatas?.length} songs returned`)
  }

  // Redaction: secrets never survive the scrubber, shapes carry no content.
  const evidence = { header, cookies, dsid: FAKE.DSID, usid: FAKE.USID, menuShape: L.shape(menu.json), fixture: L.fixture(resolve), note: `${FAKE.SAPISID} inside text` }
  const text = L.scrub(JSON.stringify(evidence), [FAKE.SAPISID, FAKE.P1, FAKE.P3, FAKE.DSID, ...FAKE.DSID.split("||"), FAKE.USID, "SOCS=CAI".slice(5)])
  const leaks = [FAKE.SAPISID, FAKE.P1, FAKE.P3, FAKE.USID].filter((s) => text.includes(s))
  check(`${host}: scrubber removes every fake secret and hash`, !leaks.length && !/[0-9a-f]{40}/.test(text), leaks)
}

// ---------- readers on synthetic signed-in shapes ----------

const oldShape = {
  contents: [
    {
      addToPlaylistRenderer: {
        playlists: [
          { playlistAddToOptionRenderer: { playlistId: "WL", title: { simpleText: "Watch later" }, privacy: "PRIVATE", containsSelectedVideos: "NONE", addToPlaylistServiceEndpoint: { playlistEditEndpoint: { playlistId: "WL", actions: [{ action: "ACTION_ADD_VIDEO", addedVideoId: "jNQXAC9IVRw" }] } }, removeFromPlaylistServiceEndpoint: { playlistEditEndpoint: { playlistId: "WL", actions: [{ action: "ACTION_REMOVE_VIDEO_BY_VIDEO_ID", removedVideoId: "jNQXAC9IVRw" }] } } } },
          { playlistAddToOptionRenderer: { playlistId: "PLaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", title: { runs: [{ text: "ytpt probe – safe to delete" }] }, privacy: "PRIVATE", containsSelectedVideos: "ALL" } }
        ]
      }
    }
  ]
}
const newShape = {
  contents: [{ toggleableListItemViewModel: { entitySelectorType: "TOGGLEABLE_LIST_ITEM_ENTITY_SELECTOR_TYPE_SAVE_TO_PLAYLIST_LIST_ENTITY", listItemViewModel: { title: { content: "My songs" } }, onToggle: { innertubeCommand: { playlistEditEndpoint: { playlistId: "PLbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", actions: [{ action: "ACTION_ADD_VIDEO", addedVideoId: "x" }] } } } } }],
  frameworkUpdates: { entityBatchUpdate: { mutations: [{ payload: { saveToPlaylistListEntity: { playlistIds: ["PLbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"] } } }] } }
}
const a = L.analyzeAddToPlaylist(oldShape, { collaborativeId: "PLaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })
check("old shape detected, WL found, privacy read", a.shape === "addToPlaylistRenderer" && a.oldShape.watchLater.present && a.oldShape.privacyValues[0] === "PRIVATE" && a.userCollaborativePlaylistListed)
check("old shape: no titles in the analysis", !JSON.stringify(L.publicView(a)).includes("Watch later") && !JSON.stringify(L.publicView(a)).includes("ytpt probe"))
const b = L.analyzeAddToPlaylist(newShape)
check("new shape detected", b.shape === "toggleableListItemViewModel" && b.newShape.entityCount === 1)
check("membership in both shapes", L.membershipOf(oldShape, "PLaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa") === "ALL" && L.membershipOf(newShape, "PLbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb") === "ALL" && L.membershipOf(oldShape, "PLnope") === "<not listed>")
check("leftover probe playlists found by title prefix", L.probeLeftovers(oldShape).length === 1)
const sd = L.saveDialogCommands(oldShape)
check("Save-dialog untick command read without clicking", sd.oldShape.untick.some((u) => u?.actions?.[0]?.action === "ACTION_REMOVE_VIDEO_BY_VIDEO_ID"), sd.oldShape.untick)
check("title length is a number", L.titleLength(oldShape, "PLaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa") === "ytpt probe – safe to delete".length)
const page = { contents: [{ playlistVideoRenderer: { videoId: "jNQXAC9IVRw", setVideoId: "S1", menu: { a: { playlistEditEndpoint: { actions: [{ setVideoId: "S1" }] } } } } }, { playlistVideoRenderer: { videoId: "jNQXAC9IVRw", setVideoId: "S2" } }, { playlistVideoRenderer: { videoId: "other", setVideoId: "S3" } }] }
check("playlist entries counted by unique setVideoId", L.playlistEntries(page, "jNQXAC9IVRw") === 2 && L.playlistEntries(page) === 3)
const fx = L.fixture({ title: "A song title", handle: "@someone", avatar: "https://yt3.ggpht.com/x", id: "jNQXAC9IVRw", other: "abcdefghijk", status: "STATUS_SUCCEEDED", playlistId: "PLaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", n: 3 }, new Set(["jNQXAC9IVRw"]))
check("fixtures keep enums and chosen video IDs only", fx.title === "<text 12>" && fx.handle === "<text 8>" && fx.avatar === "<url>" && fx.id === "jNQXAC9IVRw" && fx.other === "<text 11>" && fx.status === "STATUS_SUCCEEDED" && fx.playlistId.startsWith("<id PL") && fx.n === 3, fx)

console.log(failures ? `\n${failures} check(s) failed` : "\nall signed-out checks passed")
process.exitCode = failures ? 1 : 0
