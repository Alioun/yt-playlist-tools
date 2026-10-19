<script lang="ts">
  // YouTube's masthead and mini guide (the host page, drawn as YouTube draws it).
  import YIcon from "./YIcon.svelte";
  import { Y } from "./yt-icons";
  import { view } from "$kit";
  import { go } from "./nav";
  import { mock } from "./mock.svelte";
</script>

<div class="mast" class:hidden={mock.fullscreen}>
  <div class="start">
    <button type="button" class="ib" aria-label="Guide"><YIcon d={Y.menu} /></button>
    <a class="logo" href="/" onclick={(e) => (e.preventDefault(), go("home"))} aria-label="YouTube Home">
      <svg viewBox="0 0 30 20" width="30" height="20" aria-hidden="true"
        ><path d="M29.4 3.1A3.8 3.8 0 0 0 26.7.4C24.4 0 15 0 15 0S5.6 0 3.3.6A3.8 3.8 0 0 0 .6 3.1 39 39 0 0 0 0 10a39 39 0 0 0 .6 6.9 3.8 3.8 0 0 0 2.7 2.7C5.6 20 15 20 15 20s9.4 0 11.7-.6a3.8 3.8 0 0 0 2.7-2.7A39 39 0 0 0 30 10a39 39 0 0 0-.6-6.9z" fill="#FF0033" /><path
          d="M12 14.3 19.8 10 12 5.7z"
          fill="#fff"
        /></svg
      >
      <span>YouTube</span>
    </a>
  </div>
  <div class="center">
    <div class="search"><span>Search</span></div>
    <button type="button" class="sbtn" aria-label="Search"><YIcon d={Y.search} /></button>
    <button type="button" class="ib mic" aria-label="Search with your voice"><YIcon d={Y.mic} /></button>
  </div>
  <div class="end">
    {#if view.signedIn}
      <button type="button" class="ib" aria-label="Create"><YIcon d={Y.create} /></button>
      <button type="button" class="ib" aria-label="Notifications"><YIcon d={Y.bell} /></button>
      <span class="avatar">A</span>
    {:else}
      <span class="signin">Sign in</span>
    {/if}
  </div>
</div>
<nav class="guide" class:hidden={mock.fullscreen}>
  {#each [["Home", Y.home, "home"], ["Shorts", Y.shorts, "shorts"], ["Subscriptions", Y.subs, ""], ["You", Y.you, ""]] as [label, d, page] (label)}
    <button type="button" class="gi" onclick={() => page && go(page as "home" | "shorts")}><YIcon {d} /><span>{label}</span></button>
  {/each}
</nav>

<style>
  .mast {
    position: fixed;
    inset: 0 0 auto 0;
    height: 56px;
    z-index: 2020;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    background: var(--m-bg);
  }
  .hidden {
    display: none !important;
  }
  .start,
  .end,
  .center {
    display: flex;
    align-items: center;
  }
  .ib {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--m-text);
  }
  .logo {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-left: 16px;
    color: var(--m-text);
    text-decoration: none;
    font: 700 2rem/1 Roboto, Arial, sans-serif;
    letter-spacing: -1.2px;
  }
  .center {
    flex: 0 1 728px;
    margin: 0 40px;
  }
  .search {
    flex: 1;
    height: 40px;
    display: flex;
    align-items: center;
    padding: 0 16px;
    border: 1px solid var(--m-outline);
    border-right: 0;
    border-radius: 40px 0 0 40px;
    color: var(--m-text2);
    font: 400 1.6rem Roboto, Arial, sans-serif;
  }
  .sbtn {
    width: 64px;
    height: 42px;
    display: grid;
    place-items: center;
    border: 1px solid var(--m-outline);
    border-radius: 0 40px 40px 0;
    background: var(--m-tonal);
    color: var(--m-text);
  }
  .mic {
    margin-left: 12px;
    background: var(--m-tonal);
  }
  .end {
    gap: 8px;
  }
  .avatar {
    width: 32px;
    height: 32px;
    margin-left: 8px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: #0b8043;
    color: #fff;
    font: 500 1.4rem Roboto, Arial, sans-serif;
  }
  .signin {
    height: 36px;
    padding: 0 15px;
    display: flex;
    align-items: center;
    border: 1px solid var(--m-outline);
    border-radius: 18px;
    color: var(--yt-sys-color-baseline--call-to-action, #065fd4);
    font: 500 1.4rem Roboto, Arial, sans-serif;
  }
  .guide {
    position: fixed;
    top: 56px;
    left: 0;
    bottom: 0;
    width: 72px;
    padding: 4px;
    z-index: 2010;
    background: var(--m-bg);
  }
  .gi {
    width: 64px;
    height: 74px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--m-text);
    font: 400 1rem/1.4rem Roboto, Arial, sans-serif;
  }
  .gi:hover {
    background: var(--m-tonal);
  }
</style>
