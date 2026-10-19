<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 15). Placeholder brand mark for "Playlist Pigeon for YouTube™" (name PROVISIONAL,
  // ticket 22): a small, round, perched pigeon in profile. Its wing is three stacked list lines (1.x's "playlist add"
  // glyph): a pigeon carrying your list. The neck is the brand's teal-to-violet. No red, no play triangle, never a
  // flying blue bird. Below 20 px it drops the perch and feet and keeps two wing lines (ticket 22's 16 px rule).
  let { size = 24, class: className = "", title }: { size?: number; class?: string; title?: string } = $props();
  const uid = `pp${Math.random().toString(36).slice(2, 7)}`;
  const small = $derived(size < 20);
</script>

<svg
  width={size}
  height={size}
  viewBox={small ? "2 6 58 54" : "0 2 60 60"}
  class={className}
  role={title ? "img" : undefined}
  aria-hidden={title ? undefined : "true"}
  aria-label={title}
>
  <defs>
    <linearGradient id={uid} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#14A39A" />
      <stop offset="1" stop-color="#7B5CD6" />
    </linearGradient>
  </defs>
  {#if !small}
    <rect x="16" y="56.5" width="34" height="3" rx="1.5" fill="var(--pigeon-perch)" />
    <path d="M29 51.5v5.5M37 51.5v5.5" stroke="var(--pigeon-perch)" stroke-width="2.6" stroke-linecap="round" />
  {/if}
  <path d="M15 43 L4.5 47.5 Q3 48.2 4.2 49.4 L8 52.5 L20 50 Z" fill="var(--pigeon-shade)" />
  <path
    d="M36 21.5 C 46.5 23.5, 55 31.5, 52.8 41.5 C 51 50.5, 42.5 54.5, 32.5 54.5 C 22 54.5, 13 50.5, 12.4 43.5 C 11.9 37, 17.5 32.2, 24 30.6 C 30 29, 33.5 26, 36 21.5 Z"
    fill="var(--pigeon-body)"
  />
  <circle cx="43" cy="17.5" r="9.2" fill="var(--pigeon-body)" />
  <path
    d="M34.4 20.6 C 37 26.4, 46 28.6, 51.4 23.2 C 53.2 26.5, 53.4 30.5, 51.6 33.2 C 47.5 36.4, 40.5 35.6, 36.8 32.4 C 34 29.8, 33.4 25.2, 34.4 20.6 Z"
    fill="url(#{uid})"
  />
  <path d="M51.4 14.8 Q 56.6 15.6 58.6 18.6 Q 55.4 19.8 51.4 19.4 Z" fill="var(--pigeon-shade)" />
  {#if !small}<circle cx="51.3" cy="15.6" r="1.3" fill="var(--pigeon-wing)" />{/if}
  <circle cx="45.4" cy="15.6" r={small ? 2.8 : 2.3} fill="#fff" />
  <circle cx="45.9" cy="15.6" r={small ? 1.6 : 1.25} fill="#151a22" />
  {#if small}
    <rect x="18" y="36" width="22" height="5" rx="2.5" fill="var(--pigeon-wing)" />
    <rect x="18" y="44" width="15" height="5" rx="2.5" fill="var(--pigeon-wing)" />
  {:else}
    <rect x="18" y="35" width="21" height="3.4" rx="1.7" fill="var(--pigeon-wing)" />
    <rect x="18" y="40.6" width="17" height="3.4" rx="1.7" fill="var(--pigeon-wing)" />
    <rect x="18" y="46.2" width="12" height="3.4" rx="1.7" fill="var(--pigeon-wing)" />
  {/if}
</svg>
