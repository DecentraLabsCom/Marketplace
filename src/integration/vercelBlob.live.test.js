/**
 * @jest-environment node
 */

import { randomUUID } from 'node:crypto'
import { del, put } from '@vercel/blob'

const runLiveBlobIntegration = process.env.RUN_VERCEL_BLOB_INTEGRATION === 'true'
const liveBlobTest = runLiveBlobIntegration ? test : test.skip

liveBlobTest('stores, reads and deletes an isolated Vercel Blob object', async () => {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) throw new Error('BLOB_READ_WRITE_TOKEN is required for the live Vercel Blob integration test')

  const payload = JSON.stringify({ integrationTest: true, id: randomUUID() })
  const pathname = `integration-tests/marketplace/${randomUUID()}.json`
  let blob

  try {
    blob = await put(pathname, payload, {
      access: 'public',
      addRandomSuffix: false,
      cacheControlMaxAge: 0,
      contentType: 'application/json',
      token,
    })

    const response = await fetch(blob.url, { cache: 'no-store' })
    expect(response.ok).toBe(true)
    expect(await response.text()).toBe(payload)
  } finally {
    if (blob?.url) await del(blob.url, { token })
  }
}, 60_000)
