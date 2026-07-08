<script lang="ts">
  const { size = 18 }: { size?: number } = $props();
</script>

<div class="spinner" style="width: {size}px; height: {size}px;"></div>

<style lang="scss">
  @use "../styles/components/spinner" as *;
</style>
