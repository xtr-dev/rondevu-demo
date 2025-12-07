import React, { useState, useEffect, useRef } from 'react';
import { Rondevu } from '@xtr-dev/rondevu-client';
import toast, { Toaster } from 'react-hot-toast';

const API_URL = 'https://api.ronde.vu';

// Preset RTC configurations
const RTC_PRESETS = {
  'ipv4-turn': {
    name: 'IPv4 TURN (Recommended)',
    config: {
      iceServers: [
        { urls: ["stun:57.129.61.67:3478"] },
        {
          urls: [
            "turn:57.129.61.67:3478?transport=tcp",
            "turn:57.129.61.67:3478?transport=udp",
          ],
          username: "webrtcuser",
          credential: "supersecretpassword"
        }
      ],
    }
  },
  'hostname-turns': {
    name: 'Hostname TURNS (TLS)',
    config: {
      iceServers: [
        { urls: ["stun:turn.share.fish:3478"] },
        {
          urls: [
            "turns:turn.share.fish:5349?transport=tcp",
            "turns:turn.share.fish:5349?transport=udp",
            "turn:turn.share.fish:3478?transport=tcp",
            "turn:turn.share.fish:3478?transport=udp",
          ],
          username: "webrtcuser",
          credential: "supersecretpassword"
        }
      ],
    }
  },
  'google-stun': {
    name: 'Google STUN Only',
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    }
  },
  'relay-only': {
    name: 'Force TURN Relay (Testing)',
    config: {
      iceServers: [
        { urls: ["stun:57.129.61.67:3478"] },
        {
          urls: [
            "turn:57.129.61.67:3478?transport=tcp",
            "turn:57.129.61.67:3478?transport=udp",
          ],
          username: "webrtcuser",
          credential: "supersecretpassword"
        }
      ],
      iceTransportPolicy: 'relay'
    }
  },
  'custom': {
    name: 'Custom Configuration',
    config: null // Will be loaded from user input
  }
};

export default function App() {
  const [client, setClient] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [myUsername, setMyUsername] = useState(null);

  // Setup
  const [setupStep, setSetupStep] = useState('register'); // register, claim, ready
  const [usernameInput, setUsernameInput] = useState('');

  // Contacts
  const [contacts, setContacts] = useState([]);
  const [contactInput, setContactInput] = useState('');
  const [onlineUsers, setOnlineUsers] = useState(new Set());

  // Chat
  const [activeChats, setActiveChats] = useState({});
  const [selectedChat, setSelectedChat] = useState(null);
  const [messageInputs, setMessageInputs] = useState({});

  // Service
  const [serviceHandle, setServiceHandle] = useState(null);
  const chatEndRef = useRef(null);

  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [rtcPreset, setRtcPreset] = useState('ipv4-turn');
  const [customRtcConfig, setCustomRtcConfig] = useState('');

  // Get current RTC configuration
  const getCurrentRtcConfig = () => {
    if (rtcPreset === 'custom') {
      try {
        return JSON.parse(customRtcConfig);
      } catch (err) {
        console.error('Invalid custom RTC config:', err);
        return RTC_PRESETS['ipv4-turn'].config;
      }
    }
    return RTC_PRESETS[rtcPreset]?.config || RTC_PRESETS['ipv4-turn'].config;
  };

  // Load saved settings
  useEffect(() => {
    const savedPreset = localStorage.getItem('rondevu-rtc-preset');
    const savedCustomConfig = localStorage.getItem('rondevu-rtc-custom');

    if (savedPreset) {
      setRtcPreset(savedPreset);
    }
    if (savedCustomConfig) {
      setCustomRtcConfig(savedCustomConfig);
    }
  }, []);

  // Save settings when they change
  useEffect(() => {
    localStorage.setItem('rondevu-rtc-preset', rtcPreset);
  }, [rtcPreset]);

  useEffect(() => {
    if (customRtcConfig) {
      localStorage.setItem('rondevu-rtc-custom', customRtcConfig);
    }
  }, [customRtcConfig]);

  // Load saved data and auto-register
  useEffect(() => {
    const savedCreds = localStorage.getItem('rondevu-chat-credentials');
    const savedUsername = localStorage.getItem('rondevu-chat-username');
    const savedContacts = localStorage.getItem('rondevu-chat-contacts');

    const initialize = async () => {
      let clientInstance;

      // Load contacts first
      if (savedContacts) {
        try {
          setContacts(JSON.parse(savedContacts));
        } catch (err) {
          console.error('Failed to load contacts:', err);
        }
      }

      // Handle credentials
      if (savedCreds) {
        try {
          const creds = JSON.parse(savedCreds);
          setCredentials(creds);
          clientInstance = new Rondevu({ baseUrl: API_URL, credentials: creds });
          setClient(clientInstance);

          // If we have username too, go straight to ready
          if (savedUsername) {
            setMyUsername(savedUsername);
            setSetupStep('ready');
          } else {
            // Have creds but no username - go to claim step
            setSetupStep('claim');
          }
        } catch (err) {
          console.error('Failed to load credentials:', err);
          // Invalid saved creds - auto-register
          clientInstance = new Rondevu({ baseUrl: API_URL });
          setClient(clientInstance);
          await autoRegister(clientInstance);
        }
      } else {
        // No saved credentials - auto-register
        console.log('No saved credentials, auto-registering...');
        clientInstance = new Rondevu({ baseUrl: API_URL });
        setClient(clientInstance);
        await autoRegister(clientInstance);
      }
    };

    const autoRegister = async (clientInstance) => {
      try {
        console.log('Starting auto-registration...');
        const creds = await clientInstance.register();
        console.log('Registration successful:', creds);
        setCredentials(creds);
        localStorage.setItem('rondevu-chat-credentials', JSON.stringify(creds));
        const newClient = new Rondevu({ baseUrl: API_URL, credentials: creds });
        setClient(newClient);
        setSetupStep('claim');
      } catch (err) {
        console.error('Auto-registration failed:', err);
        toast.error(`Registration failed: ${err.message}`);
        setSetupStep('claim'); // Still allow username claim, might work anyway
      }
    };

    initialize();
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChats, selectedChat]);

  // Start chat service when ready
  useEffect(() => {
    if (setupStep === 'ready' && myUsername && client && !serviceHandle) {
      startChatService();
    }
  }, [setupStep, myUsername, client]);

  // Check online status periodically
  // Note: Online detection by attempting to query services
  // In v0.9.0 there's no direct listServices API, so we check by attempting connection
  useEffect(() => {
    if (setupStep !== 'ready' || !client) return;

    const checkOnlineStatus = async () => {
      const online = new Set();
      for (const contact of contacts) {
        try {
          // Try to query the service via discovery endpoint
          const response = await fetch(`${API_URL}/index/${contact}/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serviceFqn: 'chat.rondevu@1.0.0' })
          });

          if (response.ok) {
            online.add(contact);
          }
        } catch (err) {
          // User offline or doesn't exist
        }
      }
      setOnlineUsers(online);
    };

    checkOnlineStatus();
    const interval = setInterval(checkOnlineStatus, 10000); // Check every 10s

    return () => clearInterval(interval);
  }, [contacts, setupStep, client]);

  // Claim username
  const handleClaimUsername = async () => {
    if (!client || !usernameInput) return;
    try {
      const claim = await client.usernames.claimUsername(usernameInput);
      client.usernames.saveKeypairToStorage(usernameInput, claim.publicKey, claim.privateKey);
      setMyUsername(usernameInput);
      localStorage.setItem('rondevu-chat-username', usernameInput);
      setSetupStep('ready');
      toast.success(`Welcome, ${usernameInput}!`);
    } catch (err) {
      toast.error(`Error: ${err.message}`);
    }
  };

  // Start pooled chat service with durable connections
  const startChatService = async () => {
    if (!client || !myUsername || serviceHandle) return;

    try {
      const keypair = client.usernames.loadKeypairFromStorage(myUsername);
      if (!keypair) {
        toast.error('Username keypair not found');
        return;
      }

      const service = await client.exposeService({
        username: myUsername,
        privateKey: keypair.privateKey,
        serviceFqn: 'chat.rondevu@1.0.0',
        isPublic: true,
        ttl: 300000, // 5 minutes - service auto-refreshes
        ttlRefreshMargin: 0.2, // Refresh at 80% of TTL
        poolSize: 10, // Support up to 10 simultaneous connections
        rtcConfig: getCurrentRtcConfig(),
        handler: (channel, connectionId) => {
          console.log(`📡 New chat connection: ${connectionId}`);

          // Wait for peer to identify themselves
          channel.on('message', (data) => {
            try {
              const msg = JSON.parse(data);

              if (msg.type === 'identify') {
                // Peer identified themselves
                setActiveChats(prev => ({
                  ...prev,
                  [msg.from]: {
                    username: msg.from,
                    channel,
                    connectionId,
                    messages: prev[msg.from]?.messages || [],
                    status: 'connected'
                  }
                }));

                // Remove old handler and add new one for chat messages
                channel.off('message');
                channel.on('message', (chatData) => {
                  try {
                    const chatMsg = JSON.parse(chatData);
                    if (chatMsg.type === 'message') {
                      setActiveChats(prev => ({
                        ...prev,
                        [msg.from]: {
                          ...prev[msg.from],
                          messages: [...(prev[msg.from]?.messages || []), {
                            from: msg.from,
                            text: chatMsg.text,
                            timestamp: Date.now()
                          }]
                        }
                      }));
                    }
                  } catch (err) {
                    console.error('Failed to parse chat message:', err);
                  }
                });

                // Send acknowledgment
                channel.send(JSON.stringify({
                  type: 'identify_ack',
                  from: myUsername
                }));
              }
            } catch (err) {
              console.error('Failed to parse identify message:', err);
            }
          });

          channel.on('close', () => {
            console.log(`👋 Chat closed: ${connectionId}`);
            setActiveChats(prev => {
              const updated = { ...prev };
              Object.keys(updated).forEach(user => {
                if (updated[user].connectionId === connectionId) {
                  updated[user] = { ...updated[user], status: 'disconnected' };
                }
              });
              return updated;
            });
          });
        }
      });

      // Start the service
      await service.start();

      // Listen for service events
      service.on('connection', (connId) => {
        console.log(`🔗 New connection: ${connId}`);
      });

      service.on('disconnection', (connId) => {
        console.log(`🔌 Disconnected: ${connId}`);
      });

      service.on('ttl-refreshed', (expiresAt) => {
        console.log(`🔄 Service TTL refreshed, expires at: ${new Date(expiresAt)}`);
      });

      service.on('error', (error, context) => {
        console.error(`❌ Service error (${context}):`, error);
      });

      setServiceHandle(service);
      console.log('✅ Chat service started');
    } catch (err) {
      console.error('Error starting chat service:', err);
      toast.error(`Failed to start chat: ${err.message}`);
    }
  };

  // Add contact
  const handleAddContact = () => {
    if (!contactInput || contacts.includes(contactInput)) {
      toast.error('Invalid or duplicate contact');
      return;
    }
    if (contactInput === myUsername) {
      toast.error("You can't add yourself!");
      return;
    }

    const newContacts = [...contacts, contactInput];
    setContacts(newContacts);
    localStorage.setItem('rondevu-chat-contacts', JSON.stringify(newContacts));
    setContactInput('');
    toast.success(`Added ${contactInput}`);
  };

  // Remove contact
  const handleRemoveContact = (contact) => {
    const newContacts = contacts.filter(c => c !== contact);
    setContacts(newContacts);
    localStorage.setItem('rondevu-chat-contacts', JSON.stringify(newContacts));
    if (selectedChat === contact) {
      setSelectedChat(null);
    }
    toast.success(`Removed ${contact}`);
  };

  // Start chat with contact using durable connection
  const handleStartChat = async (contact) => {
    if (!client || activeChats[contact]?.status === 'connected') {
      setSelectedChat(contact);
      return;
    }

    try {
      toast.loading(`Connecting to ${contact}...`, { id: 'connecting' });

      // Create durable connection
      const connection = await client.connect(contact, 'chat.rondevu@1.0.0', {
        rtcConfig: getCurrentRtcConfig(),
        maxReconnectAttempts: 5
      });

      // Create data channel (must match service pool's channel name)
      const channel = connection.createChannel('rondevu-service');

      // Listen for connection events
      connection.on('connected', () => {
        console.log(`✅ Connected to ${contact}`);
      });

      connection.on('reconnecting', (attempt, max, delay) => {
        console.log(`🔄 Reconnecting to ${contact} (${attempt}/${max}) in ${delay}ms`);
        toast.loading(`Reconnecting to ${contact}...`, { id: 'reconnecting' });
      });

      connection.on('disconnected', () => {
        console.log(`🔌 Disconnected from ${contact}`);
        setActiveChats(prev => ({
          ...prev,
          [contact]: { ...prev[contact], status: 'reconnecting' }
        }));
      });

      connection.on('failed', (error) => {
        console.error(`❌ Connection to ${contact} failed:`, error);
        toast.error(`Connection to ${contact} failed`, { id: 'connecting' });
        setActiveChats(prev => ({
          ...prev,
          [contact]: { ...prev[contact], status: 'disconnected' }
        }));
      });

      // Wait for acknowledgment
      channel.on('message', (data) => {
        try {
          const msg = JSON.parse(data);

          if (msg.type === 'identify_ack') {
            // Connection established
            toast.success(`Connected to ${contact}`, { id: 'connecting' });

            setActiveChats(prev => ({
              ...prev,
              [contact]: {
                username: contact,
                channel,
                connection,
                messages: prev[contact]?.messages || [],
                status: 'connected'
              }
            }));
            setSelectedChat(contact);

            // Update handler for chat messages
            channel.off('message');
            channel.on('message', (chatData) => {
              try {
                const chatMsg = JSON.parse(chatData);
                if (chatMsg.type === 'message') {
                  setActiveChats(prev => ({
                    ...prev,
                    [contact]: {
                      ...prev[contact],
                      messages: [...(prev[contact]?.messages || []), {
                        from: contact,
                        text: chatMsg.text,
                        timestamp: Date.now()
                      }]
                    }
                  }));
                }
              } catch (err) {
                console.error('Failed to parse message:', err);
              }
            });
          }
        } catch (err) {
          console.error('Failed to parse ack:', err);
        }
      });

      channel.on('close', () => {
        setActiveChats(prev => ({
          ...prev,
          [contact]: { ...prev[contact], status: 'disconnected' }
        }));
        toast.error(`Disconnected from ${contact}`);
      });

      // Connect and send identification
      await connection.connect();

      channel.send(JSON.stringify({
        type: 'identify',
        from: myUsername
      }));

    } catch (err) {
      console.error('Failed to connect:', err);
      toast.error(`Failed to connect to ${contact}`, { id: 'connecting' });
    }
  };

  // Send message
  const handleSendMessage = (contact) => {
    const text = messageInputs[contact];
    if (!text || !activeChats[contact]?.channel) return;

    const chat = activeChats[contact];
    if (chat.status !== 'connected') {
      toast.error('Not connected');
      return;
    }

    try {
      chat.channel.send(JSON.stringify({
        type: 'message',
        text
      }));

      setActiveChats(prev => ({
        ...prev,
        [contact]: {
          ...prev[contact],
          messages: [...prev[contact].messages, {
            from: myUsername,
            text,
            timestamp: Date.now()
          }]
        }
      }));

      setMessageInputs(prev => ({ ...prev, [contact]: '' }));
    } catch (err) {
      console.error('Failed to send message:', err);
      toast.error('Failed to send message');
    }
  };

  // Clear all data
  const handleLogout = () => {
    if (window.confirm('Are you sure you want to logout? This will clear all data.')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  if (!client) {
    return <div style={styles.loading}>Loading...</div>;
  }

  return (
    <div style={styles.container}>
      <Toaster position="top-right" />

      {/* Settings Modal */}
      {showSettings && (
        <div style={styles.modalOverlay} onClick={() => setShowSettings(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>WebRTC Configuration</h2>

            <div style={styles.settingsSection}>
              <label style={styles.settingsLabel}>
                Preset Configuration:
              </label>
              <select
                value={rtcPreset}
                onChange={(e) => setRtcPreset(e.target.value)}
                style={styles.settingsSelect}
              >
                {Object.entries(RTC_PRESETS).map(([key, preset]) => (
                  <option key={key} value={key}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </div>

            {rtcPreset === 'custom' && (
              <div style={styles.settingsSection}>
                <label style={styles.settingsLabel}>
                  Custom RTC Configuration (JSON):
                </label>
                <textarea
                  value={customRtcConfig}
                  onChange={(e) => setCustomRtcConfig(e.target.value)}
                  placeholder={JSON.stringify(RTC_PRESETS['ipv4-turn'].config, null, 2)}
                  style={styles.settingsTextarea}
                  rows={15}
                />
                <p style={styles.settingsHint}>
                  Enter valid RTCConfiguration JSON
                </p>
              </div>
            )}

            {rtcPreset !== 'custom' && (
              <div style={styles.settingsSection}>
                <label style={styles.settingsLabel}>
                  Current Configuration:
                </label>
                <pre style={styles.settingsPreview}>
                  {JSON.stringify(getCurrentRtcConfig(), null, 2)}
                </pre>
              </div>
            )}

            <div style={styles.modalActions}>
              <button onClick={() => setShowSettings(false)} style={styles.modalBtn}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Setup Screen */}
      {setupStep !== 'ready' && (
        <div style={styles.setupScreen}>
          <div style={styles.setupBox}>
            <h1 style={styles.setupTitle}>Rondevu Chat</h1>
            <p style={styles.setupSubtitle}>Decentralized P2P Chat</p>

            {setupStep === 'register' && (
              <div>
                <p style={styles.setupDesc}>Registering...</p>
              </div>
            )}

            {setupStep === 'claim' && (
              <div>
                <p style={styles.setupDesc}>Choose your unique username</p>
                <input
                  type="text"
                  placeholder="Enter username"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value.toLowerCase())}
                  onKeyPress={(e) => e.key === 'Enter' && handleClaimUsername()}
                  style={styles.setupInput}
                  autoFocus
                />
                <button
                  onClick={handleClaimUsername}
                  disabled={!usernameInput}
                  style={styles.setupButton}
                >
                  Claim Username
                </button>
                <p style={styles.setupHint}>
                  3-32 characters, lowercase letters, numbers, and dashes only
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Chat Screen */}
      {setupStep === 'ready' && (
        <div style={styles.mainScreen}>
          {/* Sidebar */}
          <div style={styles.sidebar}>
            {/* User Header */}
            <div style={styles.userHeader}>
              <div>
                <div style={styles.userHeaderName}>@{myUsername}</div>
                <div style={styles.userHeaderStatus}>
                  <span style={styles.onlineDot}></span> Online
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setShowSettings(true)} style={styles.settingsBtn} title="Settings">
                  ⚙️
                </button>
                <button onClick={handleLogout} style={styles.logoutBtn} title="Logout">
                  Logout
                </button>
              </div>
            </div>

            {/* Add Contact */}
            <div style={styles.addContactBox}>
              <input
                type="text"
                placeholder="Add friend by username..."
                value={contactInput}
                onChange={(e) => setContactInput(e.target.value.toLowerCase())}
                onKeyPress={(e) => e.key === 'Enter' && handleAddContact()}
                style={styles.contactInput}
              />
              <button onClick={handleAddContact} style={styles.addBtn} title="Add friend">
                Add
              </button>
            </div>

            {/* Contacts List */}
            <div style={styles.contactsList}>
              <div style={styles.contactsHeader}>
                Friends ({contacts.length})
              </div>
              {contacts.length === 0 ? (
                <div style={styles.emptyState}>
                  <p>No friends yet</p>
                  <p style={{ fontSize: '12px', color: '#999' }}>
                    Add friends by their username above
                  </p>
                </div>
              ) : (
                contacts.map(contact => {
                  const isOnline = onlineUsers.has(contact);
                  const hasActiveChat = activeChats[contact]?.status === 'connected';

                  return (
                    <div
                      key={contact}
                      className="contact-item"
                      style={{
                        ...styles.contactItem,
                        ...(selectedChat === contact ? styles.contactItemActive : {})
                      }}
                      onClick={() => hasActiveChat ? setSelectedChat(contact) : handleStartChat(contact)}
                    >
                      <div style={styles.contactAvatar}>
                        {contact[0].toUpperCase()}
                        <span style={{
                          ...styles.contactDot,
                          background: isOnline ? '#4caf50' : '#999'
                        }}></span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={styles.contactName}>{contact}</div>
                        <div style={styles.contactStatus}>
                          {hasActiveChat ? 'Chatting' : isOnline ? 'Online' : 'Offline'}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveContact(contact);
                        }}
                        style={styles.removeBtn}
                        title="Remove friend"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Chat Area */}
          <div style={styles.chatArea}>
            {!selectedChat ? (
              <div style={styles.emptyChat}>
                <h2 style={{ margin: 0 }}>Select a friend to chat</h2>
                <p style={{ marginTop: '10px' }}>
                  Click on a friend from the sidebar to start chatting
                </p>
              </div>
            ) : (
              <>
                {/* Chat Header */}
                <div style={styles.chatHeader}>
                  <div style={styles.chatHeaderAvatar}>
                    {selectedChat[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={styles.chatHeaderName}>@{selectedChat}</div>
                    <div style={styles.chatHeaderStatus}>
                      {activeChats[selectedChat]?.status === 'connected' ? (
                        <><span style={styles.onlineDot}></span> Connected</>
                      ) : (
                        'Connecting...'
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedChat(null)}
                    style={styles.closeChatBtn}
                    title="Close chat"
                  >
                    ✕
                  </button>
                </div>

                {/* Messages */}
                <div style={styles.messagesArea}>
                  {(!activeChats[selectedChat] || activeChats[selectedChat].messages.length === 0) ? (
                    <div style={styles.emptyMessages}>
                      <p>No messages yet</p>
                      <p style={{ fontSize: '12px', color: '#999' }}>
                        Send a message to start the conversation
                      </p>
                    </div>
                  ) : (
                    activeChats[selectedChat].messages.map((msg, idx) => (
                      <div
                        key={idx}
                        style={{
                          ...styles.message,
                          ...(msg.from === myUsername ? styles.messageMe : styles.messageThem)
                        }}
                      >
                        <div style={{
                          ...styles.messageText,
                          background: msg.from === myUsername ? '#4a9eff' : '#2a2a2a',
                          color: 'white'
                        }}>
                          {msg.text}
                        </div>
                        <div style={styles.messageTime}>
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Input */}
                <div style={styles.inputArea}>
                  <input
                    type="text"
                    placeholder="Type a message..."
                    value={messageInputs[selectedChat] || ''}
                    onChange={(e) => setMessageInputs(prev => ({
                      ...prev,
                      [selectedChat]: e.target.value
                    }))}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(selectedChat);
                      }
                    }}
                    disabled={activeChats[selectedChat]?.status !== 'connected'}
                    style={styles.messageInput}
                    autoFocus
                  />
                  <button
                    onClick={() => handleSendMessage(selectedChat)}
                    disabled={!messageInputs[selectedChat] || activeChats[selectedChat]?.status !== 'connected'}
                    style={styles.sendBtn}
                    title="Send message"
                  >
                    Send
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    height: '100vh',
    background: '#1a1a1a',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  loading: {
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#e0e0e0',
    fontSize: '24px'
  },
  setupScreen: {
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px'
  },
  setupBox: {
    background: '#2a2a2a',
    borderRadius: '16px',
    padding: '40px',
    maxWidth: '400px',
    width: '100%',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    textAlign: 'center',
    border: '1px solid #3a3a3a'
  },
  setupTitle: {
    fontSize: '2.5em',
    margin: '0 0 10px 0',
    color: '#e0e0e0'
  },
  setupSubtitle: {
    fontSize: '1.1em',
    color: '#a0a0a0',
    margin: '0 0 30px 0'
  },
  setupDesc: {
    color: '#a0a0a0',
    marginBottom: '20px'
  },
  setupInput: {
    width: '100%',
    padding: '15px',
    fontSize: '16px',
    border: '1px solid #3a3a3a',
    background: '#1a1a1a',
    color: '#e0e0e0',
    borderRadius: '8px',
    marginBottom: '15px',
    boxSizing: 'border-box',
    outline: 'none',
  },
  setupButton: {
    width: '100%',
    padding: '15px',
    fontSize: '16px',
    fontWeight: '600',
    background: '#4a9eff',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  setupHint: {
    fontSize: '12px',
    color: '#808080',
    marginTop: '10px'
  },
  mainScreen: {
    height: '100vh',
    display: 'flex'
  },
  sidebar: {
    width: '320px',
    background: '#2a2a2a',
    borderRight: '1px solid #3a3a3a',
    display: 'flex',
    flexDirection: 'column'
  },
  userHeader: {
    padding: '20px',
    borderBottom: '1px solid #3a3a3a',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  userHeaderName: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#e0e0e0'
  },
  userHeaderStatus: {
    fontSize: '12px',
    color: '#a0a0a0',
    marginTop: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '5px'
  },
  onlineDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#4caf50',
    display: 'inline-block'
  },
  settingsBtn: {
    padding: '8px 12px',
    background: '#3a3a3a',
    color: '#e0e0e0',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '18px',
    lineHeight: '1'
  },
  logoutBtn: {
    padding: '8px 12px',
    background: '#3a3a3a',
    color: '#e0e0e0',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px'
  },
  addContactBox: {
    padding: '15px',
    borderBottom: '1px solid #3a3a3a',
    display: 'flex',
    gap: '8px'
  },
  contactInput: {
    flex: 1,
    padding: '10px',
    border: '1px solid #3a3a3a',
    background: '#1a1a1a',
    color: '#e0e0e0',
    borderRadius: '6px',
    fontSize: '14px',
    outline: 'none'
  },
  addBtn: {
    padding: '10px 15px',
    background: '#4a9eff',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px'
  },
  contactsList: {
    flex: 1,
    overflowY: 'auto'
  },
  contactsHeader: {
    padding: '15px 20px',
    fontSize: '12px',
    fontWeight: '600',
    color: '#808080',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  emptyState: {
    padding: '40px 20px',
    textAlign: 'center',
    color: '#808080'
  },
  contactItem: {
    padding: '15px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    cursor: 'pointer',
    transition: 'background 0.2s',
    borderBottom: '1px solid #3a3a3a'
  },
  contactItemActive: {
    background: '#3a3a3a'
  },
  contactAvatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: '#4a9eff',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
    fontWeight: '600',
    position: 'relative'
  },
  contactDot: {
    position: 'absolute',
    bottom: '0',
    right: '0',
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    border: '2px solid #2a2a2a'
  },
  contactName: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#e0e0e0'
  },
  contactStatus: {
    fontSize: '12px',
    color: '#a0a0a0',
    marginTop: '2px'
  },
  removeBtn: {
    padding: '4px 8px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
    color: '#808080',
    opacity: 0.6,
  },
  chatArea: {
    flex: 1,
    background: '#1a1a1a',
    display: 'flex',
    flexDirection: 'column'
  },
  emptyChat: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#808080'
  },
  chatHeader: {
    padding: '20px',
    borderBottom: '1px solid #3a3a3a',
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
    background: '#2a2a2a'
  },
  chatHeaderAvatar: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    background: '#4a9eff',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
    fontWeight: '600'
  },
  chatHeaderName: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#e0e0e0'
  },
  chatHeaderStatus: {
    fontSize: '13px',
    color: '#a0a0a0',
    marginTop: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '5px'
  },
  closeChatBtn: {
    padding: '8px 12px',
    background: '#3a3a3a',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    color: '#e0e0e0'
  },
  messagesArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
    background: '#1a1a1a'
  },
  emptyMessages: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#808080'
  },
  message: {
    marginBottom: '12px',
    display: 'flex',
    flexDirection: 'column',
    maxWidth: '70%'
  },
  messageMe: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end'
  },
  messageThem: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start'
  },
  messageText: {
    padding: '12px 16px',
    borderRadius: '16px',
    fontSize: '15px',
    lineHeight: '1.4',
    wordWrap: 'break-word',
    boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
  },
  messageTime: {
    fontSize: '11px',
    color: '#808080',
    marginTop: '4px',
    padding: '0 8px'
  },
  inputArea: {
    padding: '20px',
    borderTop: '1px solid #3a3a3a',
    display: 'flex',
    gap: '12px',
    background: '#2a2a2a'
  },
  messageInput: {
    flex: 1,
    padding: '12px 16px',
    border: '1px solid #3a3a3a',
    background: '#1a1a1a',
    color: '#e0e0e0',
    borderRadius: '24px',
    fontSize: '15px',
    outline: 'none',
  },
  sendBtn: {
    padding: '12px 24px',
    borderRadius: '24px',
    background: '#4a9eff',
    color: 'white',
    border: 'none',
    cursor: 'pointer',
    fontSize: '15px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modalContent: {
    background: '#2a2a2a',
    borderRadius: '12px',
    padding: '24px',
    maxWidth: '600px',
    width: '90%',
    maxHeight: '80vh',
    overflowY: 'auto',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)'
  },
  modalTitle: {
    fontSize: '24px',
    color: '#e0e0e0',
    marginBottom: '20px',
    fontWeight: '600'
  },
  settingsSection: {
    marginBottom: '20px'
  },
  settingsLabel: {
    display: 'block',
    color: '#e0e0e0',
    marginBottom: '8px',
    fontSize: '14px',
    fontWeight: '500'
  },
  settingsSelect: {
    width: '100%',
    padding: '10px',
    background: '#1a1a1a',
    color: '#e0e0e0',
    border: '1px solid #3a3a3a',
    borderRadius: '6px',
    fontSize: '14px',
    outline: 'none',
    cursor: 'pointer'
  },
  settingsTextarea: {
    width: '100%',
    padding: '12px',
    background: '#1a1a1a',
    color: '#e0e0e0',
    border: '1px solid #3a3a3a',
    borderRadius: '6px',
    fontSize: '13px',
    fontFamily: 'monospace',
    outline: 'none',
    resize: 'vertical'
  },
  settingsPreview: {
    width: '100%',
    padding: '12px',
    background: '#1a1a1a',
    color: '#4a9eff',
    border: '1px solid #3a3a3a',
    borderRadius: '6px',
    fontSize: '13px',
    fontFamily: 'monospace',
    overflowX: 'auto',
    margin: 0
  },
  settingsHint: {
    fontSize: '12px',
    color: '#808080',
    marginTop: '6px'
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '24px'
  },
  modalBtn: {
    padding: '10px 20px',
    background: '#4a9eff',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600'
  }
};

// Add hover effects via CSS
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    button:hover:not(:disabled) {
      opacity: 0.9;
      transform: scale(1.02);
    }
    button:active:not(:disabled) {
      transform: scale(0.98);
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .contact-item:hover {
      background: #333333 !important;
    }
    .contact-item:active {
      background: #2a2a2a !important;
    }
    input:focus {
      border-color: #4a9eff !important;
    }
  `;
  document.head.appendChild(style);
}
