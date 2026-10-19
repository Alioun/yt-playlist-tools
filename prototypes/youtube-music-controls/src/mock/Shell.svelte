<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 27). YouTube Music's frame: nav bar, guide, and a slot for the page. Measured on
  // music.youtube.com at 1440 px: 64 px nav bar, 240 px guide, 10 px root font size.
  import type { Snippet } from "svelte";
  import Icon from "../kit/Icon.svelte";
  import { settings } from "./store.svelte";
  import { MY_PLAYLISTS } from "./data";

  let { children, active = "home", bg = "" }: { children: Snippet; active?: "home" | "explore" | "library" | ""; bg?: string } = $props();
</script>

<div class="app" style={bg ? `background:${bg}` : ""}>
  <header class="nav">
    <div class="start">
      <span class="ib"><Icon name="menu" /></span>
      <span class="logo" aria-label="YouTube Music">
        <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"
          ><circle cx="13" cy="13" r="12.5" fill="#ff0033" /><circle cx="13" cy="13" r="7.4" fill="none" stroke="#fff" stroke-width="1.4" /><path d="M10.8 9.6v6.8l5.6-3.4z" fill="#fff" /></svg
        >
        <span>Music</span>
      </span>
    </div>
    <div class="search"><Icon name="search" /><span>Search songs, albums, artists, podcasts</span></div>
    <div class="end">
      <span class="ib"><Icon name="cast" /></span>
      {#if settings.signedIn}
        <span class="avatar">A</span>
      {:else}
        <span class="ib"><Icon name="more" /></span>
        <span class="signin">Sign in</span>
      {/if}
    </div>
  </header>
  <nav class="guide">
    <div class="entry" class:on={active === "home"}><Icon name={active === "home" ? "homeFilled" : "homeFilled"} /><span>Home</span></div>
    <div class="entry" class:on={active === "explore"}><Icon name="explore" /><span>Explore</span></div>
    <div class="entry" class:on={active === "library"}><Icon name="library" /><span>Library</span></div>
    <div class="div"></div>
    {#if settings.signedIn}
      <div class="newpl"><Icon name="add" /><span>New playlist</span></div>
      <div class="pls">
        <div class="pl"><span class="pt">Liked Music</span><span class="ps">Auto playlist</span></div>
        {#each MY_PLAYLISTS.slice(0, 6) as p}<div class="pl"><span class="pt">{p.title}</span><span class="ps">Alioun</span></div>{/each}
      </div>
    {:else}
      <div class="signinbig">Sign in</div>
      <div class="promo">Sign in to create & share playlists, get personalized recommendations, and more.</div>
    {/if}
  </nav>
  <main class="main">{@render children()}</main>
</div>

<style>
  .app {
    position: fixed;
    inset: 0;
    background: #030303;
    overflow: hidden;
  }
  .nav {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 64px;
    display: flex;
    align-items: center;
    padding: 0 16px;
    z-index: 5;
  }
  .start {
    width: 324px;
    display: flex;
    align-items: center;
    gap: 20px;
  }
  .ib {
    width: 40px;
    height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
  }
  .logo {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font: 700 21px/1 "YouTube Sans", Roboto, sans-serif;
    letter-spacing: -0.5px;
  }
  .search {
    width: 480px;
    height: 42px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 0 14px;
    color: rgba(255, 255, 255, 0.5);
    font-size: 16px;
  }
  .search :global(svg) {
    color: rgba(255, 255, 255, 0.5);
  }
  .end {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 12px;
    padding-right: 96px;
  }
  .avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: #0b8043;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font: 500 15px Roboto, sans-serif;
  }
  .signin {
    background: #fff;
    color: #030303;
    font: 500 14px/32px Roboto, sans-serif;
    padding: 0 16px;
    border-radius: 18px;
  }
  .guide {
    position: absolute;
    left: 0;
    top: 64px;
    bottom: 0;
    width: 240px;
    padding: 8px 8px;
    border-right: 1px solid rgba(255, 255, 255, 0.15);
    z-index: 4;
    background: #030303;
  }
  .entry {
    height: 48px;
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 0 16px;
    border-radius: 8px;
    font: 500 16px Roboto, sans-serif;
  }
  .entry.on {
    background: rgba(255, 255, 255, 0.1);
  }
  .div {
    height: 1px;
    background: rgba(255, 255, 255, 0.15);
    margin: 24px 16px;
  }
  .newpl {
    margin: 0 8px 12px;
    height: 40px;
    border-radius: 20px;
    background: rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font: 500 14px Roboto, sans-serif;
  }
  .pl {
    display: flex;
    flex-direction: column;
    padding: 8px 16px;
  }
  .pt {
    font: 500 14px/20px Roboto, sans-serif;
  }
  .ps {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
  }
  .signinbig {
    margin: 0 16px;
    height: 40px;
    border-radius: 20px;
    background: rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    font: 500 14px Roboto, sans-serif;
  }
  .promo {
    margin: 12px 16px;
    font-size: 12px;
    line-height: 16px;
    color: rgba(255, 255, 255, 0.7);
  }
  .main {
    position: absolute;
    left: 240px;
    right: 0;
    top: 0;
    bottom: 72px;
    overflow-y: auto;
    overflow-x: hidden;
    padding-top: 64px;
  }
</style>
