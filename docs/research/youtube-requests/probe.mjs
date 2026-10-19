// Logged-out spike for docs/research/youtube-requests.md (ticket 01).
//
// Sends the InnerTube requests YouTube's web client builds, without any
// account, and prints the fields the research relies on. Nothing here signs in
// or reads cookies; the only write it makes is the anonymous "Queue" playlist
// YouTube's own client creates for any visitor who presses "Add to queue".
//
// Run: node docs/research/youtube-requests/probe.mjs   (or: bun …/probe.mjs)
// Optional: YT_CLIENT_VERSION=2.2026MMDD.01.00 to match the live web client.

const VERSION = process.env.YT_CLIENT_VERSION ?? "2.20261016.01.00"

async function innertube(endpoint, body) {
  const res = await fetch(`https://www.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Youtube-Client-Name": "1",
      "X-Youtube-Client-Version": VERSION,
      Origin: "https://www.youtube.com",
      Cookie: "SOCS=CAI" // EU consent, so the request isn't redirected to consent.youtube.com
    },
    body: JSON.stringify({
      context: { client: { clientName: "WEB", clientVersion: VERSION, hl: "en", gl: "US" } },
      ...body
    })
  })
  let json = null
  try {
    json = await res.json()
  } catch {}
  return { status: res.status, json }
}

const at = (o, path) => path.reduce((v, k) => (v == null ? undefined : v[k]), o)
const err = (json) => json?.error && { code: json.error.code, status: json.error.status, message: json.error.message }
const loggedOut = (json) => at(json, ["responseContext", "mainAppWebResponseContext", "loggedOut"])
const out = { clientVersion: VERSION, ranAt: new Date().toISOString() }

// Job 6: typed channel references -> UC channel ID
out.resolve_url = []
for (const url of [
  "https://www.youtube.com/@mkbhd",
  "https://www.youtube.com/c/mkbhd",
  "https://www.youtube.com/c/vsauce1",
  "https://www.youtube.com/user/Vsauce",
  "https://www.youtube.com/user/vsauce1",
  "https://www.youtube.com/channel/UCBJycsmduvYEL83R_U4JriQ",
  "https://www.youtube.com/mkbhd",
  "https://www.youtube.com/@ThisHandleDoesNotExist9x7q",
  "https://www.youtube.com/c/ThisNameDoesNotExist9x7q",
  "https://www.youtube.com/feed/playlists",
  "https://www.youtube.com/playlist?list=WL",
  "https://www.youtube.com/shorts/jNQXAC9IVRw"
]) {
  const { status, json } = await innertube("navigation/resolve_url", { url })
  const ep = json?.endpoint
  out.resolve_url.push({
    url,
    status,
    browseId: ep?.browseEndpoint?.browseId,
    urlEndpoint: ep?.urlEndpoint?.url,
    webPageType: at(ep, ["commandMetadata", "webCommandMetadata", "webPageType"]),
    error: err(json)
  })
}

// Job 6: the resolved channel's title and handle
{
  const { status, json } = await innertube("browse", { browseId: "UCBJycsmduvYEL83R_U4JriQ" })
  const md = json?.metadata?.channelMetadataRenderer
  const rows = at(json, ["header", "pageHeaderRenderer", "content", "pageHeaderViewModel", "metadata", "contentMetadataViewModel", "metadataRows"])
  out.channel_browse = {
    status,
    title: md?.title,
    externalId: md?.externalId,
    vanityChannelUrl: md?.vanityChannelUrl,
    header: Object.keys(json?.header ?? {}),
    headerHandle: at(rows, [0, "metadataParts", 0, "text", "content"])
  }
}

// Job 5: a watch-page video's channel, from `next`
{
  const { status, json } = await innertube("next", { videoId: "dQw4w9WgXcQ" })
  const contents = at(json, ["contents", "twoColumnWatchNextResults", "results", "results", "contents"]) ?? []
  const owner = contents.find((c) => c.videoSecondaryInfoRenderer)?.videoSecondaryInfoRenderer?.owner?.videoOwnerRenderer
  out.next_owner = {
    status,
    title: owner?.title?.runs?.[0]?.text,
    browseId: owner?.navigationEndpoint?.browseEndpoint?.browseId,
    canonicalBaseUrl: owner?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl,
    loggedOut: loggedOut(json)
  }
}

// Jobs 5 and 8: a Short's channel, from `reel/reel_item_watch` as the Shorts page asks for it
{
  const { status, json } = await innertube("reel/reel_item_watch", {
    playerRequest: { videoId: "jNQXAC9IVRw" },
    disablePlayerResponse: true
  })
  const overlay = json?.overlay?.reelPlayerOverlayRenderer
  const bar = at(overlay, ["playerOverlay", "reelPlayerOverlayViewModel", "metapanel", "reelMetapanelViewModel", "metadataItems"])?.find((i) => i.reelChannelBarViewModel)?.reelChannelBarViewModel
  const save = overlay?.menu?.menuRenderer?.items?.map((i) => i.listItemViewModel).find((i) => i?.title?.content === "Save to playlist")
  out.reel_item_watch = {
    status,
    channelName: bar?.channelName?.content,
    channelBrowseId: at(bar, ["channelName", "commandRuns", 0, "onTap", "innertubeCommand", "browseEndpoint", "browseId"]),
    saveToPlaylistCommand: at(save, ["rendererContext", "commandContext", "onTap", "innertubeCommand", "addToPlaylistEndpoint"])
  }
}

// Jobs 1-3 and 7: what "not signed in" looks like for each signed-in-only request
for (const [name, endpoint, body] of [
  ["get_add_to_playlist", "playlist/get_add_to_playlist", { videoIds: ["dQw4w9WgXcQ"], excludeWatchLater: false }],
  ["edit_playlist_WL", "browse/edit_playlist", { playlistId: "WL", actions: [{ action: "ACTION_ADD_VIDEO", addedVideoId: "dQw4w9WgXcQ" }] }],
  ["create_private", "playlist/create", { title: "probe", privacyStatus: "PRIVATE", videoIds: ["dQw4w9WgXcQ"] }],
  ["browse_FEplaylist_aggregation", "browse", { browseId: "FEplaylist_aggregation" }],
  ["browse_VLWL", "browse", { browseId: "VLWL" }],
  ["account_menu", "account/account_menu", {}]
]) {
  const { status, json } = await innertube(endpoint, body)
  out[name] = {
    status,
    error: err(json),
    bodyStatus: json?.status,
    loggedOut: loggedOut(json),
    alert: at(json, ["alerts", 0, "alertRenderer", "text", "runs", 0, "text"]),
    firstActionPopup: Object.keys(at(json, ["actions", 0, "openPopupAction", "popup"]) ?? {})[0],
    activeAccountHeader: Boolean(at(json, ["actions", 0, "openPopupAction", "popup", "multiPageMenuRenderer", "header", "activeAccountHeaderRenderer"]))
  }
}

// Job 4: the queue is a temporary playlist YouTube creates with params "CAQ%3D"
{
  const { status, json } = await innertube("playlist/create", { title: "Queue", videoIds: ["dQw4w9WgXcQ"], params: "CAQ%3D" })
  out.queue_create = { status, playlistIdPrefix: json?.playlistId?.slice(0, 4), error: err(json) }
}

console.log(JSON.stringify(out, null, 2))
