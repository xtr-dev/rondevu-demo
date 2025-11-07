function MethodSelector({ action, onSelectMethod, onBack }) {
  return (
    <div className="step-container">
      <h2>{action === 'create' ? 'Create' : 'Join'} by...</h2>
      <div className="button-grid">
        <button
          className="action-button"
          onClick={() => onSelectMethod('topic')}
        >
          <div className="button-title">Topic</div>
          <div className="button-description">
            {action === 'create' ? 'Create in a topic' : 'Auto-connect to first peer'}
          </div>
        </button>
        {action === 'join' && (
          <button
            className="action-button"
            onClick={() => onSelectMethod('peer-id')}
          >
            <div className="button-title">Peer ID</div>
            <div className="button-description">Connect to specific peer</div>
          </button>
        )}
        <button
          className="action-button"
          onClick={() => onSelectMethod('connection-id')}
        >
          <div className="button-title">Connection ID</div>
          <div className="button-description">
            {action === 'create' ? 'Custom connection code' : 'Direct connection'}
          </div>
        </button>
      </div>
      <button className="back-button" onClick={onBack}>← Back</button>
    </div>
  );
}

export default MethodSelector;
