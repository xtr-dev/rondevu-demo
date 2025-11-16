# Rondevu Demo Development Guidelines

## WebRTC Configuration

### TURN Server Setup

When configuring TURN servers:

- ✅ **DO** include the port number in TURN URLs: `turn:server.com:3478`
- ✅ **DO** test TURN connectivity before deploying: `turnutils_uclient -u user -w pass server.com 3478 -y`
- ✅ **DO** provide both TCP and UDP transports for maximum compatibility
- ❌ **DON'T** omit the port number (even if it's the default 3478)
- ❌ **DON'T** assume TURN works without testing

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
   - Enable relay-only mode to test TURN
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
