import QRCodeDisplay from './QRCodeDisplay';

function ConnectionForm({
  action,
  connectionId,
  setConnectionId,
  connectionStatus,
  qrCodeUrl,
  currentConnectionId,
  onConnect,
  onBack
}) {
  return (
    <div className="step-container">
      <h2>{action === 'create' ? 'Create Connection' : 'Join Connection'}</h2>
      <div className="form-container">
        <div className="form-group">
          <label>Connection ID {action === 'create' && '(optional)'}</label>
          <input
            type="text"
            value={connectionId}
            onChange={(e) => setConnectionId(e.target.value)}
            placeholder={action === 'create' ? 'Auto-generated if empty' : 'Enter connection ID'}
            autoFocus={action === 'connect'}
          />
          {action === 'create' && !connectionId && (
            <p className="help-text">Leave empty to auto-generate a random ID</p>
          )}
        </div>

        <div className="button-row">
          <button className="back-button" onClick={onBack}>← Back</button>
          <button
            className="primary-button"
            onClick={onConnect}
            disabled={
              connectionStatus === 'connecting' ||
              (action === 'connect' && !connectionId)
            }
          >
            {connectionStatus === 'connecting' ? 'Connecting...' : (action === 'create' ? 'Create' : 'Connect')}
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
