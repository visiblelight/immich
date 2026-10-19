<script lang="ts">
  let {
    label,
    options,
    value,
    onchange,
    noscroll = false,
  }: {
    label: string;
    options: { value: string; label: string; href?: string }[];
    value: string;
    onchange?: (value: string) => void;
    noscroll?: boolean;
  } = $props();
</script>

<span class="segmented-control" role="group" aria-label={label}>
  {#each options as option (option.value)}
    {#if option.href !== undefined}<a
        class:chosen={value === option.value}
        aria-current={value === option.value ? 'page' : undefined}
        href={option.href}
        data-sveltekit-noscroll={noscroll ? true : undefined}>{option.label}</a
      >{:else}<button
        type="button"
        class:chosen={value === option.value}
        aria-pressed={value === option.value}
        onclick={() => onchange?.(option.value)}>{option.label}</button
      >{/if}
  {/each}
</span>

<style>
  .segmented-control {
    display: flex;
    gap: 4px;
    background: #eff2ec;
    padding: 4px;
    border-radius: 6px;
    color: #64735e;
    font-weight: 400;
  }
  a,
  button {
    flex: 1;
    text-align: center;
    font: inherit;
    font-size: 12px;
    line-height: normal;
    padding: 8px 4px;
    border: 0;
    border-radius: 4px;
    color: inherit;
    background: transparent;
    cursor: pointer;
    white-space: nowrap;
    min-width: 72px;
    text-decoration: none;
    box-sizing: border-box;
  }
  .chosen {
    background: white;
    color: #344d3d;
    box-shadow: 0 1px 3px #24362812;
  }
  a:focus-visible,
  button:focus-visible {
    outline: 2px solid #a3b59b;
    outline-offset: 1px;
  }
</style>
