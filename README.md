# Rondevu Drop

**P2P File Sharing - Share files directly, no server upload**

A React application for peer-to-peer file sharing using WebRTC data channels and Rondevu signaling.

**Related repositories:**
- [@xtr-dev/rondevu-client](https://github.com/xtr-dev/rondevu-client) - TypeScript client library ([npm](https://www.npmjs.com/package/@xtr-dev/rondevu-client))
- [@xtr-dev/rondevu-server](https://github.com/xtr-dev/rondevu-server) - HTTP signaling server ([npm](https://www.npmjs.com/package/@xtr-dev/rondevu-server), [live](https://api.ronde.vu))
- [@xtr-dev/rondevu-demo](https://github.com/xtr-dev/rondevu-demo) - Interactive demo ([live](https://ronde.vu))

---

## Features

- **Session Codes** - Generate a 6-character code to share with anyone
- **QR Code Sharing** - Scan or share QR code to join session
- **Direct P2P Transfer** - Files transfer directly between browsers
- **Chunked Transfer** - Handles large files with progress tracking
- **No File Size Limit** - Transfer any file size (limited by browser memory)
- **Persistent Identity** - Username saved in localStorage

## Quick Start

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Opens at `http://localhost:5173`

### Production Build

```bash
npm run build
npm run preview
```

## How to Use

### 1. Create Identity

On first visit, optionally enter a username (or leave blank for auto-generated). Click "Create Identity".

### 2. Start or Join Session

**To share files:**
1. Click "Start New Session"
2. Share the 6-character code or QR code with your peer

**To receive files:**
1. Enter the code shared by your peer
2. Click "Join"

### 3. Transfer Files

Once connected:
- Drag and drop files onto the drop zone
- Or click to browse and select files
- Files transfer directly to your peer
- Click "Download" to save received files

## Technical Details

### Session Flow

**Host (creates session):**
```javascript
const rondevu = await Rondevu.connect({ iceServers: 'rondevu' })

// Generate session code and create tag
const code = 'X7K9M2'
const tag = `drop.ronde.vu-${code.toLowerCase()}`

await rondevu.offer({ tags: [tag], maxOffers: 1 })
await rondevu.startFilling()

rondevu.on('connection:opened', (offerId, connection) => {
  // Peer connected - ready to transfer files
})
```

**Guest (joins session):**
```javascript
const rondevu = await Rondevu.connect({ iceServers: 'rondevu' })

const peer = await rondevu.peer({ tags: ['drop.ronde.vu-x7k9m2'] })

peer.on('open', () => {
  // Connected - ready to transfer files
})
```

### File Transfer Protocol

Files are transferred using a simple chunked protocol over WebRTC data channels:

1. **file-start** (JSON) - Announces file with id, name, size, mimeType
2. **Binary chunks** - 16KB chunks with fileId + chunkIndex header
3. Progress tracked by counting received chunks

### Architecture

- **Frontend**: React + Vite
- **Signaling**: Rondevu server on Cloudflare Workers + D1
- **Client**: @xtr-dev/rondevu-client
- **WebRTC**: RTCPeerConnection with STUN/TURN servers
- **Data Channel**: Binary transfer with ArrayBuffer

## Deployment

### Cloudflare Pages

```bash
npm run build
npx wrangler pages deploy dist --project-name=rondevu-demo
```

Or connect to GitHub for automatic deployments.

## Development Notes

- Session codes are 6 characters (A-Z, 2-9, no ambiguous chars)
- Session tag format: `drop.ronde.vu-{code}`
- Chunk size: 16KB (WebRTC safe limit)
- Flow control: waits if buffer > 1MB
- Credentials persist in localStorage

## License

MIT
