# Rondevu

🎯 **Simple WebRTC peer signaling and discovery**

Meet peers by topic, by peer ID, or by connection ID.

**Related repositories:**
- [rondevu-server](https://github.com/xtr-dev/rondevu-server) - HTTP signaling server
- [rondevu-client](https://github.com/xtr-dev/rondevu-client) - TypeScript client library

---

## Rondevu Demo

**Interactive demo showcasing three ways to connect WebRTC peers.**

Experience how easy WebRTC peer discovery can be with Rondevu's three connection methods:

🎯 **Connect by Topic** - Auto-discover and join any available peer  
👤 **Connect by Peer ID** - Filter and connect to specific peers  
🔗 **Connect by Connection ID** - Share a code and connect directly  

### Features

- **Three Connection Methods** - Experience topic discovery, peer filtering, and direct connection
- **Real WebRTC** - Actual P2P connections using RTCPeerConnection (not simulated!)
- **P2P Data Channel** - Direct peer-to-peer chat without server relay
- **Peer Discovery** - Browse topics and discover available peers
- **Real-time Chat** - Send and receive messages over WebRTC data channel
- **Activity Log** - Monitor all API and WebRTC events

### Quick Start

#### Installation

```bash
npm install
```

#### Development

```bash
npm run dev
```

This will start the Vite dev server at `http://localhost:5173`

#### Build for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

#### Preview Production Build

```bash
npm run preview
```

### Three Ways to Connect

This demo demonstrates all three Rondevu connection methods:

#### 1️⃣ Join Topic (Auto-Discovery)

**Easiest method** - Just enter a topic and auto-connect to first available peer:

1. Enter a topic name in the "Join Topic" section (e.g., "demo-room")
2. Click "Join Topic"
3. Rondevu finds the first available peer and connects automatically
4. Start chatting!

**Best for:** Quick matching, joining any available game/chat

---

#### 2️⃣ Discover Peers (Filter by Peer ID)

**Connect to specific peers** - Browse and select which peer to connect to:

1. Enter a topic name (e.g., "demo-room")
2. Click "Discover in [topic]" to list all available peers
3. See each peer's ID in the list
4. Click "Connect" on the specific peer you want to talk to
5. Start chatting!

**Best for:** Connecting to friends, teammates, or specific users

---

#### 3️⃣ Create/Connect by ID (Direct Connection)

**Share a connection code** - Like sharing a meeting link:

**To create:**
1. Enter a topic name (e.g., "meetings")
2. Enter a custom Connection ID (e.g., "my-meeting-123") or leave blank for auto-generation
3. Click "Create Connection"
4. **Share the Connection ID** with the person you want to connect with

**To join:**
1. Get the Connection ID from your friend (e.g., "my-meeting-123")
2. Enter it in the "Connect by ID" section
3. Click "Connect to ID"
4. Start chatting!

**Best for:** Meeting rooms, QR code connections, invitation-based sessions

#### Testing Locally

The easiest way to test:
1. Open the demo in **two different browser windows** (or tabs)
2. In window 1: Create an offer with topic "test-room"
3. In window 2: Discover peers in "test-room" and click Connect
4. Watch the connection establish and start chatting!

#### Browse Topics

- Click "Refresh Topics" to see all active topics
- Click on any topic to auto-fill the discovery form

### Server Configuration

This demo connects to: `https://api.ronde.vu`

To use a different server, modify the `baseUrl` in `src/main.js`:

```javascript
const rdv = new Rondevu({
  baseUrl: 'https://your-server.com'
});

// Access the API for low-level operations
rdv.api.listTopics();
```

### Technologies

- **Vite** - Fast development and build tool
- **@xtr-dev/rondevu-client** - TypeScript client for Rondevu API
- **Vanilla JavaScript** - No framework dependencies

### API Examples

The demo showcases all major Rondevu API endpoints:

- `GET /` - List all topics
- `GET /:topic/sessions` - Discover peers in a topic
- `POST /:topic/offer` - Create a new offer
- `POST /answer` - Send answer to a peer
- `POST /poll` - Poll for peer data
- `GET /health` - Check server health

### WebRTC Implementation Details

This demo implements a **complete WebRTC peer-to-peer connection** with:

#### Connection Flow

1. **Offerer** creates an `RTCPeerConnection` and generates an SDP offer
2. Offer is sent to the Rondevu signaling server via `POST /:topic/offer`
3. **Answerer** discovers the offer via `GET /:topic/sessions`
4. Answerer creates an `RTCPeerConnection`, sets the remote offer, and generates an SDP answer
5. Answer is sent via `POST /answer`
6. Both peers generate ICE candidates and send them via `POST /answer` with `candidate` field
7. Both peers poll via `POST /poll` to receive remote ICE candidates
8. Once candidates are exchanged, the **direct P2P connection** is established
9. Data channel opens and chat messages flow **directly between peers**

#### Key Features

- **Real RTCPeerConnection** - Not simulated, actual WebRTC
- **STUN servers** - Google's public STUN servers for NAT traversal
- **Data Channel** - Named "chat" channel for text messaging
- **ICE Trickle** - Candidates are sent as they're generated
- **Automatic Polling** - Polls every 1 second for remote data
- **Connection States** - Visual indicators for connecting/connected/failed states
- **Graceful Cleanup** - Properly closes connections and stops polling

#### Technologies

- **RTCPeerConnection API** - Core WebRTC connection
- **RTCDataChannel API** - Unreliable but fast text messaging
- **Rondevu Signaling** - SDP and ICE candidate exchange
- **STUN Protocol** - NAT traversal (stun.l.google.com)

### Development Notes

- Peer IDs are auto-generated on page load
- WebRTC connections use **real** RTCPeerConnection (not simulated!)
- Sessions expire after the server's configured timeout (5 minutes default)
- The demo is completely client-side (no backend required)
- Messages are sent P2P - the server only facilitates discovery
- Works across different browsers and networks (with STUN support)

### Deployment

#### Deploy to Cloudflare Pages

The demo can be easily deployed to Cloudflare Pages (free tier):

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

### License

MIT

