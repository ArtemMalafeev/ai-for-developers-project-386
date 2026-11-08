import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(new URL('..', import.meta.url).pathname)
const contract = resolve(root, 'packages/contracts/src/main.tsp')
const openapi = resolve(root, 'packages/contracts/openapi/openapi.yaml')
const generated = [
  openapi,
  resolve(root, 'packages/api-client/src/generated/types.ts'),
  resolve(root, 'packages/api-client/src/generated/client.ts'),
  resolve(root, 'packages/api-client/src/generated/index.ts'),
]

const source = await readFile(contract, 'utf8')
for (const marker of [
  'interface GuestMeetingTypes',
  'interface GuestSlots',
  'interface GuestBookings',
  'interface OwnerMeetingTypes',
  'interface OwnerBookings',
]) {
  if (!source.includes(marker)) {
    throw new Error(`TypeSpec contract is missing ${marker}`)
  }
}

const openapiDocument = await readFile(openapi, 'utf8')
for (const marker of [
  'openapi: 3.1.0',
  '/api/meeting-types:',
  '/api/owner/meeting-types:',
  '/api/meeting-types/{meetingTypeId}/slots:',
  '/api/bookings:',
  '/api/owner/bookings:',
  'ProblemDetails:',
]) {
  if (!openapiDocument.includes(marker)) {
    throw new Error(`OpenAPI document is missing ${marker}`)
  }
}

for (const file of generated) {
  const contents = await readFile(file, 'utf8')
  await writeFile(file, `${contents.trimEnd()}\n`, 'utf8')
}

console.log(`Generated ${generated.length} deterministic contract artifacts.`)
