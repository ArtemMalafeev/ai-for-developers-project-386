
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import net from 'node:net'

const services = [
  {
    name: 'backend',
    package: 'apps-api',
    port: 3000,
    url: 'http://127.0.0.1:3000/health',
    validate: async (response) => {
      const body = await response.json()
      return response.status === 200 && body.status === 'ok'
    },
  },
  {
    name: 'frontend',
    package: 'apps-web',
    port: 5173,
    url: 'http://127.0.0.1:5173/api/health',
    validate: async (response) => {
      const body = await response.json()
      return response.status === 200 && body.status === 'ok'
    },
  },
]

const processes = []
const serviceTimeoutMs = 300_000

function isPortOccupied(port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1')

    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })

    socket.once('error', (error) => {
      socket.destroy()

      if (error.code === 'ECONNREFUSED') {
        resolve(false)
      } else {
        reject(error)
      }
    })
  })
}

function startService(service) {
  console.log(`Starting ${service.name}...`)

  const child = spawn(
    'pnpm',
    ['--filter', service.package, 'dev'],
    {
      stdio: 'inherit',
      detached: true,
      env: { ...process.env, CI: 'true' },
    },
  )

  processes.push(child)
  return child
}

async function waitForService(service, child) {
  const deadline = Date.now() + serviceTimeoutMs

  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`${service.name} exited before becoming ready`)
    }

    try {
      const response = await fetch(service.url, {
        signal: AbortSignal.timeout(2000),
      })

      if (await service.validate(response)) {
        console.log(`✓ ${service.name}: OK`)
        return
      }
    } catch {
      // The service may still be starting.
    }

    await sleep(500)
  }

  throw new Error(
    `${service.name} did not become ready in ${serviceTimeoutMs / 1000} seconds`,
  )
}

function cleanup() {
  for (const child of processes) {
    if (child.pid) {
      try {
        process.kill(-child.pid, 'SIGTERM')
      } catch (error) {
        if (error.code !== 'ESRCH') {
          console.error(error)
        }
      }
    }
  }
}

process.once('SIGINT', () => {
  cleanup()
  process.exit(130)
})

process.once('SIGTERM', () => {
  cleanup()
  process.exit(143)
})

try {
  // Prevent accidentally testing servers started manually.
  for (const service of services) {
    if (await isPortOccupied(service.port)) {
      throw new Error(
        `Port ${service.port} is occupied. Stop running dev servers first.`,
      )
    }
  }

  for (const service of services) {
    const child = startService(service)
    await waitForService(service, child)
  }

  const baseUrl = 'http://127.0.0.1:5173/api'
  const typeResponse = await fetch(`${baseUrl}/owner/meeting-types`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: `Smoke ${Date.now()}`,
      durationMinutes: 30,
      description: 'Smoke test meeting',
    }),
  })
  if (typeResponse.status !== 201) throw new Error(`meeting type creation failed: ${typeResponse.status}`)
  const meetingType = await typeResponse.json()

  const typesResponse = await fetch(`${baseUrl}/meeting-types`)
  const types = await typesResponse.json()
  if (!types.some((item) => item.id === meetingType.id)) throw new Error('created meeting type is missing from public list')

  const slotsResponse = await fetch(`${baseUrl}/meeting-types/${meetingType.id}/slots`)
  const slots = await slotsResponse.json()
  if (!Array.isArray(slots) || slots.length === 0) throw new Error('smoke test found no available slots')

  const bookingResponse = await fetch(`${baseUrl}/bookings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': `smoke-${Date.now()}` },
    body: JSON.stringify({
      meetingTypeId: meetingType.id,
      startAt: slots[0].startAt,
      guestName: 'Smoke Guest',
      guestEmail: 'smoke@example.com',
    }),
  })
  if (bookingResponse.status !== 201) throw new Error(`booking creation failed: ${bookingResponse.status}`)
  const booking = await bookingResponse.json()
  const ownerBookingsResponse = await fetch(`${baseUrl}/owner/bookings`)
  const ownerBookings = await ownerBookingsResponse.json()
  if (!ownerBookings.some((item) => item.id === booking.id)) throw new Error('created booking is missing from owner list')

  console.log('\n✓ Smoke test passed')
} catch (error) {
  console.error('\n✗ Smoke test failed:', error)
  process.exitCode = 1
} finally {
  cleanup()
}
