// Checks that YouTube's current desktop web client still contains the request
// builders, command names and auth pieces docs/research/youtube-requests.md
// relies on. A missing marker means that section of the research needs a recheck.
//
// Run: node docs/research/youtube-requests/bundle-check.mjs   (or: bun …)

const UA = "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0"
const get = (url) => fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US", Cookie: "SOCS=CAI" } }).then((r) => r.text())

const html = await get("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
const version = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1]
const bundleUrl = html.match(/<script id="base-js" name="desktop_polymer\/desktop_polymer" src="([^"]+)"/)?.[1]
if (!bundleUrl) throw new Error("App bundle <script id=base-js> not found: the page layout changed")
const bundle = await get(bundleUrl)

const markers = {
  // Request builders (API path + request fields)
  "playlist/get_add_to_playlist": "playlist/get_add_to_playlist",
  "get_add_to_playlist sets excludeWatchLater=false": "X.excludeWatchLater=!1",
  "browse/edit_playlist": "browse/edit_playlist",
  "playlist/create": '"playlist/create"',
  "create: privacyStatus PUBLIC/UNLISTED/PRIVATE": 'A="UNLISTED"',
  "navigation/resolve_url": "navigation/resolve_url",
  "account/account_menu": "account/account_menu",
  "account/accounts_list": "account/accounts_list",
  "reel/reel_item_watch": "reel/reel_item_watch",
  // Commands and actions
  playlistEditEndpoint: '"playlistEditEndpoint"',
  ACTION_ADD_VIDEO: "ACTION_ADD_VIDEO",
  ACTION_REMOVE_VIDEO_BY_VIDEO_ID: "ACTION_REMOVE_VIDEO_BY_VIDEO_ID",
  createPlaylistServiceEndpoint: '"createPlaylistServiceEndpoint"',
  addToPlaylistCommand: '"addToPlaylistCommand"',
  PLAYLIST_EDIT_LIST_TYPE_QUEUE: "PLAYLIST_EDIT_LIST_TYPE_QUEUE",
  "queue playlists are TLPQ…": '"TLPQ"',
  "Save dialog reads containsSelectedVideos": 'containsSelectedVideos==="ALL"',
  "Save sheet entity saveToPlaylistListEntity": "saveToPlaylistListEntity",
  "resolver option commandController {onSuccess}": "commandController:{onSuccess:",
  selectActiveIdentityEndpoint: '"selectActiveIdentityEndpoint"',
  datasyncIdToken: "datasyncIdToken",
  // Auth headers and identity config
  SAPISIDHASH: '"SAPISIDHASH"',
  SAPISID1PHASH: '"SAPISID1PHASH"',
  SAPISID3PHASH: '"SAPISID3PHASH"',
  "auth hash key u = USER_SESSION_ID": '{key:"u",value:_.ne("USER_SESSION_ID")}',
  "X-Goog-AuthUser": '"X-Goog-AuthUser"',
  "X-Goog-PageId": '"X-Goog-PageId"',
  "context.user.onBehalfOfUser": "onBehalfOfUser:_.ne(\"DELEGATED_SESSION_ID\")",
  "experiment pageid_as_header_web": "pageid_as_header_web",
  DATASYNC_ID: '"DATASYNC_ID"',
  SESSION_INDEX: '"SESSION_INDEX"'
}

const missing = []
console.log(`client ${version}\nbundle ${bundleUrl.match(/k=([^/]+)/)?.[1]}\n`)
for (const [name, needle] of Object.entries(markers)) {
  const found = bundle.includes(needle)
  if (!found) missing.push(name)
  console.log(`${found ? "ok  " : "MISS"} ${name}`)
}
const shorts = html.match(/"WEB_PLAYER_CONTEXT_CONFIG_ID_KEVLAR_SHORTS":\{"rootElementId":"([^"]+)"/)?.[1]
console.log(`${shorts === "shorts-player" ? "ok  " : "MISS"} Shorts player root element is #shorts-player`)
if (shorts !== "shorts-player") missing.push("shorts-player")
process.exitCode = missing.length ? 1 : 0
