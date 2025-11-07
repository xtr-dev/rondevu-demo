import { useState, useEffect, useRef } from 'react';
import { Rondevu, RondevuClient } from '@xtr-dev/rondevu-client';

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
  const [action, setAction] = useState(null); // 'create' or 'join'
  const [method, setMethod] = useState(null); // 'topic', 'peer-id', 'connection-id'

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

  const connectionRef = useRef(null);
  const dataChannelRef = useRef(null);

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

    channel.onmessage = (event) => {
      setMessages(prev => [...prev, {
        text: event.data,
        type: 'received',
        timestamp: new Date()
      }]);
    };
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
    } catch (error) {
      log(`Error: ${error.message}`, 'error');
      setConnectionStatus('disconnected');
    }
  };

  const sendMessage = () => {
    if (!messageInput || !dataChannelRef.current || dataChannelRef.current.readyState !== 'open') {
      return;
    }

    dataChannelRef.current.send(messageInput);
    setMessages(prev => [...prev, {
      text: messageInput,
      type: 'sent',
      timestamp: new Date()
    }]);
    setMessageInput('');
  };

  const reset = () => {
    if (connectionRef.current) {
      connectionRef.current.close();
    }
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
            <div className="button-grid">
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
            </div>
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

            <div className="messages">
              {messages.length === 0 ? (
                <p className="empty">No messages yet. Start chatting!</p>
              ) : (
                messages.map((msg, idx) => (
                  <div key={idx} className={`message ${msg.type}`}>
                    <div className="message-text">{msg.text}</div>
                    <div className="message-time">{msg.timestamp.toLocaleTimeString()}</div>
                  </div>
                ))
              )}
            </div>

            <div className="message-input">
              <input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Type a message..."
                disabled={!dataChannelRef.current || dataChannelRef.current.readyState !== 'open'}
              />
              <button
                onClick={sendMessage}
                disabled={!dataChannelRef.current || dataChannelRef.current.readyState !== 'open'}
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
