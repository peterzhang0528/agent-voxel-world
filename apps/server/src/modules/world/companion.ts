import { Session, delay } from '@voxel/agent-runtime';
import {
  COMPANION_CHAT_INTERVAL_MS,
  height,
  openingLines,
  atmosphereLine,
  replyLine,
  plotById,
  plotCenter,
  plotInteriorCorner,
  type PlotClaim,
  type WorldEvent,
} from '@voxel/shared';

type CompanionOptions = {
  serverUrl: string;
  token: string;
  claim: PlotClaim;
  intervalMs?: number;
};

/** In-process buddy. Uses the shared world session for observe, move and chat. */
export class PlotCompanion {
  private stopped = false;
  private session?: Session;
  private lastReply = 0;
  private beat = 0;

  constructor(private options: CompanionOptions) {}

  async start() {
    const session = new Session(this.options.serverUrl);
    this.session = session;
    session.onEvent = (event) => this.onChat(event);
    await session.join(this.options.claim.companionName, 'ai-agent', {
      companionToken: this.options.token,
    });
    try {
      await this.opening();
    } catch (error) {
      console.error(
        'companion opening failed',
        this.options.claim.plotId,
        error,
      );
    }
    void this.loop();
  }

  stop() {
    this.stopped = true;
    const room = this.session?.room;
    if (room) room.connection.close();
  }

  private async opening() {
    const session = this.session!;
    const { claim } = this.options;
    const placed = await this.placeCorner();
    await this.stepTowardCorner();
    for (const text of openingLines(claim.ownerName, claim.plotId, placed)) {
      if (this.stopped) return;
      await session.request('chat', { text });
      await delay(900);
    }
  }

  private async placeCorner() {
    const session = this.session!;
    const plot = plotById(this.options.claim.plotId);
    if (!plot) return false;
    const corner = plotInteriorCorner(plot);
    const observed = await session.observe();
    const result = await session.request('edit', {
      x: corner.x,
      y: height(corner.x, corner.z) + 1,
      z: corner.z,
      material: 'wood',
      revision: observed.revision,
    });
    return result.ok === true;
  }

  private async stepTowardCorner() {
    const plot = plotById(this.options.claim.plotId);
    if (!plot || !this.session) return;
    const corner = plotInteriorCorner(plot);
    for (let step = 0; step < 4 && !this.stopped; step++) {
      const observed = await this.session.observe();
      this.steer(observed.self.x, observed.self.z, corner.x, corner.z);
      await delay(250);
    }
    this.session.move(0, 0);
  }

  private steer(x: number, z: number, targetX: number, targetZ: number) {
    const dx = targetX - x;
    const dz = targetZ - z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.9) this.session?.move(0, 0);
    else this.session?.move(dx / distance, dz / distance);
  }

  private onChat(event: WorldEvent) {
    if (this.stopped || event.type !== 'chat') return;
    const claim = this.options.claim;
    if (!claim.ownerSessionId || event.actor !== claim.ownerSessionId) return;
    const text = (event.data as { text?: string }).text ?? '';
    if (!text.trim()) return;
    if (Date.now() - this.lastReply < 8000) return;
    this.lastReply = Date.now();
    void this.session
      ?.request('chat', { text: replyLine(claim.ownerName, claim.plotId) })
      .catch((error) =>
        console.error('companion reply failed', claim.plotId, error),
      );
  }

  private async loop() {
    const interval = this.options.intervalMs ?? COMPANION_CHAT_INTERVAL_MS;
    while (!this.stopped) {
      await delay(interval);
      if (this.stopped || !this.session) break;
      const plot = plotById(this.options.claim.plotId);
      if (!plot) continue;
      const target =
        this.beat % 2 === 0 ? plotInteriorCorner(plot) : plotCenter(plot);
      try {
        const observed = await this.session.observe();
        this.steer(observed.self.x, observed.self.z, target.x, target.z);
        await this.session.request('chat', {
          text: atmosphereLine(
            this.options.claim.ownerName,
            this.options.claim.plotId,
            this.beat,
          ),
        });
        this.beat++;
      } catch (error) {
        if (!this.stopped)
          console.error(
            'companion beat failed',
            this.options.claim.plotId,
            error,
          );
      }
    }
  }
}
