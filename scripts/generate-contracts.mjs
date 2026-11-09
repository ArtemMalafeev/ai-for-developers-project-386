import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'

const execFileAsync = promisify(execFile)

const root = resolve(new URL('..', import.meta.url).pathname)
const contract = resolve(root, 'packages/contracts/src/main.tsp')
const openapi = resolve(root, 'packages/contracts/openapi/openapi.yaml')
const generatedOpenapi = resolve(root, 'packages/contracts/openapi/typespec.openapi.yaml')
const generatedSchema = resolve(root, 'packages/api-client/src/generated/openapi.ts')
const generated = [
  openapi,
  generatedOpenapi,
  generatedSchema,
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

const generatedDir = await mkdtemp(resolve(tmpdir(), 'calendar-contracts-'))
try {
  await execFileAsync('pnpm', ['exec', 'tsp', 'compile', 'src/main.tsp', '--output-dir', generatedDir], {
    cwd: resolve(root, 'packages/contracts'),
  })
  const emittedOpenapi = resolve(generatedDir, '@typespec/openapi3/openapi/openapi.yaml')
  await cp(emittedOpenapi, generatedOpenapi)
  await execFileAsync('pnpm', ['exec', 'openapi-typescript', generatedOpenapi, '-o', generatedSchema], {
    cwd: resolve(root, 'packages/contracts'),
  })
} finally {
  await rm(generatedDir, { recursive: true, force: true })
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
