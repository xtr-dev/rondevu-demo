# Rondevu Demo Development Guidelines

## ICE Configuration

The demo uses the `rondevu-client` ICE presets selectable via dropdown:
- `rondevu` - Official TURN/STUN servers (default)
- `rondevu-relay` - Force relay mode (hides client IPs)
- `google-stun` - Google STUN only
- `public-stun` - Multiple public STUN servers

## Debugging

### Console Logging

The demo logs ICE events to browser console:
- ICE candidate gathering
- ICE connection state changes
- Candidates sent/received

### Common Issues

1. **Connection stuck in "connecting":**
   - Try the `rondevu-relay` preset to force TURN relay
   - Check if both peers are behind same NAT

2. **No candidates gathered:**
   - Check STUN/TURN server availability
   - Verify firewall isn't blocking UDP ports

3. **Connection fails after candidates gathered:**
   - Enable detailed logging to see failing pairs
   - Check server is filtering by role correctly

## Project Structure

```
src/
  App.jsx           - Main app component
  components/
    ChatPanel.jsx   - Chat UI component
    ConnectionStages.jsx - Connection progress display
  index.css         - All styles
  main.jsx          - React entry point
```

## UI Guidelines

- Show clear connection status (waiting, connecting, connected)
- Provide visual feedback for all user actions
- Use toast notifications for errors and success messages
