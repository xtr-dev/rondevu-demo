import QRCodeDisplay from './QRCodeDisplay';

function ConnectionForm({
  action,
  method,
  topic,
  setTopic,
  connectionId,
  setConnectionId,
  peerId,
  setPeerId,
  topics,
  sessions,
  connectionStatus,
  qrCodeUrl,
  currentConnectionId,
  onConnect,
  onBack,
  onTopicSelect,
  onDiscoverPeers
}) {
  return (
    <div className="step-container">
      <h2>Enter Details</h2>
      <div className="form-container">
        {(method === 'topic' || method === 'peer-id' || (method === 'connection-id' && action === 'create')) && (
          <div className="form-group">
            <label>Topic</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., game-room"
              autoFocus
            />
            {topics.length > 0 && (
              <div className="topic-list">
                {topics.map((t) => (
                  <button
                    key={t.topic}
                    className="topic-item"
                    onClick={() => {
                      onTopicSelect(t.topic);
                      if (method === 'peer-id') {
                        onDiscoverPeers(t.topic);
                      }
                    }}
                  >
                    {t.topic} <span className="peer-count">({t.count})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {method === 'peer-id' && (
          <div className="form-group">
            <label>Peer ID</label>
            <input
              type="text"
              value={peerId}
              onChange={(e) => setPeerId(e.target.value)}
              placeholder="e.g., player-123"
            />
            {sessions.length > 0 && (
              <div className="topic-list">
                {sessions.map((s) => (
                  <button
                    key={s.code}
                    className="topic-item"
                    onClick={() => setPeerId(s.peerId)}
                  >
                    {s.peerId}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {method === 'connection-id' && (
          <div className="form-group">
            <label>Connection ID {action === 'create' && '(optional)'}</label>
            <input
              type="text"
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
              placeholder={action === 'create' ? 'Auto-generated if empty' : 'e.g., meeting-123'}
              autoFocus={action === 'join'}
            />
          </div>
        )}

        <div className="button-row">
          <button className="back-button" onClick={onBack}>← Back</button>
          <button
            className="primary-button"
            onClick={onConnect}
            disabled={
              connectionStatus === 'connecting' ||
              (method === 'topic' && !topic) ||
              (method === 'peer-id' && (!topic || !peerId)) ||
              (method === 'connection-id' && action === 'join' && !connectionId)
            }
          >
            {connectionStatus === 'connecting' ? 'Connecting...' : 'Connect'}
          </button>
        </div>

        {qrCodeUrl && connectionStatus === 'connecting' && action === 'create' && (
          <QRCodeDisplay qrCodeUrl={qrCodeUrl} connectionId={currentConnectionId} />
        )}
      </div>
    </div>
  );
}

export default ConnectionForm;
