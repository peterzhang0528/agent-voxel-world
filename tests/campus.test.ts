import { describe, expect, it } from 'vitest';
import {
  CAMPUS_PLOTS,
  Campus,
  atmosphereLine,
  fenceBlocks,
  isPlotBoundary,
  openingLines,
  plotAt,
  plotCenter,
  plotEditError,
  plotInteriorCorner,
} from '../packages/shared/src/campus';
import { LIMIT, height, inBounds } from '../packages/shared/src/index';

describe('AI primary campus', () => {
  it('lays out 16 non-overlapping plots inside the meadow', () => {
    expect(CAMPUS_PLOTS.length).toBeGreaterThanOrEqual(8);
    expect(CAMPUS_PLOTS.length).toBeLessThanOrEqual(20);
    const seen = new Set<string>();
    for (const plot of CAMPUS_PLOTS) {
      expect(plot.minX).toBeGreaterThanOrEqual(-LIMIT);
      expect(plot.maxX).toBeLessThanOrEqual(LIMIT);
      expect(plot.minZ).toBeGreaterThanOrEqual(-LIMIT);
      expect(plot.maxZ).toBeLessThanOrEqual(LIMIT);
      for (let x = plot.minX; x <= plot.maxX; x++) {
        for (let z = plot.minZ; z <= plot.maxZ; z++) {
          const id = `${x},${z}`;
          expect(seen.has(id)).toBe(false);
          seen.add(id);
          expect(plotAt(x, z)?.id).toBe(plot.id);
        }
      }
      const center = plotCenter(plot);
      expect(isPlotBoundary(plot, center.x, center.z)).toBe(false);
    }
    expect(plotAt(0, 0)).toBeUndefined();
    expect(plotAt(-7, -10)).toBeUndefined();
  });

  it('marks every plot with visible fence posts', () => {
    const fences = fenceBlocks();
    expect(fences.length).toBeGreaterThan(16 * 8);
    for (const block of fences) {
      expect(block.material).toBe('fence');
      expect(inBounds(block)).toBe(true);
      const plot = plotAt(block.x, block.z);
      expect(plot && isPlotBoundary(plot, block.x, block.z)).toBe(true);
      expect(block.y).toBeGreaterThan(height(block.x, block.z));
    }
  });

  it('keeps build rights inside the claimed interior', () => {
    const campus = new Campus();
    const first = campus.claim('owner-1', ' 小明 ');
    const second = campus.claim('owner-2', '小红');
    expect(first.plotId).toBe('A1');
    expect(second.plotId).not.toBe(first.plotId);
    expect(first.companionName.startsWith('A1·')).toBe(true);
    const plot = CAMPUS_PLOTS[0]!;
    const corner = plotInteriorCorner(plot);
    const claims = campus.list();
    expect(
      plotEditError({ x: corner.x, z: corner.z }, 'owner-1', claims),
    ).toBeNull();
    expect(plotEditError({ x: corner.x, z: corner.z }, 'owner-2', claims)).toBe(
      'plot-forbidden',
    );
    expect(
      plotEditError({ x: plot.minX, z: corner.z }, 'owner-1', claims),
    ).toBe('plot-boundary');
    expect(plotEditError({ x: 0, z: 0 }, 'owner-1', claims)).toBe(
      'plot-readonly',
    );
    expect(plotEditError({ x: 4, z: 4 }, 'owner-1', claims)).toBe(
      'plot-unclaimed',
    );
    campus.bindCompanion(first.plotId, 'buddy-1');
    expect(
      plotEditError({ x: corner.x, z: corner.z }, 'buddy-1', campus.list()),
    ).toBeNull();
    campus.ownerLeft('owner-1');
    expect(
      plotEditError({ x: corner.x, z: corner.z }, 'stranger', campus.list()),
    ).toBe('plot-forbidden');
    const returned = campus.claim('owner-1b', '小明');
    expect(returned.plotId).toBe(first.plotId);
    expect(returned.ownerSessionId).toBe('owner-1b');
    expect(() => {
      const full = new Campus();
      for (let i = 0; i < CAMPUS_PLOTS.length + 1; i++)
        full.claim(`s${i}`, `学生${i}`);
    }).toThrow('plot-full');
  });

  it('opens with a greeting, a group shout and an @ task', () => {
    const lines = openingLines('小明', 'A1', true);
    expect(lines[0]).toContain('同学们好呀');
    expect(lines[1]).toContain('@小明');
    expect(lines[1]).toContain('搭这个角');
    expect(lines[2]).toContain('A1');
    const beats = [0, 1, 2, 3, 4, 5].map((beat) =>
      atmosphereLine('小明', 'A1', beat),
    );
    expect(new Set(beats).size).toBe(beats.length);
    expect(beats.some((line) => line.includes('@小明'))).toBe(true);
    expect(beats.some((line) => line.includes('同学们'))).toBe(true);
  });
});
