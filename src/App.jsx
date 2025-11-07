import { useState, useEffect, useRef } from 'react';
import { Rondevu, RondevuClient } from '@xtr-dev/rondevu-client';
import QRCode from 'qrcode';
import { BrowserQRCodeReader } from '@zxing/library';

const rdv = new Rondevu({
  baseUrl: 'https://rondevu.xtrdev.workers.dev',
  rtcConfig: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      {
        urls: 'turn:relay1.expressturn.com:3480',
        username: 'ef13B1E5PH265HK1N2',
        credential: 'TTcTPEy3ndxsS0Gp'
      }
    ]
  }
});

const client = new RondevuClient({
  baseUrl: 'https://rondevu.xtrdev.workers.dev'
});

function App() {
  // Step-based state
  const [step, setStep] = useState(1); // 1: action, 2: method, 3: details, 4: connected
  const [action, setAction] = useState(null); // 'create', 'join', or 'scan'
  const [method, setMethod] = useState(null); // 'topic', 'peer-id', 'connection-id'
  const [qrCodeUrl, setQrCodeUrl] = useState('');

  // Connection state
  const [topic, setTopic] = useState('');
  const [connectionId, setConnectionId] = useState('');
  const [peerId, setPeerId] = useState('');
  const [topics, setTopics] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [connectedPeer, setConnectedPeer] = useState(null);
  const [currentConnectionId, setCurrentConnectionId] = useState(null);

  // Chat state
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [logs, setLogs] = useState([]);
  const [channelReady, setChannelReady] = useState(false);

  const connectionRef = useRef(null);
  const dataChannelRef = useRef(null);
  const fileInputRef = useRef(null);
  const fileTransfersRef = useRef(new Map()); // Track ongoing file transfers
  const videoRef = useRef(null);
  const scannerRef = useRef(null);

  useEffect(() => {
    log('Demo initialized', 'info');
    loadTopics();
  }, []);

  const log = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { message, type, timestamp }]);
  };

  const loadTopics = async () => {
    try {
      const { topics } = await client.listTopics();
      setTopics(topics);
    } catch (error) {
      log(`Error loading topics: ${error.message}`, 'error');
    }
  };

  const discoverPeers = async (topicName) => {
    try {
      const { sessions: foundSessions } = await client.listSessions(topicName);
      const otherSessions = foundSessions.filter(s => s.peerId !== rdv.peerId);
      setSessions(otherSessions);
    } catch (error) {
      log(`Error discovering peers: ${error.message}`, 'error');
    }
  };

  const setupConnection = (connection) => {
    connectionRef.current = connection;

    connection.on('connect', () => {
      log('✅ Connected!', 'success');
      setConnectionStatus('connected');
      setStep(4);

      const channel = connection.dataChannel('chat');
      setupDataChannel(channel);
    });

    connection.on('disconnect', () => {
      log('Disconnected', 'info');
      reset();
    });

    connection.on('error', (error) => {
      log(`Error: ${error.message}`, 'error');
      if (error.message.includes('timeout')) {
        reset();
      }
    });

    connection.on('datachannel', (channel) => {
      if (channel.label === 'chat') {
        setupDataChannel(channel);
      }
    });
  };

  const setupDataChannel = (channel) => {
    dataChannelRef.current = channel;

    channel.onopen = () => {
      log('Data channel ready', 'success');
      setChannelReady(true);
    };

    channel.onclose = () => {
      log('Data channel closed', 'info');
      setChannelReady(false);
    };

    channel.onmessage = (event) => {
      handleReceivedMessage(event.data);
    };

    // If channel is already open (for channels we create)
    if (channel.readyState === 'open') {
      log('Data channel ready', 'success');
      setChannelReady(true);
    }
  };

  const handleConnect = async () => {
    try {
      setConnectionStatus('connecting');
      log('Connecting...', 'info');

      let connection;

      if (action === 'create') {
        if (method === 'connection-id') {
          const id = connectionId || `conn-${Date.now()}`;
          connection = await rdv.create(id, topic || 'default');
          setCurrentConnectionId(id);
          log(`Created connection: ${id}`, 'success');
        } else {
          const id = `conn-${Date.now()}`;
          connection = await rdv.create(id, topic);
          setCurrentConnectionId(id);
          log(`Created connection: ${id}`, 'success');
        }
      } else {
        if (method === 'topic') {
          connection = await rdv.join(topic);
          setCurrentConnectionId(connection.id);
        } else if (method === 'peer-id') {
          connection = await rdv.join(topic, {
            filter: (s) => s.peerId === peerId
          });
          setCurrentConnectionId(connection.id);
        } else if (method === 'connection-id') {
          connection = await rdv.connect(connectionId);
          setCurrentConnectionId(connectionId);
        }
      }

      setConnectedPeer(connection.remotePeerId || 'Waiting...');
      setupConnection(connection);

      // Generate QR code if creating a connection
      if (action === 'create' && currentConnectionId) {
        try {
          const qrUrl = await QRCode.toDataURL(currentConnectionId, {
            width: 256,
            margin: 2,
            color: {
              dark: '#667eea',
              light: '#ffffff'
            }
          });
          setQrCodeUrl(qrUrl);
        } catch (err) {
          log(`QR code generation error: ${err.message}`, 'error');
        }
      }
    } catch (error) {
      log(`Error: ${error.message}`, 'error');
      setConnectionStatus('disconnected');
    }
  };

  const startScanning = async () => {
    try {
      scannerRef.current = new BrowserQRCodeReader();
      log('Starting QR scanner...', 'info');

      const videoInputDevices = await scannerRef.current.listVideoInputDevices();

      if (videoInputDevices.length === 0) {
        log('No camera found', 'error');
        return;
      }

      const selectedDeviceId = videoInputDevices[0].deviceId;

      scannerRef.current.decodeFromVideoDevice(
        selectedDeviceId,
        videoRef.current,
        (result, err) => {
          if (result) {
            const scannedId = result.getText();
            log(`Scanned: ${scannedId}`, 'success');
            setConnectionId(scannedId);
            stopScanning();
            setMethod('connection-id');
            setStep(3);
          }
        }
      );
    } catch (error) {
      log(`Scanner error: ${error.message}`, 'error');
    }
  };

  const stopScanning = () => {
    if (scannerRef.current) {
      scannerRef.current.reset();
      log('Scanner stopped', 'info');
    }
  };

  useEffect(() => {
    if (action === 'scan') {
      startScanning();
    }
    return () => {
      stopScanning();
    };
  }, [action]);

  const sendMessage = () => {
    if (!messageInput || !channelReady || !dataChannelRef.current) {
      return;
    }

    const message = { type: 'text', content: messageInput };
    dataChannelRef.current.send(JSON.stringify(message));
    setMessages(prev => [...prev, {
      text: messageInput,
      messageType: 'text',
      type: 'sent',
      timestamp: new Date()
    }]);
    setMessageInput('');
  };

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file || !channelReady || !dataChannelRef.current) {
      return;
    }

    const CHUNK_SIZE = 16384; // 16KB chunks
    const fileId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    log(`Sending file: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`, 'info');

    try {
      // Send file metadata
      const metadata = {
        type: 'file-start',
        fileId,
        name: file.name,
        size: file.size,
        mimeType: file.type,
        chunks: Math.ceil(file.size / CHUNK_SIZE)
      };
      dataChannelRef.current.send(JSON.stringify(metadata));

      // Read and send file in chunks
      const reader = new FileReader();
      let offset = 0;
      let chunkIndex = 0;

      const readChunk = () => {
        const slice = file.slice(offset, offset + CHUNK_SIZE);
        reader.readAsArrayBuffer(slice);
      };

      reader.onload = (e) => {
        const chunk = {
          type: 'file-chunk',
          fileId,
          index: chunkIndex,
          data: Array.from(new Uint8Array(e.target.result))
        };
        dataChannelRef.current.send(JSON.stringify(chunk));

        offset += CHUNK_SIZE;
        chunkIndex++;

        if (offset < file.size) {
          readChunk();
        } else {
          // Send completion message
          const complete = { type: 'file-complete', fileId };
          dataChannelRef.current.send(JSON.stringify(complete));

          // Add to local messages
          setMessages(prev => [...prev, {
            messageType: 'file',
            file: {
              name: file.name,
              size: file.size,
              mimeType: file.type,
              data: file
            },
            type: 'sent',
            timestamp: new Date()
          }]);

          log(`File sent: ${file.name}`, 'success');
        }
      };

      reader.onerror = () => {
        log(`Error reading file: ${file.name}`, 'error');
      };

      readChunk();
    } catch (error) {
      log(`Error sending file: ${error.message}`, 'error');
    }

    // Reset file input
    event.target.value = '';
  };

  const handleReceivedMessage = (data) => {
    try {
      const message = JSON.parse(data);

      if (message.type === 'text') {
        setMessages(prev => [...prev, {
          text: message.content,
          messageType: 'text',
          type: 'received',
          timestamp: new Date()
        }]);
      } else if (message.type === 'file-start') {
        fileTransfersRef.current.set(message.fileId, {
          name: message.name,
          size: message.size,
          mimeType: message.mimeType,
          chunks: new Array(message.chunks),
          receivedChunks: 0
        });
        log(`Receiving file: ${message.name}`, 'info');
      } else if (message.type === 'file-chunk') {
        const transfer = fileTransfersRef.current.get(message.fileId);
        if (transfer) {
          transfer.chunks[message.index] = new Uint8Array(message.data);
          transfer.receivedChunks++;
        }
      } else if (message.type === 'file-complete') {
        const transfer = fileTransfersRef.current.get(message.fileId);
        if (transfer) {
          // Combine all chunks
          const totalSize = transfer.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
          const combined = new Uint8Array(totalSize);
          let offset = 0;
          for (const chunk of transfer.chunks) {
            combined.set(chunk, offset);
            offset += chunk.length;
          }

          const blob = new Blob([combined], { type: transfer.mimeType });

          setMessages(prev => [...prev, {
            messageType: 'file',
            file: {
              name: transfer.name,
              size: transfer.size,
              mimeType: transfer.mimeType,
              data: blob
            },
            type: 'received',
            timestamp: new Date()
          }]);

          log(`File received: ${transfer.name}`, 'success');
          fileTransfersRef.current.delete(message.fileId);
        }
      }
    } catch (error) {
      // Assume it's a plain text message (backward compatibility)
      setMessages(prev => [...prev, {
        text: data,
        messageType: 'text',
        type: 'received',
        timestamp: new Date()
      }]);
    }
  };

  const downloadFile = (file) => {
    const url = URL.createObjectURL(file.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    if (connectionRef.current) {
      connectionRef.current.close();
    }
    stopScanning();
    setStep(1);
    setAction(null);
    setMethod(null);
    setTopic('');
    setConnectionId('');
    setPeerId('');
    setSessions([]);
    setConnectionStatus('disconnected');
    setConnectedPeer(null);
    setCurrentConnectionId(null);
    setMessages([]);
    setChannelReady(false);
    setQrCodeUrl('');
    connectionRef.current = null;
    dataChannelRef.current = null;
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <h1>Rondevu</h1>
          <p className="tagline">Meet WebRTC peers by topic, peer ID, or connection ID</p>
          <div className="header-links">
            <a href="https://github.com/xtr-dev/rondevu-client" target="_blank" rel="noopener noreferrer">
              <svg className="github-icon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
              </svg>
              Client
            </a>
            <a href="https://github.com/xtr-dev/rondevu-server" target="_blank" rel="noopener noreferrer">
              <svg className="github-icon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
              </svg>
              Server
            </a>
            <a href="https://github.com/xtr-dev/rondevu-demo" target="_blank" rel="noopener noreferrer">
              <svg className="github-icon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
              </svg>
              View source
            </a>
          </div>
        </div>
      </header>

      <main className="main">
        {step === 1 && (
          <div className="step-container">
            <h2>Choose Action</h2>
            <div className="button-grid button-grid-three">
              <button
                className="action-button"
                onClick={() => {
                  setAction('create');
                  setStep(2);
                }}
              >
                <div className="button-title">Create</div>
                <div className="button-description">Start a new connection</div>
              </button>
              <button
                className="action-button"
                onClick={() => {
                  setAction('join');
                  setStep(2);
                }}
              >
                <div className="button-title">Join</div>
                <div className="button-description">Connect to existing peers</div>
              </button>
              <button
                className="action-button"
                onClick={() => {
                  setAction('scan');
                }}
              >
                <div className="button-title">Scan QR</div>
                <div className="button-description">Scan a connection code</div>
              </button>
            </div>
            {action === 'scan' && (
              <div className="scanner-container">
                <video ref={videoRef} className="scanner-video" />
                <button className="back-button" onClick={() => setAction(null)}>← Cancel</button>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="step-container">
            <h2>{action === 'create' ? 'Create' : 'Join'} by...</h2>
            <div className="button-grid">
              <button
                className="action-button"
                onClick={() => {
                  setMethod('topic');
                  setStep(3);
                }}
              >
                <div className="button-title">Topic</div>
                <div className="button-description">
                  {action === 'create' ? 'Create in a topic' : 'Auto-connect to first peer'}
                </div>
              </button>
              {action === 'join' && (
                <button
                  className="action-button"
                  onClick={() => {
                    setMethod('peer-id');
                    setStep(3);
                  }}
                >
                  <div className="button-title">Peer ID</div>
                  <div className="button-description">Connect to specific peer</div>
                </button>
              )}
              <button
                className="action-button"
                onClick={() => {
                  setMethod('connection-id');
                  setStep(3);
                }}
              >
                <div className="button-title">Connection ID</div>
                <div className="button-description">
                  {action === 'create' ? 'Custom connection code' : 'Direct connection'}
                </div>
              </button>
            </div>
            <button className="back-button" onClick={() => setStep(1)}>← Back</button>
          </div>
        )}

        {step === 3 && (
          <div className="step-container">
            <h2>Enter Details</h2>
            <div className="form-container">
              {(method === 'topic' || (method === 'peer-id') || (method === 'connection-id' && action === 'create')) && (
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
                            setTopic(t.topic);
                            if (method === 'peer-id') {
                              discoverPeers(t.topic);
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
                <button className="back-button" onClick={() => setStep(2)}>← Back</button>
                <button
                  className="primary-button"
                  onClick={handleConnect}
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
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="chat-container">
            <div className="chat-header">
              <div>
                <h2>Connected</h2>
                <p className="connection-details">
                  Peer: {connectedPeer || 'Unknown'} • ID: {currentConnectionId}
                </p>
              </div>
              <button className="disconnect-button" onClick={reset}>Disconnect</button>
            </div>

            {qrCodeUrl && connectionStatus === 'connecting' && (
              <div className="qr-code-container">
                <p className="qr-label">Scan to connect:</p>
                <img src={qrCodeUrl} alt="Connection QR Code" className="qr-code" />
                <p className="connection-id-display">{currentConnectionId}</p>
              </div>
            )}

            <div className="messages">
              {messages.length === 0 ? (
                <p className="empty">No messages yet. Start chatting!</p>
              ) : (
                messages.map((msg, idx) => (
                  <div key={idx} className={`message ${msg.type}`}>
                    {msg.messageType === 'text' ? (
                      <div className="message-text">{msg.text}</div>
                    ) : (
                      <div className="message-file">
                        <div className="file-icon">📎</div>
                        <div className="file-info">
                          <div className="file-name">{msg.file.name}</div>
                          <div className="file-size">{(msg.file.size / 1024).toFixed(2)} KB</div>
                        </div>
                        <button
                          className="file-download"
                          onClick={() => downloadFile(msg.file)}
                        >
                          Download
                        </button>
                      </div>
                    )}
                    <div className="message-time">{msg.timestamp.toLocaleTimeString()}</div>
                  </div>
                ))
              )}
            </div>

            <div className="message-input">
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              <button
                className="file-button"
                onClick={() => fileInputRef.current?.click()}
                disabled={!channelReady}
                title="Send file"
              >
                📎
              </button>
              <input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Type a message..."
                disabled={!channelReady}
              />
              <button
                onClick={sendMessage}
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
        )}

        <div className="peer-id-badge">Your Peer ID: {rdv.peerId}</div>
      </main>

      <footer className="footer">
        <a href="https://ronde.vu" target="_blank" rel="noopener noreferrer">
          ronde.vu
        </a>
      </footer>
    </div>
  );
}

export default App;
