import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const publicMarkdownRoots = ['README.md', 'SUMMARY.md', 'CHANGELOG.md', 'docs']
const externalScheme = /^(?:https?:|mailto:|tel:|#|\/)/i
const markdownLinkPattern = /!?(?:\[[^\]]*\])\(([^)]+)\)/g
const imagePattern = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi
const privateDocumentationPattern = /(?:^|[(/`])dev\//i

function collectMarkdownFiles(relativePath) {
  const absolutePath = path.join(root, relativePath)
  if (!fs.existsSync(absolutePath)) return []

  const stat = fs.statSync(absolutePath)
  if (stat.isFile()) return [absolutePath]

  return fs.readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
    const childPath = path.join(relativePath, entry.name)
    if (entry.isDirectory()) return collectMarkdownFiles(childPath)
    return entry.name.toLowerCase().endsWith('.md') ? [path.join(root, childPath)] : []
  })
}

function normalizeTarget(rawTarget) {
  const target = rawTarget.trim().replace(/^<|>$/g, '')
  const titleMatch = target.match(/^(\S+)(?:\s+["'].*["'])$/)
  return titleMatch ? titleMatch[1] : target
}

function checkTarget(file, rawTarget, errors) {
  const target = normalizeTarget(rawTarget)
  if (!target || externalScheme.test(target)) return

  const cleanTarget = target.split('#', 1)[0].split('?', 1)[0]
  if (!cleanTarget) return

  let decodedTarget
  try {
    decodedTarget = decodeURIComponent(cleanTarget)
  } catch {
    errors.push(`${path.relative(root, file)}: invalid encoded target ${target}`)
    return
  }

  const resolved = path.resolve(path.dirname(file), decodedTarget)
  const relativeResolved = path.relative(root, resolved)
  if (relativeResolved.startsWith('..') || path.isAbsolute(relativeResolved)) {
    errors.push(`${path.relative(root, file)}: target escapes repository ${target}`)
    return
  }

  if (!fs.existsSync(resolved)) {
    errors.push(`${path.relative(root, file)}: missing target ${target}`)
  }
}

const markdownFiles = [...new Set(publicMarkdownRoots.flatMap(collectMarkdownFiles))]
const errors = []

for (const file of markdownFiles) {
  const content = fs.readFileSync(file, 'utf8')
  content.split(/\r?\n/).forEach((line, index) => {
    if (privateDocumentationPattern.test(line)) {
      errors.push(`${path.relative(root, file)}:${index + 1}: private dev/ documentation must not be referenced publicly`)
    }

    for (const match of line.matchAll(markdownLinkPattern)) checkTarget(file, match[1], errors)
    for (const match of line.matchAll(imagePattern)) checkTarget(file, match[1], errors)
  })
}

if (errors.length > 0) {
  console.error('Public documentation check failed:')
  errors.forEach((error) => console.error(`- ${error}`))
  process.exitCode = 1
} else {
  console.log(`Public documentation check passed (${markdownFiles.length} Markdown files).`)
}
