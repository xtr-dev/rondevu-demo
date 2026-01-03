import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Rondevu } from '@xtr-dev/rondevu-client';
import toast, { Toaster } from 'react-hot-toast';
import QRCode from 'qrcode';
import DataTable, { createTheme } from 'react-data-table-component';
import ChatPanel from './components/ChatPanel';
import ConnectionStages, { getStageText } from './components/ConnectionStages';

// Create dark theme for DataTable
createTheme('rondevu', {
  text: { primary: '#e0e0e0', secondary: '#808080' },
  background: { default: '#1a1a1a' },
  context: { background: '#2a2a2a', text: '#e0e0e0' },
  divider: { default: '#2a2a2a' },
  sortFocus: { default: '#4a9eff' },
}, 'dark');

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
  { value: 'rondevu-ipv4', label: 'Rondevu IPv4' },
  { value: 'rondevu-ipv4-relay', label: 'Rondevu IPv4 (relay)' },
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
  const [connectedPeers, setConnectedPeers] = useState([]); // Array of connected peer usernames
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
  const allChannelsRef = useRef(new Set()); // Track all connected data channels for broadcasting

  // Chat
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const chatMessagesRef = useRef([]);

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
  const [chatOpen, setChatOpen] = useState(false); // For mobile chat toggle
  const [showQrPopout, setShowQrPopout] = useState(false); // QR code popout on long-press
  const longPressTimerRef = useRef(null);

  // Password protection
  const [sessionPassword, setSessionPassword] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [pendingPasswordChannel, setPendingPasswordChannel] = useState(null); // Channel waiting for password
  const sessionPasswordRef = useRef('');
  useEffect(() => { sessionPasswordRef.current = sessionPassword; }, [sessionPassword]);

  const fileInputRef = useRef(null);

  // DataTable columns for file list (must be before any conditional returns)
  const fileColumns = useMemo(() => [
    {
      name: '',
      selector: row => row.direction,
      cell: row => <span className="file-direction">{row.direction === 'in' ? '↓' : '↑'}</span>,
      width: '40px',
      sortable: false,
    },
    {
      name: '',
      cell: row => <span className="file-icon">{getFileIcon(row.mimeType)}</span>,
      width: '40px',
      sortable: false,
    },
    {
      name: 'Name',
      selector: row => row.name,
      sortable: true,
      grow: 2,
    },
    {
      name: 'Size',
      selector: row => row.size,
      cell: row => formatSize(row.size),
      sortable: true,
      width: '100px',
    },
    {
      name: 'Status',
      selector: row => row.status,
      sortable: true,
      width: '140px',
      cell: row => {
        if (row.status === 'transferring') {
          return (
            <div className="file-progress">
              <div className="progress-bar-inline">
                <div className="progress-fill" style={{ width: `${row.progress}%` }} />
              </div>
              <span className="progress-text">{row.progress}%</span>
            </div>
          );
        }
        if (row.status === 'available' && row.direction === 'in') {
          return (
            <span>
              <a className="table-link" onClick={() => handleDownload(row)}>Download</a>
              {row.uploadCount > 0 && <span className="upload-count"> ({row.uploadCount.toFixed(2)})</span>}
            </span>
          );
        }
        if (row.status === 'available' && row.direction === 'out' && !row.uploadCount) {
          return <span className="file-status ready">Ready</span>;
        }
        if (row.status === 'requesting') {
          return <span className="file-status requesting">Requesting...</span>;
        }
        if (row.status === 'complete' && row.direction === 'in') {
          return <a className="table-link" onClick={() => handleDownload(row)}>Save</a>;
        }
        if ((row.status === 'complete' || row.uploadCount > 0) && row.direction === 'out') {
          return <span className="file-status complete">{(row.uploadCount || 0).toFixed(2)}</span>;
        }
        return null;
      },
    },
  ], []);

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

  // Initialize - generate random username on load (but don't connect yet)
  useEffect(() => {
    // Clean up old localStorage keys from previous demo
    localStorage.removeItem('rondevu-keypair');
    localStorage.removeItem('rondevu-username');
    localStorage.removeItem('rondevu-contacts');
    localStorage.removeItem('rondevu-credential');

    // Generate random username for this session
    const randomId = Math.random().toString(36).substring(2, 8);
    const randomUsername = `user-${randomId}`;
    setUsername(randomUsername);
    setSetupStep('ready');
  }, []);

  // Helper to ensure rondevu client is initialized
  const ensureConnected = async () => {
    if (rondevu) return rondevu;

    console.log('[Init] Connecting with username:', username);
    const client = await Rondevu.connect({
      apiUrl: API_URL,
      username: username,
      iceServers: icePresetRef.current,
      debug: true,
    });
    setRondevu(client);
    setUsername(client.getName());
    return client;
  };

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

      // Password protocol - must be checked before any other messages
      if (msg.type === 'password-check') {
        // Host receives password check from joining peer
        if (sessionPasswordRef.current && !msg.password) {
          // Password required but peer didn't send one - prompt them
          event.target.send(JSON.stringify({ type: 'password-required' }));
        } else if (!sessionPasswordRef.current || msg.password === sessionPasswordRef.current) {
          // No password set OR correct password
          event.target.send(JSON.stringify({ type: 'password-ok' }));
        } else {
          // Wrong password
          event.target.send(JSON.stringify({ type: 'password-fail' }));
          setTimeout(() => event.target.close(), 100);
        }
        return;
      } else if (msg.type === 'password-ok') {
        // Peer receives password accepted - send identify
        event.target.send(JSON.stringify({ type: 'identify', from: username }));
        return;
      } else if (msg.type === 'password-fail') {
        toast.error('Incorrect password');
        setConnectionStatus('disconnected');
        setSessionCode(null);
        window.history.replaceState({}, '', '/');
        return;
      } else if (msg.type === 'password-required') {
        // Host tells peer that password is required
        setPendingPasswordChannel(event.target);
        setShowPasswordModal(true);
        return;
      }

      if (msg.type === 'identify') {
        // Add peer to connected list
        setConnectedPeers(prev => prev.includes(msg.from) ? prev : [...prev, msg.from]);
        setConnectionStatus('connected');
        // Send ack
        event.target.send(JSON.stringify({ type: 'identify_ack', from: username }));
        // Send chat history
        if (chatMessagesRef.current.length > 0) {
          event.target.send(JSON.stringify({
            type: 'chat-history',
            messages: chatMessagesRef.current.map(m => ({ from: m.from, text: m.text, timestamp: m.timestamp })),
          }));
        }
        // Send available files to new peer
        transfersRef.current.filter(t => t.direction === 'out' && t.pendingFile).forEach(t => {
          event.target.send(JSON.stringify({
            type: 'file-offer',
            id: t.id,
            name: t.name,
            size: t.size,
            mimeType: t.mimeType,
            sender: username,
            uploadCount: t.uploadCount || 0,
          }));
        });
        toast.success(`${msg.from} joined`);
      } else if (msg.type === 'identify_ack') {
        // Add peer to connected list
        setConnectedPeers(prev => prev.includes(msg.from) ? prev : [...prev, msg.from]);
        setConnectionStatus('connected');
        // Send available files to host
        transfersRef.current.filter(t => t.direction === 'out' && t.pendingFile).forEach(t => {
          event.target.send(JSON.stringify({
            type: 'file-offer',
            id: t.id,
            name: t.name,
            size: t.size,
            mimeType: t.mimeType,
            sender: username,
            uploadCount: t.uploadCount || 0,
          }));
        });
      } else if (msg.type === 'file-offer') {
        // Show file as available - can be downloaded on demand
        // Check for duplicate by ID before adding
        setTransfers(prev => {
          const existing = prev.find(t => t.id === msg.id);
          if (existing) {
            // Update existing file with latest info (e.g., uploadCount)
            return prev.map(t => t.id === msg.id ? {
              ...t,
              uploadCount: msg.uploadCount || t.uploadCount,
            } : t);
          }
          // Add new file
          return [...prev, {
            id: msg.id,
            name: msg.name,
            size: msg.size,
            mimeType: msg.mimeType,
            progress: 0,
            direction: 'in',
            status: 'available',
            sender: msg.sender,
            uploadCount: msg.uploadCount || 0,
            // Store the data channel for requesting from correct peer
            _sourceChannel: event.target,
          }];
        });
      } else if (msg.type === 'file-request') {
        // Peer requested a file, start sending it
        // Use event.target (the requesting peer's channel) to send data
        const transfer = transfersRef.current.find(t => t.id === msg.id);
        if (transfer && transfer.pendingFile) {
          sendFileData(msg.id, transfer.pendingFile, event.target);
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
      } else if (msg.type === 'upload-count') {
        // Update upload count for a file
        setTransfers(prev => prev.map(t =>
          t.id === msg.id ? { ...t, uploadCount: msg.count } : t
        ));
      }
    } catch (err) {
      console.error('Failed to parse message:', err);
    }
  }, [username]);

  // Setup data channel handlers
  const setupDataChannel = useCallback((dc) => {
    dc.binaryType = 'arraybuffer';

    const handleOpen = () => {
      console.log('Data channel opened');
      setDataChannel(dc);
      dataChannelRef.current = dc; // Set ref immediately
      allChannelsRef.current.add(dc); // Track for broadcasting
      // Don't send identify here - wait for password check from peer
      // The password protocol will trigger identify exchange after verification
    };

    dc.onopen = handleOpen;

    dc.onclose = () => {
      console.log('Data channel closed');
      allChannelsRef.current.delete(dc); // Remove from tracking
      // Update dataChannelRef if this was the current one
      if (dataChannelRef.current === dc) {
        const remaining = Array.from(allChannelsRef.current);
        dataChannelRef.current = remaining.length > 0 ? remaining[0] : null;
        setDataChannel(dataChannelRef.current);
      }
      // Decrement peer count (we don't know which peer, so just remove one)
      setConnectedPeers(prev => prev.slice(0, -1));
      if (allChannelsRef.current.size === 0) {
        setConnectionStatus('waiting');
      }
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
    try {
      const client = await ensureConnected();

      const code = generateCode();
      const tag = codeToTag(code);

      setSessionCode(code);
      setIsHost(true);
      setConnectionStatus('waiting');

      // Listen for connections
      client.on('connection:opened', (offerId, connection) => {
        console.log('Connection opened:', offerId);
        const dc = connection.getDataChannel();
        const pc = connection.getPeerConnection();

        setPeerConnection(pc);

        if (dc) {
          setupDataChannel(dc);
        }
      });

      // Create and start offers with session tag (auto-starts)
      // maxOffers: 5 allows multiple peers to connect
      await client.offer({
        tags: [tag],
        maxOffers: 5,
      });
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
    if (!joinInput) return;

    try {
      const client = await ensureConnected();

      const code = joinInput.toUpperCase().trim();
      const tag = codeToTag(code);

      setSessionCode(code);
      setIsHost(false);
      setConnectionStatus('connecting');
      // Sync URL immediately
      window.history.replaceState({}, '', `/${code}`);
      setConnectionStage('signaling');

      const peer = await client.peer({ tags: [tag] });

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
        allChannelsRef.current.add(peer.dataChannel); // Add to broadcast set
        peer.dataChannel.binaryType = 'arraybuffer';

        // Send password check first (empty password to check if required)
        peer.send(JSON.stringify({ type: 'password-check', password: '' }));
      });

      peer.on('message', (data) => handleMessage({ data, target: peer.dataChannel }));

      peer.on('close', () => {
        allChannelsRef.current.delete(peer.dataChannel); // Remove from broadcast set
        setConnectionStatus('disconnected');
        setConnectionStage('');
        setConnectedPeers([]);
        setDataChannel(null);
        dataChannelRef.current = null;
        toast.error('Connection closed');
      });

      peer.on('error', (err) => {
        console.error('Peer error:', err);
        toast.error(`Connection error: ${err.message}`);
      });
    } catch (err) {
      console.error('Failed to join session:', err);
      // If no peers found, session doesn't exist - return to home silently
      if (err.message?.includes('No peers found')) {
        window.history.replaceState({}, '', '/');
        toast.error('Session not found or has ended');
      } else {
        toast.error(`Failed to join: ${err.message}`);
      }
      setSessionCode(null);
      setConnectionStatus('disconnected');
      setConnectionStage('');
    }
  };

  // Auto-join when we have a join code from URL and username is ready
  const autoJoinTriggered = useRef(false);
  useEffect(() => {
    if (username && joinInput && !autoJoinTriggered.current && !sessionCode && setupStep === 'ready') {
      // Check if this was from URL (path or query param)
      const pathCode = window.location.pathname.slice(1).toUpperCase();
      const queryCode = new URLSearchParams(window.location.search).get('join')?.toUpperCase();
      if (pathCode === joinInput || queryCode === joinInput) {
        autoJoinTriggered.current = true;
        handleJoinSession();
      }
    }
  }, [username, joinInput, sessionCode, setupStep]);

  // Keep URL in sync with session code
  useEffect(() => {
    if (sessionCode) {
      window.history.replaceState({}, '', `/${sessionCode}`);
    }
  }, [sessionCode]);

  // Warn host before leaving/refreshing (session will end)
  useEffect(() => {
    if (!isHost || !sessionCode) return;

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = 'Leaving will end your session. Are you sure?';
      return e.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isHost, sessionCode]);

  // Leave session
  const handleLeaveSession = () => {
    try {
      // Close all data channels
      allChannelsRef.current.forEach(dc => dc.close());
      peerConnection?.close();
      rondevu?.stopFilling();
    } catch (err) {
      console.error('Error leaving session:', err);
    }

    setSessionCode(null);
    setIsHost(false);
    setConnectionStatus('disconnected');
    setConnectedPeers([]);
    setDataChannel(null);
    setPeerConnection(null);
    setTransfers([]);
    incomingFilesRef.current = {};
    allChannelsRef.current.clear();
    // Clear URL
    window.history.replaceState({}, '', '/');
    toast.success('Left session');
  };

  // Get new random identity
  const handleNewIdentity = () => {
    window.location.reload();
  };

  // Submit password (peer entering password for protected session)
  const handlePasswordSubmit = () => {
    if (pendingPasswordChannel && pendingPasswordChannel.readyState === 'open') {
      pendingPasswordChannel.send(JSON.stringify({ type: 'password-check', password: passwordInput }));
      setShowPasswordModal(false);
      setPasswordInput('');
      setPendingPasswordChannel(null);
    }
  };

  // Cancel password entry (peer canceling join)
  const handlePasswordCancel = () => {
    if (pendingPasswordChannel) {
      pendingPasswordChannel.close();
    }
    setShowPasswordModal(false);
    setPasswordInput('');
    setPendingPasswordChannel(null);
    setSessionCode(null);
    setConnectionStatus('disconnected');
    window.history.replaceState({}, '', '/');
  };

  // Toggle password for session (host)
  const handleSetPassword = () => {
    const password = prompt('Set session password (leave empty to remove):');
    if (password !== null) {
      setSessionPassword(password);
      if (password) {
        toast.success('Password set');
      } else {
        toast.success('Password removed');
      }
    }
  };

  // Send file offer (file is available for peer to download on demand)
  const sendFile = async (file) => {
    // Check if any channel is open
    const openChannels = Array.from(allChannelsRef.current).filter(dc => dc.readyState === 'open');

    if (openChannels.length === 0) {
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
      uploadCount: 0, // Track how many times this file has been uploaded
    };

    // Update ref immediately so file-request handler can access it
    transfersRef.current = [...transfersRef.current, newTransfer];

    // Also update state for React re-render
    setTransfers(prev => [...prev, newTransfer]);

    // Broadcast file-offer to all connected peers
    const offerMsg = JSON.stringify({
      type: 'file-offer',
      id: fileId,
      name: file.name,
      size: file.size,
      mimeType: file.type,
      sender: username,
    });
    openChannels.forEach(dc => dc.send(offerMsg));

    toast.success(`Shared: ${file.name}`);
  };

  // Actually send file data (called after peer accepts)
  // targetChannel is the specific peer's channel that requested the file
  const sendFileData = async (fileId, file, targetChannel) => {
    const dc = targetChannel || dataChannelRef.current;
    if (!dc || dc.readyState !== 'open') {
      toast.error('Not connected');
      return;
    }

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    // Update status to transferring (keep pendingFile so file can be re-sent to other peers)
    setTransfers(prev => prev.map(t =>
      t.id === fileId ? { ...t, status: 'transferring' } : t
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

      // Mark complete and increment upload count
      setTransfers(prev => {
        const updated = prev.map(t => {
          if (t.id === fileId) {
            const newCount = (t.uploadCount || 0) + 1;
            // Broadcast count to all peers
            const countMsg = JSON.stringify({ type: 'upload-count', id: fileId, count: newCount });
            allChannelsRef.current.forEach(channel => {
              if (channel.readyState === 'open') {
                channel.send(countMsg);
              }
            });
            return { ...t, progress: 100, status: 'complete', uploadCount: newCount };
          }
          return t;
        });
        return updated;
      });
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
      // Use the source channel stored when we received the offer
      const dc = transfer._sourceChannel || dataChannelRef.current;
      if (!dc || dc.readyState !== 'open') {
        toast.error('Peer disconnected');
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

    // Broadcast to all connected peers
    const chatMsg = JSON.stringify({
      type: 'chat',
      from: message.from,
      text: message.text,
      timestamp: message.timestamp,
    });
    allChannelsRef.current.forEach(dc => {
      if (dc.readyState === 'open') {
        dc.send(chatMsg);
      }
    });
  };

  // Handle chat submit
  const handleChatSubmit = (e) => {
    e.preventDefault();
    sendChat(chatInput);
    setChatInput('');
  };

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

  // Long-press handlers for QR code popout
  const handleSessionCodePressStart = (e) => {
    e.preventDefault();
    longPressTimerRef.current = setTimeout(() => {
      setShowQrPopout(true);
    }, 500); // 500ms long press
  };

  const handleSessionCodePressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
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
          <h1 className="title">ronde.vu</h1>
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
          <span className="header-brand">ronde.vu</span>
          <div className="header-center">
            <span className="username">{username}</span>
            <button
              onClick={handleNewIdentity}
              className="refresh-btn"
              title="Get new identity"
            >
              ♻️
            </button>
          </div>
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
        </div>

        <div className="center-box">
          <h1 className="title">ronde.vu</h1>
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
        className={`container fullscreen ${isDragOver ? 'drag-over' : ''}`}
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
          <span className="header-brand">ronde.vu</span>
          <div className="header-center">
            <div className="session-code-wrapper">
              <div className="session-code-row">
                <span
                  className="session-code"
                  onClick={copyLink}
                  onMouseDown={handleSessionCodePressStart}
                  onMouseUp={handleSessionCodePressEnd}
                  onMouseLeave={handleSessionCodePressEnd}
                  onTouchStart={handleSessionCodePressStart}
                  onTouchEnd={handleSessionCodePressEnd}
                  title="Click to copy link, long-press for QR code"
                >
                  {sessionCode}
                </span>
                <button
                  className={`lock-button ${sessionPassword ? 'locked' : ''}`}
                  onClick={handleSetPassword}
                  title={sessionPassword ? 'Password protected (click to change)' : 'Set password'}
                >
                  {sessionPassword ? '🔒' : '🔓'}
                </button>
              </div>
              <span className="session-code-hint">hold for QR code</span>
            </div>
            {showQrPopout && qrDataUrl && (
              <div className="qr-popout" onClick={() => setShowQrPopout(false)}>
                <img src={qrDataUrl} alt="Session QR Code" className="qr-code" />
                <span className="qr-hint">Tap to close</span>
              </div>
            )}
          </div>
          <button onClick={handleLeaveSession} className="button text danger">Leave</button>
        </div>

        <div className="split-layout">
          {/* Files pane */}
          <div className="files-pane">
            <div className="file-list full">
              <div className="file-list-header">
                <span>Files{queuedFiles.length > 0 ? ` (${queuedFiles.length})` : ''}</span>
                <button className="header-action" onClick={() => fileInputRef.current?.click()}>
                  + Add files
                </button>
              </div>
              {queuedFiles.length === 0 ? (
                <div className="file-list-empty">
                  <span className="empty-icon">📁</span>
                  <span className="empty-text">Drop files anywhere to share</span>
                  <span className="empty-hint">or use the Add files button above</span>
                </div>
              ) : (
                queuedFiles.map((file, i) => (
                  <div key={i} className="file-row">
                    <span className="file-icon">{getFileIcon(file.type)}</span>
                    <span className="file-name">{file.name}</span>
                    <span className="file-size">{formatSize(file.size)}</span>
                    <span className="file-status queued">Queued</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Chat pane */}
          <div className={`chat-pane ${chatOpen ? 'open' : ''}`}>
            <ChatPanel
              messages={chatMessages}
              input={chatInput}
              onInputChange={setChatInput}
              onSubmit={handleChatSubmit}
            />
          </div>
        </div>

        {/* Mobile chat FAB */}
        <button className="chat-fab" onClick={() => setChatOpen(!chatOpen)}>
          {chatOpen ? '✕' : '💬'}
        </button>
      </div>
    );
  }

  // Render connecting
  // Handle ICE preset change during connection - restart with new config
  const handleIcePresetChange = async (newPreset) => {
    setIcePreset(newPreset);
    icePresetRef.current = newPreset;

    // Reset connection state
    if (peerConnection) {
      peerConnection.close();
      setPeerConnection(null);
    }
    if (dataChannel) {
      dataChannel.close();
      setDataChannel(null);
    }

    // Brief delay then retry connection
    toast.success(`Switching to ${ICE_PRESETS.find(p => p.value === newPreset)?.label || newPreset}`);
    setConnectionStage('signaling');

    // Re-initiate connection based on role
    setTimeout(() => {
      if (isHost) {
        // Host waits for peers - no action needed, will reconnect on next peer
      } else {
        // Joiner needs to re-discover and connect
        handleJoinSession(sessionCode);
      }
    }, 500);
  };

  if (connectionStatus === 'connecting') {
    return (
      <div className="container">
        <Toaster position="top-center" />
        <div className="center-box">
          <h2 className="waiting-title">Connecting...</h2>
          <ConnectionStages currentStage={connectionStage} />
          <p className="waiting-subtitle">{getStageText(connectionStage)}</p>

          <div className="connection-trouble">
            <details>
              <summary>Having trouble connecting?</summary>
              <p className="trouble-hint">Try a different connection method:</p>
              <select
                className="ice-select"
                value={icePreset}
                onChange={(e) => handleIcePresetChange(e.target.value)}
              >
                {ICE_PRESETS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              <p className="trouble-hint small">
                "Relay" options can help if you're behind a strict firewall.
              </p>
            </details>
          </div>
        </div>

        {/* Password modal */}
        {showPasswordModal && (
          <div className="modal-overlay">
            <div className="modal">
              <h3>Password Required</h3>
              <p>This session is password protected.</p>
              <input
                type="password"
                placeholder="Enter password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                className="input"
                autoFocus
              />
              <div className="modal-buttons">
                <button onClick={handlePasswordCancel} className="button text">Cancel</button>
                <button onClick={handlePasswordSubmit} className="button primary">Submit</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Render connected - file sharing view
  return (
    <div
      className={`container fullscreen ${isDragOver ? 'drag-over' : ''}`}
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
        <span className="header-brand">ronde.vu</span>
        <div className="header-center">
          {connectionStage === 'reconnecting' ? (
            <span className="peer-info warning">Reconnecting...</span>
          ) : connectionStage === 'disconnected' || connectionStage === 'failed' ? (
            <span className="peer-info warning">Disconnected</span>
          ) : (
            <span className="peer-info">{connectedPeers.length} peer{connectedPeers.length !== 1 ? 's' : ''} connected</span>
          )}
        </div>
        <button onClick={handleLeaveSession} className="button text danger">Leave</button>
      </div>

      <div className="split-layout">
        {/* Files pane */}
        <div className="files-pane">
          <div className="file-list full">
            <div className="file-list-header">
              <span>Files{transfers.length > 0 ? ` (${transfers.length})` : ''}</span>
              <button className="header-action" onClick={() => fileInputRef.current?.click()}>
                + Add files
              </button>
            </div>
            {transfers.length === 0 ? (
              <div className="file-list-empty">
                <span className="empty-icon">📁</span>
                <span className="empty-text">Drop files anywhere to share</span>
                <span className="empty-hint">or use the Add files button above</span>
              </div>
            ) : (
              <DataTable
                columns={fileColumns}
                data={transfers}
                theme="rondevu"
                dense
                noHeader
                defaultSortFieldId={3}
                customStyles={{
                  rows: { style: { minHeight: '48px' } },
                  cells: { style: { paddingLeft: '12px', paddingRight: '12px' } },
                }}
              />
            )}
          </div>
        </div>

        {/* Chat pane */}
        <div className={`chat-pane ${chatOpen ? 'open' : ''}`}>
          <ChatPanel
            messages={chatMessages}
            input={chatInput}
            onInputChange={setChatInput}
            onSubmit={handleChatSubmit}
          />
        </div>
      </div>

      {/* Mobile chat FAB */}
      <button className="chat-fab" onClick={() => setChatOpen(!chatOpen)}>
        {chatOpen ? '✕' : '💬'}
      </button>
    </div>
  );
}
