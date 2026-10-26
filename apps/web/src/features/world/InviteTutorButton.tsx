import { useState } from 'react';
import type { ManagedAgentView } from '@voxel/shared';
import { consoleFetch } from '../console/request';
import { getGatewayToken } from '../../network/gateway';

type Invite = {
  agent: ManagedAgentView;
  created: boolean;
  greetingStarted: boolean;
  message: string;
};

export function InviteTutorButton({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const invite = async () => {
    setPending(true);
    setError('');
    setMessage('');
    try {
      if (!getGatewayToken()) throw Error('请先打开控制台，输入管理员令牌。');
      const result = await consoleFetch<Invite>(
        '/agents/companions/english-tutor',
        { method: 'POST', body: {} },
      );
      try {
        sessionStorage.setItem('voxel-speech-lang', 'en');
      } catch {
        /* Private mode can block storage; speech still works for this click. */
      }
      setMessage(result.message);
    } catch (cause) {
      const text =
        cause instanceof Error ? cause.message : '邀请英语外教失败。';
      setError(
        text.includes('令牌') && !text.includes('agent:ctl')
          ? `${text} 可在终端运行 pnpm agent:ctl auth show。`
          : text,
      );
    } finally {
      setPending(false);
    }
  };
  const button = (
    <button
      type="button"
      className={className}
      disabled={pending}
      title={message || error || '邀请英语外教 Mia 一起玩'}
      onClick={() => void invite()}
    >
      {pending ? '正在邀请…' : '邀请英语外教'}
    </button>
  );
  const alert = error ? (
    <p role="alert" className="agent-error">
      {error}
    </p>
  ) : null;
  if (compact)
    return (
      <span className="tutor-invite">
        {button}
        {alert}
      </span>
    );
  return (
    <>
      {button}
      {message && <p role="status">{message}</p>}
      {alert}
    </>
  );
}
