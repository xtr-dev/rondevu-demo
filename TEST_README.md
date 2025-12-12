# Running Node.js Tests

The `test-connect.js` script demonstrates connecting to a Rondevu service from Node.js and sending a WebRTC data channel message.

## Requirements

- Node.js 19+ (or Node.js 18 with `--experimental-global-webcrypto` flag)
- wrtc package (for WebRTC support in Node.js)

## Installation

The `wrtc` package requires native compilation. Due to build complexities, it's not included as a regular dependency.

### Install wrtc manually:

```bash
# Install build tools (if not already installed)
# On Ubuntu/Debian:
sudo apt-get install build-essential python3

# On macOS:
xcode-select --install

# Install wrtc
npm install wrtc
```

**Note:** Installation may take several minutes as it compiles native code.

### Alternative: Test without WebRTC

If wrtc installation fails, you can still test the signaling layer without actual WebRTC connections by modifying the test script or using the browser demo at https://ronde.vu

## Running the Test

Once wrtc is installed:

```bash
npm test
```

This will:
1. Connect to the production Rondevu server
2. Look for @bas's chat service
3. Establish a WebRTC connection
4. Send "hello" via data channel

## Troubleshooting

### wrtc installation fails

Try installing dependencies:
```bash
npm install node-pre-gyp node-gyp
npm install wrtc
```

### "crypto.subtle is not available"

You need Node.js 19+ or run with:
```bash
node --experimental-global-webcrypto test-connect.js
```

### Can't find @bas's service

The test looks for `chat:1.0.0@bas`. If @bas is not online or the service expired, the test will fail. You can modify the `TARGET_USER` constant to test with a different user.
