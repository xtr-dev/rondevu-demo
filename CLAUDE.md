# Rondevu Demo Development Guidelines

## WebRTC Configuration

### TURN Server Setup

When configuring TURN servers:

- ✅ **DO** use TURNS (secure) on port 5349 when available: `turns:server.com:5349`
- ✅ **DO** include TURN fallback on port 3478: `turn:server.com:3478`
- ✅ **DO** include the port number in TURN URLs (even if default)
- ✅ **DO** test TURN connectivity before deploying: `turnutils_uclient -u user -w pass server.com 3478 -y`
- ✅ **DO** provide both TCP and UDP transports for maximum compatibility
- ❌ **DON'T** omit the port number
- ❌ **DON'T** assume TURN works without testing

**Default Configuration (recommended):**
```javascript
// Using built-in preset
const rondevu = await Rondevu.connect({
  iceServers: 'rondevu'  // Official Rondevu TURN/STUN servers
})
```

**Custom TURN Configuration:**
```javascript
// Configure your own TURN servers for relay support
const rondevu = await Rondevu.connect({
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: [
        'turns:your-server.com:5349?transport=tcp',
        'turn:your-server.com:3478?transport=tcp',
        'turn:your-server.com:3478?transport=udp',
      ],
      username: 'your-username',
      credential: 'your-credential'
    }
  ]
})
```

Popular TURN providers: Twilio, Metered.ca, Cloudflare, or self-hosted coturn.

### ICE Configuration

**Force Relay Mode for Testing:**
```javascript
const RTC_CONFIG = {
  iceServers: [...],
  iceTransportPolicy: 'relay' // Forces TURN relay, bypasses NAT issues
};
```

Use `iceTransportPolicy: 'relay'` to:
- Test if TURN server is working correctly
- Bypass NAT hairpinning issues (when both peers are on same network)
- Ensure maximum compatibility

**Remove or comment out** `iceTransportPolicy: 'relay'` for production to allow direct connections when possible.

## Debugging

### Enable Detailed ICE Logging

The demo includes detailed ICE candidate logging. Check browser console for:
- 🧊 ICE candidate gathering
- 🧊 ICE connection state changes
- 📤 Candidates sent to server
- 📥 Candidates received from server
- ✅ Successful candidate pairs
- ❌ Failed candidate pairs

### Common Issues

1. **Connection stuck in "connecting":**
   - Configure TURN servers and use `iceTransportPolicy: 'relay'` to test
   - Check if both peers are behind same NAT (hairpinning issue)
   - Verify TURN credentials are correct

2. **No candidates gathered:**
   - Check STUN/TURN server URLs
   - Verify firewall isn't blocking UDP ports
   - Check TURN server is running

3. **Candidates gathered but connection fails:**
   - Check if TURN relay is actually working (use `turnutils_uclient`)
   - Verify server is filtering candidates by role correctly
   - Enable detailed logging to see which candidate pairs are failing

## UI Guidelines

- Show clear connection status (waiting, connecting, connected, failed)
- Display peer role (offerer vs answerer) for debugging
- Provide visual feedback for all user actions
- Use toast notifications for errors and success messages
