#!/usr/bin/env node
/**
 * Test script to connect to @bas's chat service and send a "hello" message
 *
 * IMPORTANT: This script requires the 'wrtc' package which must be installed separately.
 * See TEST_README.md for detailed installation instructions.
 *
 * Quick start:
 *   npm install wrtc
 *   npm test
 *
 * Requirements:
 *   - Node.js 19+ (or Node.js 18 with --experimental-global-webcrypto)
 *   - wrtc package (requires native compilation)
 *   - Build tools (python, make, g++)
 */

import { Rondevu } from '@xtr-dev/rondevu-client'

// Import wrtc
let wrtc
try {
  const wrtcModule = await import('wrtc')
  wrtc = wrtcModule.default || wrtcModule
} catch (error) {
  console.error('❌ Error: wrtc package not found or failed to load')
  console.error('\nThe wrtc package is required for WebRTC support in Node.js.')
  console.error('Install it with:')
  console.error('\n  npm install wrtc')
  console.error('\nNote: wrtc requires native compilation and may take a few minutes to install.')
  console.error('\nError details:', error.message)
  process.exit(1)
}

const { RTCPeerConnection } = wrtc

// Configuration
const API_URL = 'https://api.ronde.vu'
const TARGET_USER = 'bas'
const SERVICE_FQN = `chat:2.0.0@${TARGET_USER}`
const MESSAGE = 'hello'

async function main() {
  console.log('🚀 Rondevu Test Script')
  console.log('='.repeat(50))

  try {
    // 1. Connect to Rondevu
    console.log('1. Connecting to Rondevu...')
    const rondevu = await Rondevu.connect({
      apiUrl: API_URL,
      username: `test-${Date.now()}`,  // Anonymous test user
      iceServers: 'rondevu'  // Use official Rondevu TURN/STUN servers
    })

    console.log(`   ✓ Connected as: ${rondevu.getUsername()}`)
    console.log(`   ✓ Public key: ${rondevu.getPublicKey()?.substring(0, 20)}...`)

    // 2. Connect to service (automatic setup)
    console.log(`\n2. Connecting to service: ${SERVICE_FQN}`)
    let identified = false

    const connection = await rondevu.connectToService({
      serviceFqn: SERVICE_FQN,
      onConnection: ({ dc, peerUsername }) => {
        console.log(`✅ Connected to @${peerUsername}`)

        // Set up message handler
        dc.addEventListener('message', (event) => {
          console.log(`📥 RAW DATA:`, event.data)
          try {
            const msg = JSON.parse(event.data)
            console.log(`📥 Parsed message:`, JSON.stringify(msg, null, 2))

            if (msg.type === 'identify_ack' && !identified) {
              identified = true
              console.log(`✅ Connection acknowledged by @${msg.from}`)

              // Now send the actual chat message
              console.log(`📤 Sending chat message: "${MESSAGE}"`)
              dc.send(JSON.stringify({
                type: 'message',
                text: MESSAGE
              }))

              // Keep connection open longer to see if we get a response
              setTimeout(() => {
                console.log('\n✅ Test completed successfully!')
                connection.dc.close()
                connection.pc.close()
                process.exit(0)
              }, 5000)
            } else if (msg.type === 'message') {
              console.log(`💬 @${msg.from || 'peer'}: ${msg.text}`)
            } else {
              console.log(`📥 Unknown message type: ${msg.type}`)
            }
          } catch (err) {
            console.log(`📥 Parse error:`, err.message)
            console.log(`📥 Raw data was:`, event.data)
          }
        })

        // Send identify message after channel opens
        console.log(`📤 Sending identify message...`)
        const identifyMsg = JSON.stringify({
          type: 'identify',
          from: rondevu.getUsername()
        })
        dc.send(identifyMsg)
        console.log(`   ✓ Identify message sent`)
      }
    })

    // Monitor connection state
    connection.pc.onconnectionstatechange = () => {
      console.log(`   Connection state: ${connection.pc.connectionState}`)
      if (connection.pc.connectionState === 'failed') {
        console.error('❌ Connection failed')
        process.exit(1)
      }
    }

    connection.pc.oniceconnectionstatechange = () => {
      console.log(`   ICE state: ${connection.pc.iceConnectionState}`)
    }

    console.log('\n⏳ Waiting for messages...')

    // Timeout after 30 seconds
    setTimeout(() => {
      if (connection.pc.connectionState !== 'connected') {
        console.error('❌ Connection timeout')
        process.exit(1)
      }
    }, 30000)

  } catch (error) {
    console.error('\n❌ Error:', error.message)
    console.error(error)
    process.exit(1)
  }
}

main()
