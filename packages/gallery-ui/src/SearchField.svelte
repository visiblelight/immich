<script lang="ts">
  import Icon from './Icon.svelte';

  type InputEvent = Event & { currentTarget: HTMLInputElement };
  let {
    value = $bindable(''),
    label,
    placeholder,
    clearLabel = '清除搜索',
    name,
    maxlength,
    oninput,
    onclear,
    oncompositionstart,
    oncompositionend,
  }: {
    value?: string;
    label: string;
    placeholder: string;
    clearLabel?: string;
    name?: string;
    maxlength?: number;
    oninput?: (event: InputEvent) => void;
    onclear?: () => void;
    oncompositionstart?: (event: InputEvent) => void;
    oncompositionend?: (event: InputEvent) => void;
  } = $props();
  let input: HTMLInputElement;
</script>

<span class="search-field">
  <svg
    class="search-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg
  >
  <input
    {name}
    aria-label={label}
    {placeholder}
    bind:this={input}
    bind:value
    {maxlength}
    {oninput}
    {oncompositionstart}
    {oncompositionend}
  />
  {#if value}<button
      type="button"
      class="clear-search"
      aria-label={clearLabel}
      onclick={() => {
        value = '';
        onclear?.();
        input?.focus();
      }}><Icon name="close" size={14} /></button
    >{/if}
</span>

<style>
  .search-field {
    position: relative;
    width: 100%;
    min-width: 0;
    display: flex;
    align-items: center;
    color: #899285;
  }
  input {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    height: 38px;
    padding: 8px 32px 8px 34px;
    border: 1px solid #e1e6dc;
    border-radius: 6px;
    background: transparent;
    color: #354638;
    font: inherit;
    font-size: 12px;
    transition: border-color 0.15s;
  }
  input::placeholder {
    color: #899285;
  }
  input:focus {
    outline: 2px solid #a3b59b55;
    outline-offset: 1px;
    border-color: #9eae96;
  }
  .search-icon {
    position: absolute;
    left: 11px;
    width: 15px;
    height: 15px;
    pointer-events: none;
  }
  .clear-search {
    position: absolute;
    right: 3px;
    width: 30px;
    height: 32px;
    padding: 0;
    display: grid;
    place-items: center;
    border: 0;
    background: transparent;
    color: #7c8875;
    cursor: pointer;
  }
  .clear-search:hover {
    color: #304b36;
  }
  .clear-search:focus-visible {
    outline: 2px solid #a3b59b;
    outline-offset: -3px;
    border-radius: 5px;
  }
</style>
