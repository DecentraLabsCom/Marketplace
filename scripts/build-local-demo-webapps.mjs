import { spawnSync } from 'node:child_process'
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const marketplaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workspaceRoot = path.dirname(marketplaceRoot)
const localDemosRoot = path.join(workspaceRoot, 'FMU-Executor', 'examples', 'local-demos')
const devAppRoot = path.join(marketplaceRoot, 'src', 'app', 'dev')

const dynamicShimPlugin = {
  name: 'next-dynamic-client-shim',
  setup(buildApi) {
    buildApi.onResolve({ filter: /^next\/dynamic$/ }, () => ({
      path: 'dynamic-shim',
      namespace: 'local-demo-shims',
    }))
    buildApi.onLoad({ filter: /.*/, namespace: 'local-demo-shims' }, () => ({
      loader: 'js',
      resolveDir: marketplaceRoot,
      contents: `
        import { createElement, useEffect, useState } from 'react'
        export default function dynamic(loadComponent) {
          return function LazyClientComponent(props) {
            const [Component, setComponent] = useState(null)
            useEffect(() => {
              let active = true
              loadComponent().then(({ default: LoadedComponent }) => {
                if (active) setComponent(() => LoadedComponent)
              }).catch((error) => console.error('The local scene could not be loaded.', error))
              return () => { active = false }
            }, [])
            return Component ? createElement(Component, props) : null
          }
        }
      `,
    }))
  },
}

function appHtml(title) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <link rel="stylesheet" href="./app.css">
    <style>html,body,#root{width:100%;min-height:100%;margin:0}body{font-family:Arial,sans-serif}</style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./app.js"></script>
  </body>
</html>
`
}

async function buildWebapp({ id, title, componentPath, outputPath, vehiclePath }) {
  const stagingRoot = await mkdtemp(path.join(os.tmpdir(), `decentralabs-${id}-`))
  try {
    const component = path.join(devAppRoot, componentPath)
    const vehicleUrl = vehiclePath
      ? `new URL('./${path.basename(vehiclePath)}', document.baseURI).href`
      : null
    const renderProps = vehicleUrl ? `, { vehicleUrl: ${vehicleUrl} }` : ''
    const entry = `
      import React from 'react'
      import { createRoot } from 'react-dom/client'
      import DemoApp from ${JSON.stringify(component)}
      createRoot(document.getElementById('root')).render(React.createElement(DemoApp${renderProps}))
    `

    const result = await build({
      absWorkingDir: marketplaceRoot,
      stdin: {
        contents: entry,
        loader: 'jsx',
        resolveDir: marketplaceRoot,
        sourcefile: `${id}-entry.jsx`,
      },
      bundle: true,
      define: { 'process.env.NODE_ENV': '"production"' },
      entryNames: 'app',
      format: 'esm',
      jsx: 'automatic',
      loader: { '.js': 'jsx' },
      legalComments: 'external',
      minify: true,
      outdir: stagingRoot,
      platform: 'browser',
      plugins: id === 'inverted-pendulum' ? [dynamicShimPlugin] : [],
      target: ['es2022'],
      write: false,
    })

    for (const output of result.outputFiles) {
      const outputPath = path.join(stagingRoot, path.basename(output.path))
      await writeFile(outputPath, output.contents)
    }
    await writeFile(path.join(stagingRoot, 'index.html'), appHtml(title))
    if (vehiclePath) await copyFile(vehiclePath, path.join(stagingRoot, path.basename(vehiclePath)))

    const zipSource = `
from pathlib import Path
import stat, sys, zipfile
source = Path(sys.argv[1])
destination = Path(sys.argv[2])
destination.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for item in sorted(path for path in source.rglob("*") if path.is_file()):
        if item.is_symlink():
            raise ValueError(f"webapp contains a symbolic link: {item}")
        name = item.relative_to(source).as_posix()
        entry = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
        entry.compress_type = zipfile.ZIP_DEFLATED
        entry.create_system = 3
        entry.external_attr = (stat.S_IFREG | 0o644) << 16
        archive.writestr(entry, item.read_bytes())
`
    const zip = spawnSync('python', ['-c', zipSource, stagingRoot, outputPath], { stdio: 'inherit' })
    if (zip.error) throw zip.error
    if (zip.status !== 0) throw new Error(`Could not create ${outputPath}`)
    console.log(`Built ${outputPath}`)
  } finally {
    await rm(stagingRoot, { recursive: true, force: true })
  }
}

await buildWebapp({
  id: 'inverted-pendulum',
  title: 'Inverted pendulum laboratory',
  componentPath: path.join('inverted-pendulum', 'InvertedPendulumLab.js'),
  outputPath: path.join(localDemosRoot, 'inverted-pendulum', 'InvertedPendulum.webapp.zip'),
})

await buildWebapp({
  id: 'lateral-motion',
  title: 'Bosch lateral motion laboratory',
  componentPath: path.join('lateral-motion', 'LateralMotionLab.js'),
  outputPath: path.join(localDemosRoot, 'bosch-lateral-motion', 'LateralMotionControl.webapp.zip'),
  vehiclePath: path.join(devAppRoot, 'lateral-motion', 'assets', 'crossover-suv.glb'),
})
