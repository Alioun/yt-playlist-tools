<script lang="ts">
  let items = $state([1])
</script>

<button onclick={() => items = [...items, items.length + 1]}>Unsuffixed {items.length}</button>
{#each items as item}<p>Unsuffixed item {item}</p>{/each}

<style>
  button { color: rgb(20, 80, 140); }
</style>
