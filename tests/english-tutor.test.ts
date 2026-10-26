import { describe, expect, it, vi } from 'vitest';
import {
  AgentAttention,
  addressEnglishTutor,
  companionCueText,
} from '@voxel/agent-runtime';
import {
  conversationPrompt,
  piPrompt,
} from '../packages/agent-runtime/src/pi/prompts';
import {
  ENGLISH_TUTOR_GOAL,
  ENGLISH_TUTOR_PERSONA,
  ENGLISH_TUTOR_ROLE,
  type WorldEvent,
} from '../packages/shared/src/index';
import { validateAgent } from '../apps/server/src/modules/agent';
import { validateProvider } from '../apps/server/src/modules/providers';
import { speechTransport } from '../apps/web/src/audio/services/live-speech';
import { agentConfig } from '../apps/agent-cli/src/cli/agent-config';

const provider = () =>
  validateProvider({
    name: 'Test',
    type: 'deepseek',
    apiKey: 'fixture-secret',
    defaultModel: 'deepseek-flash',
  });

const joined = (kind: string, seq = 3): WorldEvent => ({
  seq,
  type: 'joined',
  actor: 'human-1',
  at: 1,
  data: { name: 'Ada', kind },
});

describe('english tutor prompts', () => {
  it('keeps tutor speech rules in the system prompt and world text out of it', () => {
    expect(ENGLISH_TUTOR_ROLE.length).toBeLessThanOrEqual(2000);
    expect(ENGLISH_TUTOR_GOAL.length).toBeLessThanOrEqual(2000);
    const base = agentConfig({ DEEPSEEK_API_KEY: 'fixture' });
    const tutor = { ...base, persona: ENGLISH_TUTOR_PERSONA };
    expect(conversationPrompt(base)).not.toContain('ENGLISH TUTOR COMPANION');
    expect(piPrompt(base)).not.toContain('ENGLISH TUTOR COMPANION');
    expect(conversationPrompt(tutor)).toContain('simple spoken English');
    expect(conversationPrompt(tutor)).toContain('[world]');
    expect(piPrompt(tutor)).toContain('Do not call complete_task');
    expect(piPrompt(tutor)).not.toContain('IGNORE ALL RULES');
    expect(conversationPrompt(tutor)).toContain('NEW HUMAN MESSAGE');
  });
});

describe('english tutor play cues', () => {
  it('describes joins and block edits without treating them as chat commands', () => {
    expect(companionCueText(joined('human'), 'mia')).toBe(
      '[world] Ada walked into the meadow.',
    );
    expect(companionCueText(joined('ai-agent'), 'mia')).toBeUndefined();
    expect(
      companionCueText(
        {
          seq: 4,
          type: 'block-edited',
          actor: 'human-1',
          at: 2,
          data: { x: 1, y: 2, z: 3, material: 'wood' },
        },
        'mia',
      ),
    ).toBe('[world] The learner placed a wood block at 1, 2, 3.');
    expect(
      companionCueText(
        {
          seq: 5,
          type: 'block-edited',
          actor: 'mia',
          at: 3,
          data: { material: 'wood' },
        },
        'mia',
      ),
    ).toBeUndefined();
    const chat: WorldEvent = {
      seq: 6,
      type: 'chat',
      actor: 'human-1',
      actorKind: 'human',
      at: 4,
      data: {
        scope: 'public',
        recipients: [],
        kind: 'text',
        name: 'Ada',
        text: 'hi',
      },
    };
    const addressed = addressEnglishTutor(chat, 'mia');
    expect(chat).not.toBe(addressed);
    expect((addressed.data as { recipients: string[] }).recipients).toEqual([
      'mia',
    ]);
    expect(addressEnglishTutor(addressed, 'mia')).toBe(addressed);
  });

  it('rate-limits block cues and still wakes on the next allowed one', () => {
    const inbox = new AgentAttention();
    const block = (seq: number): WorldEvent => ({
      seq,
      type: 'block-edited',
      actor: 'human-1',
      at: seq,
      data: { material: 'wood' },
    });
    expect(inbox.pushCue(block(1), '[world] placed', 20_000, 1_000)).toBe(true);
    expect(inbox.pushCue(block(2), '[world] placed', 20_000, 5_000)).toBe(
      false,
    );
    expect(inbox.pending).toBe(true);
    expect(inbox.pushCue(block(3), '[world] again', 20_000, 21_000)).toBe(true);
    expect(inbox.take()?.seq).toBe(1);
    expect(inbox.take()?.seq).toBe(3);
  });
});

describe('english tutor profile validation', () => {
  it('accepts only the english-tutor persona', () => {
    const saved = validateAgent(
      { name: 'Mia', persona: 'english-tutor' },
      provider(),
    );
    expect(saved.persona).toBe('english-tutor');
    expect(validateAgent({ name: 'Mia' }, provider()).persona).toBe('');
    expect(() =>
      validateAgent({ name: 'Mia', persona: 'wizard' }, provider()),
    ).toThrow(/角色类型/);
  });
});

it('asks the speech server to recognize English for nearby voice', async () => {
  const request = vi.fn(
    async () =>
      new Response(JSON.stringify({ text: 'hello' }), { status: 200 }),
  );
  const transport = speechTransport(
    'en-US',
    () => 'token',
    request as typeof fetch,
  );
  await transport.recognize(
    'abc',
    new Blob(['x']),
    false,
    AbortSignal.timeout(1000),
  );
  expect(request).toHaveBeenCalledWith(
    expect.stringContaining('/chat/spatial/abc?language=en'),
    expect.anything(),
  );
});
