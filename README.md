# Rondevu Demo

🎯 **Interactive WebRTC peer discovery and connection demo**

Experience topic-based peer discovery and WebRTC connections using the Rondevu signaling platform.

**Related repositories:**
- [@xtr-dev/rondevu-client](https://github.com/xtr-dev/rondevu-client) - TypeScript client library ([npm](https://www.npmjs.com/package/@xtr-dev/rondevu-client))
- [@xtr-dev/rondevu-server](https://github.com/xtr-dev/rondevu-server) - HTTP signaling server ([npm](https://www.npmjs.com/package/@xtr-dev/rondevu-server))
- [@xtr-dev/rondevu-demo](https://github.com/xtr-dev/rondevu-demo) - Interactive demo ([live](https://ronde.vu))

---

## Overview

This demo showcases the complete Rondevu workflow:

1. **Register** - Get peer credentials (automatically saved)
2. **Create Offers** - Advertise your WebRTC connection on topics
3. **Discover Peers** - Find other peers by topic
4. **Connect** - Establish direct P2P WebRTC connections via `RondevuPeer`
5. **Chat** - Send messages over WebRTC data channels

### Key Features

- **Topic-Based Discovery** - Find peers by shared topics (like torrent infohashes)
- **Real P2P Connections** - Actual WebRTC data channels (not simulated)
- **State-Based Peer Management** - Uses `RondevuPeer` with clean state machine (idle → creating-offer → waiting-for-answer → exchanging-ice → connected)
- **Trickle ICE** - Fast connection establishment by sending ICE candidates as they're discovered
- **Persistent Credentials** - Saves authentication to localStorage
- **Topics Browser** - Browse all active topics and peer counts
- **Multiple Connections** - Support multiple simultaneous peer connections
- **Real-time Chat** - Direct peer-to-peer messaging

## Quick Start

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

This starts the Vite dev server at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

## How to Use

### Step 1: Register (One-time)

The demo automatically registers you when you first visit. Your credentials are saved in localStorage for future visits.

### Step 2: Create an Offer

1. Go to the "Create Offer" tab
2. Enter one or more topics (comma-separated), e.g., `demo-room, testing`
3. Click "Create Offer"
4. Your offer is now advertised on those topics

**Share the topic name with peers you want to connect with!**

### Step 3: Discover and Connect (Other Peer)

1. Go to the "Discover Offers" tab
2. Enter the same topic (e.g., `demo-room`)
3. Click "Discover Offers"
4. See available peers and their offers
5. Click "Answer Offer" to connect

### Step 4: Chat

1. Once connected, go to the "Chat" tab
2. Select a connection from the dropdown
3. Type messages and hit Enter or click Send
4. Messages are sent **directly peer-to-peer** via WebRTC

### Browse Topics

Click the "Topics" tab to:
- See all active topics
- View peer counts for each topic
- Quick-discover by clicking a topic

## Testing Locally

The easiest way to test:

1. Open the demo in **two browser windows** (or tabs)
2. **Window 1**: Create an offer with topic `test-room`
3. **Window 2**: Discover offers in `test-room` and answer
4. Switch to Chat tab in both windows
5. Start chatting peer-to-peer!

## Technical Implementation

### RondevuPeer State Machine

This demo uses the `RondevuPeer` class which implements a clean state-based connection lifecycle:

```javascript
import { Rondevu } from '@xtr-dev/rondevu-client';

// Create peer
const peer = client.createPeer();

// Set up event listeners
peer.on('state', (state) => {
  console.log('Peer state:', state);
  // Offerer: idle → creating-offer → waiting-for-answer → exchanging-ice → connected
  // Answerer: idle → answering → exchanging-ice → connected
});

peer.on('connected', () => {
  console.log('✅ P2P connection established!');
});

peer.on('datachannel', (channel) => {
  channel.addEventListener('message', (event) => {
    console.log('📥 Message:', event.data);
  });

  channel.addEventListener('open', () => {
    // Channel is ready, can send messages
    channel.send('Hello!');
  });
});

peer.on('failed', (error) => {
  console.error('❌ Connection failed:', error);
});

// Create offer (offerer)
await peer.createOffer({
  topics: ['demo-room'],
  ttl: 300000
});

// Or answer an offer (answerer)
await peer.answer(offerId, offerSdp, {
  topics: ['demo-room']
});
```

### Connection States

**Offerer Flow:**
1. **idle** - Initial state
2. **creating-offer** - Creating WebRTC offer and sending to server
3. **waiting-for-answer** - Polling for answer from peer (every 2 seconds)
4. **exchanging-ice** - Exchanging ICE candidates (polling every 1 second)
5. **connected** - Successfully connected!
6. **failed/closed** - Connection failed or was closed

**Answerer Flow:**
1. **idle** - Initial state
2. **answering** - Creating WebRTC answer and sending to server
3. **exchanging-ice** - Exchanging ICE candidates (polling every 1 second)
4. **connected** - Successfully connected!
5. **failed/closed** - Connection failed or was closed

### What Happens Under the Hood

1. **Offerer** calls `peer.createOffer()`:
   - State → `creating-offer`
   - Creates RTCPeerConnection and data channel
   - Generates SDP offer
   - Sets up ICE candidate handler (before gathering starts)
   - Sets local description → ICE gathering begins
   - Posts offer to Rondevu server
   - State → `waiting-for-answer`
   - Polls for answers every 2 seconds
   - When answer received → State → `exchanging-ice`

2. **Answerer** calls `peer.answer()`:
   - State → `answering`
   - Creates RTCPeerConnection
   - Sets remote description (offer SDP)
   - Generates SDP answer
   - Sends answer to server (registers as answerer)
   - Sets up ICE candidate handler (before gathering starts)
   - Sets local description → ICE gathering begins
   - State → `exchanging-ice`

3. **ICE Exchange** (Trickle ICE):
   - Both peers generate ICE candidates as they're discovered
   - Candidates are automatically sent to server immediately
   - Peers poll and receive remote candidates (every 1 second)
   - ICE establishes the direct P2P path
   - State → `connected`

4. **Connection Established**:
   - Data channel opens
   - Chat messages flow directly between peers
   - No server relay (true P2P!)

### Key Features of Implementation

- **Trickle ICE**: Candidates sent immediately as discovered (no waiting)
- **Proper Authorization**: Answer sent to server before ICE gathering to authorize candidate posting
- **Event Cleanup**: All event listeners properly removed with `removeEventListener`
- **State Management**: Clean state machine with well-defined transitions
- **Error Handling**: Graceful failure states with error events

### Architecture

- **Frontend**: React + Vite
- **Signaling**: Rondevu server (Cloudflare Workers + D1)
- **Client**: @xtr-dev/rondevu-client (TypeScript library)
- **WebRTC**: RTCPeerConnection with STUN/TURN servers
- **Connection Management**: RondevuPeer class with state machine

## Server Configuration

This demo connects to: `https://api.ronde.vu`

To use a different server, modify `API_URL` in `src/App.jsx`:

```javascript
const API_URL = 'https://your-server.com';
```

## Deployment

### Deploy to Cloudflare Pages

**Quick Deploy via Wrangler:**

```bash
npm run build
npx wrangler pages deploy dist --project-name=rondevu-demo
```

**Or via Git Integration:**

1. Push to GitHub/GitLab
2. Connect to Cloudflare Pages
3. Set build command: `npm run build`
4. Set output directory: `dist`
5. Deploy automatically on every push!

## Development Notes

- Credentials are stored in localStorage and persist across sessions
- Offers expire after 5 minutes by default
- The peer automatically polls for answers and ICE candidates
- Multiple simultaneous connections are supported
- WebRTC uses Google's public STUN servers + custom TURN server for NAT traversal
- Data channel messages are unreliable but fast (perfect for chat)
- Connection cleanup is automatic when peers disconnect

## Connection Timeouts

The demo uses these default timeouts:

- **ICE Gathering**: 10 seconds (not used with trickle ICE)
- **Waiting for Answer**: 30 seconds
- **Creating Answer**: 10 seconds
- **ICE Connection**: 30 seconds

These can be customized in the `PeerOptions`:

```javascript
await peer.createOffer({
  topics: ['my-topic'],
  timeouts: {
    waitingForAnswer: 60000,  // 1 minute
    iceConnection: 45000      // 45 seconds
  }
});
```

## Technologies

- **React** - UI framework
- **Vite** - Build tool and dev server
- **@xtr-dev/rondevu-client** - Rondevu client library with `RondevuPeer`
- **RTCPeerConnection** - WebRTC connections
- **RTCDataChannel** - P2P messaging
- **QRCode** - QR code generation for easy topic sharing

## License

MIT
