#!/bin/bash
# Spike for docs/research/request-context.md: which www.youtube.com URLs could
# load in a hidden frame inside an extension page without stripping headers?
# Run 2026-10-19: "/", /live_chat, /sw.js and /error send
# "x-frame-options: SAMEORIGIN"; /embed/<id> and /robots.txt send none.
# No URL sent CSP frame-ancestors.
for u in "https://www.youtube.com/" "https://www.youtube.com/embed/dQw4w9WgXcQ" "https://www.youtube.com/robots.txt" "https://www.youtube.com/live_chat?v=dQw4w9WgXcQ" "https://www.youtube.com/sw.js" "https://www.youtube.com/error"; do
  echo "== $u"
  curl -s -o /dev/null -D - "$u" | grep -i -E "^(HTTP/|x-frame-options|location)|frame-ancestors" | cut -c1-160
done
