import { useRef } from 'react';
import Message from './Message';
import FileUploadProgress from './FileUploadProgress';

function ChatView({
  connectedPeer,
  currentConnectionId,
  messages,
  messageInput,
  setMessageInput,
  channelReady,
  logs,
  fileUploadProgress,
  onSendMessage,
  onFileSelect,
  onDisconnect,
  onDownloadFile,
  onCancelUpload
}) {
  const fileInputRef = useRef(null);

  return (
    <div className="chat-container">
      <div className="chat-header">
        <div>
          <h2>Connected</h2>
          <p className="connection-details">
            Peer: {connectedPeer || 'Unknown'} • ID: {currentConnectionId}
          </p>
        </div>
        <button className="disconnect-button" onClick={onDisconnect}>Disconnect</button>
      </div>

      <div className="messages">
        {messages.length === 0 ? (
          <p className="empty">No messages yet. Start chatting!</p>
        ) : (
          messages.map((msg, idx) => (
            <Message key={idx} message={msg} onDownload={onDownloadFile} />
          ))
        )}
      </div>

      {fileUploadProgress && (
        <FileUploadProgress
          fileName={fileUploadProgress.fileName}
          progress={fileUploadProgress.progress}
          onCancel={onCancelUpload}
        />
      )}

      <div className="message-input">
        <input
          ref={fileInputRef}
          type="file"
          onChange={onFileSelect}
          style={{ display: 'none' }}
        />
        <button
          className="file-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!channelReady || fileUploadProgress}
          title="Send file"
        >
          📎
        </button>
        <input
          type="text"
          value={messageInput}
          onChange={(e) => setMessageInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && onSendMessage()}
          placeholder="Type a message..."
          disabled={!channelReady}
        />
        <button
          onClick={onSendMessage}
          disabled={!channelReady}
        >
          Send
        </button>
      </div>

      {logs.length > 0 && (
        <details className="logs">
          <summary>Activity Log ({logs.length})</summary>
          <div className="log-entries">
            {logs.map((log, idx) => (
              <div key={idx} className={`log-entry ${log.type}`}>
                [{log.timestamp}] {log.message}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export default ChatView;
