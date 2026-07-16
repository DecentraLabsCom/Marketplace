import { del, list } from '@vercel/blob'

const LEGACY_PATH = 'data/pendingProviders.json'
const execute = process.argv.includes('--execute')

if (process.argv.includes('--help')) {
  process.stdout.write(
    'Usage: npm run cleanup:legacy-pending-providers [-- --execute]\n' +
    'Without --execute, lists the number of matching legacy objects without deleting them.\n',
  )
  process.exit(0)
}

const blobs = []
let cursor
try {
  do {
    const result = await list({
      prefix: LEGACY_PATH,
      limit: 1000,
      ...(cursor ? { cursor } : {}),
    })
    blobs.push(...(result.blobs || []).filter((blob) => blob.pathname === LEGACY_PATH))
    cursor = result.hasMore ? result.cursor : null
  } while (cursor)
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown Blob storage error'
  process.stderr.write(`Unable to inspect ${LEGACY_PATH}: ${message}\n`)
  process.exit(1)
}

if (blobs.length === 0) {
  process.stdout.write(`No legacy Blob objects found at ${LEGACY_PATH}.\n`)
  process.exit(0)
}

if (!execute) {
  process.stdout.write(
    `Found ${blobs.length} legacy Blob object(s) at ${LEGACY_PATH}. ` +
    'Run again with --execute to delete them.\n',
  )
  process.exit(0)
}

for (const blob of blobs) {
  await del(blob.url)
}
process.stdout.write(`Deleted ${blobs.length} legacy Blob object(s) at ${LEGACY_PATH}.\n`)
