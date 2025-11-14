# Rondevu Demo

🎯 **Interactive WebRTC peer discovery and connection demo**

Experience topic-based peer discovery and WebRTC connections using the Rondevu signaling platform.

**Related repositories:**
- [rondevu-server](https://github.com/xtr-dev/rondevu) - HTTP signaling server
- [rondevu-client](https://github.com/xtr-dev/rondevu-client) - TypeScript client library

---

## Overview

This demo showcases the complete Rondevu workflow:

1. **Register** - Get peer credentials (automatically saved)
2. **Create Offers** - Advertise your WebRTC connection on topics
3. **Discover Peers** - Find other peers by topic
4. **Connect** - Establish direct P2P WebRTC connections
5. **Chat** - Send messages over WebRTC data channels

### Key Features

- **Topic-Based Discovery** - Find peers by shared topics (like torrent infohashes)
- **Real P2P Connections** - Actual WebRTC data channels (not simulated)
- **Connection Manager** - Uses high-level `RondevuConnection` API (no manual WebRTC plumbing)
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

### Connection Manager

This demo uses the high-level `RondevuConnection` class which abstracts all WebRTC complexity:

```javascript
// Create connection
const conn = client.createConnection();

// Set up event listeners
conn.on('connected', () => {
  console.log('P2P connection established!');
});

conn.on('datachannel', (channel) => {
  channel.onmessage = (event) => {
    console.log('Message:', event.data);
  };
});

// Create offer
await conn.createOffer({
  topics: ['demo-room'],
  ttl: 300000
});

// Or answer an offer
await conn.answer(offerId, offerSdp);
```

The connection manager handles:
- Offer/answer SDP generation
- ICE candidate gathering and exchange
- Automatic polling for answers and candidates
- Data channel lifecycle
- Connection state management
- Event-driven API

### What Happens Under the Hood

1. **Offerer** calls `conn.createOffer()`:
   - Creates RTCPeerConnection
   - Generates SDP offer
   - Creates data channel
   - Posts offer to Rondevu server
   - Polls for answers every 2 seconds

2. **Answerer** calls `conn.answer()`:
   - Creates RTCPeerConnection
   - Sets remote description (offer SDP)
   - Generates SDP answer
   - Posts answer to server
   - Polls for ICE candidates every 1 second

3. **ICE Exchange**:
   - Both peers generate ICE candidates
   - Candidates are automatically sent to server
   - Peers poll and receive remote candidates
   - ICE establishes the direct P2P path

4. **Connection Established**:
   - Data channel opens
   - Chat messages flow directly between peers
   - No server relay (true P2P!)

### Architecture

- **Frontend**: React + Vite
- **Signaling**: Rondevu server (Cloudflare Workers + D1)
- **Client**: @xtr-dev/rondevu-client (TypeScript library)
- **WebRTC**: RTCPeerConnection with Google STUN servers

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
- The connection manager polls automatically (no manual polling needed)
- Multiple simultaneous connections are supported
- WebRTC uses Google's public STUN servers for NAT traversal
- Data channel messages are unreliable but fast (perfect for chat)

## Technologies

- **React** - UI framework
- **Vite** - Build tool and dev server
- **@xtr-dev/rondevu-client** - Rondevu client library
- **RTCPeerConnection** - WebRTC connections
- **RTCDataChannel** - P2P messaging

## License

MIT
