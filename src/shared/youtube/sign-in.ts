/**
 * YouTube's own sign-in page, which returns to the page the user was on (YT-GEN-05). It's the address YouTube's
 * Sign in button opens. PROVISIONAL until the owner's live check (ticket 25).
 */
export function signInUrl(current: string): string {
  const back = new URL(current)
  const next = `${back.pathname}${back.search}${back.hash}`
  const handle = `https://www.youtube.com/signin?action_handle_signin=true&app=desktop&next=${encodeURIComponent(next)}`
  return `https://accounts.google.com/ServiceLogin?service=youtube&uilel=3&passive=true&continue=${encodeURIComponent(handle)}`
}

/** YouTube's account switcher (YT-GEN-05). */
export const switchAccountUrl = "https://www.youtube.com/channel_switcher"
