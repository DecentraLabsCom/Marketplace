import http from 'node:http';
import { spawn } from 'node:child_process';

const mode = process.argv[2] === 'open' ? 'open' : 'run';
const cypressArgs = process.argv.slice(3);
const devPort = Number(process.env.E2E_PORT || 3000);
const baseUrl = `http://127.0.0.1:${devPort}`;
const timeoutMs = Number(process.env.E2E_SERVER_TIMEOUT_MS || 120000);

function waitForServer(url, timeout) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      const request = http.get(url, (response) => {
        response.resume();
        if (response.statusCode && response.statusCode < 500) {
          resolve();
          return;
        }

        if (Date.now() - startedAt >= timeout) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }

        setTimeout(check, 500);
      });

      request.on('error', () => {
        if (Date.now() - startedAt >= timeout) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }

        setTimeout(check, 500);
      });
    };

    check();
  });
}

function killProcessTree(pid) {
  if (!pid) return Promise.resolve();

  return new Promise((resolve) => {
    const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      shell: true,
    });
    killer.on('exit', () => resolve());
    killer.on('error', () => resolve());
  });
}

async function run() {
  const childEnv = { ...process.env };
  delete childEnv.ELECTRON_RUN_AS_NODE;

  const devServer = spawn('npm', ['run', 'dev'], {
    env: childEnv,
    shell: true,
    stdio: 'inherit',
  });

  let exitCode = 1;
  let terminating = false;

  const shutdown = async () => {
    if (terminating) return;
    terminating = true;
    await killProcessTree(devServer.pid);
  };

  const onSignal = async (signal) => {
    await shutdown();
    process.exit(128 + (signal === 'SIGINT' ? 2 : 15));
  };

  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  try {
    await waitForServer(baseUrl, timeoutMs);

    const cypress = spawn('npx', ['cypress', mode, ...cypressArgs], {
      env: childEnv,
      shell: true,
      stdio: 'inherit',
    });

    exitCode = await new Promise((resolve, reject) => {
      cypress.on('exit', (code) => resolve(code ?? 1));
      cypress.on('error', reject);
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    exitCode = 1;
  } finally {
    await shutdown();
  }

  process.exit(exitCode);
}

run();
