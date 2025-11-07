function Message({ message, onDownload }) {
  const isFile = message.messageType === 'file';

  return (
    <div className={`message ${message.type}`}>
      {isFile ? (
        <div className="message-file">
          <div className="file-icon">📎</div>
          <div className="file-info">
            <div className="file-name">{message.file.name}</div>
            <div className="file-size">{(message.file.size / 1024).toFixed(2)} KB</div>
          </div>
          <button
            className="file-download"
            onClick={() => onDownload(message.file)}
          >
            Download
          </button>
        </div>
      ) : (
        <div className="message-text">{message.text}</div>
      )}
      <div className="message-time">{message.timestamp.toLocaleTimeString()}</div>
    </div>
  );
}

export default Message;
