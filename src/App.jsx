import React, {useState, useEffect} from 'react';
import {Rondevu} from '@xtr-dev/rondevu-client';
import toast, {Toaster} from 'react-hot-toast';

const API_URL = 'https://api.ronde.vu';

const RTC_CONFIG = {
  iceServers: [
    {
      urls: ["stun:stun.ronde.vu:3478"]
    },
    {
      urls: [
        "turn:turn.ronde.vu:3478?transport=tcp",
        "turn:turn.ronde.vu:3478?transport=udp",
      ],
      username: "webrtcuser",
      credential: "supersecretpassword"
    }
  ],
  // Force relay to test TURN server (comment out for normal operation)
  // iceTransportPolicy: 'relay'
};

export default function App() {
  const [client, setClient] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [activeTab, setActiveTab] = useState('setup');
  const [status, setStatus] = useState('Not registered');

  // Offer state
  const [offerTopics, setOfferTopics] = useState('demo-chat');
  const [myConnections, setMyConnections] = useState([]);

  // Discovery state
  const [searchTopic, setSearchTopic] = useState('demo-chat');
  const [discoveredOffers, setDiscoveredOffers] = useState([]);

  // Messages
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');

  // Load credentials
  useEffect(() => {
    const saved = localStorage.getItem('rondevu-credentials');
    if (saved) {
      try {
        const creds = JSON.parse(saved);
        // Validate credentials have required fields
        if (creds && creds.peerId && creds.secret) {
          setCredentials(creds);
          setClient(new Rondevu({baseUrl: API_URL, credentials: creds}));
          setStatus('Registered (from storage)');
        } else {
          // Invalid credentials, remove them
          localStorage.removeItem('rondevu-credentials');
          setClient(new Rondevu({baseUrl: API_URL}));
          setStatus('Not registered');
        }
      } catch (err) {
        // Corrupted credentials, remove them
        console.error('Failed to load credentials:', err);
        localStorage.removeItem('rondevu-credentials');
        setClient(new Rondevu({baseUrl: API_URL}));
        setStatus('Not registered');
      }
    } else {
      setClient(new Rondevu({baseUrl: API_URL}));
    }
  }, []);

  // Cleanup on unmount only (empty dependency array)
  useEffect(() => {
    return () => {
      // Close all peer connections when component unmounts
      myConnections.forEach(c => c.peer?.close());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps = only run on mount/unmount

  // Register
  const handleRegister = async () => {
    if (!client) return;
    try {
      setStatus('Registering...');
      const creds = await client.register();
      setCredentials(creds);
      localStorage.setItem('rondevu-credentials', JSON.stringify(creds));
      setClient(new Rondevu({baseUrl: API_URL, credentials: creds}));
      setStatus('Registered!');
      setActiveTab('offer');
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  };

  // Create offer with peer connection manager
  const handleCreateOffer = async () => {
    if (!client || !credentials) {
      toast.error('Please register first!');
      return;
    }

    try {
      const topics = offerTopics.split(',').map(t => t.trim()).filter(Boolean);

      // Create peer connection using the manager
      const peer = client.createPeer(RTC_CONFIG);

      // Add debugging
      addApiLogging(client);
      addIceLogging(peer);

      // Setup event listeners
      peer.on('state', (state) => {
        console.log(`🔄 Peer state: ${state}`);
        updateConnectionStatus(peer.offerId, state);
      });

      peer.on('connected', () => {
        updateConnectionStatus(peer.offerId, 'connected');
      });

      peer.on('disconnected', () => {
        updateConnectionStatus(peer.offerId, 'disconnected');
      });

      peer.on('failed', (error) => {
        console.error('❌ Peer connection failed:', error);
        toast.error(`Connection failed: ${error.message}`);
        updateConnectionStatus(peer.offerId, 'failed');
      });

      peer.on('datachannel', (channel) => {
        // Handle data channel
        channel.onmessage = (event) => {
          setMessages(prev => [...prev, {
            from: 'peer',
            text: event.data,
            timestamp: Date.now(),
            connId: peer.offerId
          }]);
        };

        updateConnectionChannel(peer.offerId, channel);
      });

      // Create offer
      const offerId = await peer.createOffer({
        topics,
        ttl: 300000,
        timeouts: {
          iceGathering: 15000,
          waitingForAnswer: 60000,
          iceConnection: 45000
        }
      });

      // Add to connections list
      setMyConnections(prev => [...prev, {
        id: offerId,
        topics,
        status: 'waiting-for-answer',
        role: 'offerer',
        peer,
        channel: null
      }]);

      setOfferTopics('');
      toast.success(`Created offer! Share topic "${topics[0]}" with peers.`);
    } catch (err) {
      console.error('Error creating offer:', err);
      toast.error(`Error: ${err.message}`);
    }
  };

  // Discover peers
  const handleDiscoverPeers = async () => {
    if (!client) return;

    if (!client.isAuthenticated()) {
      toast.error('Please register first!');
      return;
    }

    try {
      const offers = await client.offers.findByTopic(searchTopic.trim(), {limit: 50});
      setDiscoveredOffers(offers);

      if (offers.length === 0) {
        toast.error('No peers found!');
      } else {
        toast.success(`Found ${offers.length} peer(s)`);
      }
    } catch (err) {
      toast.error(`Error: ${err.message}`);
    }
  };

  // Answer an offer
  const handleAnswerOffer = async (offer) => {
    if (!client || !credentials) {
      toast.error('Please register first!');
      return;
    }

    try {
      // Create peer connection using the manager
      const peer = client.createPeer(RTC_CONFIG);

      // Add debugging
      addApiLogging(client);
      addIceLogging(peer);

      // Setup event listeners
      peer.on('state', (state) => {
        console.log(`🔄 Peer state: ${state}`);
        updateConnectionStatus(offer.id, state);
      });

      peer.on('connected', () => {
        updateConnectionStatus(offer.id, 'connected');
      });

      peer.on('disconnected', () => {
        updateConnectionStatus(offer.id, 'disconnected');
      });

      peer.on('failed', (error) => {
        console.error('❌ Peer connection failed:', error);
        toast.error(`Connection failed: ${error.message}`);
        updateConnectionStatus(offer.id, 'failed');
      });

      peer.on('datachannel', (channel) => {
        // Handle data channel
        channel.onmessage = (event) => {
          setMessages(prev => [...prev, {
            from: 'peer',
            text: event.data,
            timestamp: Date.now(),
            connId: offer.id
          }]);
        };

        updateConnectionChannel(offer.id, channel);
      });

      // Answer the offer
      await peer.answer(offer.id, offer.sdp, {
        topics: offer.topics,
        timeouts: {
          iceGathering: 15000,
          creatingAnswer: 15000,
          iceConnection: 45000
        }
      });

      // Add to connections list
      setMyConnections(prev => [...prev, {
        id: offer.id,
        topics: offer.topics,
        status: 'answering',
        role: 'answerer',
        peer,
        channel: null
      }]);

      setActiveTab('connections');
      toast.success('Answering offer...');
    } catch (err) {
      console.error('Error answering offer:', err);
      toast.error(`Error: ${err.message}`);
    }
  };

  // Helper functions
  const updateConnectionStatus = (connId, status) => {
    setMyConnections(prev => prev.map(c =>
      c.id === connId ? {...c, status} : c
    ));
  };

  const updateConnectionChannel = (connId, channel) => {
    setMyConnections(prev => prev.map(c =>
      c.id === connId ? {...c, channel} : c
    ));
  };

  // Add API-level ICE candidate logging
  const addApiLogging = (client) => {
    const originalAddIceCandidates = client.offers.addIceCandidates.bind(client.offers);
    const originalGetIceCandidates = client.offers.getIceCandidates.bind(client.offers);

    client.offers.addIceCandidates = async (offerId, candidates) => {
      console.log(`📤 Sending ${candidates.length} ICE candidate(s) to server for offer ${offerId}`);
      console.log(`📤 Candidates:`, candidates);
      const result = await originalAddIceCandidates(offerId, candidates);
      console.log(`📤 Send result:`, result);
      return result;
    };

    client.offers.getIceCandidates = async (offerId, since) => {
      const result = await originalGetIceCandidates(offerId, since);
      console.log(`📥 Received ${result.length} ICE candidate(s) from server for offer ${offerId}, since=${since}`);
      if (result.length > 0) {
        console.log(`📥 All candidates:`, result);
        result.forEach((cand, i) => {
          console.log(`📥 Candidate ${i}:`, {
            role: cand.role,
            peerId: cand.peerId,
            candidate: cand.candidate,
            createdAt: cand.createdAt
          });
        });
      }
      return result;
    };
  };

  // Add ICE debugging to a peer connection
  const addIceLogging = (peer) => {
    const pc = peer.pc; // Access underlying peer connection for debugging
    if (pc) {
      // Add new handlers that don't override existing ones
      pc.addEventListener('icecandidate', (event) => {
        if (event.candidate) {
          // Skip empty/end-of-candidates markers in logs
          if (!event.candidate.candidate || event.candidate.candidate === '') {
            console.log('🧊 ICE gathering complete (end-of-candidates marker)');
            return;
          }

          console.log('🧊 ICE candidate gathered:', {
            type: event.candidate.type,
            protocol: event.candidate.protocol,
            address: event.candidate.address,
            port: event.candidate.port,
            candidate: event.candidate.candidate
          });
        } else {
          console.log('🧊 ICE gathering complete');
        }
      });

      pc.addEventListener('icegatheringstatechange', () => {
        console.log('🧊 ICE gathering state:', pc.iceGatheringState);
      });

      pc.addEventListener('iceconnectionstatechange', () => {
        console.log('🧊 ICE connection state:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed') {
          console.error('❌ ICE connection failed! Check firewall/NAT/TURN server.');
          // Log stats when failed
          pc.getStats().then(stats => {
            console.log('📊 Connection stats at failure:', stats);
          });
        } else if (pc.iceConnectionState === 'checking') {
          console.log('⏳ ICE checking candidates...');
          // Set a timeout to detect if we're stuck
          setTimeout(() => {
            if (pc.iceConnectionState === 'checking') {
              console.warn('⚠️ Still in checking state after 30s - connection may be stuck');
              pc.getStats().then(stats => {
                stats.forEach(report => {
                  if (report.type === 'candidate-pair') {
                    console.log('Candidate pair:', report);
                  }
                });
              });
            }
          }, 30000);
        }
      });

      pc.addEventListener('connectionstatechange', () => {
        console.log('🔌 Connection state:', pc.connectionState);
        if (pc.connectionState === 'failed') {
          console.error('❌ Connection failed!');
          // Log the selected candidate pair to see what was attempted
          pc.getStats().then(stats => {
            stats.forEach(report => {
              if (report.type === 'candidate-pair' && report.selected) {
                console.log('Selected candidate pair:', report);
              }
            });
          });
        }
      });

      // Log ICE candidate pair changes
      pc.addEventListener('icecandidate', () => {
        setTimeout(() => {
          pc.getStats().then(stats => {
            stats.forEach(report => {
              if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                console.log('✅ ICE candidate pair succeeded:', {
                  local: report.localCandidateId,
                  remote: report.remoteCandidateId,
                  nominated: report.nominated,
                  state: report.state
                });
              } else if (report.type === 'candidate-pair' && report.state === 'failed') {
                console.log('❌ ICE candidate pair failed:', {
                  local: report.localCandidateId,
                  remote: report.remoteCandidateId,
                  state: report.state
                });
              }
            });
          });
        }, 1000);
      });
    }
  };

  // Send message
  const handleSendMessage = (connection) => {
    if (!messageInput.trim() || !connection.channel) return;

    if (connection.channel.readyState !== 'open') {
      toast.error('Channel not open yet!');
      return;
    }

    connection.channel.send(messageInput);
    setMessages(prev => [...prev, {
      from: 'me',
      text: messageInput,
      timestamp: Date.now(),
      connId: connection.id
    }]);
    setMessageInput('');
  };

  // Clear credentials
  const handleClearCredentials = () => {
    localStorage.removeItem('rondevu-credentials');
    setCredentials(null);
    setStatus('Not registered');
    myConnections.forEach(c => c.peer?.close());
    setMyConnections([]);
    setMessages([]);
    setClient(new Rondevu({baseUrl: API_URL}));
  };

  return (
    <div style={styles.container}>
      <Toaster position="top-right"/>
      <div style={styles.inner}>
        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.title}>🌐 Rondevu</h1>
          <p style={styles.subtitle}>Topic-Based Peer Discovery & WebRTC</p>
          <p style={styles.version}>v0.5.0 - State-Based Peer Manager</p>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          {[
            {id: 'setup', label: '1️⃣ Setup', icon: '⚙️'},
            {id: 'offer', label: '2️⃣ Create', icon: '📤'},
            {id: 'discover', label: '3️⃣ Discover', icon: '🔍'},
            {id: 'connections', label: '4️⃣ Chat', icon: '💬'}
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                ...styles.tab,
                ...(activeTab === tab.id ? styles.tabActive : {})
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={styles.content}>
          {/* Setup Tab */}
          {activeTab === 'setup' && (
            <div>
              <h2>Registration</h2>
              <p style={styles.desc}>Get your credentials to start connecting</p>

              <div style={{...styles.card, background: credentials ? '#e8f5e9' : '#fff3e0', marginBottom: '20px'}}>
                <div style={{fontWeight: '600', marginBottom: '10px'}}>Status: {status}</div>
                {credentials && (
                  <div style={{fontSize: '0.9em'}}>
                    <div><strong>Peer ID:</strong> <code>{credentials.peerId.substring(0, 20)}...</code></div>
                  </div>
                )}
              </div>

              {!credentials ? (
                <button onClick={handleRegister} style={styles.btnPrimary}>Register</button>
              ) : (
                <div style={{display: 'flex', gap: '10px'}}>
                  <button onClick={() => setActiveTab('offer')} style={styles.btnPrimary}>Continue →</button>
                  <button onClick={handleClearCredentials} style={styles.btnDanger}>Clear</button>
                </div>
              )}
            </div>
          )}

          {/* Create Offer Tab */}
          {activeTab === 'offer' && (
            <div>
              <h2>Create Offer</h2>
              <p style={styles.desc}>Create a WebRTC offer that peers can discover</p>

              {!credentials ? (
                <div style={{...styles.card, background: '#ffebee', color: '#c62828'}}>
                  ⚠️ Please register first
                </div>
              ) : (
                <>
                  <div style={{marginBottom: '20px'}}>
                    <label style={styles.label}>Topics:</label>
                    <input
                      type="text"
                      value={offerTopics}
                      onChange={(e) => setOfferTopics(e.target.value)}
                      placeholder="demo-chat, file-share"
                      style={styles.input}
                    />
                  </div>

                  <button onClick={handleCreateOffer} style={styles.btnPrimary}>
                    📤 Create Offer
                  </button>

                  {myConnections.filter(c => c.role === 'offerer').length > 0 && (
                    <div style={{marginTop: '30px'}}>
                      <h3>My Offers ({myConnections.filter(c => c.role === 'offerer').length})</h3>
                      {myConnections.filter(c => c.role === 'offerer').map(conn => (
                        <div key={conn.id} style={styles.card}>
                          <div style={{display: 'flex', justifyContent: 'space-between'}}>
                            <div>
                              <div style={{fontWeight: '600'}}>{conn.topics.join(', ')}</div>
                              <div style={{fontSize: '0.85em', color: '#666'}}>
                                ID: {conn.id.substring(0, 12)}...
                              </div>
                            </div>
                            <div style={{
                              ...styles.badge,
                              background: conn.status === 'connected' ? '#4caf50' :
                                conn.status === 'connecting' ? '#ff9800' : '#999'
                            }}>
                              {conn.status}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Discover Tab */}
          {activeTab === 'discover' && (
            <div>
              <h2>Discover Peers</h2>
              <p style={styles.desc}>Search for peers by topic</p>

              <div style={{marginBottom: '20px'}}>
                <label style={styles.label}>Topic:</label>
                <div style={{display: 'flex', gap: '10px'}}>
                  <input
                    type="text"
                    value={searchTopic}
                    onChange={(e) => setSearchTopic(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleDiscoverPeers()}
                    style={{...styles.input, flex: 1}}
                  />
                  <button onClick={handleDiscoverPeers} style={styles.btnPrimary}>
                    🔍 Search
                  </button>
                </div>
              </div>

              {discoveredOffers.length > 0 && (
                <div>
                  <h3>Found {discoveredOffers.length} Peer(s)</h3>
                  {discoveredOffers.map(offer => {
                    const isConnected = myConnections.some(c => c.id === offer.id);
                    const isMine = credentials && offer.peerId === credentials.peerId;

                    return (
                      <div key={offer.id} style={styles.card}>
                        <div style={{marginBottom: '10px'}}>
                          <div style={{fontWeight: '600'}}>{offer.topics.join(', ')}</div>
                          <div style={{fontSize: '0.85em', color: '#666'}}>
                            Peer: {offer.peerId.substring(0, 16)}...
                          </div>
                        </div>

                        {isMine ? (
                          <div style={{...styles.badge, background: '#2196f3'}}>Your offer</div>
                        ) : isConnected ? (
                          <div style={{...styles.badge, background: '#4caf50'}}>✓ Connected</div>
                        ) : (
                          <button onClick={() => handleAnswerOffer(offer)} style={styles.btnSuccess}>
                            🤝 Connect
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Connections Tab */}
          {activeTab === 'connections' && (
            <div>
              <h2>Active Connections</h2>
              <p style={styles.desc}>Chat with connected peers</p>

              {myConnections.length === 0 ? (
                <div style={{textAlign: 'center', padding: '40px', color: '#999'}}>
                  <div style={{fontSize: '3em'}}>🔌</div>
                  <div>No connections yet</div>
                </div>
              ) : (
                <div>
                  {myConnections.map(conn => {
                    const connMessages = messages.filter(m => m.connId === conn.id);

                    return (
                      <div key={conn.id} style={{...styles.card, padding: '20px', marginBottom: '20px'}}>
                        <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '15px'}}>
                          <div>
                            <div style={{fontWeight: '600'}}>{conn.topics.join(', ')}</div>
                            <div style={{fontSize: '0.85em', color: '#666'}}>Role: {conn.role}</div>
                          </div>
                          <div style={{
                            ...styles.badge,
                            background: conn.status === 'connected' ? '#4caf50' :
                              conn.status === 'connecting' ? '#ff9800' : '#999'
                          }}>
                            {conn.status === 'connected' ? '🟢 Connected' :
                              conn.status === 'connecting' ? '🟡 Connecting' : '⚪ Waiting'}
                          </div>
                        </div>

                        {conn.status === 'connected' && (
                          <>
                            <div style={styles.messages}>
                              {connMessages.length === 0 ? (
                                <div style={{textAlign: 'center', color: '#999', padding: '20px'}}>
                                  No messages yet. Say hi!
                                </div>
                              ) : (
                                connMessages.map((msg, i) => (
                                  <div key={i} style={{
                                    display: 'flex',
                                    justifyContent: msg.from === 'me' ? 'flex-end' : 'flex-start',
                                    marginBottom: '10px'
                                  }}>
                                    <div style={{
                                      ...styles.message,
                                      background: msg.from === 'me' ? '#667eea' : 'white',
                                      color: msg.from === 'me' ? 'white' : '#333'
                                    }}>
                                      <div>{msg.text}</div>
                                      <div style={{fontSize: '0.75em', opacity: 0.7, marginTop: '4px'}}>
                                        {new Date(msg.timestamp).toLocaleTimeString()}
                                      </div>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>

                            <div style={{display: 'flex', gap: '10px'}}>
                              <input
                                type="text"
                                value={messageInput}
                                onChange={(e) => setMessageInput(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage(conn)}
                                placeholder="Type a message..."
                                style={{...styles.input, flex: 1, margin: 0}}
                              />
                              <button onClick={() => handleSendMessage(conn)} style={styles.btnPrimary}>
                                Send
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <p>Server: {API_URL}</p>
          <p>Open in multiple tabs to test peer-to-peer connections</p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  inner: {
    maxWidth: '1200px',
    margin: '0 auto'
  },
  header: {
    textAlign: 'center',
    marginBottom: '40px',
    color: 'white'
  },
  title: {
    fontSize: '3em',
    margin: '0 0 10px 0',
    fontWeight: '700'
  },
  subtitle: {
    fontSize: '1.2em',
    opacity: 0.9,
    margin: 0
  },
  version: {
    fontSize: '0.9em',
    opacity: 0.7,
    margin: '10px 0 0 0'
  },
  tabs: {
    display: 'flex',
    gap: '10px',
    marginBottom: '20px',
    flexWrap: 'wrap',
    justifyContent: 'center'
  },
  tab: {
    padding: '12px 24px',
    background: 'rgba(255,255,255,0.2)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '1em',
    fontWeight: '600',
    transition: 'all 0.3s'
  },
  tabActive: {
    background: 'white',
    color: '#667eea',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
  },
  content: {
    background: 'white',
    borderRadius: '16px',
    padding: '30px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
    minHeight: '500px'
  },
  desc: {
    color: '#666',
    marginBottom: '20px'
  },
  card: {
    padding: '15px',
    background: 'white',
    borderRadius: '8px',
    border: '1px solid #e0e0e0',
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
    marginBottom: '10px'
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    fontWeight: '600',
    color: '#333'
  },
  input: {
    width: '100%',
    padding: '12px',
    fontSize: '1em',
    border: '2px solid #e0e0e0',
    borderRadius: '8px',
    boxSizing: 'border-box',
    outline: 'none',
    marginBottom: '10px'
  },
  btnPrimary: {
    padding: '12px 24px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '1em',
    fontWeight: '600',
    boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
  },
  btnSuccess: {
    padding: '10px 20px',
    background: '#4caf50',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '0.95em',
    fontWeight: '600',
    width: '100%'
  },
  btnDanger: {
    padding: '12px 24px',
    background: '#f44336',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '1em',
    fontWeight: '600'
  },
  badge: {
    padding: '6px 14px',
    color: 'white',
    borderRadius: '12px',
    fontSize: '0.85em',
    fontWeight: '600'
  },
  messages: {
    height: '200px',
    overflowY: 'auto',
    padding: '10px',
    background: '#f5f5f5',
    borderRadius: '8px',
    marginBottom: '10px'
  },
  message: {
    maxWidth: '70%',
    padding: '8px 12px',
    borderRadius: '8px',
    boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
  },
  footer: {
    marginTop: '40px',
    textAlign: 'center',
    color: 'white',
    opacity: 0.8,
    fontSize: '0.9em'
  }
};
