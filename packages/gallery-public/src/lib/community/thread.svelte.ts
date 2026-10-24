import type { CommunityComment, CommunityTarget, CommunityThread } from '@gallery/core';
import type { CommunityClient } from './context';
const empty = (): CommunityThread => ({
  likes: 0,
  liked: false,
  total: 0,
  comments: [],
  hasMore: false,
});
const merge = (comments: CommunityComment[]) =>
  [...new Map(comments.map((c) => [c.id, c])).values()].sort(
    (a, b) =>
      Date.parse(a.date) - Date.parse(b.date) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );

/** One state per content item: title, photo overlay and comment pane stay in sync. */
export class ThreadState {
  data = $state<CommunityThread>(empty());
  loading = $state(false);
  busy = $state(false);
  error = $state('');
  notice = $state('');
  private page = 1;
  private revision = -1;
  private generation = 0;
  private pending?: Promise<void>;
  private extra: CommunityComment[] = [];
  constructor(
    private client: CommunityClient,
    readonly target: CommunityTarget,
  ) {}
  async load(revision: number, more = false, force = false) {
    if (revision !== this.revision) {
      this.generation++;
      this.pending = undefined;
      this.revision = revision;
      this.data = empty();
      this.extra = [];
      this.page = 1;
      force = true;
    }
    if (this.pending) return this.pending;
    if (this.busy) return;
    if (!more && !force) return;
    if (force) this.extra = [];
    const generation = this.generation,
      page = more ? this.page + 1 : 1;
    this.loading = true;
    this.error = '';
    const promise = (async () => {
      try {
        const r = await this.client.request(
          `thread?kind=${this.target.kind}&id=${this.target.id}&page=${page}`,
        );
        if (generation !== this.generation) return;
        this.data = {
          ...r.thread,
          comments: merge([...(more ? this.data.comments : []), ...r.thread.comments, ...this.extra]),
        };
        this.page = page;
        this.client.changed(this.target, this.data.likes);
      } catch (e) {
        if (generation === this.generation) this.error = (e as Error).message;
      } finally {
        if (generation === this.generation) {
          this.loading = false;
          this.pending = undefined;
        }
      }
    })();
    this.pending = promise;
    return promise;
  }
  async mutate(action: string, input: Record<string, unknown>) {
    if (this.busy) return false;
    this.busy = true;
    this.error = '';
    this.notice = '';
    const generation = this.generation;
    try {
      await this.pending;
      if (generation !== this.generation) return false;
      const r = await this.client.request(action, {
        target: this.target,
        ...input,
      });
      if (generation !== this.generation) return false;
      if (action === 'delete-comment') {
        this.extra = this.extra.filter((c) => c.id !== input.id);
        // Refill the loaded prefix after deletion so offset pagination cannot skip a comment.
        const pages = this.page,
          comments = [...r.thread.comments];
        let last = r.thread;
        for (let p = 2; p <= pages && last.hasMore; p++) {
          last = (await this.client.request(`thread?kind=${this.target.kind}&id=${this.target.id}&page=${p}`))
            .thread;
          comments.push(...last.comments);
        }
        if (generation !== this.generation) return false;
        this.data = {
          ...r.thread,
          comments: merge([...comments, ...this.extra]),
          hasMore: last.hasMore,
        };
      } else {
        if (r.thread.submitted) {
          this.extra = merge([...this.extra, r.thread.submitted]);
          this.notice =
            r.thread.submitted.status === 'pending' ? '已提交审核，目前仅你可见。' : '评论已发表。';
        }
        this.data = {
          ...this.data,
          likes: r.thread.likes,
          liked: r.thread.liked,
          total: r.thread.total,
          comments: merge([...this.data.comments, ...r.thread.comments, ...this.extra]),
          hasMore: this.page === 1 ? r.thread.hasMore : this.data.hasMore,
        };
      }
      this.client.changed(this.target, this.data.likes);
      return true;
    } catch (e) {
      if (generation === this.generation) this.error = (e as Error).message;
      return false;
    } finally {
      this.busy = false;
      if (generation !== this.generation && this.client.enabled)
        void this.load(this.client.revision, false, true);
    }
  }
}
