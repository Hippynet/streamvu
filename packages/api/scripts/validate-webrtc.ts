#!/usr/bin/env npx ts-node
/**
 * WebRTC Bus Routing Validation Script
 *
 * Use this script to validate that WebRTC connections and bus routing
 * are working correctly in a room.
 *
 * Usage:
 *   npx ts-node scripts/validate-webrtc.ts <roomId> [apiToken]
 *
 * Example:
 *   npx ts-node scripts/validate-webrtc.ts room-123 eyJhbGciOiJIUzI1NiI...
 */

const API_BASE_URL = process.env.API_URL || 'http://localhost:3000'

interface ValidationResult {
  roomId: string
  timestamp: string
  room: {
    exists: boolean
    participantCount: number
    producers: Array<{
      participantId: string
      producerId: string
      busType?: string
      isBusOutput: boolean
      closed: boolean
      paused: boolean
    }>
  } | null
  busProducers: Array<{
    busType: string
    available: boolean
    producerId: string | null
    participantId: string | null
    allProducers: Array<{
      producerId: string
      participantId: string
      paused: boolean
    }>
  }>
  encoders: Array<{
    outputId: string
    isRunning: boolean
    uptimeSeconds: number
  }>
  issues: string[]
  recommendations: string[]
}

async function fetchDiagnostics(roomId: string, token?: string): Promise<ValidationResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${API_BASE_URL}/api/webrtc/${roomId}/diagnostics`, {
    headers,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`API error: ${response.status} ${response.statusText}\n${text}`)
  }

  const data = await response.json()
  if (!data.success) {
    throw new Error(`API returned error: ${data.error?.message || 'Unknown error'}`)
  }

  return data.data
}

async function runValidation(roomId: string, token?: string): Promise<void> {
  console.log('\n🔍 WebRTC Bus Routing Validation')
  console.log('================================\n')
  console.log(`Room ID: ${roomId}`)
  console.log(`API URL: ${API_BASE_URL}`)
  console.log('')

  try {
    const result = await fetchDiagnostics(roomId, token)

    // Room status
    console.log('📊 Room Status')
    console.log('─────────────')
    if (result.room) {
      console.log(`  ✅ Room exists in mediasoup`)
      console.log(`  👥 Participants: ${result.room.participantCount}`)
      console.log(`  🎙️  Producers: ${result.room.producers.length}`)
    } else {
      console.log(`  ❌ Room not found in mediasoup state`)
      console.log('     This means no participants have joined the room yet.')
    }
    console.log('')

    // Bus producers
    console.log('🚌 Bus Producers')
    console.log('─────────────────')
    for (const bus of result.busProducers) {
      const status = bus.available ? '✅' : '❌'
      const count = bus.allProducers.length
      console.log(`  ${status} ${bus.busType}: ${bus.available ? 'Available' : 'Not available'} (${count} producer${count !== 1 ? 's' : ''})`)

      if (bus.available && bus.producerId) {
        console.log(`     Producer ID: ${bus.producerId.substring(0, 20)}...`)
        console.log(`     From: ${bus.participantId?.substring(0, 20) || 'unknown'}...`)
      }

      // Warn about multiple producers
      if (count > 1) {
        console.log(`     ⚠️  Multiple producers - only first will be used`)
      }
    }
    console.log('')

    // Encoders
    if (result.encoders.length > 0) {
      console.log('📡 Running Encoders')
      console.log('───────────────────')
      for (const encoder of result.encoders) {
        console.log(`  🟢 Output: ${encoder.outputId}`)
        console.log(`     Uptime: ${encoder.uptimeSeconds}s`)
      }
      console.log('')
    }

    // Issues
    if (result.issues.length > 0) {
      console.log('⚠️  Issues Found')
      console.log('────────────────')
      for (const issue of result.issues) {
        console.log(`  • ${issue}`)
      }
      console.log('')
    }

    // Recommendations
    if (result.recommendations.length > 0) {
      console.log('💡 Recommendations')
      console.log('──────────────────')
      for (const rec of result.recommendations) {
        console.log(`  • ${rec}`)
      }
      console.log('')
    }

    // Summary
    console.log('📋 Summary')
    console.log('──────────')
    const hasRoom = result.room !== null
    const hasPGM = result.busProducers.find(b => b.busType === 'PGM')?.available
    const hasTB = result.busProducers.find(b => b.busType === 'TB')?.available
    const noIssues = result.issues.length === 0

    if (hasRoom && hasPGM && noIssues) {
      console.log('  ✅ WebRTC bus routing is working correctly!')
    } else if (hasRoom && hasPGM) {
      console.log('  ⚠️  WebRTC is working but has some issues')
    } else if (hasRoom) {
      console.log('  ❌ Room exists but no bus producers available')
      console.log('     Ensure the host client has enabled bus outputs')
    } else {
      console.log('  ❌ Room not active - waiting for participants')
    }

    // IFB capability check
    if (hasTB) {
      console.log('  ✅ IFB/Talkback capable (TB producer available)')
    } else {
      console.log('  ⚠️  IFB/Talkback not available (no TB producer)')
    }

    console.log('')

  } catch (error) {
    console.error('❌ Validation failed:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

// Main
const args = process.argv.slice(2)
if (args.length === 0) {
  console.log('Usage: npx ts-node scripts/validate-webrtc.ts <roomId> [apiToken]')
  console.log('')
  console.log('Environment variables:')
  console.log('  API_URL - Base URL for the API (default: http://localhost:3000)')
  process.exit(1)
}

const [roomId, token] = args
runValidation(roomId, token)
