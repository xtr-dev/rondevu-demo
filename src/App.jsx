import React, { useState, useEffect, useRef } from 'react';
import { Rondevu } from '@xtr-dev/rondevu-client';
import toast, { Toaster } from 'react-hot-toast';

const API_URL = 'https://api.ronde.vu';
const CHAT_SERVICE = 'chat:2.0.0';

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
  const [rondevu, setRondevu] = useState(null);
  const [myUsername, setMyUsername] = useState(null);

  // Setup
  const [setupStep, setSetupStep] = useState('init'); // init, claim, ready
  const [usernameInput, setUsernameInput] = useState('');

  // Contacts
  const [contacts, setContacts] = useState([]);
  const [contactInput, setContactInput] = useState('');
  const [onlineUsers, setOnlineUsers] = useState(new Set());

  // Chat - structure: { [username]: { connection, channel, messages, status, role, serviceFqn, offerId, polling } }
  const [activeChats, setActiveChats] = useState({});
  const [selectedChat, setSelectedChat] = useState(null);
  const [messageInputs, setMessageInputs] = useState({});

  // Service - we publish one service that can accept multiple connections
  const [myServicePublished, setMyServicePublished] = useState(false);
  const [hostConnections, setHostConnections] = useState({}); // Track incoming connections as host
  const [offerIdToPeerConnection, setOfferIdToPeerConnection] = useState({}); // Map offerId to RTCPeerConnection
  const [lastAnswerTimestamp, setLastAnswerTimestamp] = useState(0); // Track last answer timestamp for polling

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

  // Initialize Rondevu
  useEffect(() => {
    const init = async () => {
      try {
        const savedUsername = localStorage.getItem('rondevu-username');
        const savedKeypair = localStorage.getItem('rondevu-keypair');
        const savedContacts = localStorage.getItem('rondevu-contacts');

        console.log('[Init] Saved username:', savedUsername);
        console.log('[Init] Has saved keypair:', !!savedKeypair);

        // Load contacts
        if (savedContacts) {
          try {
            setContacts(JSON.parse(savedContacts));
          } catch (err) {
            console.error('Failed to load contacts:', err);
          }
        }

        const parsedKeypair = savedKeypair ? JSON.parse(savedKeypair) : undefined;

        // Create Rondevu instance
        // If no username is saved, use undefined to let Rondevu handle it
        const service = new Rondevu({
          apiUrl: API_URL,
          username: savedUsername,
          keypair: parsedKeypair,
        });

        await service.initialize();
        setRondevu(service);

        // Check if we have a saved username and if it's claimed
        if (savedUsername && savedKeypair) {
          console.log('[Init] Checking if username is claimed...');
          const isClaimed = await service.isUsernameClaimed();
          console.log('[Init] Username claimed:', isClaimed);

          if (isClaimed) {
            setMyUsername(savedUsername);
            setSetupStep('ready');
            toast.success(`Welcome back, ${savedUsername}!`);
          } else {
            console.warn('[Init] Username not claimed on server, need to claim');
            setSetupStep('claim');
          }
        } else {
          // No saved username, prompt user to claim one
          setSetupStep('claim');
        }
      } catch (err) {
        console.error('Initialization failed:', err);
        toast.error(`Failed to initialize: ${err.message}`);
        setSetupStep('claim');
      }
    };

    init();
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChats, selectedChat]);

  // Publish service when ready
  useEffect(() => {
    if (setupStep === 'ready' && myUsername && rondevu && !myServicePublished) {
      publishMyService();
    }
  }, [setupStep, myUsername, rondevu, myServicePublished]);

  // Combined polling for answers and ICE candidates (host side)
  useEffect(() => {
    if (!myServicePublished || !rondevu || Object.keys(offerIdToPeerConnection).length === 0) {
      return;
    }

    console.log('[Host Polling] Starting combined polling for answers and ICE candidates...');

    const poll = async () => {
      try {
        const result = await rondevu.pollOffers(lastAnswerTimestamp);

        // Process answers
        if (result.answers.length > 0) {
          console.log(`[Host Polling] Found ${result.answers.length} new answer(s)`);

          for (const answer of result.answers) {
            const pc = offerIdToPeerConnection[answer.offerId];

            if (pc && pc.signalingState !== 'stable') {
              console.log(`[Host Polling] Setting remote answer for offer ${answer.offerId}`);

              await pc.setRemoteDescription({
                type: 'answer',
                sdp: answer.sdp
              });

              // Update host connection status to show answer was received
              setHostConnections(prev => {
                const updated = { ...prev };
                for (const key in updated) {
                  if (updated[key].offerId === answer.offerId) {
                    updated[key] = { ...updated[key], status: 'answered' };
                  }
                }
                return updated;
              });

              // Update last answer timestamp
              setLastAnswerTimestamp(prev => Math.max(prev, answer.answeredAt));

              console.log(`✅ [Host Polling] Remote answer set for offer ${answer.offerId}`);
            } else if (pc) {
              console.log(`[Host Polling] Skipping offer ${answer.offerId} - already in stable state`);
            }
          }
        }

        // Process ICE candidates
        let totalIceCandidates = 0;
        for (const [offerId, candidates] of Object.entries(result.iceCandidates)) {
          const pc = offerIdToPeerConnection[offerId];

          if (pc && candidates.length > 0) {
            // Filter for answerer candidates only (offerer doesn't need their own candidates back)
            const answererCandidates = candidates.filter(item => item.role === 'answerer');

            if (answererCandidates.length > 0) {
              console.log(`[Host Polling] Processing ${answererCandidates.length} answerer ICE candidate(s) for offer ${offerId}`);

              for (const item of answererCandidates) {
                if (item.candidate) {
                  try {
                    await pc.addIceCandidate(new RTCIceCandidate(item.candidate));
                    totalIceCandidates++;
                    // Update timestamp
                    setLastAnswerTimestamp(prev => Math.max(prev, item.createdAt));
                  } catch (err) {
                    console.warn(`[Host Polling] Failed to add ICE candidate for offer ${offerId}:`, err);
                  }
                }
              }
            }
          }
        }

        if (totalIceCandidates > 0) {
          console.log(`✅ [Host Polling] Added ${totalIceCandidates} answerer ICE candidate(s)`);
        }
      } catch (err) {
        console.error('[Host Polling] Error polling:', err);
      }
    };

    // Poll every 2 seconds
    const interval = setInterval(poll, 2000);
    poll(); // Initial poll

    return () => clearInterval(interval);
  }, [myServicePublished, rondevu, offerIdToPeerConnection, lastAnswerTimestamp]);

  // Check online status periodically
  useEffect(() => {
    if (setupStep !== 'ready' || !rondevu) return;

    const checkOnlineStatus = async () => {
      const online = new Set();
      for (const contact of contacts) {
        try {
          const fqn = `${CHAT_SERVICE}@${contact}`;
          await rondevu.getService(fqn);
          online.add(contact);
        } catch (err) {
          // User offline or doesn't have service published
        }
      }
      setOnlineUsers(online);
    };

    checkOnlineStatus();
    const interval = setInterval(checkOnlineStatus, 10000); // Check every 10s

    return () => clearInterval(interval);
  }, [contacts, setupStep, rondevu]);

  // Claim username
  const handleClaimUsername = async () => {
    if (!rondevu || !usernameInput) return;

    try {
      const keypair = rondevu.getKeypair();
      const newService = new Rondevu({
        apiUrl: API_URL,
        username: usernameInput,
        keypair,
      });
      await newService.initialize();
      await newService.claimUsername();

      setRondevu(newService);
      setMyUsername(usernameInput);
      localStorage.setItem('rondevu-username', usernameInput);
      localStorage.setItem('rondevu-keypair', JSON.stringify(keypair));

      setSetupStep('ready');
      toast.success(`Welcome, ${usernameInput}!`);
    } catch (err) {
      toast.error(`Error: ${err.message}`);
    }
  };

  // Publish service to accept incoming connections
  const publishMyService = async () => {
    try {
      // Verify username is claimed with correct keypair before publishing
      console.log('[Publish] Verifying username claim...');
      const isClaimed = await rondevu.isUsernameClaimed();
      console.log('[Publish] Is claimed by us:', isClaimed);

      if (!isClaimed) {
        console.warn('[Publish] Username not claimed by current keypair');

        // Check if username is claimed by someone else
        try {
          const usernameCheck = await fetch(`${API_URL}/users/${myUsername}`);
          const checkData = await usernameCheck.json();

          if (!checkData.available) {
            // Username claimed by different keypair
            console.error('[Publish] Username claimed by different keypair');
            toast.error(
              'Username keypair mismatch. Please logout and try again with a fresh account.',
              { duration: 10000 }
            );
            return;
          }
        } catch (e) {
          console.error('[Publish] Failed to check username:', e);
        }

        // Try to claim username
        console.log('[Publish] Attempting to claim username...');
        toast.loading('Claiming username...', { id: 'claim' });
        try {
          await rondevu.claimUsername();
          toast.success('Username claimed!', { id: 'claim' });
        } catch (claimErr) {
          console.error('[Publish] Failed to claim username:', claimErr);
          toast.error(`Failed to claim username: ${claimErr.message}`, { id: 'claim' });
          return;
        }
      }

      // We'll create a pool of offers manually
      const offers = [];
      const poolSize = 10; // Support up to 10 simultaneous connections
      const connections = []; // Track connections before publishing

      console.log('[Publish] Creating', poolSize, 'peer connections...');
      for (let i = 0; i < poolSize; i++) {
        const pc = new RTCPeerConnection(getCurrentRtcConfig());
        const dc = pc.createDataChannel('chat');

        // Setup handlers (will be enhanced with offerId later)
        setupHostConnection(pc, dc, myUsername);

        // Buffer ICE candidates until we have offerId
        const candidateBuffer = [];
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            console.log(`[Host] Buffering ICE candidate for connection ${i}:`, event.candidate);
            candidateBuffer.push(event.candidate.toJSON());
          } else {
            console.log(`[Host] ICE gathering complete for connection ${i} (buffered ${candidateBuffer.length} candidates)`);
          }
        };

        // Create offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        offers.push({ sdp: offer.sdp });
        connections.push({ pc, dc, index: i, candidateBuffer });
      }

      // Publish service
      const fqn = `${CHAT_SERVICE}@${myUsername}`;
      console.log('[Publish] Publishing service with FQN:', fqn);
      console.log('[Publish] Public key:', rondevu.getPublicKey());

      const publishResult = await rondevu.publishService({
        serviceFqn: fqn,
        offers,
        ttl: 300000, // 5 minutes
      });

      // Map offerIds to peer connections and setup ICE handlers
      const offerMapping = {};
      const hostConnMap = {};
      publishResult.offers.forEach((offer, idx) => {
        const conn = connections[idx];
        offerMapping[offer.offerId] = conn.pc;
        hostConnMap[`host-${idx}`] = { pc: conn.pc, dc: conn.dc, offerId: offer.offerId, status: 'waiting' };

        // Track connection state changes
        conn.pc.onconnectionstatechange = () => {
          console.log(`[Host] Connection state for offer ${offer.offerId}:`, conn.pc.connectionState);

          if (conn.pc.connectionState === 'connecting') {
            setHostConnections(prev => {
              const updated = { ...prev };
              for (const key in updated) {
                if (updated[key].offerId === offer.offerId) {
                  updated[key] = { ...updated[key], status: 'connecting' };
                }
              }
              return updated;
            });
          } else if (conn.pc.connectionState === 'connected') {
            setHostConnections(prev => {
              const updated = { ...prev };
              for (const key in updated) {
                if (updated[key].offerId === offer.offerId) {
                  updated[key] = { ...updated[key], status: 'connected' };
                }
              }
              return updated;
            });
          }
        };

        // Send buffered ICE candidates
        if (conn.candidateBuffer && conn.candidateBuffer.length > 0) {
          console.log(`[Host] Sending ${conn.candidateBuffer.length} buffered ICE candidates for offer ${offer.offerId}`);
          rondevu.addOfferIceCandidates(
            fqn,
            offer.offerId,
            conn.candidateBuffer
          ).then(() => {
            console.log(`✅ [Host] Successfully sent ${conn.candidateBuffer.length} buffered ICE candidates for offer ${offer.offerId}`);
          }).catch(err => console.error(`[Host] Failed to send buffered ICE candidates for offer ${offer.offerId}:`, err));
        }

        // Setup ICE candidate handler for any future candidates
        conn.pc.onicecandidate = (event) => {
          if (event.candidate) {
            console.log(`[Host] Sending new ICE candidate for offer ${offer.offerId}:`, event.candidate);
            rondevu.addOfferIceCandidates(
              fqn,
              offer.offerId,
              [event.candidate.toJSON()]
            ).then(() => {
              console.log(`✅ [Host] Successfully sent ICE candidate for offer ${offer.offerId}`);
            }).catch(err => console.error(`[Host] Failed to send ICE candidate for offer ${offer.offerId}:`, err));
          } else {
            console.log(`[Host] ICE gathering complete for offer ${offer.offerId} (null candidate)`);
          }
        };
      });

      setOfferIdToPeerConnection(offerMapping);
      setHostConnections(hostConnMap);
      setMyServicePublished(true);

      console.log('✅ Chat service published successfully with', poolSize, 'offers');
      console.log('[Publish] Offer IDs:', Object.keys(offerMapping));
      toast.success('Chat service started!');
    } catch (err) {
      console.error('[Publish] Failed to publish service:', err);
      toast.error(`Failed to start chat service: ${err.message}`);

      // Provide helpful guidance based on error type
      if (err.message?.includes('Invalid signature') || err.message?.includes('403')) {
        toast.error(
          'Authentication error. Try logging out and creating a new account.',
          { duration: 10000 }
        );
      }
    }
  };

  // Setup host connection (when someone connects to us)
  const setupHostConnection = (pc, dc, hostUsername) => {
    let peerUsername = null;

    dc.onopen = () => {
      console.log('Host data channel opened');
    };

    dc.onclose = () => {
      console.log('Host data channel closed');
      if (peerUsername) {
        setActiveChats(prev => ({
          ...prev,
          [peerUsername]: { ...prev[peerUsername], status: 'disconnected' }
        }));
      }
    };

    dc.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'identify') {
          // Peer identified themselves
          peerUsername = msg.from;
          console.log(`📡 New connection from: ${peerUsername}`);

          // Auto-accept and open chat immediately (same UX as answerer side)
          setActiveChats(prev => ({
            ...prev,
            [peerUsername]: {
              username: peerUsername,
              channel: dc,
              connection: pc,
              messages: prev[peerUsername]?.messages || [],
              status: 'connected',
              role: 'host'
            }
          }));

          // Auto-select the chat
          setSelectedChat(peerUsername);

          // Send acknowledgment
          dc.send(JSON.stringify({
            type: 'identify_ack',
            from: hostUsername
          }));

          // Show notification
          toast.success(`${peerUsername} connected!`, {
            duration: 3000,
            icon: '💬'
          });
        } else if (msg.type === 'message' && peerUsername) {
          // Chat message
          setActiveChats(prev => ({
            ...prev,
            [peerUsername]: {
              ...prev[peerUsername],
              messages: [...(prev[peerUsername]?.messages || []), {
                from: peerUsername,
                text: msg.text,
                timestamp: Date.now()
              }]
            }
          }));
        }
      } catch (err) {
        console.error('Failed to parse message:', err);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('Host connection state:', pc.connectionState);
    };
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
    localStorage.setItem('rondevu-contacts', JSON.stringify(newContacts));
    setContactInput('');
    toast.success(`Added ${contactInput}`);
  };

  // Remove contact
  const handleRemoveContact = (contact) => {
    const newContacts = contacts.filter(c => c !== contact);
    setContacts(newContacts);
    localStorage.setItem('rondevu-contacts', JSON.stringify(newContacts));
    if (selectedChat === contact) {
      setSelectedChat(null);
    }
    toast.success(`Removed ${contact}`);
  };

  // Start chat with contact (answerer role)
  const handleStartChat = async (contact) => {
    if (!rondevu || activeChats[contact]?.status === 'connected') {
      setSelectedChat(contact);
      return;
    }

    try {
      toast.loading(`Connecting to ${contact}...`, { id: 'connecting' });

      // Discover peer's service
      const fqn = `${CHAT_SERVICE}@${contact}`;
      const serviceData = await rondevu.getService(fqn);

      console.log('Found peer service:', serviceData);

      // Create peer connection
      const pc = new RTCPeerConnection(getCurrentRtcConfig());

      // Handle incoming data channel
      let dataChannel = null;
      pc.ondatachannel = (event) => {
        console.log('Received data channel from', contact);
        dataChannel = event.channel;
        setupClientChannel(dataChannel, contact, pc);
      };

      // Set remote offer
      await pc.setRemoteDescription({
        type: 'offer',
        sdp: serviceData.sdp,
      });

      // Create answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Send answer
      await rondevu.postOfferAnswer(fqn, serviceData.offerId, answer.sdp);

      // Poll for ICE candidates
      const lastIceTimestamp = { current: 0 };
      console.log(`[Answerer] Starting ICE candidate polling for offer ${serviceData.offerId}`);

      const icePolling = setInterval(async () => {
        try {
          const result = await rondevu.getOfferIceCandidates(
            fqn,
            serviceData.offerId,
            lastIceTimestamp.current
          );

          if (result.candidates.length > 0) {
            console.log(`[Answerer] Received ${result.candidates.length} ICE candidate(s) from offerer`);
          }

          for (const item of result.candidates) {
            if (item.candidate && item.candidate.candidate) {
              try {
                console.log(`[Answerer] Adding offerer ICE candidate:`, item.candidate);
                const rtcCandidate = new RTCIceCandidate(item.candidate);
                await pc.addIceCandidate(rtcCandidate);
                lastIceTimestamp.current = item.createdAt;
                console.log(`✅ [Answerer] Successfully added offerer ICE candidate`);
              } catch (err) {
                console.warn('[Answerer] Failed to process ICE candidate:', err);
                lastIceTimestamp.current = item.createdAt;
              }
            } else {
              lastIceTimestamp.current = item.createdAt;
            }
          }
        } catch (err) {
          if (err.message?.includes('404') || err.message?.includes('410')) {
            console.warn('[Answerer] Offer expired, stopping ICE polling');
            clearInterval(icePolling);
          } else {
            console.error('[Answerer] Error polling ICE candidates:', err);
          }
        }
      }, 1000);

      // Send local ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log(`[Answerer] Sending ICE candidate to server:`, event.candidate);
          rondevu.addOfferIceCandidates(
            fqn,
            serviceData.offerId,
            [event.candidate.toJSON()]
          ).then(() => {
            console.log(`✅ [Answerer] Successfully sent ICE candidate to server`);
          }).catch(err => console.error('[Answerer] Failed to send ICE candidate:', err));
        }
      };

      pc.onconnectionstatechange = () => {
        console.log('Client connection state:', pc.connectionState);
        if (pc.connectionState === 'connected') {
          toast.success(`Connected to ${contact}`, { id: 'connecting' });
          // Stop ICE polling once connected
          clearInterval(icePolling);
          console.log('[Answerer] Stopped ICE polling - connection established');
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          toast.error(`Disconnected from ${contact}`);
          clearInterval(icePolling);
          setActiveChats(prev => ({
            ...prev,
            [contact]: { ...prev[contact], status: 'disconnected' }
          }));
        }
      };

      // Store connection info
      setActiveChats(prev => ({
        ...prev,
        [contact]: {
          username: contact,
          connection: pc,
          channel: dataChannel, // Will be set when ondatachannel fires
          messages: prev[contact]?.messages || [],
          status: 'connecting',
          role: 'answerer',
          serviceFqn: fqn,
          offerId: serviceData.offerId,
          icePolling
        }
      }));

      setSelectedChat(contact);

    } catch (err) {
      console.error('Failed to connect:', err);
      toast.error(`Failed to connect to ${contact}`, { id: 'connecting' });
    }
  };

  // Setup client data channel
  const setupClientChannel = (dc, contact, pc) => {
    dc.onopen = () => {
      console.log('Client data channel opened with', contact);

      // Send identification
      dc.send(JSON.stringify({
        type: 'identify',
        from: myUsername
      }));
    };

    dc.onclose = () => {
      console.log('Client data channel closed');
      setActiveChats(prev => ({
        ...prev,
        [contact]: { ...prev[contact], status: 'disconnected' }
      }));
    };

    dc.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'identify_ack') {
          // Connection acknowledged
          setActiveChats(prev => ({
            ...prev,
            [contact]: {
              ...prev[contact],
              channel: dc,
              status: 'connected'
            }
          }));
          toast.success(`Connected to ${contact}`, { id: 'connecting' });
        } else if (msg.type === 'message') {
          // Chat message
          setActiveChats(prev => ({
            ...prev,
            [contact]: {
              ...prev[contact],
              messages: [...(prev[contact]?.messages || []), {
                from: contact,
                text: msg.text,
                timestamp: Date.now()
              }]
            }
          }));
        }
      } catch (err) {
        console.error('Failed to parse message:', err);
      }
    };

    // Update the channel reference in state
    setActiveChats(prev => ({
      ...prev,
      [contact]: {
        ...prev[contact],
        channel: dc
      }
    }));
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

  if (!rondevu) {
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

            {setupStep === 'init' && (
              <div>
                <p style={styles.setupDesc}>Initializing...</p>
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


            {/* Connection Pool Status */}
            {myServicePublished && Object.keys(hostConnections).length > 0 && (
              <div style={styles.contactsList}>
                <div style={styles.contactsHeader}>
                  Connection Pool ({Object.keys(hostConnections).filter(k => hostConnections[k].status !== 'waiting').length}/{Object.keys(hostConnections).length})
                </div>
                <div style={{ padding: '12px', fontSize: '12px', color: '#666' }}>
                  {Object.keys(hostConnections).map(key => {
                    const conn = hostConnections[key];
                    let statusColor = '#999';
                    let statusText = 'Waiting';

                    if (conn.status === 'answered') {
                      statusColor = '#ff9800';
                      statusText = 'Answer received';
                    } else if (conn.status === 'connecting') {
                      statusColor = '#2196f3';
                      statusText = 'Connecting...';
                    } else if (conn.status === 'connected') {
                      statusColor = '#4caf50';
                      statusText = 'Connected';
                    }

                    return (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', marginBottom: '6px', gap: '8px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusColor }}></div>
                        <span>{statusText}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Incoming Chats (not in contacts) */}
            {Object.keys(activeChats).filter(username => !contacts.includes(username) && activeChats[username].status === 'connected').length > 0 && (
              <div style={styles.contactsList}>
                <div style={styles.contactsHeader}>
                  Active Chats ({Object.keys(activeChats).filter(username => !contacts.includes(username) && activeChats[username].status === 'connected').length})
                </div>
                {Object.keys(activeChats)
                  .filter(username => !contacts.includes(username) && activeChats[username].status === 'connected')
                  .map(contact => (
                    <div
                      key={contact}
                      className="contact-item"
                      style={{
                        ...styles.contactItem,
                        ...(selectedChat === contact ? styles.contactItemActive : {})
                      }}
                      onClick={() => setSelectedChat(contact)}
                    >
                      <div style={styles.contactAvatar}>
                        {contact[0].toUpperCase()}
                        <span style={{
                          ...styles.contactDot,
                          background: '#4caf50'
                        }}></span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={styles.contactName}>{contact}</div>
                        <div style={styles.contactStatus}>
                          Connected
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          // Close/disconnect the chat
                          const chat = activeChats[contact];
                          if (chat) {
                            try {
                              chat.channel?.close();
                              chat.connection?.close();
                            } catch (err) {
                              console.error('Error closing chat:', err);
                            }
                            setActiveChats(prev => {
                              const updated = { ...prev };
                              delete updated[contact];
                              return updated;
                            });
                            if (selectedChat === contact) {
                              setSelectedChat(null);
                            }
                            toast.success(`Disconnected from ${contact}`);
                          }
                        }}
                        style={{
                          ...styles.removeBtn,
                          background: '#dc3545'
                        }}
                        title="Disconnect"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
              </div>
            )}

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
                      {hasActiveChat && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Close the active chat
                            const chat = activeChats[contact];
                            if (chat) {
                              try {
                                chat.channel?.close();
                                chat.connection?.close();
                              } catch (err) {
                                console.error('Error closing chat:', err);
                              }
                              setActiveChats(prev => {
                                const updated = { ...prev };
                                delete updated[contact];
                                return updated;
                              });
                              if (selectedChat === contact) {
                                setSelectedChat(null);
                              }
                              toast.success(`Chat with ${contact} closed`);
                            }
                          }}
                          style={{
                            ...styles.removeBtn,
                            background: '#dc3545',
                            marginRight: '4px'
                          }}
                          title="End chat"
                        >
                          ✕
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Remove ${contact} from your friends list?`)) {
                            handleRemoveContact(contact);
                          }
                        }}
                        style={styles.removeBtn}
                        title="Remove friend"
                      >
                        🗑
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
