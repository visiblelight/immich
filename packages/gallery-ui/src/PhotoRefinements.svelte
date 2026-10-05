<script lang="ts">
  import { tick } from 'svelte';
  import {
    appendPhotoFilters,
    placeChoiceTree,
    type PlaceChoice,
    type PlaceChoiceNode,
    type PhotoFilters,
  } from '../../gallery-core/src/photo-filters';
  type Option = { id: string; name: string; count: number };
  type Field = 'place' | 'camera' | 'lens' | 'focal';
  let {
    filters,
    places = [],
    cameras = [],
    lenses = [],
    bounds = null,
    sort,
    month,
    tags = [],
  }: {
    filters: PhotoFilters;
    places: PlaceChoice[];
    cameras: Option[];
    lenses: Option[];
    bounds: { min: number; max: number } | null;
    sort: string;
    month: string;
    tags: string[];
  } = $props();
  const labels = { place: '地理位置', camera: '相机', lens: '镜头', focal: '实际焦距' };
  let dialog: HTMLDialogElement;
  let active = $state<Field | null>(null),
    search = $state('');
  let selected = $state<string[]>([]),
    minimum = $state<number | undefined>(),
    maximum = $state<number | undefined>();
  let left = $state(0),
    top = $state(0);
  let anchor: HTMLElement | undefined;
  const names = (items: Option[], ids: string[]) =>
    ids.map((id) => items.find((o) => o.id === id)?.name ?? id).join('、');
  const focalLabel = (min: number | null, max: number | null) =>
    min === null && max === null
      ? '不限焦距'
      : min === null
        ? `≤ ${max} mm`
        : max === null
          ? `≥ ${min} mm`
          : `${min}–${max} mm`;
  const values = $derived({
    place: filters.place
      ? (places.find((p) => p.id === filters.place)?.path.replaceAll(' / ', ' › ') ?? '已选地点')
      : '全部地点',
    camera: names(cameras, filters.cameras) || '全部相机',
    lens: names(lenses, filters.lenses) || '全部镜头',
    focal: focalLabel(filters.focalMin, filters.focalMax),
  });
  const chosen = $derived({
    place: !!filters.place,
    camera: !!filters.cameras.length,
    lens: !!filters.lenses.length,
    focal: filters.focalMin !== null || filters.focalMax !== null,
  });
  const choices = $derived.by(() => {
    const all = active === 'place' ? places : active === 'camera' ? cameras : lenses;
    return [
      ...all,
      ...selected.filter((id) => !all.some((o) => o.id === id)).map((id) => ({ id, name: id, count: 0 })),
    ].filter((o) =>
      ('path' in o ? String(o.path) : o.name).toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    );
  });
  const placeTree = $derived(placeChoiceTree(places, search));
  function includedBySelection(place: PlaceChoice) {
    let id = place.parent;
    const seen = new Set<string>();
    while (id && !seen.has(id)) {
      if (selected.includes(id)) return true;
      seen.add(id);
      id = places.find((p) => p.id === id)?.parent ?? '';
    }
    return false;
  }
  const low = $derived(Math.min(bounds?.min ?? 0, minimum ?? Infinity));
  const high = $derived(Math.max(bounds?.max ?? 200, maximum ?? 0, minimum ?? 0));
  function position() {
    if (!anchor) return;
    const box = anchor.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - 32);
    left = Math.max(16, Math.min(box.left, window.innerWidth - width - 16));
    top = Math.max(
      16,
      Math.min(box.bottom + 8, window.innerHeight - (dialog?.getBoundingClientRect().height || 400) - 16),
    );
  }
  async function open(field: Field, button: HTMLElement) {
    active = field;
    anchor = button;
    search = '';
    selected =
      field === 'place'
        ? filters.place
          ? [filters.place]
          : []
        : [...(field === 'camera' ? filters.cameras : filters.lenses)];
    minimum = filters.focalMin ?? undefined;
    maximum = filters.focalMax ?? undefined;
    await tick();
    dialog.showModal();
    position();
  }
  function apply(place?: string) {
    const next = { ...filters };
    if (active === 'place') next.place = place ?? selected[0] ?? '';
    if (active === 'camera') next.cameras = selected;
    if (active === 'lens') next.lenses = selected;
    if (active === 'focal') {
      next.focalMin = minimum ?? null;
      next.focalMax = maximum ?? null;
    }
    const q = new URLSearchParams({ sort, month });
    for (const tag of tags) q.append('tag', tag);
    appendPhotoFilters(q, next);
    dialog.close();
    window.location.assign(`/photos?${q}`);
  }
  function toggle(id: string) {
    selected = selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id];
  }
</script>

<svelte:window onresize={position} />
<div class="refinements">
  {#each ['place', 'camera', 'lens', 'focal'] as key}
    {@const field = key as Field}
    <div class="field">
      <span class="field-label">{labels[field]}</span>
      <button
        type="button"
        class="field-control"
        class:chosen={chosen[field]}
        aria-label={`${labels[field]}：${values[field]}`}
        aria-haspopup="dialog"
        aria-expanded={active === field}
        onclick={(e) => open(field, e.currentTarget)}
      >
        <span>{values[field]}</span><svg
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          ><path
            d="m4 6 4 4 4-4"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          /></svg
        >
      </button>
    </div>
  {/each}
  {#if Object.values(chosen).some(Boolean)}<a class="clear-all" href="/photos">清除筛选</a>{/if}
</div>

<!-- A top-layer chooser escapes the sidebar's scroll clipping. Native dialog supplies
     keyboard focus containment, Escape dismissal and focus return to the field. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={dialog}
  class="chooser"
  aria-label={active ? `选择${labels[active]}` : '选择筛选条件'}
  style:--chooser-left={`${left}px`}
  style:--chooser-top={`${top}px`}
  onclose={() => (active = null)}
  onclick={(e) => {
    if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
        dialog.close();
    }
  }}
>
  {#if active}
    <header>
      <h2>{labels[active]}</h2>
      <button type="button" class="close" aria-label="关闭筛选选项" onclick={() => dialog.close()}
        ><svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20"
          ><path
            d="m5 5 10 10M15 5 5 15"
            fill="none"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linecap="round"
          /></svg
        ></button
      >
    </header>
    {#if active === 'focal'}
      <form
        onsubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <div class="focal-content">
          <div class="range-track">
            <input
              type="range"
              aria-label="最小实际焦距滑块"
              min={low}
              max={high}
              step="0.1"
              value={minimum ?? bounds?.min ?? 0}
              oninput={(e) => {
                minimum = Number(e.currentTarget.value);
                if (maximum !== undefined && maximum < minimum) maximum = minimum;
              }}
            />
            <input
              type="range"
              aria-label="最大实际焦距滑块"
              min={low}
              max={high}
              step="0.1"
              value={maximum ?? high}
              oninput={(e) => {
                maximum = Number(e.currentTarget.value);
                if (minimum !== undefined && minimum > maximum) minimum = maximum;
              }}
            />
          </div>
          <div class="range-numbers">
            <label
              >最小<input
                aria-label="最小实际焦距"
                type="number"
                min="0"
                max={maximum ?? 100000}
                step="any"
                placeholder="不限"
                bind:value={minimum}
              /></label
            ><span>—</span><label
              >最大<input
                aria-label="最大实际焦距"
                type="number"
                min={minimum ?? 0}
                max="100000"
                step="any"
                placeholder="不限"
                bind:value={maximum}
              /></label
            ><span>mm</span>
          </div>
          <p>使用实际焦距，包含两端。</p>
        </div>
        <footer>
          <button
            type="button"
            class="reset"
            onclick={() => {
              minimum = undefined;
              maximum = undefined;
            }}>不限焦距</button
          ><button class="apply">完成</button>
        </footer>
      </form>
    {:else}
      <div class="search">
        <input
          aria-label={`搜索${labels[active]}`}
          placeholder={active === 'place' ? '搜索国家、省州、城市' : `搜索${labels[active]}型号`}
          bind:value={search}
        />
      </div>
      {#if active === 'place'}<p class="place-hint">选择国家或省州，会包含其下属地区的照片。</p>{/if}
      <div class="options">
        {#if active === 'place'}<button
            type="button"
            class="option"
            class:selected={!selected.length}
            onclick={() => apply('')}
            ><span class="option-name">全部地点</span><span class="check">{!selected.length ? '✓' : ''}</span
            ></button
          >{/if}
        {#if active === 'place'}
          {@render placeBranches(placeTree)}
          {#if !placeTree.length}<p class="empty">没有匹配的地点</p>{/if}
        {:else}
          {#each choices as o}
            <button
              type="button"
              class="option"
              class:selected={selected.includes(o.id)}
              aria-pressed={selected.includes(o.id)}
              onclick={() => toggle(o.id)}
            >
              <span class="option-name">{o.name}</span><span class="count">{o.count}</span><span class="check"
                >{selected.includes(o.id) ? '✓' : ''}</span
              >
            </button>
          {/each}
          {#if !choices.length}<p class="empty">没有匹配的选项</p>{/if}
        {/if}
      </div>
      {#if active === 'place'}<p class="attribution">
          地名 <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a> · CC BY 4.0
        </p>
      {:else}<footer>
          <button type="button" class="reset" onclick={() => (selected = [])}>全部{labels[active]}</button
          ><button type="button" class="apply" onclick={() => apply()}
            >完成{selected.length ? `（${selected.length}）` : ''}</button
          >
        </footer>{/if}
    {/if}
  {/if}
</dialog>

{#snippet placeBranches(nodes: PlaceChoiceNode[])}
  <ul class="place-branches">
    {#each nodes as place (place.id)}
      {@const included = includedBySelection(place)}
      <li>
        <button
          type="button"
          class="option place-option"
          class:selected={selected.includes(place.id)}
          class:included
          aria-label={`${place.path.replaceAll(' / ', ' › ')}，${place.count} 张照片${place.children.length ? '，包含下属地区' : ''}${included ? '，已包含在当前选择中' : ''}`}
          aria-pressed={selected.includes(place.id)}
          onclick={() => apply(place.id)}
        >
          <span class="option-name"
            >{place.name}<span class="place-kind"
              >{place.kind === 'country' ? '国家' : place.kind === 'region' ? '省州' : '城市'}</span
            ></span
          >
          <span class="count">{place.count}</span><span class="check"
            >{selected.includes(place.id) ? '✓' : included ? '·' : ''}</span
          >
        </button>
        {#if place.children.length}{@render placeBranches(place.children)}{/if}
      </li>
    {/each}
  </ul>
{/snippet}

<style>
  .refinements {
    display: grid;
    gap: 18px;
    margin: 24px 0;
    font-size: 13px;
    color: #52604d;
  }
  .field {
    min-width: 0;
    display: grid;
    gap: 7px;
  }
  .field-label {
    font-size: 12px;
    color: #7b8676;
  }
  button,
  input {
    font: inherit;
  }
  button {
    cursor: pointer;
  }
  .field-control {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    min-height: 40px;
    padding: 10px 12px;
    border: 1px solid #dce2d8;
    border-radius: 6px;
    background: transparent;
    color: #798373;
    text-align: left;
    line-height: 1.5;
  }
  .field-control span {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .field-control svg {
    flex-shrink: 0;
    opacity: 0.6;
  }
  .field-control.chosen {
    color: #344a36;
    background: #f0f3ec;
  }
  .field-control:hover {
    border-color: #aab7a3;
  }
  .clear-all {
    font-size: 12px;
    color: #798373;
    text-decoration: none;
    justify-self: start;
  }
  .clear-all:hover {
    color: #344a36;
  }
  .chooser {
    position: fixed;
    inset: auto;
    left: var(--chooser-left);
    top: var(--chooser-top);
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    width: min(360px, calc(100vw - 32px));
    max-height: calc(100dvh - 32px);
    border: 1px solid #dfe5da;
    border-radius: 10px;
    background: #fcfdf9;
    color: #344332;
    box-shadow: 0 12px 44px #18261924;
    font-size: 13px;
    overflow: auto;
  }
  .chooser::backdrop {
    background: transparent;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 18px 12px;
    gap: 16px;
  }
  h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 550;
  }
  .close {
    display: grid;
    place-items: center;
    padding: 5px;
    border: 0;
    background: transparent;
    color: #7b8676;
    border-radius: 5px;
  }
  .close:hover {
    background: #edf1e8;
  }
  .search {
    padding: 0 16px 10px;
  }
  input:not([type='range']) {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    padding: 10px 11px;
    border: 1px solid #dce3d6;
    border-radius: 5px;
    color: inherit;
    background: #fff;
  }
  .options {
    max-height: min(310px, 45dvh);
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    padding: 0 8px;
  }
  .option {
    display: flex;
    width: 100%;
    gap: 10px;
    align-items: center;
    text-align: left;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    padding: 11px 10px;
    line-height: 1.5;
  }
  .option:hover {
    background: #f1f4ed;
  }
  .option.selected {
    background: #eaf0e4;
  }
  .option-name {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .place-hint {
    margin: 0;
    padding: 0 18px 12px;
    font-size: 11px;
    line-height: 1.6;
    color: #899282;
  }
  .place-branches {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .place-branches .place-branches {
    margin-left: 16px;
    padding-left: 10px;
    border-left: 1px solid #e1e6dc;
  }
  .place-option.included {
    color: #526c49;
  }
  .place-kind {
    margin-left: 7px;
    color: #929a8c;
    font-size: 10px;
    white-space: nowrap;
  }
  .count {
    color: #929a8c;
    font-size: 11px;
  }
  .check {
    flex: 0 0 14px;
    color: #56754a;
  }
  footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    padding: 13px 16px;
    border-top: 1px solid #edf0e8;
  }
  footer button {
    padding: 8px 12px;
    border: 0;
    border-radius: 5px;
  }
  .reset {
    color: #788571;
    background: transparent;
  }
  .apply {
    background: #3c5b40;
    color: #fff;
  }
  .attribution {
    margin: 0;
    padding: 12px 18px;
    font-size: 10px;
    color: #929a8c;
  }
  .attribution a {
    color: inherit;
    text-decoration: none;
  }
  .empty {
    margin: 20px 10px;
    color: #899282;
  }
  .focal-content {
    padding: 8px 18px 14px;
  }
  .focal-content p {
    color: #899282;
    font-size: 11px;
    margin: 14px 0 0;
  }
  .range-track {
    height: 30px;
    position: relative;
    margin: 10px 0 14px;
  }
  .range-track input {
    position: absolute;
    width: 100%;
    margin: 0;
    pointer-events: none;
    appearance: none;
    background: transparent;
    height: 24px;
  }
  .range-track input::-webkit-slider-runnable-track {
    height: 3px;
    background: #d6dfd0;
  }
  .range-track input::-webkit-slider-thumb {
    appearance: none;
    pointer-events: auto;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #526e4c;
    border: 2px solid white;
    box-shadow: 0 0 0 1px #526e4c;
    margin-top: -6px;
  }
  .range-track input::-moz-range-thumb {
    pointer-events: auto;
    background: #526e4c;
    border: 2px solid white;
    border-radius: 50%;
    width: 12px;
    height: 12px;
  }
  .range-track input::-moz-range-track {
    height: 3px;
    background: #d6dfd0;
  }
  .range-numbers {
    display: flex;
    align-items: end;
    gap: 10px;
  }
  .range-numbers label {
    display: grid;
    gap: 6px;
    flex: 1;
    font-size: 12px;
    color: #83907b;
    min-width: 0;
  }
  .range-numbers > span {
    padding-bottom: 10px;
    color: #83907b;
  }
  :focus-visible {
    outline: 1px solid #84977d;
    outline-offset: 2px;
  }
  @media (max-width: 640px) {
    .chooser {
      left: 12px;
      right: 12px;
      top: auto;
      bottom: 12px;
      width: auto;
      max-height: 80dvh;
      border-radius: 14px;
    }
    .chooser::backdrop {
      background: #14201733;
    }
    .option {
      padding: 13px 10px;
    }
    .options {
      max-height: 45dvh;
    }
  }
</style>
