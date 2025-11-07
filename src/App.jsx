import { useState, useEffect, useRef } from 'react';
import { Rondevu, RondevuClient } from '@xtr-dev/rondevu-client';
import QRCode from 'qrcode';
import Header from './components/Header';
import ActionSelector from './components/ActionSelector';
import MethodSelector from './components/MethodSelector';
import ConnectionForm from './components/ConnectionForm';
import ChatView from './components/ChatView';

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
  const [fileUploadProgress, setFileUploadProgress] = useState(null);

  const connectionRef = useRef(null);
  const dataChannelRef = useRef(null);
  const fileTransfersRef = useRef(new Map()); // Track ongoing file transfers
  const uploadCancelRef = useRef(false);

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
      let connId;

      if (action === 'create') {
        if (method === 'connection-id') {
          connId = connectionId || `conn-${Date.now()}`;
          connection = await rdv.create(connId, topic || 'default');
          setCurrentConnectionId(connId);
          log(`Created connection: ${connId}`, 'success');
        } else {
          connId = `conn-${Date.now()}`;
          connection = await rdv.create(connId, topic);
          setCurrentConnectionId(connId);
          log(`Created connection: ${connId}`, 'success');
        }

        // Generate QR code if creating a connection
        try {
          const qrUrl = await QRCode.toDataURL(connId, {
            width: 256,
            margin: 2,
            color: {
              dark: '#667eea',
              light: '#ffffff'
            }
          });
          setQrCodeUrl(qrUrl);
          log('QR code generated', 'success');
        } catch (err) {
          log(`QR code generation error: ${err.message}`, 'error');
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
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    uploadCancelRef.current = false;
    setFileUploadProgress({ fileName: file.name, progress: 0 });

    log(`Sending file: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`, 'info');

    try {
      // Send file metadata
      const metadata = {
        type: 'file-start',
        fileId,
        name: file.name,
        size: file.size,
        mimeType: file.type,
        chunks: totalChunks
      };
      dataChannelRef.current.send(JSON.stringify(metadata));

      // Read and send file in chunks
      const reader = new FileReader();
      let offset = 0;
      let chunkIndex = 0;

      const readChunk = () => {
        if (uploadCancelRef.current) {
          setFileUploadProgress(null);
          log('File upload cancelled', 'info');
          return;
        }

        const slice = file.slice(offset, offset + CHUNK_SIZE);
        reader.readAsArrayBuffer(slice);
      };

      reader.onload = (e) => {
        if (uploadCancelRef.current) {
          setFileUploadProgress(null);
          return;
        }

        const chunk = {
          type: 'file-chunk',
          fileId,
          index: chunkIndex,
          data: Array.from(new Uint8Array(e.target.result))
        };
        dataChannelRef.current.send(JSON.stringify(chunk));

        offset += CHUNK_SIZE;
        chunkIndex++;

        // Update progress
        const progress = Math.round((chunkIndex / totalChunks) * 100);
        setFileUploadProgress({ fileName: file.name, progress });

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

          setFileUploadProgress(null);
          log(`File sent: ${file.name}`, 'success');
        }
      };

      reader.onerror = () => {
        setFileUploadProgress(null);
        log(`Error reading file: ${file.name}`, 'error');
      };

      readChunk();
    } catch (error) {
      setFileUploadProgress(null);
      log(`Error sending file: ${error.message}`, 'error');
    }

    // Reset file input
    event.target.value = '';
  };

  const cancelFileUpload = () => {
    uploadCancelRef.current = true;
    setFileUploadProgress(null);
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

  const handleScanComplete = (scannedId) => {
    setConnectionId(scannedId);
    setAction('join');
    setMethod('connection-id');
    setStep(3);
  };

  const handleScanCancel = () => {
    setAction(null);
  };

  return (
    <div className="app">
      <Header />

      <main className="main">
        {step === 1 && (
          <ActionSelector
            action={action}
            onSelectAction={setAction}
            onScanComplete={handleScanComplete}
            onScanCancel={handleScanCancel}
            log={log}
          />
        )}

        {step === 2 && (
          <MethodSelector
            action={action}
            onSelectMethod={(m) => {
              setMethod(m);
              setStep(3);
            }}
            onBack={() => setStep(1)}
          />
        )}

        {step === 3 && (
          <ConnectionForm
            action={action}
            method={method}
            topic={topic}
            setTopic={setTopic}
            connectionId={connectionId}
            setConnectionId={setConnectionId}
            peerId={peerId}
            setPeerId={setPeerId}
            topics={topics}
            sessions={sessions}
            connectionStatus={connectionStatus}
            qrCodeUrl={qrCodeUrl}
            currentConnectionId={currentConnectionId}
            onConnect={handleConnect}
            onBack={() => setStep(2)}
            onTopicSelect={setTopic}
            onDiscoverPeers={discoverPeers}
          />
        )}

        {step === 4 && (
          <ChatView
            connectedPeer={connectedPeer}
            currentConnectionId={currentConnectionId}
            messages={messages}
            messageInput={messageInput}
            setMessageInput={setMessageInput}
            channelReady={channelReady}
            logs={logs}
            fileUploadProgress={fileUploadProgress}
            onSendMessage={sendMessage}
            onFileSelect={handleFileSelect}
            onDisconnect={reset}
            onDownloadFile={downloadFile}
            onCancelUpload={cancelFileUpload}
          />
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
