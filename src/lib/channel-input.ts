/**
 * Reading a channel the user typed or pasted into a channel filter. Parsing is
 * offline; the lookup that turns it into a channel ID and label is
 * `fetchChannel` in `@/lib/youtube`, run by the background.
 */

/** Which `channels.list` lookup a typed channel needs. */
export type ChannelQuery =
  | { by: "id"; id: string }
  | { by: "handle"; handle: string }
  | { by: "username"; username: string }

export type ParsedChannelInput = { query: ChannelQuery } | { error: string }

export const CUSTOM_URL_ERROR =
  "Custom /c/ URLs can't be looked up. Paste the channel's @handle or /channel/ URL."
export const NOT_A_CHANNEL_ERROR =
  "That doesn't look like a channel. Paste an @handle or a channel URL."
export const NOT_FOUND_ERROR = "Couldn't find that channel on YouTube."
export const LOOKUP_FAILED_ERROR = "Couldn't look up the channel. Try again."

/** A channel ID: `UC` and 22 URL-safe base64 characters. */
const CHANNEL_ID = /^UC[\w-]{22}$/
/** A handle or username without its `@`: no spaces or URL punctuation. */
const NAME = /^[^\s/?#@]+$/u
const YOUTUBE_HOST = /^(?:[\w-]+\.)*youtube\.com$/i
const SCHEME = /^https?:\/\//i

/** The path segments of a YouTube URL, or null when the text isn't one. */
function youTubePath(text: string): string[] | null {
  const looksLikeUrl =
    SCHEME.test(text) || /^(?:[\w-]+\.)*youtube\.com(?:[/?#]|$)/i.test(text)
  if (!looksLikeUrl) return null
  try {
    const url = new URL(SCHEME.test(text) ? text : `https://${text}`)
    if (!YOUTUBE_HOST.test(url.hostname)) return null
    return url.pathname
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment))
  } catch {
    return null
  }
}

function fromHandle(text: string): ParsedChannelInput {
  const handle = text.replace(/^@/, "")
  return NAME.test(handle)
    ? { query: { by: "handle", handle: `@${handle}` } }
    : { error: NOT_A_CHANNEL_ERROR }
}

/**
 * What a typed channel asks for. Accepts a `UC…` ID, an `@handle` (the `@` is
 * optional), and YouTube channel URLs with or without the scheme, including
 * trailing paths and query strings. `/c/` URLs are rejected, because the API
 * can't look them up.
 */
export function parseChannelInput(input: string): ParsedChannelInput {
  const text = input.trim()
  if (!text) return { error: NOT_A_CHANNEL_ERROR }

  const path = youTubePath(text)
  if (path === null) {
    if (/[/\s]/.test(text)) return { error: NOT_A_CHANNEL_ERROR }
    if (CHANNEL_ID.test(text)) return { query: { by: "id", id: text } }
    return fromHandle(text)
  }

  const [first = "", second = ""] = path
  if (first === "channel" && CHANNEL_ID.test(second)) {
    return { query: { by: "id", id: second } }
  }
  if (first.startsWith("@")) return fromHandle(first)
  if (first === "user" && NAME.test(second)) {
    return { query: { by: "username", username: second } }
  }
  if (first === "c") return { error: CUSTOM_URL_ERROR }
  return { error: NOT_A_CHANNEL_ERROR }
}
