const { exec } = require('child_process')
const util = require('util')
const execP = util.promisify(exec)

describe('ESLint - Cypress files', () => {
  test('no `no-undef` errors (e.g. expect) in cypress tests', async () => {
    // Run eslint in a child process to avoid ESM/dynamic import issues in the Node API
    const cmd = 'npx eslint -f json "cypress/**/*.cy.js" "cypress/e2e/**/*.js" "cypress/**/*.js" --config eslint.config.cjs'

    let stdout
    try {
      const { stdout: out } = await execP(cmd, { cwd: process.cwd(), maxBuffer: 10 * 1024 * 1024 })
      stdout = out
    } catch (err) {
      // eslint exits with non-zero code when problems are found. Use stdout if available to inspect messages
      stdout = err.stdout || err && err.message
      if (!stdout) throw new Error(`ESLint failed to run: ${err && err.message ? err.message : err}`, { cause: err })
    }

    let results
    try {
      results = JSON.parse(stdout || '[]')
    } catch (err) {
      throw new Error(`Failed to parse ESLint JSON output: ${err && err.message ? err.message : err}`, { cause: err })
    }

    const messages = results.flatMap((r) => r.messages || [])
    const noUndef = messages.filter((m) => m.ruleId === 'no-undef' || /'expect' is not defined/.test(m.message))

    expect(noUndef).toEqual([])
  }, 30000)
})
