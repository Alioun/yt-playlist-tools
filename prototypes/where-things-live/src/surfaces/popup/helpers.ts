// THROWAWAY PROTOTYPE (ticket 09). Small helpers for the popup only.
import { channels } from "$lib/data";
import type { ChannelFilter, PlaylistOptions } from "$lib/state.svelte";

/** The pill on a ticked auto-add playlist: its non-default options joined with " · ", else "Options" (ticket 07). */
export function optionsPill(o: PlaylistOptions, f: ChannelFilter | undefined): string {
  const parts: string[] = [];
  if (o.takes === "shorts") parts.push("Shorts only");
  if (o.takes === "both") parts.push("Shorts too");
  if (o.percent !== null) parts.push(`${o.percent} %`);
  if (f) parts.push(filterPill(f));
  return parts.length ? parts.join(" · ") : "Options";
}

/** The filter pill on a ticked auto-add playlist. */
export function filterPill(f: ChannelFilter | undefined): string {
  if (!f) return "All channels";
  const n = f.channels.length;
  const word = n === 1 ? "channel" : "channels";
  if (!f.enabled) return `${f.mode === "allow" ? "Allowlist" : "Denylist"} · off`;
  return f.mode === "allow" ? `Only ${n} ${word}` : `All but ${n} ${word}`;
}

/** Matches a typed "@handle or channel URL" against the fake channels. Returns the channel key, or null. */
export function matchChannel(input: string): string | null {
  const q = input.trim().toLowerCase().replace(/^https?:\/\/(www\.)?youtube\.com\//, "").replace(/\/$/, "");
  if (!q) return null;
  for (const [key, c] of Object.entries(channels)) {
    const handle = c.handle?.toLowerCase();
    if (handle && (q === handle || q === handle.slice(1) || q === `${handle}`)) return key;
    if (q === `channel/${c.id.toLowerCase()}` || q === c.id.toLowerCase()) return key;
    if (q === c.title.toLowerCase()) return key;
  }
  return null;
}

export const sectionLabel = "text-muted-foreground text-[11px] font-semibold tracking-wide uppercase";
export const selectClass =
  "border-input bg-background h-7 min-w-0 flex-1 rounded-md border px-1.5 text-xs disabled:opacity-60 dark:bg-input/30";
