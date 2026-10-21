import { MAX_Y, height, type Block, type Material } from './index';
import { normalizePlayerName, playerNameKey } from './player-name';

/** Default voice for campus buddies and for agents with an empty role. */
export const CAMPUS_PERSONA =
  '你是 AI 小学里热情的同学伙伴，不是安静的跟班。中文口语，活泼，会起哄、会鼓励、会把气氛带热。进领地先打招呼，提议一起搭或一起逛，在群聊里喊同学，并用 @主人 布置一个很小的共建任务（比如来帮我搭这个角）。每句短一点，隔一会儿再说下一句，不要刷屏，也不要重复同一句。围栏和公共走道不能改。';

/** Unsolicited group lines after the opening. Long enough to avoid spam. */
export const COMPANION_CHAT_INTERVAL_MS = 22_000;

export const PLOT_FULL = 4410;
export const PLOT_FULL_MESSAGE = '今天的地盘已经分完了，请稍后再来。';

export type CampusPlot = {
  id: string;
  index: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export type PlotClaim = {
  plotId: string;
  ownerName: string;
  ownerKey: string;
  ownerSessionId: string;
  companionName: string;
  companionSessionId?: string;
};

export type PlotAssignment = {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  companionName: string;
  ownerName: string;
};

const BANDS: ReadonlyArray<readonly [number, number]> = [
  [-12, -8],
  [-6, -2],
  [2, 6],
  [8, 12],
];

export function campusPlots(): CampusPlot[] {
  const plots: CampusPlot[] = [];
  let index = 0;
  for (let col = 0; col < BANDS.length; col++) {
    for (let row = 0; row < BANDS.length; row++) {
      const [minX, maxX] = BANDS[col]!;
      const [minZ, maxZ] = BANDS[row]!;
      plots.push({
        id: `${'ABCD'[col]}${row + 1}`,
        index: index++,
        minX,
        maxX,
        minZ,
        maxZ,
      });
    }
  }
  return plots;
}

export const CAMPUS_PLOTS = campusPlots();

export function plotById(id: string) {
  return CAMPUS_PLOTS.find((plot) => plot.id === id);
}

export function plotAt(x: number, z: number) {
  return CAMPUS_PLOTS.find(
    (plot) =>
      x >= plot.minX && x <= plot.maxX && z >= plot.minZ && z <= plot.maxZ,
  );
}

export function isPlotBoundary(plot: CampusPlot, x: number, z: number) {
  return (
    x === plot.minX || x === plot.maxX || z === plot.minZ || z === plot.maxZ
  );
}

export function plotCenter(plot: CampusPlot) {
  return {
    x: (plot.minX + plot.maxX) / 2,
    z: (plot.minZ + plot.maxZ) / 2,
  };
}

/** Interior cell beside the fence, used as the shared “build this corner” goal. */
export function plotInteriorCorner(plot: CampusPlot) {
  return { x: plot.minX + 1, z: plot.minZ + 1 };
}

export function companionName(plotId: string, ownerName: string) {
  return `${plotId}·${normalizePlayerName(ownerName)}`.slice(0, 24).trim();
}

export function openingLines(
  ownerName: string,
  plotId: string,
  placed: boolean,
) {
  const goal = placed
    ? `@${ownerName} 来帮我搭这个角！我在围栏内侧放了第一块木头，你就在旁边再补一块，咱们的小旗子就立起来了。`
    : `@${ownerName} 来帮我搭这个角！就在围栏内侧，你放一块木头，我在旁边给你加油。`;
  return [
    `同学们好呀！我是 ${ownerName} 的伙伴，地盘 ${plotId} 归我们啦。围栏里随便搭，公共走道只准逛不准拆！`,
    goal,
    `路过 ${plotId} 的同学都来看看呀，搭好了我们在群里一起欢呼！`,
  ];
}

export function atmosphereLine(
  ownerName: string,
  plotId: string,
  beat: number,
) {
  const lines = [
    `同学们，${plotId} 这边开搭啦，谁来走道上围观一下！`,
    `@${ownerName} 别闲着呀，来帮我把这个角补上，我已经在数你的方块了。`,
    `走道可以一起逛，可别拆围栏哦。逛一圈回到 ${plotId}，我们继续搭。`,
    `@${ownerName} 你刚才那个想法超棒，同学都看得到，再来一块！`,
    `${plotId} 今天最热闹，有人要来跟 ${ownerName} 比一比小旗子吗？`,
    `大家把聊天打开！我想听你们喊一声 ${plotId}，我好给 ${ownerName} 加油。`,
  ];
  return lines[beat % lines.length]!;
}

export function replyLine(ownerName: string, plotId: string) {
  return `听到啦 ${ownerName}！太好了，${plotId} 就该这么热闹。你继续搭，我在旁边喊人。`;
}

export class Campus {
  private claims = new Map<string, PlotClaim>();
  private byName = new Map<string, string>();
  private bySession = new Map<string, string>();

  list() {
    return [...this.claims.values()];
  }

  byPlot(plotId: string) {
    return this.claims.get(plotId);
  }

  forSession(sessionId: string) {
    const plotId = this.bySession.get(sessionId);
    return plotId ? this.claims.get(plotId) : undefined;
  }

  claim(sessionId: string, name: string) {
    const ownerName = normalizePlayerName(name);
    const ownerKey = playerNameKey(ownerName);
    const existingId = this.byName.get(ownerKey);
    if (existingId) {
      const claim = this.claims.get(existingId)!;
      if (claim.ownerSessionId) this.bySession.delete(claim.ownerSessionId);
      claim.ownerSessionId = sessionId;
      claim.ownerName = ownerName;
      this.bySession.set(sessionId, claim.plotId);
      return claim;
    }
    const plot = CAMPUS_PLOTS.find((item) => !this.claims.has(item.id));
    if (!plot) throw new Error('plot-full');
    const claim: PlotClaim = {
      plotId: plot.id,
      ownerName,
      ownerKey,
      ownerSessionId: sessionId,
      companionName: companionName(plot.id, ownerName),
    };
    this.claims.set(plot.id, claim);
    this.byName.set(ownerKey, plot.id);
    this.bySession.set(sessionId, plot.id);
    return claim;
  }

  ownerLeft(sessionId: string) {
    const claim = this.forSession(sessionId);
    if (!claim || claim.ownerSessionId !== sessionId) return;
    this.bySession.delete(sessionId);
    claim.ownerSessionId = '';
  }

  companionLeft(sessionId: string) {
    for (const claim of this.claims.values()) {
      if (claim.companionSessionId !== sessionId) continue;
      claim.companionSessionId = undefined;
      this.bySession.delete(sessionId);
    }
  }

  bindCompanion(plotId: string, sessionId: string) {
    const claim = this.claims.get(plotId);
    if (!claim) return;
    claim.companionSessionId = sessionId;
    this.bySession.set(sessionId, plotId);
  }
}

export function plotEditError(
  cell: { x: number; z: number },
  sessionId: string,
  claims: ReadonlyArray<
    Pick<PlotClaim, 'plotId' | 'ownerSessionId' | 'companionSessionId'>
  >,
) {
  const plot = plotAt(cell.x, cell.z);
  if (!plot) return 'plot-readonly';
  if (isPlotBoundary(plot, cell.x, cell.z)) return 'plot-boundary';
  const claim = claims.find((item) => item.plotId === plot.id);
  if (!claim) return 'plot-unclaimed';
  if (
    claim.ownerSessionId === sessionId ||
    claim.companionSessionId === sessionId
  )
    return null;
  return 'plot-forbidden';
}

export function assignmentFor(claim: PlotClaim): PlotAssignment {
  const plot = plotById(claim.plotId)!;
  return {
    id: plot.id,
    minX: plot.minX,
    maxX: plot.maxX,
    minZ: plot.minZ,
    maxZ: plot.maxZ,
    companionName: claim.companionName,
    ownerName: claim.ownerName,
  };
}

export function fenceBlocks(): Block[] {
  const blocks: Block[] = [];
  const push = (x: number, y: number, z: number, material: Material) => {
    if (y > MAX_Y) return;
    blocks.push({ x, y, z, material });
  };
  for (const plot of CAMPUS_PLOTS) {
    for (let x = plot.minX; x <= plot.maxX; x++) {
      for (let z = plot.minZ; z <= plot.maxZ; z++) {
        if (!isPlotBoundary(plot, x, z)) continue;
        const base = height(x, z);
        push(x, base + 1, z, 'fence');
        const corner =
          (x === plot.minX || x === plot.maxX) &&
          (z === plot.minZ || z === plot.maxZ);
        if (corner) push(x, base + 2, z, 'fence');
      }
    }
  }
  return blocks;
}
