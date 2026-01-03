import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Rondevu } from '@xtr-dev/rondevu-client';
import toast, { Toaster } from 'react-hot-toast';
import QRCode from 'qrcode';

const API_URL = 'https://api.ronde.vu';
const CHUNK_SIZE = 16 * 1024; // 16KB chunks
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I,O,0,1

// Generate 6-char session code
const generateCode = () => Array.from({ length: 6 }, () =>
  CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
).join('');

// Create session tag from code
const codeToTag = (code) => `drop.ronde.vu-${code.toLowerCase()}`;

// Format file size
const formatSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
};

// Get file icon based on MIME type
const getFileIcon = (mimeType) => {
  if (!mimeType) return '📄';
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType.startsWith('video/')) return '🎬';
  if (mimeType.startsWith('audio/')) return '🎵';
  if (mimeType.includes('pdf')) return '📕';
  if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('rar')) return '📦';
  if (mimeType.includes('text') || mimeType.includes('json') || mimeType.includes('xml')) return '📝';
  return '📄';
};

// Available ICE server presets
const ICE_PRESETS = [
  { value: 'rondevu', label: 'Rondevu (recommended)' },
  { value: 'rondevu-relay', label: 'Rondevu (relay only)' },
  { value: 'google-stun', label: 'Google STUN' },
  { value: 'public-stun', label: 'Public STUN (multiple)' },
];

export default function App() {
  // Identity
  const [rondevu, setRondevu] = useState(null);
  const [username, setUsername] = useState(null);
  const [claimUsername, setClaimUsername] = useState('');
  const [setupStep, setSetupStep] = useState('init'); // init | identity | ready
  const [icePreset, setIcePreset] = useState('rondevu');
  const icePresetRef = useRef(icePreset);
  icePresetRef.current = icePreset; // Always keep ref in sync

  // Session
  const [sessionCode, setSessionCode] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [peerUsername, setPeerUsername] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // disconnected | waiting | connecting | connected
  const [connectionStage, setConnectionStage] = useState(''); // signaling | checking | connected
  const [dataChannel, setDataChannel] = useState(null);
  const [peerConnection, setPeerConnection] = useState(null);

  // Files
  const [transfers, setTransfers] = useState([]); // {id, name, size, mimeType, progress, direction, blob?, status}
  const [isDragOver, setIsDragOver] = useState(false);
  const [queuedFiles, setQueuedFiles] = useState([]); // Files waiting to be sent when peer connects
  const incomingFilesRef = useRef({}); // Track incoming file chunks
  const transfersRef = useRef([]); // Ref for access in callbacks
  const dataChannelRef = useRef(null); // Ref for dataChannel access in callbacks

  // Chat
  const [chatMessages, setChatMessages] = useState([]); // {from, text, timestamp, isYou}
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef(null);
  const chatMessagesRef = useRef([]); // Ref for access in callbacks

  // Keep refs in sync with state
  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);

  useEffect(() => {
    transfersRef.current = transfers;
  }, [transfers]);

  useEffect(() => {
    dataChannelRef.current = dataChannel;
  }, [dataChannel]);

  // UI
  const [joinInput, setJoinInput] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState(null);

  const fileInputRef = useRef(null);

  // Check URL for join code on mount (supports /CODE and ?join=CODE)
  useEffect(() => {
    // Check path first: /CODE
    const pathCode = window.location.pathname.slice(1).toUpperCase();
    if (pathCode && /^[A-Z0-9]{6}$/.test(pathCode)) {
      setJoinInput(pathCode);
      return;
    }
    // Fallback to query param: ?join=CODE
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get('join');
    if (joinCode) {
      setJoinInput(joinCode.toUpperCase());
    }
  }, []);

  // Initialize - create random identity on each load
  useEffect(() => {
    const init = async () => {
      try {
        // Clean up old localStorage keys from previous demo
        localStorage.removeItem('rondevu-keypair');
        localStorage.removeItem('rondevu-username');
        localStorage.removeItem('rondevu-contacts');
        localStorage.removeItem('rondevu-credential');

        // Generate random username for this session
        const randomId = Math.random().toString(36).substring(2, 8);
        const randomUsername = `user-${randomId}`;

        console.log('[Init] Creating random identity:', randomUsername);

        const client = await Rondevu.connect({
          apiUrl: API_URL,
          username: randomUsername,
          iceServers: icePresetRef.current,
          debug: true,
        });

        setRondevu(client);
        setUsername(client.getName());
        setSetupStep('ready');
      } catch (err) {
        console.error('Init failed:', err);
        setSetupStep('identity'); // Fallback to manual identity creation
      }
    };
    init();
  }, []);

  // Generate QR code when session code changes
  useEffect(() => {
    if (sessionCode && isHost) {
      const url = `${window.location.origin}/${sessionCode}`;
      QRCode.toDataURL(url, { width: 200, margin: 2 })
        .then(setQrDataUrl)
        .catch(console.error);
    }
  }, [sessionCode, isHost]);

  // Create identity (fallback for manual creation)
  const handleCreateIdentity = async () => {
    try {
      // Use provided username or generate random one
      const usernameToUse = claimUsername || `user-${Math.random().toString(36).substring(2, 8)}`;

      const client = await Rondevu.connect({
        apiUrl: API_URL,
        username: usernameToUse,
        iceServers: icePresetRef.current,
        debug: true,
      });

      // Don't save to localStorage - each tab gets fresh identity
      setRondevu(client);
      setUsername(client.getName());
      setSetupStep('ready');
      toast.success(`Welcome, ${client.getName()}!`);
    } catch (err) {
      if (err.message?.includes('already taken')) {
        toast.error('Username already taken');
      } else {
        toast.error(`Error: ${err.message}`);
      }
    }
  };

  // Handle incoming data channel message
  const handleMessage = useCallback((event) => {
    // Binary data = file chunk
    if (event.data instanceof ArrayBuffer) {
      const view = new DataView(event.data);
      const decoder = new TextDecoder();

      // Extract file ID (first 36 bytes)
      const fileId = decoder.decode(new Uint8Array(event.data, 0, 36));
      // Extract chunk index (next 4 bytes)
      const chunkIndex = view.getUint32(36);
      // Extract chunk data
      const chunkData = new Uint8Array(event.data, 40);

      const incoming = incomingFilesRef.current[fileId];
      if (incoming) {
        incoming.chunks[chunkIndex] = chunkData;
        incoming.receivedChunks++;

        const progress = Math.round((incoming.receivedChunks / incoming.totalChunks) * 100);

        setTransfers(prev => prev.map(t =>
          t.id === fileId ? { ...t, progress } : t
        ));

        // Check if complete
        if (incoming.receivedChunks === incoming.totalChunks) {
          const blob = new Blob(incoming.chunks, { type: incoming.mimeType });
          setTransfers(prev => prev.map(t =>
            t.id === fileId ? { ...t, progress: 100, status: 'complete', blob } : t
          ));
          delete incomingFilesRef.current[fileId];
        }
      }
      return;
    }

    // JSON message
    try {
      const msg = JSON.parse(event.data);

      if (msg.type === 'identify') {
        setPeerUsername(msg.from);
        setConnectionStatus('connected');
        // Send ack
        event.target.send(JSON.stringify({ type: 'identify_ack', from: username }));
        // If host, send chat history
        if (chatMessagesRef.current.length > 0) {
          event.target.send(JSON.stringify({
            type: 'chat-history',
            messages: chatMessagesRef.current.map(m => ({ from: m.from, text: m.text, timestamp: m.timestamp })),
          }));
        }
        toast.success(`Connected to ${msg.from}!`);
      } else if (msg.type === 'identify_ack') {
        setPeerUsername(msg.from);
        setConnectionStatus('connected');
        toast.success(`Connected to ${msg.from}!`);
      } else if (msg.type === 'file-offer') {
        // Show file as available - can be downloaded on demand
        setTransfers(prev => [...prev, {
          id: msg.id,
          name: msg.name,
          size: msg.size,
          mimeType: msg.mimeType,
          progress: 0,
          direction: 'in',
          status: 'available',
          sender: msg.sender || peerUsername, // Use sender from message
        }]);
      } else if (msg.type === 'file-request') {
        // Peer requested a file, start sending it
        const transfer = transfersRef.current.find(t => t.id === msg.id);
        if (transfer && transfer.pendingFile) {
          sendFileData(msg.id, transfer.pendingFile);
        }
      } else if (msg.type === 'file-start') {
        // Peer is starting to send accepted file
        const totalChunks = Math.ceil(msg.size / CHUNK_SIZE);
        incomingFilesRef.current[msg.id] = {
          name: msg.name,
          size: msg.size,
          mimeType: msg.mimeType,
          totalChunks,
          receivedChunks: 0,
          chunks: new Array(totalChunks),
        };
        setTransfers(prev => prev.map(t =>
          t.id === msg.id ? { ...t, status: 'transferring' } : t
        ));
      } else if (msg.type === 'file-decline') {
        // Peer declined our file offer
        setTransfers(prev => prev.map(t =>
          t.id === msg.id ? { ...t, status: 'declined' } : t
        ));
        toast.error(`File declined: ${msg.name}`);
      } else if (msg.type === 'chat') {
        // Incoming chat message
        setChatMessages(prev => [...prev, {
          from: msg.from,
          text: msg.text,
          timestamp: msg.timestamp,
          isYou: false,
        }]);
      } else if (msg.type === 'chat-history') {
        // Received chat history from host
        setChatMessages(msg.messages.map(m => ({
          ...m,
          isYou: m.from === username,
        })));
      }
    } catch (err) {
      console.error('Failed to parse message:', err);
    }
  }, [username, peerUsername]);

  // Setup data channel handlers
  const setupDataChannel = useCallback((dc) => {
    dc.binaryType = 'arraybuffer';

    const handleOpen = () => {
      console.log('Data channel opened');
      setDataChannel(dc);
      dataChannelRef.current = dc; // Set ref immediately
      // Send identify
      dc.send(JSON.stringify({ type: 'identify', from: username }));
    };

    dc.onopen = handleOpen;

    dc.onclose = () => {
      console.log('Data channel closed');
      setDataChannel(null);
      setConnectionStatus('disconnected');
      // Remove files shared by the disconnected peer
      setTransfers(prev => prev.filter(t => t.sender !== peerUsername));
      setPeerUsername(null);
    };

    dc.onmessage = handleMessage;

    // If data channel is already open, trigger handler immediately
    if (dc.readyState === 'open') {
      console.log('Data channel already open, triggering handler');
      handleOpen();
    }
  }, [username, handleMessage]);

  // Start session as host
  const handleStartSession = async () => {
    if (!rondevu) return;

    try {
      const code = generateCode();
      const tag = codeToTag(code);

      setSessionCode(code);
      setIsHost(true);
      setConnectionStatus('waiting');

      // Create offers with session tag
      await rondevu.offer({
        tags: [tag],
        maxOffers: 1,
      });

      // Listen for connections
      rondevu.on('connection:opened', (offerId, connection) => {
        console.log('Connection opened:', offerId);
        const dc = connection.getDataChannel();
        const pc = connection.getPeerConnection();

        setPeerConnection(pc);

        if (dc) {
          setupDataChannel(dc);
        }
      });

      await rondevu.startFilling();
      toast.success('Session created!');
    } catch (err) {
      console.error('Failed to start session:', err);
      toast.error(`Failed to start session: ${err.message}`);
      setSessionCode(null);
      setIsHost(false);
      setConnectionStatus('disconnected');
    }
  };

  // Join session as guest
  const handleJoinSession = async () => {
    if (!rondevu || !joinInput) return;

    try {
      const code = joinInput.toUpperCase().trim();
      const tag = codeToTag(code);

      setSessionCode(code);
      setIsHost(false);
      setConnectionStatus('connecting');
      setConnectionStage('signaling');

      const peer = await rondevu.peer({ tags: [tag] });

      // Track connection stages
      peer.on('state', (state) => {
        console.log('Connection state:', state);
        setConnectionStage(state);
      });

      peer.on('open', () => {
        console.log('Peer connected');
        setPeerConnection(peer.peerConnection);
        setDataChannel(peer.dataChannel);
        dataChannelRef.current = peer.dataChannel; // Set ref immediately
        peer.dataChannel.binaryType = 'arraybuffer';

        // Send identify
        peer.send(JSON.stringify({ type: 'identify', from: username }));
      });

      peer.on('message', (data) => handleMessage({ data, target: peer.dataChannel }));

      peer.on('close', () => {
        setConnectionStatus('disconnected');
        setConnectionStage('');
        setPeerUsername(null);
        setDataChannel(null);
        toast.error('Connection closed');
      });

      peer.on('error', (err) => {
        console.error('Peer error:', err);
        toast.error(`Connection error: ${err.message}`);
      });

      // Clear URL (reset to root)
      window.history.replaceState({}, '', '/');
    } catch (err) {
      console.error('Failed to join session:', err);
      toast.error(`Failed to join: ${err.message}`);
      setSessionCode(null);
      setConnectionStatus('disconnected');
      setConnectionStage('');
    }
  };

  // Auto-join when rondevu is ready and we have a join code from URL
  const autoJoinTriggered = useRef(false);
  useEffect(() => {
    if (rondevu && joinInput && !autoJoinTriggered.current && !sessionCode) {
      // Check if this was from URL (path or query param)
      const pathCode = window.location.pathname.slice(1).toUpperCase();
      const queryCode = new URLSearchParams(window.location.search).get('join')?.toUpperCase();
      if (pathCode === joinInput || queryCode === joinInput) {
        autoJoinTriggered.current = true;
        handleJoinSession();
      }
    }
  }, [rondevu, joinInput, sessionCode]);

  // Leave session
  const handleLeaveSession = () => {
    try {
      dataChannel?.close();
      peerConnection?.close();
      rondevu?.stopFilling();
    } catch (err) {
      console.error('Error leaving session:', err);
    }

    setSessionCode(null);
    setIsHost(false);
    setConnectionStatus('disconnected');
    setPeerUsername(null);
    setDataChannel(null);
    setPeerConnection(null);
    setTransfers([]);
    incomingFilesRef.current = {};
    toast.success('Left session');
  };

  // Get new random identity
  const handleNewIdentity = () => {
    window.location.reload();
  };

  // Send file offer (file is available for peer to download on demand)
  const sendFile = async (file) => {
    if (!dataChannel || dataChannel.readyState !== 'open') {
      // Queue file if host is waiting for peer
      if (isHost && connectionStatus === 'waiting') {
        setQueuedFiles(prev => [...prev, file]);
        toast.success(`Queued: ${file.name}`);
        return;
      }
      toast.error('Not connected');
      return;
    }

    const fileId = crypto.randomUUID();

    // Create transfer object with the file stored for on-demand transfer
    const newTransfer = {
      id: fileId,
      name: file.name,
      size: file.size,
      mimeType: file.type,
      progress: 0,
      direction: 'out',
      status: 'available',
      pendingFile: file,
      sender: username, // Track who shared this file
    };

    // Update ref immediately so file-request handler can access it
    transfersRef.current = [...transfersRef.current, newTransfer];

    // Also update state for React re-render
    setTransfers(prev => [...prev, newTransfer]);

    // Send file-offer message (peer can request download when ready)
    dataChannel.send(JSON.stringify({
      type: 'file-offer',
      id: fileId,
      name: file.name,
      size: file.size,
      mimeType: file.type,
      sender: username, // Include sender username
    }));

    toast.success(`Shared: ${file.name}`);
  };

  // Actually send file data (called after peer accepts)
  const sendFileData = async (fileId, file) => {
    const dc = dataChannelRef.current;
    if (!dc || dc.readyState !== 'open') {
      toast.error('Not connected');
      return;
    }

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    // Update status to transferring
    setTransfers(prev => prev.map(t =>
      t.id === fileId ? { ...t, status: 'transferring', pendingFile: undefined } : t
    ));

    // Send file-start message so receiver prepares to receive chunks
    dc.send(JSON.stringify({
      type: 'file-start',
      id: fileId,
      name: file.name,
      size: file.size,
      mimeType: file.type,
    }));

    // Send chunks
    const reader = file.stream().getReader();
    let chunkIndex = 0;
    let buffer = new Uint8Array(0);

    const sendChunk = async () => {
      while (true) {
        // Fill buffer if needed
        while (buffer.length < CHUNK_SIZE) {
          const { done, value } = await reader.read();
          if (done) break;
          const newBuffer = new Uint8Array(buffer.length + value.length);
          newBuffer.set(buffer);
          newBuffer.set(value, buffer.length);
          buffer = newBuffer;
        }

        if (buffer.length === 0) break;

        // Extract chunk
        const chunkData = buffer.slice(0, CHUNK_SIZE);
        buffer = buffer.slice(CHUNK_SIZE);

        // Create message: fileId (36) + chunkIndex (4) + data
        const encoder = new TextEncoder();
        const idBytes = encoder.encode(fileId);
        const message = new ArrayBuffer(40 + chunkData.length);
        const view = new DataView(message);

        // Write file ID
        new Uint8Array(message, 0, 36).set(idBytes);
        // Write chunk index
        view.setUint32(36, chunkIndex);
        // Write chunk data
        new Uint8Array(message, 40).set(chunkData);

        // Wait for buffer to drain if needed
        while (dc.bufferedAmount > 1024 * 1024) {
          await new Promise(r => setTimeout(r, 10));
        }

        dc.send(message);
        chunkIndex++;

        // Update progress with bytes uploaded
        const progress = Math.round((chunkIndex / totalChunks) * 100);
        const uploadedBytes = Math.min(chunkIndex * CHUNK_SIZE, file.size);
        setTransfers(prev => prev.map(t =>
          t.id === fileId ? { ...t, progress, uploadedBytes } : t
        ));
      }

      // Mark complete
      setTransfers(prev => prev.map(t =>
        t.id === fileId ? { ...t, progress: 100, status: 'complete' } : t
      ));
    };

    try {
      await sendChunk();
    } catch (err) {
      console.error('Error sending file:', err);
      setTransfers(prev => prev.map(t =>
        t.id === fileId ? { ...t, status: 'error' } : t
      ));
      toast.error(`Failed to send ${file.name}`);
    }
  };

  // Handle file drop
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    files.forEach(sendFile);
  };

  // Handle file input
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(sendFile);
    e.target.value = '';
  };

  // Download file - request transfer if needed, or save if already received
  const handleDownload = (transfer) => {
    // If file already received, save it
    if (transfer.blob) {
      const url = URL.createObjectURL(transfer.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = transfer.name;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    // If incoming file not yet transferred, request it
    if (transfer.direction === 'in' && transfer.status === 'available') {
      const dc = dataChannelRef.current;
      if (!dc || dc.readyState !== 'open') {
        toast.error('Not connected');
        return;
      }

      // Request the file from sender
      dc.send(JSON.stringify({
        type: 'file-request',
        id: transfer.id,
      }));

      // Update status to show we're waiting for transfer
      setTransfers(prev => prev.map(t =>
        t.id === transfer.id ? { ...t, status: 'requesting' } : t
      ));
    }
  };

  // Remove file from the list
  const handleRemoveFile = (transfer) => {
    setTransfers(prev => prev.filter(t => t.id !== transfer.id));
  };

  // Send chat message
  const sendChat = (text) => {
    if (!text.trim()) return;

    const message = {
      from: isHost ? 'host' : username,
      text: text.trim(),
      timestamp: Date.now(),
      isYou: true,
    };

    // Add to local state
    setChatMessages(prev => [...prev, message]);

    // Send to peer if connected
    if (dataChannel?.readyState === 'open') {
      dataChannel.send(JSON.stringify({
        type: 'chat',
        from: message.from,
        text: message.text,
        timestamp: message.timestamp,
      }));
    }
  };

  // Handle chat submit
  const handleChatSubmit = (e) => {
    e.preventDefault();
    sendChat(chatInput);
    setChatInput('');
  };

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Send queued files when peer connects
  useEffect(() => {
    if (dataChannel?.readyState === 'open' && queuedFiles.length > 0) {
      const filesToSend = [...queuedFiles];
      setQueuedFiles([]);
      filesToSend.forEach(file => sendFile(file));
    }
  }, [dataChannel?.readyState, queuedFiles.length]);

  // Copy session code to clipboard
  const copyCode = () => {
    navigator.clipboard.writeText(sessionCode);
    toast.success('Code copied!');
  };

  // Copy full session link to clipboard
  const copyLink = () => {
    const url = `${window.location.origin}/${sessionCode}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copied!');
  };

  // Render loading
  if (setupStep === 'init') {
    return (
      <div className="container">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  // Render identity screen
  if (setupStep === 'identity') {
    return (
      <div className="container">
        <Toaster position="top-center" />
        <div className="center-box">
          <h1 className="title">Rondevu Drop</h1>
          <p className="subtitle">Share files directly, peer-to-peer</p>

          <div className="form-group">
            <input
              type="text"
              placeholder="Choose a username (optional)"
              value={claimUsername}
              onChange={(e) => setClaimUsername(e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, ''))}
              className="input"
              maxLength={32}
            />
            <p className="hint">4-32 chars, lowercase, alphanumeric, dashes, periods</p>
          </div>

          <button onClick={handleCreateIdentity} className="button primary full">
            Create Identity
          </button>
        </div>
      </div>
    );
  }

  // Render lobby (no active session)
  if (!sessionCode) {
    return (
      <div className="container">
        <Toaster position="top-center" />

        <div className="header">
          <span className="username">{username}</span>
          <div className="header-controls">
            <select
              className="ice-select"
              value={icePreset}
              onChange={(e) => setIcePreset(e.target.value)}
              disabled={rondevu !== null}
              title={rondevu ? 'ICE preset is set when client initializes' : 'Select ICE server preset'}
            >
              {ICE_PRESETS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            <button onClick={handleNewIdentity} className="button text">New Identity</button>
          </div>
        </div>

        <div className="center-box">
          <h1 className="title">Rondevu Drop</h1>
          <p className="subtitle">Share files directly, peer-to-peer</p>

          <button onClick={handleStartSession} className="button primary full large">
            Start New Session
          </button>

          <div className="divider">
            <span>or join existing</span>
          </div>

          <div className="join-row">
            <input
              type="text"
              placeholder="Enter code"
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              onKeyDown={(e) => e.key === 'Enter' && joinInput.length === 6 && handleJoinSession()}
              className="input code-input"
              maxLength={6}
            />
            <button
              onClick={handleJoinSession}
              className="button primary"
              disabled={joinInput.length !== 6}
            >
              Join
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render waiting for peer (host only) - shows full interface
  if (connectionStatus === 'waiting' && isHost) {
    return (
      <div
        className={`container ${isDragOver ? 'drag-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={(e) => { if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget)) setIsDragOver(false); }}
        onDrop={handleDrop}
      >
        <Toaster position="top-center" />
        {isDragOver && <div className="drop-overlay">Drop files to queue</div>}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        <div className="header">
          <span className="session-label">Session: {sessionCode} - Waiting for peer...</span>
          <button onClick={handleLeaveSession} className="button text danger">Leave</button>
        </div>

        <div className="main-content">
          {/* Share code section */}
          <div className="share-section">
            <div className="code-display" onClick={copyCode}>
              <span className="code">{sessionCode}</span>
              <button className="copy-btn">Copy Code</button>
            </div>
            <div className="share-link">
              <span className="share-url">{window.location.origin}/{sessionCode}</span>
              <button className="button small primary" onClick={copyLink}>Copy Link</button>
            </div>
          </div>

          {/* File drop hint */}
          <div className="drop-hint-banner" onClick={() => fileInputRef.current?.click()}>
            <span>📁 Drop files anywhere to queue them, or <button className="link-button">browse</button></span>
            <span className="drop-hint-sub">Files will be sent when peer connects</span>
          </div>

          {/* Queued files list */}
          {queuedFiles.length > 0 && (
            <div className="transfers">
              <h3 className="transfers-title">Queued Files ({queuedFiles.length})</h3>
              {queuedFiles.map((file, i) => (
                <div key={i} className="transfer-item">
                  <div className="transfer-icon">{getFileIcon(file.type)}</div>
                  <div className="transfer-info">
                    <div className="transfer-name">{file.name}</div>
                    <div className="transfer-meta">{formatSize(file.size)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Chat */}
          <div className="chat-container">
            <div className="chat-header">Chat</div>
            <div className="chat-messages">
              {chatMessages.length === 0 && (
                <div className="chat-empty">No messages yet</div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className="chat-line">
                  <span className="chat-sender">{msg.from}{msg.isYou ? ' (you)' : ''}:</span>
                  <span className="chat-text">{msg.text}</span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={handleChatSubmit} className="chat-input-form">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type a message..."
                className="chat-input"
              />
              <button type="submit" className="chat-send">Send</button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Get stage display info
  const getStageDisplay = () => {
    switch (connectionStage) {
      case 'signaling':
        return { emoji: '📡', text: 'Signaling...' };
      case 'checking':
        return { emoji: '⛸️', text: 'Ice skating...' };
      case 'connected':
        return { emoji: '🔗', text: 'Connecting data channel...' };
      default:
        return { emoji: '🔄', text: 'Starting...' };
    }
  };

  // Render connecting
  if (connectionStatus === 'connecting') {
    const stage = getStageDisplay();
    return (
      <div className="container">
        <Toaster position="top-center" />
        <div className="center-box">
          <h2 className="waiting-title">Connecting...</h2>
          <div className="connection-stages">
            <div className={`stage ${connectionStage === 'signaling' || connectionStage === 'checking' || connectionStage === 'connected' ? 'done' : ''}`}>
              <span className="stage-emoji">📡</span>
              <span className="stage-text">Signaling</span>
            </div>
            <div className={`stage ${connectionStage === 'checking' || connectionStage === 'connected' ? 'active' : ''} ${connectionStage === 'connected' ? 'done' : ''}`}>
              <span className="stage-emoji">⛸️</span>
              <span className="stage-text">Ice skating</span>
            </div>
            <div className={`stage ${connectionStage === 'connected' ? 'active' : ''}`}>
              <span className="stage-emoji">🔗</span>
              <span className="stage-text">Data channel</span>
            </div>
          </div>
          <p className="waiting-subtitle">{stage.emoji} {stage.text}</p>
        </div>
      </div>
    );
  }

  // Render connected - file sharing view
  return (
    <div
      className={`container ${isDragOver ? 'drag-over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget)) setIsDragOver(false); }}
      onDrop={handleDrop}
    >
      <Toaster position="top-center" />
      {isDragOver && <div className="drop-overlay">Drop files to send</div>}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      <div className="header">
        <div className="header-left">
          <span className="connected-label">Connected to {peerUsername}</span>
          <span className="session-info" onClick={copyLink} title="Click to copy link">
            {sessionCode}
          </span>
        </div>
        <button onClick={handleLeaveSession} className="button text danger">Leave</button>
      </div>

      <div className="main-content">
        {/* File drop hint */}
        <div className="drop-hint-banner" onClick={() => fileInputRef.current?.click()}>
          <span>📁 Drop files anywhere to send them, or <button className="link-button">browse</button></span>
        </div>

        {/* Transfers list */}
        {transfers.length > 0 && (
          <div className="transfers">
            <h3 className="transfers-title">Transfers</h3>
            {transfers.map(transfer => (
              <div key={transfer.id} className="transfer-item">
                <div className="transfer-icon">{getFileIcon(transfer.mimeType)}</div>
                <div className="transfer-info">
                  <div className="transfer-name">
                    {transfer.direction === 'in' ? '↓' : '↑'} {transfer.name}
                  </div>
                  <div className="transfer-meta">
                    {formatSize(transfer.size)}
                    {transfer.sender && ` • from ${transfer.sender}`}
                  </div>
                  {transfer.status === 'transferring' && (
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${transfer.progress}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className="transfer-actions">
                  {transfer.status === 'available' && transfer.direction === 'in' && (
                    <button
                      className="button small primary"
                      onClick={() => handleDownload(transfer)}
                    >
                      Download
                    </button>
                  )}
                  {transfer.status === 'available' && transfer.direction === 'out' && (
                    <span className="status-available">Ready</span>
                  )}
                  {transfer.status === 'requesting' && (
                    <span className="status-waiting">Requesting...</span>
                  )}
                  {transfer.status === 'transferring' && transfer.direction === 'out' && (
                    <span className="status-progress">
                      {formatSize(transfer.uploadedBytes || 0)} / {formatSize(transfer.size)}
                    </span>
                  )}
                  {transfer.status === 'transferring' && transfer.direction === 'in' && (
                    <span className="status-progress">{transfer.progress}%</span>
                  )}
                  {transfer.status === 'complete' && transfer.direction === 'in' && (
                    <button
                      className="button small"
                      onClick={() => handleDownload(transfer)}
                    >
                      Save
                    </button>
                  )}
                  {transfer.status === 'complete' && transfer.direction === 'out' && (
                    <span className="status-sent">Uploaded</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Chat */}
        <div className="chat-container">
          <div className="chat-header">Chat</div>
          <div className="chat-messages">
            {chatMessages.length === 0 && (
              <div className="chat-empty">No messages yet</div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className="chat-line">
                <span className="chat-sender">{msg.from}{msg.isYou ? ' (you)' : ''}:</span>
                <span className="chat-text">{msg.text}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={handleChatSubmit} className="chat-input-form">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Type a message..."
              className="chat-input"
            />
            <button type="submit" className="chat-send">Send</button>
          </form>
        </div>
      </div>
    </div>
  );
}
