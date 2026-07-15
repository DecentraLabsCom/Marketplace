import { spawnSync } from 'node:child_process'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const checks = [
  ['run', 'lint'],
  ['test', '--', '--runInBand'],
]

for (const args of checks) {
  console.log(`\n> ${npmCommand} ${args.join(' ')}`)
  const result = spawnSync(npmCommand, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  if (result.error) {
    console.error(result.error)
    process.exit(1)
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
