import { spawn } from 'node:child_process';

const mode = process.argv[2] === 'open' ? 'open' : 'run';
const cypressArgs = process.argv.slice(3);

const childEnv = { ...process.env };
delete childEnv.ELECTRON_RUN_AS_NODE;

const child = spawn('npx', ['cypress', mode, ...cypressArgs], {
  env: childEnv,
  shell: true,
  stdio: 'inherit',
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
