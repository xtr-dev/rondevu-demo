# ronde.vu

**P2P File Sharing - Share files directly, no server upload**

A React app for peer-to-peer file sharing using WebRTC data channels and [Rondevu](https://github.com/xtr-dev/rondevu-client) signaling.

[Try it live](https://ronde.vu)

## Features

- **Session Codes** - 6-character code to share with anyone
- **QR Code Sharing** - Scan or share QR code to join
- **Direct P2P Transfer** - Files go directly between browsers
- **Chat** - Text chat while sharing files
- **ICE Presets** - Choose connection mode (direct, relay, etc.)
- **No Size Limit** - Transfer any file size
- **Persistent Identity** - Username saved in localStorage

## Quick Start

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`

## How to Use

1. **Create Identity** - Enter username (or leave blank for auto)
2. **Start Session** - Click "Start New Session" to get a code
3. **Share Code** - Send code or QR to your peer
4. **Connect** - Peer enters code and clicks "Join"
5. **Share Files** - Drag and drop files to transfer

## Deployment

```bash
npm run build
npx wrangler pages deploy dist --project-name=rondevu-demo
```

## Links

- [Client Library](https://github.com/xtr-dev/rondevu-client) | [Server](https://github.com/xtr-dev/rondevu-server)

## License

MIT
