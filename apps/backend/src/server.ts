import Fastify from 'fastify'

const app = Fastify({
  logger: true,
})

app.get('/health', async () => {
  return { status: 'ok' }
})

app.get('/api/health', async () => {
  return { status: 'ok' }
})

try {
  await app.listen({
    port: 3000,
    host: '127.0.0.1',
  })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}

