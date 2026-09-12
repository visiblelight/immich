<script lang="ts">
  import {
    literalMarkdown,
    albumPhotoItems,
    photoItemKey,
    orderAlbumPhotos,
    groupSelectedPhotos,
    type AlbumContent,
    type DraftPhoto,
    type PhotoGroup,
  } from '@gallery/core';
  import { flip } from 'svelte/animate';
  import { onDestroy, tick } from 'svelte';
  import { MarkdownEditor } from '@gallery/ui';
  let {
    content = $bindable(),
    editPhoto,
    pick,
    saveItem,
    canPublish,
  }: {
    content: AlbumContent;
    editPhoto: (p: DraftPhoto) => void;
    pick: () => void;
    saveItem: (candidate: AlbumContent, target: string, publish: boolean) => Promise<void>;
    canPublish: boolean;
  } = $props();
  const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
  let groupDraft = $state<AlbumContent | null>(null);
  let groupDialog: HTMLDialogElement;
  let groupBaseline = '';
  let isNewGroup = $state(false);
  let fallbackTarget = '';
  let saving = $state(false);
  let groupError = $state('');
  let discardGroup = $state(false);
  let memberEditing = $state('');
  const working = () => groupDraft ?? content;
  let selected = $state<string[]>([]),
    notice = $state(''),
    editing = $state('');
  let dragKey = $state(''),
    scope = $state(''),
    dragging = $state(false),
    previewOrder = $state<string[]>([]);
  let ghost = $state<{ src: string; title: string; x: number; y: number } | null>(null);
  let root: HTMLElement;
  let pointerId = -1,
    startX = 0,
    startY = 0,
    scrollY = 0,
    lastX = 0,
    lastY = 0,
    frame = 0,
    suppressClickUntil = 0;
  let originalKeys: string[] = [],
    slots: { x: number; y: number; width: number; height: number }[] = [];
  const media = (p: DraftPhoto) => `/media/source/${p.asset}?variant=thumbnail`;
  let groups = $derived(content.groups ?? []);
  let baseItems = $derived(albumPhotoItems(content.photos));
  let selectedPhotos = $derived(content.photos.filter((p) => !p.group && selected.includes(p.id)));
  let items = $derived(
    dragging && !scope ? previewOrder.map((key) => baseItems.find((p) => photoItemKey(p) === key)!) : baseItems,
  );
  const members = (id: string) => working().photos.filter((p) => p.group === id);
  const shownMembers = (id: string) =>
    dragging && scope === id ? previewOrder.map((key) => members(id).find((p) => p.id === key)!) : members(id);
  const group = (id: string) => (working().groups ?? []).find((g) => g.id === id);
  const cover = (p: DraftPhoto) => (p.group ? (members(p.group).find((x) => x.id === group(p.group!)?.cover) ?? p) : p);
  const motionDuration = () =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 170;
  function normalize() {
    const c = working();
    c.photos = orderAlbumPhotos(c.photos, albumPhotoItems(c.photos).map(photoItemKey));
  }
  function makeGroup() {
    if (selectedPhotos.length < 2) return;
    const result = groupSelectedPhotos(
      content.photos,
      selectedPhotos.map((p) => p.id),
      crypto.randomUUID(),
    );
    void openGroup(result.group.id, {
      ...copy(content),
      groups: [...copy(groups), result.group],
      photos: copy(result.photos),
    });
    notice = '';
  }
  function preservedDescription(g: PhotoGroup, p: DraftPhoto) {
    return [g.title ? `## ${literalMarkdown(g.title)}` : '', g.description, p.description].filter(Boolean).join('\n\n');
  }
  function canPreserve(g: PhotoGroup, photos: DraftPhoto[]) {
    notice = photos.some((p) => preservedDescription(g, p).length > 50000)
      ? '保留共用说明后，个别照片的描述会超过 50,000 字符。请先缩短说明再移出或解散。'
      : '';
    groupError = notice;
    return !notice;
  }
  function dissolve(id: string) {
    const g = group(id);
    if (!g || !canPreserve(g, members(id))) return false;
    for (const p of members(id)) {
      p.description = preservedDescription(g, p);
      p.group = '';
    }
    working().groups = (working().groups ?? []).filter((g) => g.id !== id);
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
  function arrow(key: string, offset: number, groupId = '') {
    const keys = groupId ? members(groupId).map((p) => p.id) : baseItems.map(photoItemKey);
    const from = keys.indexOf(key),
      to = from + offset;
    if (from < 0 || to < 0 || to >= keys.length) return;
    keys.splice(to, 0, keys.splice(from, 1)[0]!);
    const c = groupId ? working() : content;
    c.photos = orderAlbumPhotos(c.photos, keys, groupId);
    notice = `已移到第 ${to + 1} ${groupId ? '张' : '项'}，请保存草稿。`;
  }
  function cancelDrag() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (pointerId >= 0)
      for (const el of [root, groupDialog]) if (el?.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
    pointerId = -1;
    dragKey = '';
    dragging = false;
    previewOrder = [];
    ghost = null;
  }
  onDestroy(cancelDrag);
  function start(e: PointerEvent, key: string, groupId = '') {
    if (e.button !== 0 || dragKey) return;
    e.preventDefault();
    dragKey = key;
    scope = groupId;
    pointerId = e.pointerId;
    startX = lastX = e.clientX;
    startY = lastY = e.clientY;
    scrollY = groupId ? groupDialog.scrollTop : window.scrollY;
    originalKeys = groupId ? members(groupId).map((p) => p.id) : baseItems.map(photoItemKey);
    slots = Array.from(root.querySelectorAll<HTMLElement>('[data-order]'))
      .filter((el) => el.dataset.scope === groupId)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      });
    previewOrder = [...originalKeys];
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function targetAtPointer() {
    const offset = (scope ? groupDialog.scrollTop : window.scrollY) - scrollY;
    let target = -1,
      distance = Infinity;
    slots.forEach((r, index) => {
      const y = r.y - offset;
      // Fixed slots avoid animated cards repeatedly swapping underneath the pointer.
      if (lastX < r.x - 14 || lastX > r.x + r.width + 14 || lastY < y - 14 || lastY > y + r.height + 14) return;
      const d = Math.hypot(lastX - r.x - r.width / 2, lastY - y - r.height / 2);
      if (d < distance) {
        target = index;
        distance = d;
      }
    });
    if (target < 0) return;
    const next = originalKeys.filter((key) => key !== dragKey);
    next.splice(target, 0, dragKey);
    if (next.join() !== previewOrder.join()) previewOrder = next;
  }
  function autoScroll() {
    if (!dragging) return;
    const edge = 75;
    const amount =
      lastY < edge
        ? -Math.ceil((edge - lastY) / 4)
        : lastY > window.innerHeight - edge
          ? Math.ceil((lastY - window.innerHeight + edge) / 4)
          : 0;
    if (amount) {
      (scope ? groupDialog : window).scrollBy(0, amount);
      targetAtPointer();
    }
    frame = requestAnimationFrame(autoScroll);
  }
  function pointer(e: PointerEvent) {
    if (!dragKey || e.pointerId !== pointerId) return;
    lastX = e.clientX;
    lastY = e.clientY;
    if (!dragging && Math.hypot(lastX - startX, lastY - startY) < 6) return;
    if (!dragging) {
      dragging = true;
      (scope ? groupDialog : root).setPointerCapture(pointerId);
      const p = scope
        ? members(scope).find((p) => p.id === dragKey)!
        : cover(baseItems.find((p) => photoItemKey(p) === dragKey)!);
      ghost = {
        src: media(p),
        title: scope ? p.title || '组内照片' : group(p.group || '')?.title || p.title || '照片',
        x: lastX,
        y: lastY,
      };
      frame = requestAnimationFrame(autoScroll);
    }
    ghost = { ...ghost!, x: lastX, y: lastY };
    targetAtPointer();
  }
  function drop(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    if (dragging) {
      const c = scope ? working() : content;
      c.photos = orderAlbumPhotos(c.photos, previewOrder, scope);
      notice = `已移到第 ${previewOrder.indexOf(dragKey) + 1} ${scope ? '张' : '项'}，请保存草稿。`;
      suppressClickUntil = performance.now() + 250;
    }
    cancelDrag();
  }
  async function openGroup(id: string, candidate?: AlbumContent) {
    groupDraft = candidate ?? copy(content);
    isNewGroup = !!candidate;
    editing = id;
    fallbackTarget = groupDraft.photos.find((p) => p.group === id)?.id ?? id;
    groupBaseline = candidate ? '' : JSON.stringify(groupDraft);
    groupError = '';
    discardGroup = false;
    memberEditing = '';
    await tick();
    groupDialog.showModal();
  }
  function closeGroup(force = false) {
    if (saving) return;
    if (!force && JSON.stringify(groupDraft) !== groupBaseline) {
      discardGroup = true;
      groupDialog.scrollTo({ top: 0 });
      return;
    }
    cancelDrag();
    groupDialog.close();
    groupDraft = null;
    editing = '';
  }
  async function saveGroup(publish: boolean) {
    if (!groupDraft || saving) return;
    saving = true;
    groupError = '';
    try {
      await saveItem(
        copy(groupDraft),
        groupDraft.groups?.some((g) => g.id === editing) ? editing : fallbackTarget,
        publish,
      );
      saving = false;
      selected = [];
      closeGroup(true);
    } catch (e) {
      groupError = e instanceof Error ? e.message : '保存失败，请重试。';
    } finally {
      saving = false;
    }
  }
  function clickPhoto(p: DraftPhoto, groupId = '') {
    if (performance.now() < suppressClickUntil) return;
    if (groupId) void openGroup(groupId);
    else editPhoto(p);
  }
</script>

<svelte:window
  onbeforeunload={(e) => {
    if (groupDraft && JSON.stringify(groupDraft) !== groupBaseline) {
      e.preventDefault();
      e.returnValue = '';
    }
  }}
  onpointermove={pointer}
  onpointerup={drop}
  onpointercancel={cancelDrag}
  onkeydown={(e) => {
    if (e.key === 'Escape' && dragKey) {
      e.preventDefault();
      suppressClickUntil = performance.now() + 250;
      cancelDrag();
    }
  }}
/>
<section class="album-photo-editor" bind:this={root} class:is-dragging={dragging}>
  <p class="order-notice" role="status" aria-live="polite">{notice || '排序和分组先保存草稿，发布后更新前台。'}</p>
  <div class="section-heading">
    <div>
      <h2>本册照片 <small>{content.photos.length}</small></h2>
      <p class="muted">拖动照片或手柄排序；手机上拖动手柄。多选照片可组成一组。</p>
    </div>
    <button class="primary" onclick={pick}>＋ 从 Immich 选片</button>
  </div>
  <div class="selection-bar">
    <span>已选择 {selectedPhotos.length} 张</span><button disabled={selectedPhotos.length < 2} onclick={makeGroup}
      >组成照片组</button
    ><button disabled={!selectedPhotos.length} onclick={() => (selected = [])}>清除选择</button>
  </div>
  {#if selectedPhotos.length}<div class="selection-preview" aria-label="已选照片">
      {#each selectedPhotos as p (p.id)}<img
          src={media(p)}
          alt={p.title || `已选照片 ${content.photos.indexOf(p) + 1}`}
        />{/each}
    </div>{/if}
  <div class="collection-grid">
    {#each items as p, index (p.group || p.id)}{@const g = p.group ? group(p.group) : undefined}{@const key =
        p.group || p.id}
      <article
        class="collection-card"
        class:stack={!!g}
        class:drag-placeholder={dragging && !scope && dragKey === key}
        class:selected-card={!g && selected.includes(p.id)}
        animate:flip={{ duration: motionDuration() }}
        data-order={key}
        data-scope=""
      >
        <div class="collection-top">
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
        <button
          class="collection-image"
          onpointerdown={(e) => {
            if (e.pointerType !== 'touch') start(e, key);
          }}
          onclick={() => clickPhoto(p, g?.id)}
          ><img
            draggable="false"
            src={media(cover(p))}
            alt={p.alt || g?.title || p.title || '编辑照片'}
          />{#if content.cover === cover(p).asset}<span class="cover-badge">相册封面</span>{/if}</button
        >
        <button class="collection-caption" onclick={() => clickPhoto(p, g?.id)}
          ><strong>{g?.title || p.title || (g ? '编辑照片组' : '添加照片标题')}</strong></button
        >
        <div class="collection-actions">
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
  <dialog
    class="group-dialog"
    bind:this={groupDialog}
    aria-label="编辑照片组"
    oncancel={(e) => {
      e.preventDefault();
      closeGroup();
    }}
  >
    {#if groupDraft}
      <header class="group-heading">
        <h2>编辑照片组</h2>
        <button disabled={saving} onclick={() => closeGroup()}>取消</button>
      </header>
      <div class="group-body">
        {#if discardGroup}<div class="discard-edit" role="alert">
            <p>照片组修改尚未保存。</p>
            <button onclick={() => (discardGroup = false)}>继续编辑</button><button onclick={() => closeGroup(true)}
              >放弃修改并关闭</button
            >
          </div>{/if}
        {#if groupError}<p class="error" role="alert">{groupError}</p>{/if}
        {#if !(groupDraft.groups ?? []).some((g) => g.id === editing)}<p>
            照片组已在编辑副本中解散。保存后生效，原有个人说明和共用说明均保留。
          </p>{/if}
        {#each (groupDraft.groups ?? []).filter((g) => g.id === editing) as g}<section class="group-panel">
            <div class="section-heading">
              <h2>编辑照片组 · {members(g.id).length} 张</h2>
            </div>
            <label>组标题<input maxlength="200" bind:value={g.title} /></label><MarkdownEditor
              label="共用说明"
              bind:value={g.description}
              maxLength={10000}
              filename="photo-group.md"
            />
            <p class="muted">访客只看到组标题与共用说明。点击成员调整无障碍和位置设置；每张照片保留独立的拍摄参数。</p>
            <div class="collection-grid">
              {#each shownMembers(g.id) as p, index (p.id)}<article
                  class="collection-card"
                  class:drag-placeholder={dragging && scope === g.id && dragKey === p.id}
                  animate:flip={{ duration: motionDuration() }}
                  data-order={p.id}
                  data-scope={g.id}
                >
                  <div class="collection-top">
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
                  <button
                    class="collection-image"
                    onpointerdown={(e) => {
                      if (e.pointerType !== 'touch') start(e, p.id, g.id);
                    }}
                    onclick={() => (memberEditing = memberEditing === p.id ? '' : p.id)}
                    ><img draggable="false" src={media(p)} alt={p.alt || p.title || '编辑成员设置'} /></button
                  >
                  <div class="collection-actions">
                    <button
                      disabled={index === 0}
                      aria-label={`前移组内照片 ${index + 1}`}
                      onclick={() => arrow(p.id, -1, g.id)}>←</button
                    ><button
                      disabled={index === members(g.id).length - 1}
                      aria-label={`后移组内照片 ${index + 1}`}
                      onclick={() => arrow(p.id, 1, g.id)}>→</button
                    ><button onclick={() => (g.cover = p.id)}>组封面</button><button onclick={() => detach(p)}
                      >移出组</button
                    >
                  </div>
                  {#if memberEditing === p.id}<div class="member-settings">
                      <label>画面描述（无障碍）<input maxlength="500" bind:value={p.alt} /></label>
                      <label
                        >位置公开方式<select bind:value={p.location}
                          ><option value="inherit">跟随相册</option><option value="hidden">隐藏</option><option
                            value="approximate">近似位置</option
                          ><option value="exact">精确位置（受相册限制）</option></select
                        ></label
                      >
                    </div>{/if}
                </article>{/each}
            </div>
            <label
              >添加本册照片<select
                value=""
                onchange={(e) => {
                  const p = groupDraft!.photos.find((p) => p.id === e.currentTarget.value);
                  if (p) {
                    p.group = g.id;
                    normalize();
                    selected = selected.filter((id) => id !== p.id);
                  }
                  e.currentTarget.value = '';
                }}
                ><option value="">选择一张未分组照片</option
                >{#each groupDraft.photos.filter((p) => !p.group) as p}<option value={p.id}
                    >{p.title || `照片 ${groupDraft.photos.indexOf(p) + 1}`}</option
                  >{/each}</select
              ></label
            >
            <button class="dissolve" onclick={() => (isNewGroup ? closeGroup() : dissolve(g.id))}
              >{isNewGroup ? '取消分组' : '解散照片组（保留说明）'}</button
            >
          </section>{/each}
      </div>
      <footer class="group-footer">
        <p>
          仅保存或发布本组及必要的成员关系变更，其他相册修改继续保留在草稿中。 {#if !canPublish}请先公开相册及所有上级。{/if}
        </p>
        <div>
          <button disabled={saving} onclick={() => closeGroup()}>取消</button>
          <button disabled={saving} onclick={() => saveGroup(false)}>保存草稿</button>
          <button class="primary" disabled={saving || !canPublish} onclick={() => saveGroup(true)}
            >{saving ? '正在保存…' : '保存并发布'}</button
          >
        </div>
      </footer>
    {/if}
    {#if scope}{#if dragging && ghost}<div
          class="drag-ghost"
          aria-hidden="true"
          style:left={`${ghost.x + 16}px`}
          style:top={`${ghost.y + 14}px`}
        >
          <img src={ghost.src} alt="" /><strong>{ghost.title}</strong><span
            >松开移到第 {previewOrder.indexOf(dragKey) + 1} 位 · Esc 取消</span
          >
        </div>{/if}
    {/if}
  </dialog>
</section>
{#if !scope}{#if dragging && ghost}<div
      class="drag-ghost"
      aria-hidden="true"
      style:left={`${ghost.x + 16}px`}
      style:top={`${ghost.y + 14}px`}
    >
      <img src={ghost.src} alt="" /><strong>{ghost.title}</strong><span
        >松开移到第 {previewOrder.indexOf(dragKey) + 1} 位 · Esc 取消</span
      >
    </div>{/if}
{/if}

<style>
  .group-dialog {
    width: min(1100px, calc(100vw - 48px));
    max-width: none;
    max-height: 92dvh;
    padding: 0;
    border: 0;
    border-radius: 12px;
    background: #fbfcf8;
  }
  .group-heading,
  .group-footer {
    position: sticky;
    background: #fbfcf8;
    padding: 18px 24px;
    z-index: 2;
  }
  .group-heading {
    top: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #dde2d7;
  }
  .group-heading h2 {
    margin: 0;
  }
  .group-body {
    padding: 24px;
  }
  .group-footer {
    bottom: 0;
    border-top: 1px solid #dde2d7;
  }
  .group-footer p {
    font-size: 12px;
    color: #60724f;
    margin: 0 0 10px;
  }
  .group-footer > div {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: end;
  }
  .member-settings {
    padding: 12px;
    display: grid;
    gap: 12px;
  }
  @media (max-width: 600px) {
    .group-dialog {
      width: 100vw;
      height: 100dvh;
      max-height: 100dvh;
      margin: 0;
      border-radius: 0;
    }
    .group-body {
      padding: 16px;
    }
    .group-heading,
    .group-footer {
      padding: 14px 16px;
    }
  }

  .album-photo-editor {
    display: block;
    min-width: 0;
  }
  .order-notice {
    font-size: 12px;
    color: #647659;
    margin: 0 0 16px;
    line-height: 1.6;
  }
  .selection-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
  }
  .selection-bar button {
    white-space: nowrap;
  }
  .selection-preview {
    display: flex;
    gap: 8px;
    margin: 0 0 18px;
    overflow: auto;
  }
  .selection-preview img {
    width: 64px;
    height: 48px;
    object-fit: contain;
    background: #eef1e9;
    border: 2px solid #728961;
    border-radius: 4px;
  }
  .collection-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 230px), 1fr));
    gap: 18px;
    align-items: start;
  }
  .collection-card {
    min-width: 0;
    border: 1px solid #dfe5d8;
    border-radius: 8px;
    background: white;
    overflow: hidden;
    position: relative;
  }
  .collection-top {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 42px;
    padding: 6px 10px;
    box-sizing: border-box;
    font-size: 12px;
  }
  .collection-top small {
    margin-left: auto;
    white-space: nowrap;
  }
  .collection-top label {
    display: flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
    margin: 0;
  }
  .collection-top input {
    width: 16px;
    height: 16px;
    margin: 0;
    padding: 0;
    flex: none;
  }
  .drag {
    touch-action: none;
    cursor: grab;
    font-size: 24px;
    border: 0;
    background: none;
    padding: 0 8px;
    min-height: 32px;
    flex: none;
  }
  .collection-image {
    display: block;
    position: relative;
    width: 100%;
    aspect-ratio: 4/3;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: #edf0e8;
    cursor: grab;
    overflow: hidden;
  }
  .collection-image img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: contain;
    pointer-events: none;
    user-select: none;
  }
  .collection-caption {
    display: block;
    width: 100%;
    min-width: 0;
    padding: 12px 12px 8px;
    text-align: left;
    border: 0;
    background: none;
  }
  .collection-caption strong {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }
  .collection-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    padding: 8px;
  }
  .collection-actions button {
    white-space: nowrap;
    flex: none;
    padding: 6px 8px;
    font-size: 12px;
    border: 0;
    background: #f5f7f1;
    min-height: 32px;
  }
  .collection-actions .text-action {
    margin-left: auto;
  }
  .stack {
    box-shadow:
      3px 3px 0 #e6ebdf,
      6px 6px 0 #f1f3ed;
  }
  .selected-card {
    border-color: #6f875b;
    box-shadow: 0 0 0 2px #6f875b;
  }
  .drag-placeholder {
    opacity: 0.28;
    border: 2px dashed #647e52;
    box-shadow: none;
  }
  .is-dragging {
    user-select: none;
    cursor: grabbing;
  }
  .is-dragging .collection-image,
  .is-dragging .drag {
    cursor: grabbing;
  }
  .group-panel {
    display: block;
    min-width: 0;
    border-top: 2px solid #dbe3d1;
    margin-top: 32px;
    padding-top: 24px;
  }
  .group-panel > label {
    display: block;
    margin: 20px 0;
    font-size: 13px;
  }
  .group-panel input,
  .group-panel select {
    display: block;
    width: 100%;
    max-width: 100%;
    padding: 10px;
    box-sizing: border-box;
    margin-top: 8px;
  }
  .dissolve {
    margin-top: 20px;
    white-space: normal;
  }
  .drag-ghost {
    position: fixed;
    z-index: 2000;
    pointer-events: none;
    width: 170px;
    max-width: 40vw;
    padding: 7px;
    background: #fff;
    border: 1px solid #789065;
    border-radius: 9px;
    box-shadow: 0 14px 38px #21331e44;
    transform: rotate(3deg);
  }
  .drag-ghost img {
    display: block;
    width: 100%;
    height: 110px;
    object-fit: contain;
    background: #edf0e8;
  }
  .drag-ghost strong,
  .drag-ghost span {
    display: block;
    padding: 5px 2px 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }
  .drag-ghost span {
    font-size: 10px;
    color: #60724f;
  }
  @container (max-width:480px) {
    .collection-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .section-heading {
      flex-wrap: wrap;
    }
    .collection-actions button {
      min-height: 38px;
    }
  }
</style>
