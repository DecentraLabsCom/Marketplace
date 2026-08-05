/**
 * @jest-environment node
 */

import path from 'node:path'
import { promises as fs } from 'node:fs'

jest.mock('@/utils/isVercel', () => ({
  __esModule: true,
  default: jest.fn(() => false),
}))

import { cleanupLabStorage } from '../labRetention'

describe('cleanupLabStorage', () => {
  test('deletes the exact managed URI even when its suffix differs from the minted lab ID', async () => {
    const metadataUri = `Lab-point4-${Date.now()}.json`
    const metadataPath = path.join(process.cwd(), 'data', metadataUri)

    await fs.writeFile(metadataPath, '{}', 'utf8')
    try {
      const result = await cleanupLabStorage({ labId: 3, metadataUri })

      expect(result.storage).toBe('local')
      expect(result.removed).toContain(`data/${metadataUri}`)
      await expect(fs.access(metadataPath)).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await fs.rm(metadataPath, { force: true })
    }
  })
})
