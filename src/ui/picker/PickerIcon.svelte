<script lang="ts">
  let { name }: { name: "lock" | "link" | "globe" | "pin" | "plus" | "search" | "close" | "chevron" | "playlist" } = $props()
  const paths = {
    lock: ["M5 11h14v10H5z", "M8 11V7a4 4 0 0 1 8 0v4"],
    link: ["M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-2 2", "M14 11a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7l2-2"],
    globe: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0", "M3 12h18", "M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18"],
    pin: ["m16 3 5 5-4 1-4 4-1 5-6-6 5-1 4-4z", "m2 22 6-6"],
    plus: ["M12 5v14", "M5 12h14"],
    search: ["M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0", "m16 16 6 6"],
    close: ["m6 6 12 12", "M6 18 18 6"],
    chevron: ["m6 9 6 6 6-6"],
    playlist: ["M4 6h16", "M4 11h16", "M4 16h8", "M17 15v6", "M14 18h6"]
  }
</script>

<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
  {#each paths[name] as d}<path {d} />{/each}
</svg>
