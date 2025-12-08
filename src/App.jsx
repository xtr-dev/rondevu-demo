import React, { useState, useEffect, useRef } from 'react'
import { RondevuService, RondevuSignaler, WebRTCContext, RTCDurableConnection, ServiceHost, ServiceClient } from '@xtr-dev/rondevu-client'
import toast, { Toaster } from 'react-hot-toast'

const API_URL = 'https://api.ronde.vu'
const CHAT_SERVICE = 'chat.rondevu@2.0.0'

// RTC Presets remain the same
const RTC_PRESETS = {
    'ipv4-turn': {
        name: 'IPv4 TURN (Recommended)',
        config: {
            iceServers: [
                { urls: ['stun:57.129.61.67:3478'] },
                {
                    urls: [
                        'turn:57.129.61.67:3478?transport=tcp',
                        'turn:57.129.61.67:3478?transport=udp',
                    ],
                    username: 'webrtcuser',
                    credential: 'supersecretpassword',
                },
            ],
        },
    },
}

export default function App() {
    // Core state
    const [rondevuService, setRondevuService] = useState(null)
    const [serviceHost, setServiceHost] = useState(null)
    const [myUsername, setMyUsername] = useState(null)
    const [setupStep, setSetupStep] = useState('init') // init, claim, ready
    const [usernameInput, setUsernameInput] = useState('')

    // Chat state
    const [contacts, setContacts] = useState([])
    const [contactInput, setContactInput] = useState('')
    const [activeChats, setActiveChats] = useState({}) // { username: { client, connection, messages } }
    const [selectedChat, setSelectedChat] = useState(null)
    const [messageInputs, setMessageInputs] = useState({})

    const [rtcPreset] = useState('ipv4-turn')
    const chatEndRef = useRef(null)

    // Initialize Rondevu Service
    useEffect(() => {
        const init = async () => {
            try {
                // Load saved data
                const savedUsername = localStorage.getItem('rondevu-v2-username')
                const savedKeypair = localStorage.getItem('rondevu-v2-keypair')
                const savedContacts = localStorage.getItem('rondevu-v2-contacts')

                if (savedContacts) {
                    try {
                        setContacts(JSON.parse(savedContacts))
                    } catch (err) {
                        console.error('Failed to load contacts:', err)
                    }
                }

                // Create service
                const service = new RondevuService({
                    apiUrl: API_URL,
                    username: savedUsername || 'temp',
                    keypair: savedKeypair ? JSON.parse(savedKeypair) : undefined,
                })

                await service.initialize()
                setRondevuService(service)

                // Check if we have a saved username and it's still valid
                if (savedUsername && savedKeypair) {
                    try {
                        // Verify the username is still claimed by checking with the server
                        const isClaimed = await service.isUsernameClaimed()
                        if (isClaimed) {
                            setMyUsername(savedUsername)
                            setSetupStep('ready')
                            console.log('Restored session for username:', savedUsername)
                            toast.success(`Welcome back, ${savedUsername}!`, { duration: 3000 })
                        } else {
                            // Username expired or was never properly claimed
                            console.log('Saved username is no longer valid, need to reclaim')
                            setSetupStep('claim')
                        }
                    } catch (err) {
                        console.error('Failed to verify username claim:', err)
                        // Keep the saved data but require reclaim
                        setSetupStep('claim')
                    }
                } else {
                    setSetupStep('claim')
                }
            } catch (err) {
                console.error('Initialization failed:', err)
                toast.error(`Failed to initialize: ${err.message}`)
                setSetupStep('claim')
            }
        }

        init()
    }, [])

    // Start hosting service when ready
    useEffect(() => {
        if (setupStep === 'ready' && myUsername && rondevuService && !serviceHost) {
            startHosting()
        }
    }, [setupStep, myUsername, rondevuService])

    // Auto-scroll chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [activeChats, selectedChat])

    // Claim username
    const handleClaimUsername = async () => {
        if (!rondevuService || !usernameInput) return

        try {
            await rondevuService.claimUsername()

            // Save username and keypair
            setMyUsername(usernameInput)
            localStorage.setItem('rondevu-v2-username', usernameInput)
            localStorage.setItem(
                'rondevu-v2-keypair',
                JSON.stringify(rondevuService.getKeypair())
            )

            setSetupStep('ready')
            toast.success(`Welcome, ${usernameInput}!`)
        } catch (err) {
            toast.error(`Error: ${err.message}`)
        }
    }

    // Start hosting chat service
    const startHosting = async () => {
        if (!rondevuService || serviceHost) return

        try {
            const host = new ServiceHost({
                service: CHAT_SERVICE,
                rondevuService,
                maxPeers: 5,
                ttl: 300000,
                isPublic: true,
                rtcConfiguration: RTC_PRESETS[rtcPreset].config,
            })

            // Listen for incoming connections
            host.events.on('connection', conn => {
                console.log(`New incoming connection: ${conn.id}`)

                // Wait for peer to identify
                let peerUsername = null
                const messageHandler = msg => {
                    try {
                        const data = JSON.parse(msg)
                        if (data.type === 'identify') {
                            peerUsername = data.from

                            // Update active chats
                            setActiveChats(prev => ({
                                ...prev,
                                [peerUsername]: {
                                    connection: conn,
                                    messages: prev[peerUsername]?.messages || [],
                                    status: 'connected',
                                },
                            }))

                            // Send acknowledgment
                            conn.sendMessage(
                                JSON.stringify({ type: 'identify_ack', from: myUsername })
                            )

                            // Remove identify handler, add message handler
                            conn.events.off('message', messageHandler)
                            conn.events.on('message', chatMsg => {
                                try {
                                    const chatData = JSON.parse(chatMsg)
                                    if (chatData.type === 'message') {
                                        setActiveChats(prev => ({
                                            ...prev,
                                            [peerUsername]: {
                                                ...prev[peerUsername],
                                                messages: [
                                                    ...(prev[peerUsername]?.messages || []),
                                                    {
                                                        from: peerUsername,
                                                        text: chatData.text,
                                                        timestamp: Date.now(),
                                                    },
                                                ],
                                            },
                                        }))
                                    }
                                } catch (err) {
                                    console.error('Failed to parse chat message:', err)
                                }
                            })
                        }
                    } catch (err) {
                        console.error('Failed to parse identify message:', err)
                    }
                }

                conn.events.on('message', messageHandler)

                conn.events.on('state-change', state => {
                    if (state === 'disconnected' && peerUsername) {
                        setActiveChats(prev => ({
                            ...prev,
                            [peerUsername]: { ...prev[peerUsername], status: 'disconnected' },
                        }))
                    }
                })
            })

            host.events.on('error', error => {
                console.error('Host error:', error)
                toast.error(`Service error: ${error.message}`)
            })

            await host.start()
            setServiceHost(host)
            console.log('✅ Chat service started')
        } catch (err) {
            console.error('Failed to start hosting:', err)
            toast.error(`Failed to start service: ${err.message}`)
        }
    }

    // Add contact
    const handleAddContact = () => {
        if (!contactInput || contacts.includes(contactInput)) {
            toast.error('Invalid or duplicate contact')
            return
        }
        if (contactInput === myUsername) {
            toast.error("You can't add yourself!")
            return
        }

        const newContacts = [...contacts, contactInput]
        setContacts(newContacts)
        localStorage.setItem('rondevu-v2-contacts', JSON.stringify(newContacts))
        setContactInput('')
        toast.success(`Added ${contactInput}`)
    }

    // Remove contact
    const handleRemoveContact = contact => {
        const newContacts = contacts.filter(c => c !== contact)
        setContacts(newContacts)
        localStorage.setItem('rondevu-v2-contacts', JSON.stringify(newContacts))
        if (selectedChat === contact) {
            setSelectedChat(null)
        }
        toast.success(`Removed ${contact}`)
    }

    // Start chat with contact
    const handleStartChat = async contact => {
        if (activeChats[contact]?.status === 'connected') {
            setSelectedChat(contact)
            return
        }

        try {
            toast.loading(`Connecting to ${contact}...`, { id: 'connecting' })

            const client = new ServiceClient({
                username: contact,
                serviceFqn: CHAT_SERVICE,
                rondevuService,
                autoReconnect: true,
                rtcConfiguration: RTC_PRESETS[rtcPreset].config,
            })

            // Listen for events
            client.events.on('connected', conn => {
                console.log(`✅ Connected to ${contact}`)
                toast.success(`Connected to ${contact}`, { id: 'connecting' })

                setActiveChats(prev => ({
                    ...prev,
                    [contact]: {
                        client,
                        connection: conn,
                        messages: prev[contact]?.messages || [],
                        status: 'connected',
                    },
                }))
                setSelectedChat(contact)

                // Handle messages
                conn.events.on('message', msg => {
                    try {
                        const data = JSON.parse(msg)
                        if (data.type === 'message') {
                            setActiveChats(prev => ({
                                ...prev,
                                [contact]: {
                                    ...prev[contact],
                                    messages: [
                                        ...(prev[contact]?.messages || []),
                                        {
                                            from: contact,
                                            text: data.text,
                                            timestamp: Date.now(),
                                        },
                                    ],
                                },
                            }))
                        } else if (data.type === 'identify_ack') {
                            console.log(`Got identify_ack from ${contact}`)
                        }
                    } catch (err) {
                        console.error('Failed to parse message:', err)
                    }
                })

                // Send identification
                conn.sendMessage(JSON.stringify({ type: 'identify', from: myUsername }))
            })

            client.events.on('disconnected', () => {
                console.log(`🔌 Disconnected from ${contact}`)
                setActiveChats(prev => ({
                    ...prev,
                    [contact]: { ...prev[contact], status: 'disconnected' },
                }))
            })

            client.events.on('reconnecting', ({ attempt, maxAttempts }) => {
                console.log(`🔄 Reconnecting to ${contact} (${attempt}/${maxAttempts})`)
                toast.loading(`Reconnecting to ${contact}...`, { id: 'reconnecting' })
            })

            client.events.on('error', error => {
                console.error(`❌ Connection error:`, error)
                toast.error(`Connection failed: ${error.message}`, { id: 'connecting' })
            })

            // Connect
            await client.connect()
        } catch (err) {
            console.error('Failed to connect:', err)
            toast.error(`Failed to connect to ${contact}`, { id: 'connecting' })
        }
    }

    // Send message
    const handleSendMessage = contact => {
        const text = messageInputs[contact]
        if (!text || !activeChats[contact]?.connection) return

        const chat = activeChats[contact]
        if (chat.status !== 'connected') {
            toast.error('Not connected')
            return
        }

        try {
            chat.connection.sendMessage(JSON.stringify({ type: 'message', text }))

            setActiveChats(prev => ({
                ...prev,
                [contact]: {
                    ...prev[contact],
                    messages: [
                        ...prev[contact].messages,
                        { from: myUsername, text, timestamp: Date.now() },
                    ],
                },
            }))

            setMessageInputs(prev => ({ ...prev, [contact]: '' }))
        } catch (err) {
            console.error('Failed to send message:', err)
            toast.error('Failed to send message')
        }
    }

    // Logout
    const handleLogout = () => {
        if (window.confirm('Are you sure you want to logout?')) {
            localStorage.clear()
            window.location.reload()
        }
    }

    if (!rondevuService) {
        return <div style={styles.loading}>Loading...</div>
    }

    return (
        <div style={styles.container}>
            <Toaster position="top-right" />

            {/* Setup Screen */}
            {setupStep !== 'ready' && (
                <div style={styles.setupScreen}>
                    <div style={styles.setupBox}>
                        <h1 style={styles.setupTitle}>Rondevu Chat</h1>
                        <p style={styles.setupSubtitle}>v2.0 - Decentralized P2P Chat</p>

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
                                    onChange={e => setUsernameInput(e.target.value.toLowerCase())}
                                    onKeyPress={e => e.key === 'Enter' && handleClaimUsername()}
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
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Main Chat Screen - Same UI as before */}
            {setupStep === 'ready' && (
                <div style={styles.mainScreen}>
                    {/* Sidebar */}
                    <div style={styles.sidebar}>
                        <div style={styles.userHeader}>
                            <div>
                                <div style={styles.userHeaderName}>@{myUsername}</div>
                                <div style={styles.userHeaderStatus}>
                                    <span style={styles.onlineDot}></span> Online
                                </div>
                            </div>
                            <button onClick={handleLogout} style={styles.logoutBtn}>
                                Logout
                            </button>
                        </div>

                        <div style={styles.addContactBox}>
                            <input
                                type="text"
                                placeholder="Add friend..."
                                value={contactInput}
                                onChange={e => setContactInput(e.target.value.toLowerCase())}
                                onKeyPress={e => e.key === 'Enter' && handleAddContact()}
                                style={styles.contactInput}
                            />
                            <button onClick={handleAddContact} style={styles.addBtn}>
                                Add
                            </button>
                        </div>

                        <div style={styles.contactsList}>
                            <div style={styles.contactsHeader}>Friends ({contacts.length})</div>
                            {contacts.length === 0 ? (
                                <div style={styles.emptyState}>
                                    <p>No friends yet</p>
                                </div>
                            ) : (
                                contacts.map(contact => {
                                    const hasActiveChat = activeChats[contact]?.status === 'connected'

                                    return (
                                        <div
                                            key={contact}
                                            style={{
                                                ...styles.contactItem,
                                                ...(selectedChat === contact
                                                    ? styles.contactItemActive
                                                    : {}),
                                            }}
                                            onClick={() =>
                                                hasActiveChat
                                                    ? setSelectedChat(contact)
                                                    : handleStartChat(contact)
                                            }
                                        >
                                            <div style={styles.contactAvatar}>
                                                {contact[0].toUpperCase()}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={styles.contactName}>{contact}</div>
                                                <div style={styles.contactStatus}>
                                                    {hasActiveChat ? 'Connected' : 'Offline'}
                                                </div>
                                            </div>
                                            <button
                                                onClick={e => {
                                                    e.stopPropagation()
                                                    handleRemoveContact(contact)
                                                }}
                                                style={styles.removeBtn}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </div>

                    {/* Chat Area - Same as before but simplified */}
                    <div style={styles.chatArea}>
                        {!selectedChat ? (
                            <div style={styles.emptyChat}>
                                <h2>Select a friend to chat</h2>
                            </div>
                        ) : (
                            <>
                                <div style={styles.chatHeader}>
                                    <div style={styles.chatHeaderName}>@{selectedChat}</div>
                                </div>

                                <div style={styles.messagesArea}>
                                    {(!activeChats[selectedChat] ||
                                        activeChats[selectedChat].messages.length === 0) && (
                                        <div style={styles.emptyMessages}>
                                            <p>No messages yet</p>
                                        </div>
                                    )}
                                    {activeChats[selectedChat]?.messages.map((msg, idx) => (
                                        <div
                                            key={idx}
                                            style={{
                                                ...styles.message,
                                                ...(msg.from === myUsername
                                                    ? styles.messageMe
                                                    : styles.messageThem),
                                            }}
                                        >
                                            <div
                                                style={{
                                                    ...styles.messageText,
                                                    background:
                                                        msg.from === myUsername ? '#4a9eff' : '#2a2a2a',
                                                    color: 'white',
                                                }}
                                            >
                                                {msg.text}
                                            </div>
                                        </div>
                                    ))}
                                    <div ref={chatEndRef} />
                                </div>

                                <div style={styles.inputArea}>
                                    <input
                                        type="text"
                                        placeholder="Type a message..."
                                        value={messageInputs[selectedChat] || ''}
                                        onChange={e =>
                                            setMessageInputs(prev => ({
                                                ...prev,
                                                [selectedChat]: e.target.value,
                                            }))
                                        }
                                        onKeyPress={e =>
                                            e.key === 'Enter' && handleSendMessage(selectedChat)
                                        }
                                        disabled={activeChats[selectedChat]?.status !== 'connected'}
                                        style={styles.messageInput}
                                    />
                                    <button
                                        onClick={() => handleSendMessage(selectedChat)}
                                        disabled={
                                            !messageInputs[selectedChat] ||
                                            activeChats[selectedChat]?.status !== 'connected'
                                        }
                                        style={styles.sendBtn}
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
    )
}

// Styles remain mostly the same...
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
        fontSize: '24px',
    },
    setupScreen: {
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
    },
    setupBox: {
        background: '#2a2a2a',
        borderRadius: '16px',
        padding: '40px',
        maxWidth: '400px',
        width: '100%',
        textAlign: 'center',
        border: '1px solid #3a3a3a',
    },
    setupTitle: {
        fontSize: '2.5em',
        margin: '0 0 10px 0',
        color: '#e0e0e0',
    },
    setupSubtitle: {
        fontSize: '1.1em',
        color: '#a0a0a0',
        margin: '0 0 30px 0',
    },
    setupDesc: {
        color: '#a0a0a0',
        marginBottom: '20px',
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
    mainScreen: {
        height: '100vh',
        display: 'flex',
    },
    sidebar: {
        width: '320px',
        background: '#2a2a2a',
        borderRight: '1px solid #3a3a3a',
        display: 'flex',
        flexDirection: 'column',
    },
    userHeader: {
        padding: '20px',
        borderBottom: '1px solid #3a3a3a',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    userHeaderName: {
        fontSize: '18px',
        fontWeight: '600',
        color: '#e0e0e0',
    },
    userHeaderStatus: {
        fontSize: '12px',
        color: '#a0a0a0',
        marginTop: '4px',
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
    },
    onlineDot: {
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: '#4caf50',
        display: 'inline-block',
    },
    logoutBtn: {
        padding: '8px 12px',
        background: '#3a3a3a',
        color: '#e0e0e0',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        fontSize: '14px',
    },
    addContactBox: {
        padding: '15px',
        borderBottom: '1px solid #3a3a3a',
        display: 'flex',
        gap: '8px',
    },
    contactInput: {
        flex: 1,
        padding: '10px',
        border: '1px solid #3a3a3a',
        background: '#1a1a1a',
        color: '#e0e0e0',
        borderRadius: '6px',
        fontSize: '14px',
    },
    addBtn: {
        padding: '10px 15px',
        background: '#4a9eff',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        fontSize: '14px',
    },
    contactsList: {
        flex: 1,
        overflowY: 'auto',
    },
    contactsHeader: {
        padding: '15px 20px',
        fontSize: '12px',
        fontWeight: '600',
        color: '#808080',
        textTransform: 'uppercase',
    },
    emptyState: {
        padding: '40px 20px',
        textAlign: 'center',
        color: '#808080',
    },
    contactItem: {
        padding: '15px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        cursor: 'pointer',
        borderBottom: '1px solid #3a3a3a',
    },
    contactItemActive: {
        background: '#3a3a3a',
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
    },
    contactName: {
        fontSize: '15px',
        fontWeight: '600',
        color: '#e0e0e0',
    },
    contactStatus: {
        fontSize: '12px',
        color: '#a0a0a0',
    },
    removeBtn: {
        padding: '4px 8px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        fontSize: '16px',
        color: '#808080',
    },
    chatArea: {
        flex: 1,
        background: '#1a1a1a',
        display: 'flex',
        flexDirection: 'column',
    },
    emptyChat: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#808080',
    },
    chatHeader: {
        padding: '20px',
        borderBottom: '1px solid #3a3a3a',
        background: '#2a2a2a',
    },
    chatHeaderName: {
        fontSize: '18px',
        fontWeight: '600',
        color: '#e0e0e0',
    },
    messagesArea: {
        flex: 1,
        overflowY: 'auto',
        padding: '20px',
        background: '#1a1a1a',
    },
    emptyMessages: {
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#808080',
    },
    message: {
        marginBottom: '12px',
        display: 'flex',
        flexDirection: 'column',
        maxWidth: '70%',
    },
    messageMe: {
        alignSelf: 'flex-end',
        alignItems: 'flex-end',
    },
    messageThem: {
        alignSelf: 'flex-start',
        alignItems: 'flex-start',
    },
    messageText: {
        padding: '12px 16px',
        borderRadius: '16px',
        fontSize: '15px',
        lineHeight: '1.4',
        wordWrap: 'break-word',
    },
    inputArea: {
        padding: '20px',
        borderTop: '1px solid #3a3a3a',
        display: 'flex',
        gap: '12px',
        background: '#2a2a2a',
    },
    messageInput: {
        flex: 1,
        padding: '12px 16px',
        border: '1px solid #3a3a3a',
        background: '#1a1a1a',
        color: '#e0e0e0',
        borderRadius: '24px',
        fontSize: '15px',
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
    },
}
