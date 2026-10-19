// THROWAWAY PROTOTYPE (ticket 15). Opening the extension's other pages, and YouTube's. Inside the harness the
// request goes to the harness (which switches its frame); standalone, the page opens in place. The real popup calls
// `runtime.openOptionsPage()` or `tabs.create` and closes.
export type Page = "settings" | "onboarding" | "popup";
export type External = "youtube" | "music" | "sign-in" | "switch-account" | "reload" | "google-permissions" | "browser-shortcuts" | "github-known" | "github-report" | "privacy-policy";

const keep = ["s", "theme", "os", "browser"];

export function navigate(page: Page, hash = "") {
  if (window.parent !== window) {
    window.parent.postMessage({ pigeonNavigate: page, hash }, "*");
    return;
  }
  const here = new URLSearchParams(location.search);
  const q = new URLSearchParams();
  for (const k of keep) if (here.get(k)) q.set(k, here.get(k)!);
  location.href = `${page}.html?${q}${hash ? `#${hash}` : ""}`;
}

/** Links that leave the extension. In the prototype they only say where they'd go. */
export const externalUrl: Record<External, string> = {
  youtube: "https://www.youtube.com/",
  music: "https://music.youtube.com/",
  "sign-in": "https://accounts.google.com/ServiceLogin?service=youtube",
  "switch-account": "https://www.youtube.com/channel_switcher",
  reload: "(reloads the YouTube tab)",
  "google-permissions": "https://myaccount.google.com/permissions",
  "browser-shortcuts": "chrome://extensions/shortcuts · about:addons › Manage extension shortcuts",
  "github-known": "https://github.com/Alioun/yt-playlist-tools/issues?q=label%3Ayoutube-change",
  "github-report": "https://github.com/Alioun/yt-playlist-tools/issues/new?template=problem.yml",
  "privacy-policy": "https://alioun.github.io/yt-playlist-tools/privacy",
};

export function openExternal(where: External) {
  if (window.parent !== window) window.parent.postMessage({ pigeonExternal: where, url: externalUrl[where] }, "*");
  else console.info(`[prototype] would open ${externalUrl[where]}`);
}
