<script lang="ts">
  // An iframe that follows its page's content height (same origin, so a ResizeObserver on the frame's #app works;
  // a {pigeonHeight} message from the page also sets it). Capped at `max`.
  let {
    src,
    width = 360,
    max = 600,
    min = 120,
    title,
    lazy = false,
    class: className = "",
  }: { src: string; width?: number; max?: number; min?: number; title: string; lazy?: boolean; class?: string } = $props();

  let frame = $state<HTMLIFrameElement | null>(null);
  let height = $state(max);
  let ro: ResizeObserver | null = null;

  function attach() {
    ro?.disconnect();
    const doc = frame?.contentDocument;
    const app = doc?.getElementById("app");
    if (!app) return;
    const measure = () => {
      const el = (app.firstElementChild as HTMLElement | null) ?? app;
      const hgt = Math.ceil(el.getBoundingClientRect().height);
      if (hgt > 0) height = Math.max(min, Math.min(max, hgt));
    };
    ro = new ResizeObserver(measure);
    ro.observe(app);
    new MutationObserver(() => {
      if (app.firstElementChild) ro?.observe(app.firstElementChild);
      measure();
    }).observe(app, { childList: true });
    measure();
  }

  $effect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source === frame?.contentWindow && typeof e.data?.pigeonHeight === "number")
        height = Math.max(min, Math.min(max, e.data.pigeonHeight));
    };
    addEventListener("message", onMsg);
    return () => {
      removeEventListener("message", onMsg);
      ro?.disconnect();
    };
  });
</script>

<iframe
  bind:this={frame}
  {src}
  {title}
  loading={lazy ? "lazy" : undefined}
  onload={attach}
  class="block border-0 {className}"
  style="width:{width}px;height:{height}px"
></iframe>
