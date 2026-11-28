# Local Three.js demo build tooling

The app contract does not prescribe a bundler or a build command. Each checked-in
demo pipeline owns its app-specific bundling and asset generation; static app
ZIP creation is shared through `scripts/lib/webapp_archive.py`.

The archive helper requires a root `index.html`, rejects symlinks and other
non-regular entries, rejects a destination inside the source tree, and writes
sorted ZIP entries with fixed timestamps and file modes. Run its focused tests
with `npm run test:webapp-archive`.

The Jaxonomy DC Motor has a checked-in, app-specific build pipeline. The
Inverted Pendulum and Lateral Motion ZIPs are currently local demo artifacts.
Their only rebuild script hardcodes those two apps, so it remains in this
workspace only and is not exposed as a package script. New demos must not depend
on it: add a reproducible build command alongside the checked-in app or
introduce a genuinely shared, configuration-driven build path.
