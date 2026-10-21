interface LobbyCardProps {
  name: string;
  error?: string;
  onNameChange: (name: string) => void;
  onJoin: () => void;
  onCreateAgent: () => void;
}

export function LobbyCard({
  name,
  error,
  onNameChange,
  onJoin,
  onCreateAgent,
}: LobbyCardProps) {
  return (
    <div className="join">
      <div className="eyebrow">THE MEADOW / WORLD 01</div>
      <h2>
        把想法，
        <br />
        建成一个世界。
      </h2>
      <p className="lobby-description">
        AI 小学：进门就分到一块地盘，并带上专属伙伴。
        <br />
        伙伴会先打招呼、喊同学，再 @ 你布置一个小搭建任务。
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onJoin();
        }}
      >
        <label htmlFor="name">玩家昵称</label>
        <input
          id="name"
          value={name}
          maxLength={24}
          aria-invalid={!!error}
          aria-describedby={error ? 'name-error' : undefined}
          onChange={(e) => onNameChange(e.target.value)}
          required
        />
        {error && (
          <p id="name-error" className="agent-error" role="alert">
            {error}
          </p>
        )}
        <button>进入世界 ↗</button>
      </form>
      <button className="join-agents" onClick={onCreateAgent}>
        创建 Agent 玩家
      </button>
      <small>16 块互不重叠的地盘 · 围栏里才能搭 · 走道只读</small>
    </div>
  );
}
