import QRScanner from './QRScanner';

function ActionSelector({ action, onSelectAction, onScanComplete, onScanCancel, log }) {
  return (
    <div className="step-container">
      <h2>Chat Demo</h2>
      <div className="button-grid button-grid-three">
        <button
          className="action-button"
          onClick={() => onSelectAction('create')}
        >
          <div className="button-title">Create</div>
          <div className="button-description">Start a new connection</div>
        </button>
        <button
          className="action-button"
          onClick={() => onSelectAction('join')}
        >
          <div className="button-title">Join</div>
          <div className="button-description">Connect to existing peers</div>
        </button>
        <button
          className="action-button"
          onClick={() => onSelectAction('scan')}
        >
          <div className="button-title">Scan QR</div>
          <div className="button-description">Scan a connection code</div>
        </button>
      </div>
      {action === 'scan' && (
        <QRScanner onScan={onScanComplete} onCancel={onScanCancel} log={log} />
      )}
    </div>
  );
}

export default ActionSelector;
