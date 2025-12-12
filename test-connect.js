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

import { Rondevu, RondevuSignaler, NodeCryptoAdapter } from '@xtr-dev/rondevu-client'

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

// TURN server configuration (IPv4 TURN only - matches demo default)
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:57.129.61.67:3478' },
    {
      urls: [
        'turn:57.129.61.67:3478?transport=tcp',
        'turn:57.129.61.67:3478?transport=udp',
      ],
      username: 'webrtcuser',
      credential: 'supersecretpassword'
    }
  ]
}

async function main() {
  console.log('🚀 Rondevu Test Script')
  console.log('='.repeat(50))

  try {
    // 1. Initialize Rondevu with Node crypto adapter
    console.log('1. Initializing Rondevu client...')
    const rondevu = new Rondevu({
      apiUrl: API_URL,
      username: `test-${Date.now()}`,  // Anonymous test user
      cryptoAdapter: new NodeCryptoAdapter()
    })

    await rondevu.initialize()
    console.log(`   ✓ Initialized as: ${rondevu.getUsername()}`)
    console.log(`   ✓ Public key: ${rondevu.getPublicKey()?.substring(0, 20)}...`)

    // 2. Discover service
    console.log(`\n2. Looking for service: ${SERVICE_FQN}`)
    const serviceData = await rondevu.getService(SERVICE_FQN)
    console.log(`   ✓ Found service from @${serviceData.username}`)
    console.log(`   ✓ Offer ID: ${serviceData.offerId}`)

    // 3. Create peer connection
    console.log('\n3. Creating WebRTC peer connection...')
    const pc = new RTCPeerConnection(RTC_CONFIG)

    // 4. Wait for data channel (we're the answerer, host creates the channel)
    console.log('4. Waiting for data channel from host...')
    let dc = null
    let identified = false

    // Function to setup data channel handlers
    const setupDataChannel = (channel) => {
      dc = channel

      dc.onopen = () => {
        console.log('   ✓ Data channel opened!')
        console.log(`   Data channel state: ${dc.readyState}`)

        // Longer delay to ensure both sides are ready
        setTimeout(() => {
          console.log(`   Data channel state before send: ${dc.readyState}`)
          if (dc.readyState !== 'open') {
            console.error(`   ❌ Data channel not open: ${dc.readyState}`)
            return
          }

          // Send identify message (demo protocol)
          console.log(`📤 Sending identify message...`)
          const identifyMsg = JSON.stringify({
            type: 'identify',
            from: rondevu.getUsername()
          })
          console.log(`   Message:`, identifyMsg)
          dc.send(identifyMsg)
          console.log(`   ✓ Identify message sent, bufferedAmount: ${dc.bufferedAmount}`)
        }, 500)
      }

      dc.onclose = () => {
        console.log('   ❌ Data channel closed!')
      }

      dc.onmessage = (event) => {
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
              dc.close()
              pc.close()
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
      }

      dc.onerror = (error) => {
        console.error('❌ Data channel error:', error)
        process.exit(1)
      }
    }

    // Receive data channel from host (we're the answerer)
    pc.ondatachannel = (event) => {
      console.log('   ✓ Data channel received from host!')
      setupDataChannel(event.channel)
    }

    // 5. Set up ICE candidate exchange FIRST
    console.log('5. Setting up ICE candidate exchange...')

    // Send our ICE candidates
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        console.log('   📤 Sending ICE candidate')
        try {
          // wrtc doesn't have toJSON, manually create the object
          const candidateInit = {
            candidate: event.candidate.candidate,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
            sdpMid: event.candidate.sdpMid,
            usernameFragment: event.candidate.usernameFragment
          }
          await rondevu.getAPIPublic().addOfferIceCandidates(
            serviceData.serviceFqn,
            serviceData.offerId,
            [candidateInit]
          )
        } catch (err) {
          console.error('   ❌ Failed to send ICE candidate:', err.message)
        }
      }
    }

    // Start polling for remote ICE candidates
    const signaler = new RondevuSignaler(rondevu, SERVICE_FQN, TARGET_USER)
    signaler.offerId = serviceData.offerId
    signaler.serviceFqn = serviceData.serviceFqn

    signaler.addListener((candidate) => {
      console.log('   📥 Received ICE candidate')
      pc.addIceCandidate(candidate)
    })

    // 6. Set remote offer
    console.log('6. Setting remote offer...')
    await pc.setRemoteDescription({ type: 'offer', sdp: serviceData.sdp })
    console.log('   ✓ Remote offer set')

    // 7. Create and set local answer (this triggers ICE gathering)
    console.log('7. Creating answer...')
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    console.log('   ✓ Local answer set')

    // 8. Send answer to server
    console.log('8. Sending answer to signaling server...')
    await rondevu.postOfferAnswer(
      serviceData.serviceFqn,
      serviceData.offerId,
      answer.sdp
    )
    console.log('   ✓ Answer sent')

    // Monitor connection state
    pc.onconnectionstatechange = () => {
      console.log(`   Connection state: ${pc.connectionState}`)
      if (pc.connectionState === 'failed') {
        console.error('❌ Connection failed')
        process.exit(1)
      }
    }

    pc.oniceconnectionstatechange = () => {
      console.log(`   ICE state: ${pc.iceConnectionState}`)
    }

    console.log('\n⏳ Waiting for connection...')

    // Timeout after 30 seconds
    setTimeout(() => {
      if (pc.connectionState !== 'connected') {
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
