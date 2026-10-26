import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { Session, type RunOptions } from '@voxel/agent-runtime';
import { ENGLISH_TUTOR_PERSONA } from '@voxel/shared';
import { ProviderStore } from '../src/modules/providers/provider-store';
import { createTestServer } from './helpers/test-server';

const servers: { close: () => Promise<void> }[] = [];
const folders: string[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(
    folders
      .splice(0)
      .map((folder) => rm(folder, { recursive: true, force: true })),
  );
});

function dependencies() {
  return {
    session: (url: string) => new Session(url),
    runner: () => ({
      run: (options: RunOptions) =>
        new Promise<void>((resolve) => {
          if (options.signal.aborted) {
            resolve();
            return;
          }
          options.signal.addEventListener('abort', () => resolve(), {
            once: true,
          });
        }),
    }),
    models: async () => [],
  };
}

const headers = {
  Authorization: 'Bearer fixture-gateway-token-for-tests',
  'Content-Type': 'application/json',
};

it('invites one english tutor into the world and does not duplicate her', async () => {
  const server = await createTestServer({ agentDependencies: dependencies() });
  servers.push(server);
  const invite = () =>
    fetch(`${server.httpUrl}/agents/companions/english-tutor`, {
      method: 'POST',
      headers,
      body: '{}',
    });
  const first = await invite();
  const created = await first.json();
  expect(first.status).toBe(201);
  expect(created.created).toBe(true);
  expect(created.greetingStarted).toBe(true);
  expect(created.agent).toMatchObject({
    name: 'Mia',
    persona: ENGLISH_TUTOR_PERSONA,
    voiceReplies: true,
    skills: ['building', 'exploration', 'guide'],
    permissions: { move: true, chat: true, place: true, remove: false },
  });
  expect(created.agent.sessionId).toBeTruthy();
  expect(created.agent.task.goal).toContain('spoken-English');
  expect(created.message).toContain('收听');

  const voices = await fetch(`${server.httpUrl}/voice/tts/services`, {
    headers,
  });
  const services = await voices.json();
  expect(
    services.some(
      (service: { type: string; voiceLanguage?: string }) =>
        service.type === 'browser' && service.voiceLanguage === 'en-US',
    ),
  ).toBe(true);

  const second = await invite();
  const again = await second.json();
  expect(second.status).toBe(200);
  expect(again.created).toBe(false);
  expect(again.greetingStarted).toBe(false);
  expect(again.agent.id).toBe(created.agent.id);

  const rejected = await fetch(`${server.httpUrl}/agents`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      providerId: 'deepseek',
      name: 'Scout',
      persona: 'wizard',
    }),
  });
  expect(rejected.status).toBe(400);
  expect(await rejected.json()).toMatchObject({
    error: expect.stringContaining('角色类型'),
  });
}, 20_000);

it('refuses to invite a tutor until a model provider is usable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'voxel-tutor-'));
  folders.push(directory);
  const providers = new ProviderStore(join(directory, 'providers.json'));
  await providers.load({});
  const server = await createTestServer({
    directory,
    providers,
    agentDependencies: dependencies(),
  });
  servers.push(server);
  const response = await fetch(
    `${server.httpUrl}/agents/companions/english-tutor`,
    { method: 'POST', headers, body: '{}' },
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({
    error: expect.stringContaining('模型服务'),
  });
});
