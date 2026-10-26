import type { ChatData, WorldEvent } from '@voxel/shared';

/** Live, addressed human messages only; never replay observation history. */
export class AgentAttention {
  private queue: WorldEvent[] = [];
  private lastSeq = 0;
  private wake?: () => void;
  get pending() {
    return this.queue.length > 0;
  }
  readonly generation = crypto.randomUUID();
  rejected = false;
  accept(event: WorldEvent, self: string) {
    this.rejected = false;
    if (event.seq <= this.lastSeq) return false;
    this.lastSeq = event.seq;
    if (
      event.type !== 'chat' ||
      event.actor === self ||
      event.actorKind !== 'human'
    )
      return false;
    const data = event.data as ChatData;
    if (
      !['public', 'private', 'nearby'].includes(data.scope) ||
      !data.recipients.includes(self)
    )
      return false;
    return true;
  }
  push(event: WorldEvent, self: string) {
    return this.accept(event, self) && this.enqueue(event);
  }
  enqueue(event: WorldEvent) {
    if (this.queue.length >= 8) {
      this.rejected = true;
      return false;
    }
    this.queue.push(event);
    this.wake?.();
    return true;
  }
  /** A play event turned into one spoken-English cue. Rate limit still consumes seq. */
  private lastCueAt = 0;
  pushCue(
    event: WorldEvent,
    text: string,
    minIntervalMs: number,
    now = Date.now(),
  ) {
    this.rejected = false;
    if (event.seq <= this.lastSeq || !text.trim()) return false;
    this.lastSeq = event.seq;
    if (
      minIntervalMs > 0 &&
      this.lastCueAt > 0 &&
      now - this.lastCueAt < minIntervalMs
    )
      return false;
    const raw =
      event.data &&
      typeof event.data === 'object' &&
      'name' in event.data &&
      typeof (event.data as { name?: unknown }).name === 'string'
        ? (event.data as { name: string }).name
        : 'Learner';
    const queued = this.enqueue({
      seq: event.seq,
      type: 'chat',
      actor: event.actor,
      actorKind: 'human',
      at: event.at,
      data: {
        scope: 'nearby',
        recipients: [],
        kind: 'text',
        name:
          raw
            .replace(/[\r\n]/g, ' ')
            .trim()
            .slice(0, 24) || 'Learner',
        text: text.trim(),
        transcriptAvailable: true,
      },
    });
    if (queued) this.lastCueAt = now;
    return queued;
  }
  take() {
    return this.queue.shift();
  }
  clear() {
    this.queue = [];
    this.wake?.();
  }
  async wait(ms: number, signal: AbortSignal) {
    if (this.pending || signal.aborted) return;
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', finish);
        this.wake = undefined;
        resolve();
      };
      const timer = setTimeout(finish, ms);
      this.wake = finish;
      signal.addEventListener('abort', finish, { once: true });
    });
  }
}
