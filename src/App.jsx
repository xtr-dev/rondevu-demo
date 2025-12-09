import React, { useState, useEffect, useRef } from 'react'
import { Rondevu } from '@xtr-dev/rondevu-client'
import toast, { Toaster } from 'react-hot-toast'

const API_URL = 'https://api.ronde.vu'
const CHAT_SERVICE = 'chat:2.0.0'

const RTC_CONFIG = {
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
}

export default function App() {
    // Setup state
    const [rondevu, setRondevu] = useState(null)
    const [myUsername, setMyUsername] = useState(null)
    const [setupStep, setSetupStep] = useState('init') // init, claim, ready
    const [usernameInput, setUsernameInput] = useState('')

    // Chat state
    const [peerUsername, setPeerUsername] = useState('')
    const [peerConnection, setPeerConnection] = useState(null)
    const [dataChannel, setDataChannel] = useState(null)
    const [connectionState, setConnectionState] = useState('disconnected') // disconnected, connecting, connected
    const [messages, setMessages] = useState([])
    const [messageInput, setMessageInput] = useState('')
    const [role, setRole] = useState(null) // 'offerer' or 'answerer'

    // Signaling state
    const [serviceFqn, setServiceFqn] = useState(null)
    const [offerId, setOfferId] = useState(null)
    const [answerPolling, setAnswerPolling] = useState(null)
    const [icePolling, setIcePolling] = useState(null)
    const lastIceTimestamp = useRef(0)

    const messagesEndRef = useRef(null)

    // Initialize Rondevu Service
    useEffect(() => {
        const init = async () => {
            try {
                const savedUsername = localStorage.getItem('rondevu-username')
                const savedKeypair = localStorage.getItem('rondevu-keypair')

                const parsedKeypair = savedKeypair ? JSON.parse(savedKeypair) : undefined

                const service = new Rondevu({
                    apiUrl: API_URL,
                    username: savedUsername || 'temp',
                    keypair: parsedKeypair,
                })

                await service.initialize()
                setRondevu(service)

                if (savedUsername && savedKeypair) {
                    const isClaimed = await service.isUsernameClaimed()
                    if (isClaimed) {
                        setMyUsername(savedUsername)
                        setSetupStep('ready')
                        toast.success(`Welcome back, ${savedUsername}!`)

                        // Publish service
                        await publishService(service, savedUsername)
                    } else {
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

    // Auto-scroll messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (answerPolling) clearInterval(answerPolling)
            if (icePolling) clearInterval(icePolling)
        }
    }, [answerPolling, icePolling])

    // Publish chat service (offerer)
    const publishService = async (service, username) => {
        try {
            // Create peer connection
            const pc = new RTCPeerConnection(RTC_CONFIG)
            const dc = pc.createDataChannel('chat')

            setupDataChannel(dc)
            setupPeerConnection(pc)

            // Create offer
            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)

            // Publish service with FQN format: chat:2.0.0@username
            const fqn = `${CHAT_SERVICE}@${username}`
            const publishedService = await service.publishService({
                serviceFqn: fqn,
                offers: [{ sdp: offer.sdp }],
                ttl: 300000,
            })

            const firstOffer = publishedService.offers[0]
            setServiceFqn(fqn)
            setOfferId(firstOffer.offerId)
            setPeerConnection(pc)
            setDataChannel(dc)
            setRole('offerer')

            // Poll for answer
            startAnswerPolling(service, fqn, firstOffer.offerId, pc)

            // Poll for ICE candidates
            startIcePolling(service, fqn, firstOffer.offerId, pc)

            // Send local ICE candidates
            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log('Sending ICE candidate')
                    service.addOfferIceCandidates(
                        fqn,
                        firstOffer.offerId,
                        [event.candidate.toJSON()]
                    ).catch(err => console.error('Failed to send ICE candidate:', err))
                }
            }

            toast.success('Service published! Waiting for peer...')
        } catch (err) {
            console.error('Failed to publish service:', err)
            toast.error(`Failed to publish service: ${err.message}`)
        }
    }

    // Poll for answer from answerer (offerer side)
    const startAnswerPolling = (service, fqn, offerId, pc) => {
        const interval = setInterval(async () => {
            try {
                const answer = await service.getOfferAnswer(fqn, offerId)
                if (answer && answer.sdp) {
                    console.log('Received answer')
                    clearInterval(interval)
                    setAnswerPolling(null)
                    await pc.setRemoteDescription({ type: 'answer', sdp: answer.sdp })
                    toast.success('Peer connected!')
                }
            } catch (err) {
                // 404 is expected when answer isn't available yet
                if (!err.message?.includes('404')) {
                    console.error('Error polling for answer:', err)
                }
            }
        }, 1000)

        setAnswerPolling(interval)
    }

    // Poll for ICE candidates (both offerer and answerer)
    const startIcePolling = (service, fqn, offerId, pc, targetRole) => {
        const interval = setInterval(async () => {
            try {
                const result = await service.getOfferIceCandidates(
                    fqn,
                    offerId,
                    lastIceTimestamp.current
                )

                for (const item of result.candidates) {
                    if (item.candidate && item.candidate.candidate) {
                        try {
                            const rtcCandidate = new RTCIceCandidate(item.candidate)
                            console.log('Received ICE candidate')
                            await pc.addIceCandidate(rtcCandidate)
                            lastIceTimestamp.current = item.createdAt
                        } catch (err) {
                            console.warn('Failed to process ICE candidate:', err)
                            lastIceTimestamp.current = item.createdAt
                        }
                    } else {
                        lastIceTimestamp.current = item.createdAt
                    }
                }
            } catch (err) {
                // 404/410 means offer expired
                if (err.message?.includes('404') || err.message?.includes('410')) {
                    console.warn('Offer expired, stopping ICE polling')
                    clearInterval(interval)
                    setIcePolling(null)
                } else if (!err.message?.includes('404')) {
                    console.error('Error polling for ICE candidates:', err)
                }
            }
        }, 1000)

        setIcePolling(interval)
    }

    // Claim username
    const handleClaimUsername = async () => {
        if (!rondevu || !usernameInput) return

        try {
            const keypair = rondevu.getKeypair()
            const newService = new Rondevu({
                apiUrl: API_URL,
                username: usernameInput,
                keypair,
            })
            await newService.initialize()
            await newService.claimUsername()

            setRondevu(newService)
            setMyUsername(usernameInput)
            localStorage.setItem('rondevu-username', usernameInput)
            localStorage.setItem('rondevu-keypair', JSON.stringify(keypair))

            setSetupStep('ready')
            toast.success(`Welcome, ${usernameInput}!`)

            // Publish service
            await publishService(newService, usernameInput)
        } catch (err) {
            toast.error(`Error: ${err.message}`)
        }
    }

    // Connect to peer (answerer)
    const handleConnectToPeer = async () => {
        if (!rondevu || !peerUsername) return

        try {
            setConnectionState('connecting')
            toast.loading('Connecting to peer...')

            // Discover peer's service
            const fqn = `${CHAT_SERVICE}@${peerUsername}`
            const serviceData = await rondevu.getService(fqn)

            console.log('Found peer service:', serviceData)
            setServiceFqn(fqn)
            setOfferId(serviceData.offerId)

            // Create peer connection
            const pc = new RTCPeerConnection(RTC_CONFIG)
            setupPeerConnection(pc)

            // Handle incoming data channel
            pc.ondatachannel = (event) => {
                console.log('Received data channel')
                setupDataChannel(event.channel)
                setDataChannel(event.channel)
            }

            // Set remote offer
            await pc.setRemoteDescription({
                type: 'offer',
                sdp: serviceData.sdp,
            })

            // Create answer
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)

            // Send answer
            await rondevu.postOfferAnswer(fqn, serviceData.offerId, answer.sdp)

            // Poll for ICE candidates
            startIcePolling(rondevu, fqn, serviceData.offerId, pc, 'answerer')

            // Send local ICE candidates
            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log('Sending ICE candidate')
                    rondevu.addOfferIceCandidates(
                        fqn,
                        serviceData.offerId,
                        [event.candidate.toJSON()]
                    ).catch(err => console.error('Failed to send ICE candidate:', err))
                }
            }

            setPeerConnection(pc)
            setRole('answerer')

            toast.dismiss()
            toast.success('Answer sent! Waiting for connection...')
        } catch (err) {
            console.error('Failed to connect:', err)
            toast.dismiss()
            toast.error(`Failed to connect: ${err.message}`)
            setConnectionState('disconnected')
        }
    }

    // Setup peer connection event handlers
    const setupPeerConnection = (pc) => {
        pc.onconnectionstatechange = () => {
            console.log('Connection state:', pc.connectionState)
            setConnectionState(pc.connectionState)

            if (pc.connectionState === 'connected') {
                toast.success('Connected!')
            } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                toast.error('Connection failed or disconnected')
            }
        }

        pc.oniceconnectionstatechange = () => {
            console.log('ICE connection state:', pc.iceConnectionState)
        }

        pc.onicegatheringstatechange = () => {
            console.log('ICE gathering state:', pc.iceGatheringState)
        }
    }

    // Setup data channel event handlers
    const setupDataChannel = (dc) => {
        dc.onopen = () => {
            console.log('Data channel opened')
            setConnectionState('connected')
        }

        dc.onclose = () => {
            console.log('Data channel closed')
            setConnectionState('disconnected')
        }

        dc.onmessage = (event) => {
            console.log('Received message:', event.data)
            setMessages(prev => [...prev, { from: 'peer', text: event.data, timestamp: Date.now() }])
        }

        dc.onerror = (err) => {
            console.error('Data channel error:', err)
        }
    }

    // Send message
    const handleSendMessage = () => {
        if (!dataChannel || !messageInput.trim()) return

        if (dataChannel.readyState !== 'open') {
            toast.error('Data channel not open')
            return
        }

        try {
            dataChannel.send(messageInput)
            setMessages(prev => [...prev, { from: 'me', text: messageInput, timestamp: Date.now() }])
            setMessageInput('')
        } catch (err) {
            console.error('Failed to send message:', err)
            toast.error('Failed to send message')
        }
    }

    // Cleanup
    const handleDisconnect = () => {
        if (peerConnection) {
            peerConnection.close()
        }
        if (dataChannel) {
            dataChannel.close()
        }
        if (answerPolling) {
            clearInterval(answerPolling)
            setAnswerPolling(null)
        }
        if (icePolling) {
            clearInterval(icePolling)
            setIcePolling(null)
        }
        setPeerConnection(null)
        setDataChannel(null)
        setConnectionState('disconnected')
        setMessages([])
        setPeerUsername('')
        setRole(null)
        setServiceFqn(null)
        setOfferId(null)
        lastIceTimestamp.current = 0
        toast.success('Disconnected')
    }

    // Render
    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
            <Toaster position="top-right" />

            <div className="max-w-4xl mx-auto">
                <h1 className="text-4xl font-bold text-center mb-8 text-indigo-900">
                    Rondevu Chat Demo
                </h1>

                {setupStep === 'claim' && (
                    <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
                        <h2 className="text-2xl font-semibold mb-4">Claim Username</h2>
                        <div className="flex gap-4">
                            <input
                                type="text"
                                value={usernameInput}
                                onChange={(e) => setUsernameInput(e.target.value)}
                                placeholder="Enter username"
                                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                onKeyPress={(e) => e.key === 'Enter' && handleClaimUsername()}
                            />
                            <button
                                onClick={handleClaimUsername}
                                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                            >
                                Claim
                            </button>
                        </div>
                    </div>
                )}

                {setupStep === 'ready' && (
                    <>
                        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
                            <h2 className="text-2xl font-semibold mb-4">
                                Logged in as: <span className="text-indigo-600">{myUsername}</span>
                            </h2>
                            <p className="text-gray-600 mb-4">
                                Role: <span className="font-semibold">
                                    {role === 'offerer' ? 'Offerer (Hosting)' : role === 'answerer' ? 'Answerer' : 'Waiting'}
                                </span>
                            </p>

                            {connectionState === 'disconnected' && !role && (
                                <div className="flex gap-4">
                                    <input
                                        type="text"
                                        value={peerUsername}
                                        onChange={(e) => setPeerUsername(e.target.value)}
                                        placeholder="Enter peer username to connect"
                                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                        onKeyPress={(e) => e.key === 'Enter' && handleConnectToPeer()}
                                    />
                                    <button
                                        onClick={handleConnectToPeer}
                                        className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                                    >
                                        Connect
                                    </button>
                                </div>
                            )}

                            {connectionState === 'connecting' && (
                                <div className="text-center py-4">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                                    <p className="mt-2 text-gray-600">Connecting...</p>
                                </div>
                            )}

                            {(connectionState === 'connected' || role) && connectionState !== 'connecting' && (
                                <button
                                    onClick={handleDisconnect}
                                    className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                                >
                                    Disconnect
                                </button>
                            )}
                        </div>

                        {connectionState === 'connected' && (
                            <div className="bg-white rounded-lg shadow-lg p-8">
                                <h2 className="text-2xl font-semibold mb-4">Chat</h2>

                                <div className="h-96 overflow-y-auto mb-4 p-4 bg-gray-50 rounded-lg">
                                    {messages.length === 0 && (
                                        <p className="text-gray-400 text-center">No messages yet. Start chatting!</p>
                                    )}
                                    {messages.map((msg, i) => (
                                        <div
                                            key={i}
                                            className={`mb-3 ${msg.from === 'me' ? 'text-right' : 'text-left'}`}
                                        >
                                            <div
                                                className={`inline-block px-4 py-2 rounded-lg max-w-xs ${
                                                    msg.from === 'me'
                                                        ? 'bg-indigo-600 text-white'
                                                        : 'bg-gray-300 text-gray-900'
                                                }`}
                                            >
                                                {msg.text}
                                            </div>
                                            <div className="text-xs text-gray-400 mt-1">
                                                {new Date(msg.timestamp).toLocaleTimeString()}
                                            </div>
                                        </div>
                                    ))}
                                    <div ref={messagesEndRef} />
                                </div>

                                <div className="flex gap-4">
                                    <input
                                        type="text"
                                        value={messageInput}
                                        onChange={(e) => setMessageInput(e.target.value)}
                                        placeholder="Type a message..."
                                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                        onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                                    />
                                    <button
                                        onClick={handleSendMessage}
                                        className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                                    >
                                        Send
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
