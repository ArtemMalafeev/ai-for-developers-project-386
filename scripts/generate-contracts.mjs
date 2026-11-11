import { mkdtemp, readFile, readdir, rm, mkdir, cp, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve, relative, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const execFileAsync = promisify(execFile)
const checkOnly = process.argv.includes('--check')
const root = fileURLToPath(new URL('..', import.meta.url))
const contractsDir = resolve(root, 'packages/contracts')
const require = createRequire(resolve(contractsDir, 'package.json'))
const { createClient } = await import(resolve(dirname(require.resolve('@hey-api/openapi-ts/package.json')), 'dist/index.mjs'))
const temp = await mkdtemp(resolve(tmpdir(), 'calendar-contracts-'))

const listFiles = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(dir, entry.name)
    return entry.isDirectory() ? listFiles(path) : [path]
  }))
  return nested.flat().sort()
}

try {
  await execFileAsync(resolve(contractsDir, 'node_modules/.bin/tsp'), ['compile', 'src/main.tsp', '--output-dir', temp], {
    cwd: contractsDir,
  })
  const emittedOpenapi = resolve(temp, '@typespec/openapi3/openapi/openapi.yaml')
  const clientOutput = resolve(temp, 'client')
  const serverOutput = resolve(temp, 'server')
  const output = (path) => ({ path, importFileExtension: '.js' })
  await createClient({
    input: emittedOpenapi,
    output: output(clientOutput),
    plugins: ['@hey-api/typescript', '@hey-api/sdk', '@hey-api/client-fetch'],
  })
  await createClient({
    input: emittedOpenapi,
    output: output(serverOutput),
    plugins: ['@hey-api/typescript', 'fastify'],
  })

  const artifacts = [
    [emittedOpenapi, resolve(root, 'packages/contracts/openapi/openapi.yaml')],
    ...((await listFiles(clientOutput)).map((path) => [
      path,
      resolve(root, 'packages/api-client/src/generated', relative(clientOutput, path)),
    ])),
    ...((await listFiles(serverOutput)).map((path) => [
      path,
      resolve(root, 'apps/backend/src/generated', relative(serverOutput, path)),
    ])),
  ]
  const generatedDirectories = [
    [clientOutput, resolve(root, 'packages/api-client/src/generated')],
    [serverOutput, resolve(root, 'apps/backend/src/generated')],
  ]
  const openapiDirectory = resolve(root, 'packages/contracts/openapi')
  if (checkOnly) {
    for (const [generated, committed] of artifacts) {
      const [actual, expected] = await Promise.all([
        readFile(committed, 'utf8').catch(() => undefined),
        readFile(generated, 'utf8'),
      ])
      if (actual !== expected) throw new Error(`Generated artifact is stale: ${committed}`)
    }
    for (const [generated, committed] of generatedDirectories) {
      const expected = (await listFiles(generated)).map((path) => relative(generated, path))
      const actual = (await listFiles(committed).catch(() => [])).map((path) => relative(committed, path))
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Generated artifact set is stale: ${committed}`)
      }
    }
    const openapiFiles = (await listFiles(openapiDirectory)).map((path) => relative(openapiDirectory, path))
    if (JSON.stringify(openapiFiles) !== JSON.stringify(['openapi.yaml'])) {
      throw new Error(`Generated artifact set is stale: ${openapiDirectory}`)
    }
    console.log('Contract artifacts are up to date.')
  } else {
    for (const [generated, committed] of generatedDirectories) {
      await rm(committed, { recursive: true, force: true })
      await cp(generated, committed, { recursive: true })
    }
    const canonicalOpenapi = resolve(openapiDirectory, 'openapi.yaml')
    await rm(openapiDirectory, { recursive: true, force: true })
    await mkdir(dirname(canonicalOpenapi), { recursive: true })
    await writeFile(canonicalOpenapi, await readFile(emittedOpenapi))
    console.log(`Generated ${artifacts.length} contract artifacts.`)
  }
} finally {
  await rm(temp, { recursive: true, force: true })
}
