import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const checkOnly = process.argv.includes('--check')

const root = fileURLToPath(new URL('..', import.meta.url))
const contract = resolve(root, 'packages/contracts/src/main.tsp')
const openapi = resolve(root, 'packages/contracts/openapi/openapi.yaml')
const generatedOpenapi = resolve(root, 'packages/contracts/openapi/typespec.openapi.yaml')
const generatedSchema = resolve(root, 'packages/api-client/src/generated/openapi.ts')

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
const emittedOpenapi = resolve(generatedDir, 'typespec.openapi.yaml')
const emittedSchema = resolve(generatedDir, 'openapi.ts')
try {
  await execFileAsync('pnpm', ['exec', 'tsp', 'compile', 'src/main.tsp', '--output-dir', generatedDir], {
    cwd: resolve(root, 'packages/contracts'),
  })
  await cp(resolve(generatedDir, '@typespec/openapi3/openapi/openapi.yaml'), emittedOpenapi)
  await execFileAsync('pnpm', ['exec', 'openapi-typescript', openapi, '-o', emittedSchema], {
    cwd: resolve(root, 'packages/contracts'),
  })
  const openapiDocument = await readFile(openapi, 'utf8')
  const typespecDocument = await readFile(emittedOpenapi, 'utf8')
  const contractMarkers = [
    'openapi: 3.1.0',
    '/api/meeting-types:',
    '/api/owner/meeting-types:',
    '/api/meeting-types/{meetingTypeId}/slots:',
    '/api/bookings:',
    '/api/owner/bookings:',
    'ProblemDetails:',
  ]
  for (const marker of contractMarkers) {
    if (!openapiDocument.includes(marker)) {
      throw new Error(`OpenAPI document is missing ${marker}`)
    }
    if (!typespecDocument.includes(marker)) {
      throw new Error(`TypeSpec output is missing ${marker}`)
    }
  }

  const normalize = (value) => `${value.trimEnd()}\n`
  if (checkOnly) {
    const expected = [
      [generatedOpenapi, emittedOpenapi],
      [generatedSchema, emittedSchema],
    ]
    for (const [committed, generated] of expected) {
      const [committedContents, generatedContents] = await Promise.all([
        readFile(committed, 'utf8'),
        readFile(generated, 'utf8'),
      ])
      if (normalize(committedContents) !== normalize(generatedContents)) {
        throw new Error(`Generated artifact is stale: ${committed}`)
      }
    }
    console.log('Contract artifacts are up to date.')
  } else {
    await Promise.all([
      writeFile(generatedOpenapi, normalize(await readFile(emittedOpenapi, 'utf8')), 'utf8'),
      writeFile(generatedSchema, normalize(await readFile(emittedSchema, 'utf8')), 'utf8'),
    ])
    console.log('Generated 2 deterministic contract artifacts.')
  }
} finally {
  await rm(generatedDir, { recursive: true, force: true })
}
