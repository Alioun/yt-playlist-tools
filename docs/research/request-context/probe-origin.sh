#!/bin/bash
# Spike for docs/research/request-context.md: does InnerTube accept a POST
# whose Origin is an extension origin? Signed-out, from curl, so it shows only
# the Origin gate, not cookie auth. Run 2026-10-19 from a DE IP:
#   (no Origin)                                   -> 200
#   Origin: https://www.youtube.com               -> 200
#   Origin: chrome-extension://...                -> 403
#   Origin: chrome-extension://... + X-Origin yt  -> 403
#   Origin: moz-extension://...                   -> 403
#   X-Origin: chrome-extension://... (no Origin)  -> 200
#   Origin: https://evil.example                  -> 403
#   Origin: https://www.google.com                -> 200
#   browse/edit_playlist (add to WL), fake SAPISID + hash:
#     Origin youtube.com                          -> 200, body says logged_in 0
#     Origin chrome-extension                     -> 403
body='{"context":{"client":{"clientName":"WEB","clientVersion":"2.20261016.01.00","hl":"en"}},"browseId":"FEwhat_to_watch"}'
url="https://www.youtube.com/youtubei/v1/browse?prettyPrint=false"
probe() {
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$url" -H "Content-Type: application/json" "$@" --data "$body")
  echo "$* -> $code"
}
probe
probe -H "Origin: https://www.youtube.com"
probe -H "Origin: chrome-extension://abcdefghijklmnopabcdefghijklmnop"
probe -H "Origin: chrome-extension://abcdefghijklmnopabcdefghijklmnop" -H "X-Origin: https://www.youtube.com"
probe -H "Origin: moz-extension://12345678-1234-1234-1234-123456789abc"
probe -H "X-Origin: chrome-extension://abcdefghijklmnopabcdefghijklmnop"
probe -H "Origin: https://evil.example"
probe -H "Origin: https://www.google.com"

# A write with a fake SAPISID cookie and a matching SAPISIDHASH. The extension
# Origin is refused (403) whatever the auth; the YouTube Origin gets through
# and is simply treated as signed out.
ts=$(date +%s)
sapisid="fakefakefakefakefake/AAAAAAAAAAAAAAAAAA"
hash=$(printf '%s %s %s' "$ts" "$sapisid" "https://www.youtube.com" | sha1sum | cut -d' ' -f1)
auth=(-H "Cookie: SAPISID=$sapisid" -H "Authorization: SAPISIDHASH ${ts}_${hash}" -H "X-Origin: https://www.youtube.com")
# A write (add a video to Watch Later) can't succeed without a real session.
url="https://www.youtube.com/youtubei/v1/browse/edit_playlist?prettyPrint=false"
body='{"context":{"client":{"clientName":"WEB","clientVersion":"2.20261016.01.00","hl":"en"}},"playlistId":"WL","actions":[{"action":"ACTION_ADD_VIDEO","addedVideoId":"dQw4w9WgXcQ"}]}'
probe "${auth[@]}" -H "Origin: https://www.youtube.com"
probe "${auth[@]}" -H "Origin: chrome-extension://abcdefghijklmnopabcdefghijklmnop"
