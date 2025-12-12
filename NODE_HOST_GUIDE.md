# Hosting WebRTC Services with Node.js

This guide shows you how to create a WebRTC service host in Node.js that web clients can discover and connect to using Rondevu.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Node.js Host (Offerer)](#nodejs-host-offerer)
- [Browser Client (Answerer)](#browser-client-answerer)
- [Message Protocol](#message-protocol)
- [WebRTC Patterns](#webrtc-patterns)
- [TURN Server Configuration](#turn-server-configuration)
- [Troubleshooting](#troubleshooting)

## Overview

In this pattern:
- **Node.js host** runs a service (e.g., chat bot, data processor) and publishes offers on Rondevu
- **Browser clients** discover the service and connect via WebRTC
- **Direct P2P communication** happens over WebRTC data channels (no server relay after connection)

```
┌─────────────────┐         ┌──────────────┐         ┌─────────────────┐
│  Node.js Host   │────1───▶│   Rondevu    │◀───2────│  Browser Client │
│   (Offerer)     │         │    Server    │         │   (Answerer)    │
│                 │         │              │         │                 │
│ Publishes offer │         │  Signaling   │         │ Gets offer      │
│ Creates channel │         │              │         │ Receives channel│
└────────┬────────┘         └──────────────┘         └────────┬────────┘
         │                                                     │
         │              3. WebRTC P2P Connection               │
         └─────────────────────────────────────────────────────┘
                        (Data channel messages)
```

## Prerequisites

### Node.js Requirements

- Node.js 19+ (recommended), OR
- Node.js 18 with `--experimental-global-webcrypto` flag

### Install Dependencies

```bash
npm install @xtr-dev/rondevu-client wrtc
```

**Important:** `wrtc` requires native compilation and build tools:

**Ubuntu/Debian:**
```bash
sudo apt-get install python3 make g++
npm install wrtc
```

**macOS:**
```bash
# Xcode Command Line Tools required
xcode-select --install
npm install wrtc
```

**Windows:**
```bash
# Visual Studio Build Tools required
npm install --global windows-build-tools
npm install wrtc
```

Installation may take several minutes as wrtc compiles native WebRTC libraries.

## Node.js Host (Offerer)

Here's a complete example of a Node.js service host that creates a chat bot:

```javascript
#!/usr/bin/env node
import { Rondevu, NodeCryptoAdapter } from '@xtr-dev/rondevu-client'
import wrtcModule from 'wrtc'

const { RTCPeerConnection } = wrtcModule

// Configuration
const API_URL = 'https://api.ronde.vu'
const USERNAME = 'chatbot'  // Your service username
const SERVICE = 'chat:2.0.0'  // Service name (username will be auto-appended)

// TURN server configuration for NAT traversal
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: [
        'turn:57.129.61.67:3478?transport=tcp',
        'turn:57.129.61.67:3478?transport=udp',
      ],
      username: 'webrtcuser',
      credential: 'supersecretpassword'
    }
  ]
}

async function main() {
  console.log('🤖 Starting Chat Bot Service')
  console.log('='.repeat(50))

  // 1. Initialize Rondevu with Node crypto adapter
  console.log('1. Initializing Rondevu client...')
  const rondevu = new Rondevu({
    apiUrl: API_URL,
    username: USERNAME,
    cryptoAdapter: new NodeCryptoAdapter()
  })

  await rondevu.initialize()
  console.log(`   ✓ Initialized as: ${rondevu.getUsername()}`)
  console.log(`   ✓ Public key: ${rondevu.getPublicKey()?.substring(0, 20)}...`)

  // 2. Username will be auto-claimed on first authenticated request (publishService)
  console.log('2. Username will be auto-claimed on first publish...')

  // Keep track of active connections
  const connections = new Map()

  // 3. Create connection handler for new peers
  async function createOffer() {
    console.log('\n3. Creating new WebRTC offer...')
    const pc = new RTCPeerConnection(RTC_CONFIG)

    // IMPORTANT: Offerer creates the data channel
    const dc = pc.createDataChannel('chat', {
      ordered: true,
      maxRetransmits: 3
    })

    // Set up data channel handlers
    dc.onopen = () => {
      console.log('   ✓ Data channel opened with new peer!')

      // Send welcome message
      dc.send(JSON.stringify({
        type: 'identify',
        from: USERNAME,
        publicKey: rondevu.getPublicKey()
      }))
    }

    dc.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        console.log(`📥 Message from peer:`, msg)

        if (msg.type === 'identify') {
          // Peer identified themselves
          console.log(`   Peer: @${msg.from}`)

          // Send acknowledgment
          dc.send(JSON.stringify({
            type: 'identify_ack',
            from: USERNAME,
            publicKey: rondevu.getPublicKey()
          }))
        } else if (msg.type === 'message') {
          // Received chat message - echo it back
          console.log(`   💬 @${msg.from || 'peer'}: ${msg.text}`)

          dc.send(JSON.stringify({
            type: 'message',
            from: USERNAME,
            text: `Echo: ${msg.text}`
          }))
        }
      } catch (err) {
        console.error('Failed to parse message:', err)
      }
    }

    dc.onclose = () => {
      console.log('   ❌ Data channel closed')
    }

    dc.onerror = (error) => {
      console.error('   ❌ Data channel error:', error)
    }

    // 4. Create offer
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    console.log('   ✓ Local description set')

    // 5. Publish service with offer
    console.log('4. Publishing service to Rondevu...')
    const result = await rondevu.publishService({
      service: SERVICE,
      offers: [{ sdp: offer.sdp }],
      ttl: 300000  // 5 minutes
    })

    const offerId = result.offers[0].offerId
    const serviceFqn = result.serviceFqn  // Full FQN with username
    console.log(`   ✓ Service published with offer ID: ${offerId}`)

    // Store connection info
    connections.set(offerId, { pc, dc, answered: false })

    // 6. Set up ICE candidate handler BEFORE candidates are gathered
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        console.log('   📤 Sending ICE candidate')
        try {
          // wrtc doesn't have toJSON, manually serialize
          const candidateInit = {
            candidate: event.candidate.candidate,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
            sdpMid: event.candidate.sdpMid,
            usernameFragment: event.candidate.usernameFragment
          }
          await rondevu.getAPIPublic().addOfferIceCandidates(
            serviceFqn,
            offerId,
            [candidateInit]
          )
        } catch (err) {
          console.error('Failed to send ICE candidate:', err)
        }
      }
    }

    // 7. Monitor connection state
    pc.onconnectionstatechange = () => {
      console.log(`   Connection state: ${pc.connectionState}`)
      if (pc.connectionState === 'connected') {
        console.log(`   ✅ Connected to peer via offer ${offerId}`)
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        console.log(`   ❌ Connection ${pc.connectionState} for offer ${offerId}`)
        connections.delete(offerId)
      }
    }

    pc.oniceconnectionstatechange = () => {
      console.log(`   ICE state: ${pc.iceConnectionState}`)
    }

    return offerId
  }

  // 8. Poll for answers and ICE candidates
  console.log('5. Starting to poll for answers...')
  let lastPollTimestamp = 0

  const pollInterval = setInterval(async () => {
    try {
      const result = await rondevu.pollOffers(lastPollTimestamp)

      // Process answers
      for (const answer of result.answers) {
        const conn = connections.get(answer.offerId)
        if (conn && !conn.answered) {
          console.log(`\n📥 Received answer for offer ${answer.offerId}`)
          await conn.pc.setRemoteDescription({ type: 'answer', sdp: answer.sdp })
          conn.answered = true
          lastPollTimestamp = answer.answeredAt

          // Create new offer for next peer
          await createOffer()
        }
      }

      // Process ICE candidates
      for (const [offerId, candidates] of Object.entries(result.iceCandidates)) {
        const conn = connections.get(offerId)
        if (conn) {
          const answererCandidates = candidates.filter(c => c.role === 'answerer')

          for (const item of answererCandidates) {
            if (item.candidate) {
              console.log(`   📥 Received ICE candidate for offer ${offerId}`)
              await conn.pc.addIceCandidate(item.candidate)
              lastPollTimestamp = Math.max(lastPollTimestamp, item.createdAt)
            }
          }
        }
      }
    } catch (err) {
      console.error('Polling error:', err.message)
    }
  }, 1000)

  // 9. Create initial offer
  await createOffer()

  console.log('\n✅ Service is live! Waiting for connections...')
  console.log(`   Service: ${SERVICE}`)
  console.log(`   Username: ${USERNAME}`)
  console.log(`   Clients can connect by discovering: ${SERVICE}@${USERNAME}`)

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down...')
    clearInterval(pollInterval)

    for (const [offerId, conn] of connections.entries()) {
      console.log(`   Closing connection ${offerId}`)
      conn.dc?.close()
      conn.pc?.close()
    }

    process.exit(0)
  })
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
```

### Running the Host

```bash
# Make executable
chmod +x host-service.js

# Run
node host-service.js

# Or with Node 18:
node --experimental-global-webcrypto host-service.js
```

## Browser Client (Answerer)

Here's how to connect from a browser (or see the [demo app](https://ronde.vu) for a full UI):

```javascript
import { Rondevu } from '@xtr-dev/rondevu-client'

// Configuration
const API_URL = 'https://api.ronde.vu'
const SERVICE_FQN = 'chat:2.0.0@chatbot'  // Full service name with username

// TURN server configuration
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: [
        'turn:57.129.61.67:3478?transport=tcp',
        'turn:57.129.61.67:3478?transport=udp',
      ],
      username: 'webrtcuser',
      credential: 'supersecretpassword'
    }
  ]
}

async function connectToService() {
  console.log('🌐 Connecting to chat bot...')

  // 1. Initialize Rondevu (anonymous user)
  const rondevu = new Rondevu({
    apiUrl: API_URL,
    // No username = auto-generated anonymous username
  })

  await rondevu.initialize()
  console.log(`✓ Initialized as: ${rondevu.getUsername()}`)

  // 2. Discover service
  console.log(`Looking for service: ${SERVICE_FQN}`)
  const serviceData = await rondevu.getService(SERVICE_FQN)
  console.log(`✓ Found service from @${serviceData.username}`)

  // 3. Create peer connection
  const pc = new RTCPeerConnection(RTC_CONFIG)

  // 4. IMPORTANT: Answerer receives data channel via ondatachannel
  // DO NOT create a channel with pc.createDataChannel()
  let dc = null

  pc.ondatachannel = (event) => {
    console.log('✓ Data channel received from host!')
    dc = event.channel

    dc.onopen = () => {
      console.log('✓ Data channel opened!')

      // Send identify message
      dc.send(JSON.stringify({
        type: 'identify',
        from: rondevu.getUsername(),
        publicKey: rondevu.getPublicKey()
      }))
    }

    dc.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        console.log('📥 Message:', msg)

        if (msg.type === 'identify') {
          console.log(`Connected to @${msg.from}`)
        } else if (msg.type === 'identify_ack') {
          console.log('✅ Connection acknowledged!')

          // Send a test message
          dc.send(JSON.stringify({
            type: 'message',
            text: 'Hello from browser!'
          }))
        } else if (msg.type === 'message') {
          console.log(`💬 @${msg.from}: ${msg.text}`)
        }
      } catch (err) {
        console.error('Parse error:', err)
      }
    }

    dc.onclose = () => {
      console.log('❌ Data channel closed')
    }

    dc.onerror = (error) => {
      console.error('❌ Data channel error:', error)
    }
  }

  // 5. Set up ICE candidate handler BEFORE setting remote description
  pc.onicecandidate = async (event) => {
    if (event.candidate) {
      console.log('📤 Sending ICE candidate')
      try {
        await rondevu.getAPIPublic().addOfferIceCandidates(
          serviceData.serviceFqn,
          serviceData.offerId,
          [event.candidate.toJSON()]
        )
      } catch (err) {
        console.error('Failed to send ICE candidate:', err)
      }
    }
  }

  // 6. Set remote offer
  console.log('Setting remote offer...')
  await pc.setRemoteDescription({ type: 'offer', sdp: serviceData.sdp })

  // 7. Create and set local answer
  console.log('Creating answer...')
  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer)

  // 8. Send answer to server
  console.log('Sending answer...')
  await rondevu.postOfferAnswer(
    serviceData.serviceFqn,
    serviceData.offerId,
    answer.sdp
  )

  // 9. Poll for remote ICE candidates
  console.log('Polling for ICE candidates...')
  let lastIceTimestamp = 0

  const pollInterval = setInterval(async () => {
    try {
      const result = await rondevu.getOfferIceCandidates(
        serviceData.serviceFqn,
        serviceData.offerId,
        lastIceTimestamp
      )

      for (const item of result.candidates) {
        if (item.candidate) {
          console.log('📥 Received ICE candidate')
          await pc.addIceCandidate(new RTCIceCandidate(item.candidate))
          lastIceTimestamp = item.createdAt
        }
      }
    } catch (err) {
      console.error('ICE polling error:', err)
    }
  }, 1000)

  // 10. Monitor connection state
  pc.onconnectionstatechange = () => {
    console.log(`Connection state: ${pc.connectionState}`)

    if (pc.connectionState === 'connected') {
      console.log('✅ Successfully connected!')
      clearInterval(pollInterval)
    } else if (pc.connectionState === 'failed') {
      console.error('❌ Connection failed')
      clearInterval(pollInterval)
    } else if (pc.connectionState === 'closed') {
      console.log('Connection closed')
      clearInterval(pollInterval)
    }
  }

  pc.oniceconnectionstatechange = () => {
    console.log(`ICE state: ${pc.iceConnectionState}`)
  }

  console.log('⏳ Waiting for connection...')
}

// Run it
connectToService().catch(err => {
  console.error('Error:', err)
})
```

## Message Protocol

The examples above use a simple JSON-based protocol:

### Message Types

#### 1. Identify
Sent when a peer first connects to introduce themselves.

```javascript
{
  type: 'identify',
  from: 'username',
  publicKey: 'base64-encoded-public-key'  // For verification
}
```

#### 2. Identify Acknowledgment
Response to identify message.

```javascript
{
  type: 'identify_ack',
  from: 'username',
  publicKey: 'base64-encoded-public-key'
}
```

#### 3. Chat Message
Actual message content.

```javascript
{
  type: 'message',
  from: 'username',      // Optional
  text: 'message text'
}
```

### Custom Protocols

You can implement any protocol you want over the data channel:

```javascript
// Binary protocol
dc.binaryType = 'arraybuffer'
dc.send(new Uint8Array([1, 2, 3, 4]))

// Custom JSON protocol
dc.send(JSON.stringify({
  type: 'file-transfer',
  filename: 'document.pdf',
  size: 1024000,
  chunks: 100
}))
```

## WebRTC Patterns

### Critical Pattern: Data Channel Creation

**IMPORTANT:** In WebRTC, only the **offerer** creates data channels. The **answerer** receives them.

```javascript
// ✅ CORRECT - Offerer (Node.js host)
const pc = new RTCPeerConnection()
const dc = pc.createDataChannel('chat')  // Offerer creates
const offer = await pc.createOffer()
// ...

// ✅ CORRECT - Answerer (Browser client)
const pc = new RTCPeerConnection()
pc.ondatachannel = (event) => {  // Answerer receives via event
  const dc = event.channel
  // ...
}
await pc.setRemoteDescription(offer)
// ...

// ❌ WRONG - Answerer creating channel
const pc = new RTCPeerConnection()
const dc = pc.createDataChannel('chat')  // DON'T DO THIS!
// This creates a SEPARATE channel that won't communicate
```

Creating channels on both sides results in two separate, non-communicating channels. Always follow the offerer/answerer pattern.

### ICE Candidate Timing

Set up ICE handlers **before** setting local description to catch all candidates:

```javascript
// ✅ CORRECT ORDER
pc.onicecandidate = (event) => {
  // Send candidate to server
}

await pc.setLocalDescription(offer)  // This triggers ICE gathering

// ❌ WRONG ORDER
await pc.setLocalDescription(offer)  // Starts gathering immediately

pc.onicecandidate = (event) => {
  // Might miss early candidates!
}
```

### Answer Before ICE (Answerer)

Answerers should send their answer **before** ICE gathering to authorize candidate posting:

```javascript
// ✅ CORRECT - Answer first, then gather ICE
await pc.setRemoteDescription(offer)
const answer = await pc.createAnswer()

// Send answer to authorize ICE posting
await rondevu.postOfferAnswer(serviceFqn, offerId, answer.sdp)

// Now set local description (starts ICE gathering)
await pc.setLocalDescription(answer)

// ICE candidates can now be posted (authorized)
```

## TURN Server Configuration

For production deployments, you'll need TURN servers for NAT traversal:

```javascript
const RTC_CONFIG = {
  iceServers: [
    // STUN for public IP discovery
    { urls: 'stun:stun.l.google.com:19302' },

    // TURN relay for NAT traversal
    {
      urls: [
        'turn:your-turn-server.com:3478?transport=tcp',
        'turn:your-turn-server.com:3478?transport=udp',
      ],
      username: 'your-username',
      credential: 'your-password'
    }
  ]
}
```

### Testing TURN Connectivity

Use `turnutils_uclient` to verify TURN server:

```bash
# Install coturn utilities
sudo apt-get install coturn-utils

# Test TURN server
turnutils_uclient -u username -w password your-turn-server.com 3478 -y
```

### Force TURN (Testing)

To test if TURN is working, force relay mode:

```javascript
const RTC_CONFIG = {
  iceServers: [/* ... */],
  iceTransportPolicy: 'relay'  // Forces TURN, bypasses direct connections
}
```

**Remove** `iceTransportPolicy: 'relay'` for production to allow direct connections when possible.

## Troubleshooting

### Connection Stuck in "connecting"

**Possible causes:**
1. TURN server not working
2. Both peers behind same NAT (hairpinning issue)
3. Firewall blocking UDP ports

**Solutions:**
```javascript
// Enable relay-only mode to test TURN
const RTC_CONFIG = {
  iceServers: [/* ... */],
  iceTransportPolicy: 'relay'
}

// Check TURN server
turnutils_uclient -u user -w pass server.com 3478 -y

// Verify both peers are on different networks
```

### No Candidates Gathered

**Possible causes:**
1. ICE handler set up too late
2. STUN/TURN servers unreachable
3. Firewall blocking

**Solutions:**
```javascript
// Set handler BEFORE setLocalDescription
pc.onicecandidate = (event) => { /* ... */ }
await pc.setLocalDescription(offer)

// Test STUN connectivity
ping stun.l.google.com
```

### Messages Not Received

**Possible causes:**
1. Data channel created on both sides
2. Channel not opened yet
3. Wrong channel name

**Solutions:**
```javascript
// Only offerer creates channel
// Offerer:
const dc = pc.createDataChannel('chat')

// Answerer:
pc.ondatachannel = (event) => {
  const dc = event.channel  // Receive it
}

// Wait for channel to open
dc.onopen = () => {
  dc.send('message')  // Now safe to send
}
```

### wrtc Installation Fails

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y python3 make g++ pkg-config libssl-dev
npm install wrtc
```

**macOS:**
```bash
xcode-select --install
npm install wrtc
```

**Windows:**
```bash
npm install --global windows-build-tools
npm install wrtc
```

## Complete Working Example

See `/demo/test-connect.js` for a complete working example that connects to the chat demo at `chat:2.0.0@bas`.

To run:
```bash
cd demo
npm install wrtc
npm test
```

## Additional Resources

- [Rondevu Client API](../client/README.md)
- [WebRTC MDN Documentation](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [wrtc GitHub](https://github.com/node-webrtc/node-webrtc)
- [TURN Server Setup (coturn)](https://github.com/coturn/coturn)

## License

MIT
