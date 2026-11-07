import { field } from "../read-parsers"
import { text } from "../parsers/playlists"

export function readLiveAccountMenu(document: Document): unknown {
  const header = document.querySelector("ytd-active-account-header-renderer, ytd-account-header-renderer, ytmusic-active-account-header-renderer")
  if (!header) return undefined
  const data = field(header, "data")
  if (text(field(data, "accountName"))?.trim()) return { activeAccountHeaderRenderer: data }
  const name = header.querySelector("#account-name")?.textContent?.trim()
  const handle = header.querySelector("#channel-handle")?.textContent?.trim()
  return { activeAccountHeaderRenderer: name ? { accountName: { simpleText: name }, ...(handle ? { channelHandle: { simpleText: handle } } : {}) } : undefined }
}
