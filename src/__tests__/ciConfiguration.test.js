import fs from 'node:fs';
import path from 'node:path';

const repositoryRoot = process.cwd();
const readRepositoryFile = (relativePath) => fs.readFileSync(
  path.join(repositoryRoot, relativePath),
  'utf8',
);

describe('CI and dependency reproducibility configuration', () => {
  test('does not enable legacy peer dependency resolution', () => {
    expect(readRepositoryFile('.npmrc')).not.toMatch(/^legacy-peer-deps\s*=\s*true\s*$/m);
  });

  test('runs the blocking build job on pushes and pull requests', () => {
    const workflow = readRepositoryFile('.github/workflows/test.yml');

    expect(workflow).toMatch(/push:/);
    expect(workflow).toMatch(/pull_request:/);
    expect(workflow).toMatch(/name: Build/);
    expect(workflow).toMatch(/run: npm run build/);
  });

  test('runs strict peer dependency installation periodically', () => {
    const workflow = readRepositoryFile('.github/workflows/strict-dependencies.yml');

    expect(workflow).toMatch(/schedule:/);
    expect(workflow).toMatch(/workflow_dispatch:/);
    expect(workflow).toMatch(/npm install --strict-peer-deps/);
    expect(workflow).toMatch(/--legacy-peer-deps=false/);
  });
});
