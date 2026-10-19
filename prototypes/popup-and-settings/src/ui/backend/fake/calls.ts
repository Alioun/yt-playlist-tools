// THROWAWAY PROTOTYPE (ticket 15). The fake Backend's calls (the background's answers, scripted). Loaded on the
// first call, after the popup's first frame, so the stand-in doesn't weigh on the first view.
import type { UiArgs, UiCall, UiResult } from "../backend";
import type { AccountId, Doc } from "$shared/model/types";
import { seed } from "./seed";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export async function runCall<K extends UiCall>(kind: K, a: UiArgs<K>, doc: Doc, emit: () => void): Promise<UiResult<K>> {
  const args = a as Record<string, unknown>;
  const r = async (): Promise<unknown> => {
      switch (kind) {
        case "accountInView": {
          if (doc.env.readingAccount) return new Promise(() => {}); // never answers: the header keeps its placeholder
          await wait(90);
          const acct = doc.env.signedIn ? doc.env.account : null;
          return { acct, label: acct ? doc.accounts[acct] : null, signedIn: doc.env.signedIn, from: doc.env.youtubeOpen ? "tab" : "cached" };
        }
        case "thisTab":
          await wait(160);
          return { video: doc.env.activeSite === "youtube" ? doc.thisVideo : null, playing: doc.env.musicOpen ? doc.playing : null };
        case "playlists": {
          const { playlists } = await import("./catalog");
          await wait(doc.env.youtubeOpen ? 120 : 30);
          const acct = args.acct as AccountId;
          const list = clone(playlists[acct] ?? []);
          for (const [id, title] of Object.entries(doc.titles))
            if (doc.setups[acct] && Object.values(doc.setups[acct]!).some((v) => JSON.stringify(v).includes(`"${id}"`)) && !list.some((p) => p.id === id))
              list.push({ id, title, privacy: "private", count: 0, hue: 0, gone: true });
          return { list, fromCache: !doc.env.youtubeOpen, savedAgo: doc.env.cachedAgo };
        }
        case "membership":
          await wait(550);
          if (!doc.env.youtubeOpen) return null;
          return clone((args.item === doc.playing?.id ? doc.playing?.inPlaylists : doc.thisVideo?.inPlaylists) ?? []);
        case "add": {
          await wait(650);
          if (!doc.env.signedIn) return { outcome: "failed", error: "Sign in to YouTube to save videos." };
          if (doc.env.staleTab) return { outcome: "failed", error: "Your account changed in another tab." };
          if (doc.marks[args.playlist as string] === "full") return { outcome: "failed", error: "It's full" };
          if (doc.marks[args.playlist as string] === "missing") return { outcome: "failed", error: "It doesn't exist anymore" };
          const holder = args.item === doc.playing?.id ? doc.playing : doc.thisVideo;
          if (holder?.inPlaylists.includes(args.playlist as string)) return { outcome: "already" };
          holder?.inPlaylists.push(args.playlist as string);
          return { outcome: "added" };
        }
        case "remove": {
          await wait(600);
          const holder = args.item === doc.playing?.id ? doc.playing : doc.thisVideo;
          if (holder) holder.inPlaylists = holder.inPlaylists.filter((p) => p !== args.playlist);
          return { ok: true };
        }
        case "create": {
          await wait(900);
          if (!doc.env.youtubeOpen) return { error: "Open YouTube to create playlists." };
          const acct = args.acct as AccountId;
          if (!doc.accounts[acct]?.handle) return { error: "This account needs a YouTube channel to create playlists." };
          const id = `PLnew${Date.now().toString(36)}`;
          const { playlists } = await import("./catalog");
          playlists[acct]?.splice(1, 0, { id, title: args.title as string, privacy: args.privacy as never, count: args.withItem ? 1 : 0, hue: 182, fresh: true });
          doc.titles[id] = args.title as string;
          const holder = args.withItem === doc.playing?.id ? doc.playing : args.withItem ? doc.thisVideo : null;
          holder?.inPlaylists.push(id);
          emit();
          return { id };
        }
        case "resolveChannel": {
          const { channelLookup, channels } = await import("./catalog");
          await wait(500);
          const input = String(args.input).trim().replace(/^https?:\/\/(www\.)?/, "");
          const id = channelLookup[input] ?? channelLookup[input.toLowerCase()];
          if (id) return channels[id];
          return { error: "That doesn't look like a channel. Paste its @handle or a link to it." };
        }
        case "channel": {
          const { channels } = await import("./catalog");
          return channels[args.id as string] ?? null;
        }
        case "syncJoin":
          if (args.choice !== "cancel") {
            doc.sync.on = true;
            doc.sync.joinedBefore = true;
            doc.sync.remoteHasSettings = false;
            doc.sync.status = "ok";
            emit();
          }
          return { ok: true };
        case "clearAll": {
          const fresh = seed("fresh");
          fresh.scenario = doc.scenario;
          fresh.env = doc.env;
          fresh.sync.joinedBefore = !args.alsoSynced && doc.sync.joinedBefore;
          Object.assign(doc, fresh);
          emit();
          return { ok: true };
        }
        case "checkNow": {
          await wait(1400);
          const broken = Object.entries(doc.health).filter(([, h]) => h?.status !== "working").length;
          doc.lastCheck = {
            when: "just now",
            result: !doc.env.youtubeOpen ? "No YouTube tab to check in." : broken ? `${broken} problem${broken === 1 ? "" : "s"} found.` : "Everything answered as expected.",
          };
          emit();
          return doc.lastCheck;
        }
        case "diagnostics":
          return { report: "" };
        case "claim": {
          // Ticket 11: the first signed-in account in a normal window whose own playlists hold any of the setup's IDs.
          await wait(700);
          const un = doc.unclaimed;
          if (!un) return { outcome: "nothing" };
          if (!doc.env.youtubeOpen) return { outcome: "open-youtube" };
          if (!doc.env.signedIn) return { outcome: "sign-in" };
          const { playlists } = await import("./catalog");
          const acct = doc.env.account;
          const owned = new Map((playlists[acct] ?? []).map((p) => [p.id, p.title]));
          const ids = [...new Set([...un.autoAdd, ...(un.shortcutTarget ? [un.shortcutTarget] : [])])];
          const mine = ids.filter((id) => owned.has(id));
          if (!mine.length) return { outcome: "other-account" };
          const s = (doc.setups[acct] ??= { autoAdd: [], options: {}, filters: {}, shortcutTargets: {}, quickSave: null, musicQuickSave: null });
          for (const id of un.autoAdd) if (owned.has(id) && !s.autoAdd.includes(id)) s.autoAdd.push(id);
          const k = doc.features.shortcuts.list[0];
          if (k && un.shortcutTarget && owned.has(un.shortcutTarget) && !s.shortcutTargets[k.id]) s.shortcutTargets[k.id] = un.shortcutTarget;
          for (const id of mine) doc.titles[id] = owned.get(id)!;
          doc.unclaimed = null;
          emit();
          return { outcome: "claimed", acct, titles: mine.map((id) => owned.get(id)!), leftOut: ids.length - mine.length };
        }
      }
  };
  return (await r()) as UiResult<K>;
}
