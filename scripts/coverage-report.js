import { readFile } from 'node:fs/promises'
import path from 'node:path'

const summaryPath = path.resolve(process.cwd(), 'coverage/coverage-summary.json')

let summary
try {
  summary = JSON.parse(await readFile(summaryPath, 'utf8'))
} catch (error) {
  console.error(`Coverage summary not found at ${summaryPath}. Run npm run test:coverage first.`)
  process.exitCode = 1
  if (error?.code !== 'ENOENT') console.error(error)
  process.exit()
}

const formatMetric = (metric) => `${metric.pct.toFixed(2)}% (${metric.covered}/${metric.total})`
const total = summary.total

console.log('Coverage summary')
console.log(`  Lines:      ${formatMetric(total.lines)}`)
console.log(`  Statements: ${formatMetric(total.statements)}`)
console.log(`  Branches:   ${formatMetric(total.branches)}`)
console.log(`  Functions:  ${formatMetric(total.functions)}`)
