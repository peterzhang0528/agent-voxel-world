import {
  ENGLISH_TUTOR_NAME,
  ENGLISH_TUTOR_PERSONA,
  ENGLISH_TUTOR_VOICE_ID,
  englishTutorPlan,
  englishTutorProfile,
  isEnglishTutor,
  type ManagedAgentView,
} from '@voxel/shared';
import { AppError } from '../../common/errors';
import type { AgentOrchestrator } from './orchestrator';

export type EnglishTutorInvite = {
  agent: ManagedAgentView;
  created: boolean;
  greetingStarted: boolean;
  message: string;
};

const playing = (agent: ManagedAgentView) =>
  !!agent.task && ['running', 'waiting'].includes(agent.task.status);

function tutorMessage(name: string, greetingStarted: boolean) {
  const presence = greetingStarted
    ? `${name} 已在世界里，会用英语打招呼并走到你身边。`
    : `${name} 已经在世界里陪你。`;
  return `${presence}进游戏后打开附近语音的「收听」，才能听见她。点「说英语」用浏览器跟她说话，不需要 Whisper。附近麦克风请把识别语言设成 English，并需要本机 Whisper 或语音容器。`;
}

async function tutorVoice(manager: AgentOrchestrator) {
  const voices = manager.voiceServices;
  if (!voices?.ensure)
    throw new AppError('语音服务不可用，暂时不能邀请英语外教。', 503);
  const saved = voices.list();
  const existing =
    saved.find((service) => service.id === ENGLISH_TUTOR_VOICE_ID) ??
    saved.find(
      (service) =>
        service.type === 'browser' && service.voiceLanguage === 'en-US',
    );
  if (existing) return existing.id;
  const created = await voices.ensure(ENGLISH_TUTOR_VOICE_ID, {
    name: 'English tutor',
    type: 'browser',
    voice: '',
    voiceLanguage: 'en-US',
    speed: 0.95,
  });
  return created.id;
}

function tutorProvider(manager: AgentOrchestrator) {
  const usable = manager.providers
    .list()
    .filter(
      (provider) =>
        provider.defaultModel.trim() &&
        (provider.type === 'ollama' || provider.hasApiKey),
    );
  const provider = usable.find((item) => item.type === 'deepseek') ?? usable[0];
  if (!provider)
    throw new AppError(
      '请先在控制台的「模型服务」里配置 DeepSeek API Key，或为本机 Ollama 填写已下载的模型，然后再邀请英语外教。',
    );
  return provider;
}

/**
 * Reuses Agent create, join, and the task planner. One English tutor per world.
 */
export async function inviteEnglishTutor(
  manager: AgentOrchestrator,
): Promise<EnglishTutorInvite> {
  const voiceServiceId = await tutorVoice(manager);
  const provider = tutorProvider(manager);
  let created = false;
  let agent = manager.list().find((item) => isEnglishTutor(item.persona));
  const offline = !!agent && !agent.sessionId && agent.status !== 'joining';
  if (!agent) {
    agent = manager.create(
      englishTutorProfile(provider.id, provider.defaultModel, voiceServiceId),
    );
    created = true;
  } else if (offline) {
    agent = manager.join(agent.id);
  }
  // settled waits for the current execution. A live play-along task must not block the button.
  if (created || offline || agent.status === 'joining')
    await manager.settled(agent.id);
  agent = manager.list().find((item) => item.id === agent!.id) ?? agent;
  if (!agent.sessionId || agent.status === 'failed')
    throw new AppError(
      agent.logs.at(-1) ||
        `英语外教未能加入世界。如果昵称 ${ENGLISH_TUTOR_NAME} 已被占用，请先更换那个玩家的昵称。`,
      409,
    );
  if (
    agent.status === 'idle' &&
    (!agent.voiceReplies || !agent.voiceServiceId)
  ) {
    await manager.update(agent.id, {
      providerId: agent.providerId,
      name: agent.name,
      persona: ENGLISH_TUTOR_PERSONA,
      voiceReplies: true,
      voiceServiceId: agent.voiceServiceId || voiceServiceId,
    });
    agent = manager.list().find((item) => item.id === agent!.id) ?? agent;
  }
  let greetingStarted = false;
  if (!playing(agent)) {
    await manager.createTaskPlan(agent.id, englishTutorPlan());
    greetingStarted = true;
    agent = manager.list().find((item) => item.id === agent!.id) ?? agent;
  }
  return {
    agent,
    created,
    greetingStarted,
    message: tutorMessage(agent.name, greetingStarted),
  };
}
