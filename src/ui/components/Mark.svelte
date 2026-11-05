<script lang="ts">
  let { src, size = 56 }: { src: string; size?: number } = $props()
</script>

<img {src} width={size} height={size} alt="" class="shrink-0 select-none" draggable="false" />
