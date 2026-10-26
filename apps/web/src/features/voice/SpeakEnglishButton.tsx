import { useEffect, useState } from 'react';
import { BrowserSpeech } from '../../audio/services/browser-speech';
import type { Connection } from '../../network/connection';

/** Browser speech recognition, so a learner can talk without a Whisper server. */
export function SpeakEnglishButton({
  connection,
  prepare,
}: {
  connection: Connection;
  prepare: () => Promise<void> | void;
}) {
  const [speech] = useState(() => new BrowserSpeech());
  const [listening, setListening] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => () => speech.stop(), [speech]);
  const connected = connection.status === 'connected';
  const start = async () => {
    setNote('');
    if (!connected) {
      setNote('进入世界后再跟她说英语。');
      return;
    }
    setListening(true);
    try {
      await prepare();
    } catch {
      /* Listening can still start; playback asks for another click if blocked. */
    }
    speech.listen(
      'en-US',
      (text) => {
        setListening(false);
        void connection
          .requestAction('chat', {
            text,
            scope: 'public',
            recipients: [],
          })
          .then(() => setNote(`已说给她：${text}`))
          .catch((error: Error) => setNote(error.message));
      },
      (error) => {
        setListening(false);
        setNote(error);
      },
      () => setListening(false),
    );
  };
  return (
    <>
      <button
        type="button"
        aria-pressed={listening}
        disabled={!connected}
        title="用浏览器识别英语并发给外教。请先允许麦克风。听见她的声音需要打开收听。"
        onClick={() => (listening ? speech.stop() : void start())}
      >
        {listening ? '正在听英语…' : '说英语'}
      </button>
      {note && (
        <span className="spatial-speak-note" role="status">
          {note}
        </span>
      )}
    </>
  );
}
