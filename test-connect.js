#!/usr/bin/env node
/**
 * Test script to connect to @bas's chat service and send a "hello" message
 *
 * Usage: node test-connect.js
 *
 * Requires Node.js 19+ or Node.js 18 with --experimental-global-webcrypto
 */

import { Rondevu, RondevuSignaler, NodeCryptoAdapter } from '@xtr-dev/rondevu-client'
import wrtc from 'wrtc'

const { RTCPeerConnection } = wrtc

// Configuration
const API_URL = 'https://rondevu.xtrdev.workers.dev'
const TARGET_USER = 'bas'
const SERVICE_FQN = `chat:1.0.0@${TARGET_USER}`
const MESSAGE = 'hello'

// TURN server configuration
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.share.fish:3478' },
    {
      urls: [
        'turns:turn.share.fish:5349?transport=tcp',
        'turns:turn.share.fish:5349?transport=udp',
        'turn:turn.share.fish:3478?transport=tcp',
        'turn:turn.share.fish:3478?transport=udp',
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

    // 4. Create data channel
    console.log('4. Creating data channel...')
    const dc = pc.createDataChannel('chat')

    // Set up data channel handlers
    dc.onopen = () => {
      console.log('   ✓ Data channel opened!')
      console.log(`\n📤 Sending message: "${MESSAGE}"`)
      dc.send(MESSAGE)

      // Close after sending
      setTimeout(() => {
        console.log('\n✅ Test completed successfully!')
        dc.close()
        pc.close()
        process.exit(0)
      }, 1000)
    }

    dc.onmessage = (event) => {
      console.log(`📥 Received: ${event.data}`)
    }

    dc.onerror = (error) => {
      console.error('❌ Data channel error:', error)
      process.exit(1)
    }

    // 5. Set remote offer
    console.log('5. Setting remote offer...')
    await pc.setRemoteDescription({ type: 'offer', sdp: serviceData.sdp })
    console.log('   ✓ Remote offer set')

    // 6. Create and set local answer
    console.log('6. Creating answer...')
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    console.log('   ✓ Local answer set')

    // 7. Send answer to server
    console.log('7. Sending answer to signaling server...')
    await rondevu.postOfferAnswer(
      serviceData.serviceFqn,
      serviceData.offerId,
      answer.sdp
    )
    console.log('   ✓ Answer sent')

    // 8. Handle ICE candidates
    console.log('8. Setting up ICE candidate exchange...')
    const signaler = new RondevuSignaler(rondevu, SERVICE_FQN, TARGET_USER)

    // Send our ICE candidates
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        console.log('   📤 Sending ICE candidate')
        await signaler.addIceCandidate(event.candidate)
      }
    }

    // Receive remote ICE candidates
    signaler.addListener((candidate) => {
      console.log('   📥 Received ICE candidate')
      pc.addIceCandidate(candidate)
    })

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
