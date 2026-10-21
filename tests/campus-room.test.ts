import { afterEach, describe, expect, it } from 'vitest';
import { Session, until } from '@voxel/agent-runtime';
import {
  height,
  plotAt,
  plotInteriorCorner,
} from '../packages/shared/src/index';
import { createTestServer } from '../apps/server/test/helpers/test-server';

const servers: { close: () => Promise<void> }[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe('campus room rules', () => {
  it('assigns a plot, raises a fence, and lets the buddy lead', async () => {
    const server = await createTestServer();
    servers.push(server);
    const human = await new Session(server.url).join('小明', 'human');
    try {
      await until(() => human.snapshot?.plot?.id === 'A1', 3000);
      expect(human.snapshot?.plot?.companionName.startsWith('A1·')).toBe(true);
      expect(human.snapshot?.persistence).toBe('memory');
      expect(
        human.snapshot?.blocks.some((block) => block.material === 'fence'),
      ).toBe(true);
      await until(
        () =>
          human.events.some(
            (event) =>
              event.type === 'chat' &&
              String((event.data as { text?: string }).text ?? '').includes(
                '@小明',
              ) &&
              String((event.data as { text?: string }).text ?? '').includes(
                '搭这个角',
              ),
          ),
        12000,
      );
      const greeting = human.events.find(
        (event) =>
          event.type === 'chat' &&
          String((event.data as { text?: string }).text ?? '').includes(
            '同学们好呀',
          ),
      );
      expect(greeting?.actorKind).toBe('ai-agent');
      const self = (await human.observe()).self;
      const plot = plotAt(Math.round(self.x), Math.round(self.z));
      expect(plot?.id).toBe('A1');
      const corner = plotInteriorCorner(plot!);
      await until(
        () =>
          human.edits.some(
            (edit) =>
              edit.x === corner.x &&
              edit.z === corner.z &&
              edit.material === 'wood',
          ) ||
          (human.snapshot?.blocks.some(
            (block) =>
              block.x === corner.x &&
              block.z === corner.z &&
              block.material === 'wood',
          ) ??
            false),
        3000,
      );
      const observed = await human.observe();
      const boundary = await human.request('edit', {
        x: plot!.minX,
        y: height(plot!.minX, plot!.minZ + 2) + 1,
        z: plot!.minZ + 2,
        material: null,
        revision: observed.revision,
      });
      expect(boundary.error).toBe('plot-boundary');
      const aisle = await human.request('edit', {
        x: -10,
        y: height(-10, -7) + 1,
        z: -7,
        material: 'wood',
        revision: (await human.observe()).revision,
      });
      expect(aisle.error).toBe('plot-readonly');
      const inside = {
        x: plot!.maxX - 1,
        y: height(plot!.maxX - 1, plot!.maxZ - 1) + 1,
        z: plot!.maxZ - 1,
      };
      const placed = await human.request('edit', {
        ...inside,
        material: 'wood',
        revision: (await human.observe()).revision,
      });
      expect(placed.error ?? placed.ok).toBe(true);
    } finally {
      await human.close();
    }
  }, 20000);
});
