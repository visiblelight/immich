<script lang="ts">
  import { literalMarkdown, type AlbumContent, type DraftPhoto, type PhotoGroup } from '@gallery/core';
  import { MarkdownEditor } from '@gallery/ui';
  let {
    content = $bindable(),
    editPhoto,
    pick,
  }: { content: AlbumContent; editPhoto: (p: DraftPhoto) => void; pick: () => void } = $props();
  let selected = $state<string[]>([]),
    notice = $state(''),
    editing = $state(''),
    dragKey = $state(''),
    over = $state(''),
    scope = $state('');
  let root: HTMLElement;
  const media = (p: DraftPhoto) => `/media/source/${p.asset}?variant=thumbnail`;
  let groups = $derived(content.groups ?? []);
  let items = $derived.by(() => {
    const seen = new Set<string>();
    return content.photos.filter((p) => {
      const key = p.group || p.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });
  const members = (id: string) => content.photos.filter((p) => p.group === id);
  const group = (id: string) => groups.find((g) => g.id === id);
  const cover = (p: DraftPhoto) => (p.group ? (members(p.group).find((x) => x.id === group(p.group!)?.cover) ?? p) : p);
  function normalize() {
    content.photos = items.flatMap((p) => (p.group ? members(p.group) : [p]));
  }
  function makeGroup() {
    const chosen = content.photos.filter((p) => selected.includes(p.id) && !p.group);
    if (chosen.length < 2) return;
    const id = crypto.randomUUID();
    content.groups = [...groups, { id, title: '', description: '', cover: chosen[0]!.id }];
    for (const p of chosen) p.group = id;
    normalize();
    selected = [];
    editing = id;
  }
  function preservedDescription(g: PhotoGroup, p: DraftPhoto) {
    return [g.title ? `## ${literalMarkdown(g.title)}` : '', g.description, p.description].filter(Boolean).join('\n\n');
  }
  function canPreserve(g: PhotoGroup, photos: DraftPhoto[]) {
    notice = photos.some((p) => preservedDescription(g, p).length > 50000)
      ? '保留共用说明后，个别照片的描述会超过 50,000 字符。请先缩短说明再移出或解散。'
      : '';
    return !notice;
  }
  function dissolve(id: string) {
    const g = group(id);
    if (!g || !canPreserve(g, members(id))) return false;
    for (const p of members(id)) {
      p.description = preservedDescription(g, p);
      p.group = '';
    }
    content.groups = groups.filter((g) => g.id !== id);
    editing = '';
    return true;
  }
  function detach(p: DraftPhoto) {
    const id = p.group,
      g = id ? group(id) : undefined;
    if (!g) return true;
    if (members(id!).length === 2) return dissolve(id!);
    if (!canPreserve(g, [p])) return false;
    p.description = preservedDescription(g, p);
    p.group = '';
    if (g.cover === p.id) g.cover = members(id!)[0]!.id;
    normalize();
    return true;
  }
  function remove(p: DraftPhoto) {
    if (p.group && !detach(p)) return;
    content.photos = content.photos.filter((x) => x.id !== p.id);
    if (content.cover === p.asset) content.cover = '';
    selected = selected.filter((id) => id !== p.id);
  }
  function reorder(key: string, target: string, groupId = '') {
    if (key === target) return;
    if (groupId) {
      const list = members(groupId),
        from = list.findIndex((p) => p.id === key),
        to = list.findIndex((p) => p.id === target);
      if (from < 0 || to < 0) return;
      const [p] = list.splice(from, 1);
      list.splice(to, 0, p!);
      let n = 0;
      content.photos = content.photos.map((p) => (p.group === groupId ? list[n++]! : p));
    } else {
      const list = [...items],
        from = list.findIndex((p) => (p.group || p.id) === key),
        to = list.findIndex((p) => (p.group || p.id) === target);
      if (from < 0 || to < 0) return;
      const [p] = list.splice(from, 1);
      list.splice(to, 0, p!);
      content.photos = list.flatMap((p) => (p.group ? members(p.group) : [p]));
    }
  }
  function arrow(key: string, offset: number, groupId = '') {
    const list = groupId ? members(groupId) : items;
    const i = list.findIndex((p) => (groupId ? p.id : p.group || p.id) === key),
      next = list[i + offset];
    if (next) reorder(key, groupId ? next.id : next.group || next.id, groupId);
  }
  function start(e: PointerEvent, key: string, groupId = '') {
    if (e.button !== 0) return;
    e.preventDefault();
    dragKey = key;
    over = key;
    scope = groupId;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function pointer(e: PointerEvent) {
    if (!dragKey) return;
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-order]');
    if (target && root.contains(target) && target.dataset.scope === scope) over = target.dataset.order!;
  }
  function drop() {
    if (dragKey && over) reorder(dragKey, over, scope);
    dragKey = '';
    over = '';
  }
</script>

<svelte:window
  onpointermove={pointer}
  onpointerup={drop}
  onpointercancel={() => {
    dragKey = '';
    over = '';
  }}
/>
<section class="photo-editor" bind:this={root}>
  {#if notice}<p role="alert">{notice}</p>{/if}
  <div class="section-heading">
    <div>
      <h2>本册照片 <small>{content.photos.length}</small></h2>
      <p class="muted">拖动手柄调整顺序；多选照片组成一组。</p>
    </div>
    <button class="primary" onclick={pick}>＋ 从 Immich 选片</button>
  </div>
  <div class="selection-bar">
    <span>已选择 {selected.length} 张</span><button disabled={selected.length < 2} onclick={makeGroup}
      >组成照片组</button
    ><button disabled={!selected.length} onclick={() => (selected = [])}>清除选择</button>
  </div>
  <div class="photo-grid">
    {#each items as p, index (p.group || p.id)}{@const g = p.group ? group(p.group) : undefined}{@const key =
        p.group || p.id}
      <article
        class="photo-card"
        class:stack={!!g}
        class:drop-target={!!dragKey && over === key}
        data-order={key}
        data-scope=""
      >
        <div class="card-top">
          <button
            class="drag"
            aria-label={`拖动项目 ${index + 1}`}
            onpointerdown={(e) => start(e, key)}
            onkeydown={(e) => {
              if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
                arrow(key, e.key === 'ArrowLeft' ? -1 : 1);
              }
            }}>⠿</button
          >{#if !g}<label
              ><input
                type="checkbox"
                aria-label={`选择照片 ${index + 1}`}
                checked={selected.includes(p.id)}
                onchange={(e) =>
                  (selected = e.currentTarget.checked ? [...selected, p.id] : selected.filter((id) => id !== p.id))}
              />选择</label
            >{/if}<small>{index + 1}{g ? ` · 照片组 ${members(g.id).length} 张` : ''}</small>
        </div>
        <button class="photo-image" onclick={() => (g ? (editing = g.id) : editPhoto(p))}
          ><img
            src={media(cover(p))}
            alt={p.alt || g?.title || p.title || '编辑照片'}
          />{#if content.cover === cover(p).asset}<span class="cover-badge">相册封面</span>{/if}</button
        >
        <button class="photo-caption" onclick={() => (g ? (editing = g.id) : editPhoto(p))}
          ><strong>{g?.title || p.title || (g ? '编辑照片组' : '添加照片标题')}</strong></button
        >
        <div class="photo-actions">
          <button aria-label={`前移项目 ${index + 1}`} disabled={index === 0} onclick={() => arrow(key, -1)}>←</button
          ><button
            aria-label={`后移项目 ${index + 1}`}
            disabled={index === items.length - 1}
            onclick={() => arrow(key, 1)}>→</button
          ><button class="text-action" onclick={() => (content.cover = cover(p).asset)}>设为封面</button>{#if !g}<button
              aria-label={`移除照片 ${index + 1}`}
              onclick={() => remove(p)}>×</button
            >{/if}
        </div>
      </article>
    {/each}
  </div>
  {#if !items.length}<div class="empty large">
      <h3>把照片整理成自己的故事</h3>
      <button class="primary" onclick={pick}>从 Immich 选片</button>
    </div>{/if}
  {#each groups.filter((g) => g.id === editing) as g}<section class="group-panel">
      <div class="section-heading">
        <h2>编辑照片组 · {members(g.id).length} 张</h2>
        <button onclick={() => (editing = '')}>收起</button>
      </div>
      <label>组标题<input maxlength="200" bind:value={g.title} /></label><MarkdownEditor
        label="共用说明"
        bind:value={g.description}
        maxLength={10000}
        filename="photo-group.md"
      />
      <p class="muted">共用说明只写一次；点击成员编辑角度说明。成员的拍摄参数独立显示。</p>
      <div class="photo-grid">
        {#each members(g.id) as p, index (p.id)}<article
            class="photo-card"
            class:drop-target={!!dragKey && over === p.id}
            data-order={p.id}
            data-scope={g.id}
          >
            <div class="card-top">
              <button
                class="drag"
                aria-label={`拖动组内照片 ${index + 1}`}
                onpointerdown={(e) => start(e, p.id, g.id)}
                onkeydown={(e) => {
                  if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
                    e.preventDefault();
                    arrow(p.id, e.key === 'ArrowLeft' ? -1 : 1, g.id);
                  }
                }}>⠿</button
              ><small>{index + 1}{g.cover === p.id ? ' · 组封面' : ''}</small>
            </div>
            <button class="photo-image" onclick={() => editPhoto(p)}
              ><img src={media(p)} alt={p.alt || p.title || '编辑角度说明'} /></button
            >
            <div class="photo-actions">
              <button
                disabled={index === 0}
                aria-label={`前移组内照片 ${index + 1}`}
                onclick={() => arrow(p.id, -1, g.id)}>←</button
              ><button
                disabled={index === members(g.id).length - 1}
                aria-label={`后移组内照片 ${index + 1}`}
                onclick={() => arrow(p.id, 1, g.id)}>→</button
              ><button onclick={() => (g.cover = p.id)}>组封面</button><button onclick={() => detach(p)}>移出组</button>
            </div>
          </article>{/each}
      </div>
      <label
        >添加本册照片<select
          value=""
          onchange={(e) => {
            const p = content.photos.find((p) => p.id === e.currentTarget.value);
            if (p) {
              p.group = g.id;
              normalize();
            }
            e.currentTarget.value = '';
          }}
          ><option value="">选择一张未分组照片</option>{#each content.photos.filter((p) => !p.group) as p}<option
              value={p.id}>{p.title || `照片 ${content.photos.indexOf(p) + 1}`}</option
            >{/each}</select
        ></label
      >
      <button class="dissolve" onclick={() => dissolve(g.id)}>解散照片组（保留说明）</button>
    </section>{/each}
</section>

<style>
  .selection-bar,
  .card-top {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }
  .card-top {
    margin: 0;
    padding: 6px 8px;
    justify-content: space-between;
    font-size: 12px;
  }
  .card-top label {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .card-top input {
    width: auto;
  }
  .drag {
    touch-action: none;
    cursor: grab;
    font-size: 23px;
    border: 0;
    background: none;
    padding: 2px 10px;
  }
  .stack {
    box-shadow:
      4px 4px 0 #e6ebdf,
      8px 8px 0 #f1f3ed;
  }
  .drop-target {
    outline: 3px solid #708a59;
    outline-offset: 3px;
  }
  .group-panel {
    border-top: 2px solid #dbe3d1;
    margin-top: 35px;
    padding-top: 24px;
  }
  .group-panel > label {
    display: block;
    margin: 20px 0;
  }
  .group-panel input,
  .group-panel select {
    display: block;
    width: 100%;
    padding: 10px;
    box-sizing: border-box;
  }
  .dissolve {
    margin-top: 20px;
  }
  .photo-editor :global(.photo-image img) {
    pointer-events: none;
  }
</style>
