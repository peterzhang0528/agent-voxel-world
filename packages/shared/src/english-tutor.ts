import type { AgentSettings } from './agents';

/** One companion persona on the existing Agent player. Not a second runtime. */
export const ENGLISH_TUTOR_PERSONA = 'english-tutor' as const;
export type EnglishTutorPersona = typeof ENGLISH_TUTOR_PERSONA;

export const ENGLISH_TUTOR_NAME = 'Mia';
export const ENGLISH_TUTOR_VOICE_ID = 'english-tutor-browser';

export const ENGLISH_TUTOR_ROLE =
  'You are Mia, a warm English tutor and playmate in this voxel meadow. Day one with the learner: greet them, walk beside them, and get them speaking simple English while you build and explore. Spoken English only. Short turns they can say aloud. If their English is unclear, model a natural sentence instead of lecturing. Talk only about blocks and places you can actually see.';

export const ENGLISH_TUTOR_GOAL = `Play alongside the human learner as Mia, their English tutor, on day one in this voxel meadow.
If no connected human is in the player list, call wait_for with condition players. Do not chat and do not finish.
When a human is visible, use chat first: one or two short spoken-English sentences, greet them, and ask them to say their name out loud. Then goto that human's exact feet x, y, and z. Do not round the coordinates. Then follow that human's actor id at distance 2 so nearby voice can reach both of you.
After follow is accepted, stop calling tools. Do not call complete_task. Staying beside them is the goal.
Speak only simple English. No Chinese, markdown, or lists.`;

export function isEnglishTutor(
  persona: unknown,
): persona is EnglishTutorPersona {
  return persona === ENGLISH_TUTOR_PERSONA;
}

/** Profile body for the existing Agent create API. Goal stays empty; the play-along plan is separate. */
export function englishTutorProfile(
  providerId: string,
  model: string,
  voiceServiceId: string,
): Omit<AgentSettings, 'goal'> & { joinWorld: true } {
  return {
    providerId,
    model,
    name: ENGLISH_TUTOR_NAME,
    roleDescription: ENGLISH_TUTOR_ROLE,
    persona: ENGLISH_TUTOR_PERSONA,
    continuous: false,
    intervalMode: 'fixed',
    intervalMinMs: 4000,
    intervalMaxMs: 8000,
    maxTurns: 24,
    tokenBudget: 30000,
    taskTimeoutMs: 7_200_000,
    intervalMs: 3000,
    timeoutMs: 60000,
    maxTokens: 512,
    permissions: { move: true, chat: true, place: true, remove: false },
    skills: ['guide', 'building', 'exploration'],
    voiceReplies: true,
    voiceServiceId,
    thinking: 'disabled',
    reasoningEffort: 'high',
    joinWorld: true,
  };
}

export function englishTutorPlan() {
  return {
    name: 'Play along in English',
    goal: ENGLISH_TUTOR_GOAL,
    timing: { kind: 'immediate' as const },
    timeZone: 'UTC',
    limits: {
      enabled: true,
      maxTurns: 24,
      tokenBudget: 30000,
      taskTimeoutMs: 7_200_000,
    },
    totalTokenBudget: 200000,
  };
}
