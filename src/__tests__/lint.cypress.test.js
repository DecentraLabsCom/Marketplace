const path = require('path')
const { ESLint } = require('eslint')

describe('ESLint - Cypress files', () => {
  test('no `no-undef` errors (e.g. expect) in cypress tests', async () => {
    const eslint = new ESLint({
      cwd: process.cwd(),
      overrideConfigFile: path.resolve(process.cwd(), 'eslint.config.cjs'),
    })

    let results
    try {
      results = await eslint.lintFiles(['cypress/**/*.cy.js', 'cypress/e2e/**/*.js', 'cypress/**/*.js'])
    } catch (err) {
      // Fail the test with the ESLint error so CI shows the underlying cause
      throw new Error(`ESLint execution failed: ${err && err.message ? err.message : err}`)
    }

    const messages = results.flatMap((r) => r.messages || [])
    const noUndef = messages.filter((m) => m.ruleId === 'no-undef' || /'expect' is not defined/.test(m.message))

    expect(noUndef).toEqual([])
  })
})
