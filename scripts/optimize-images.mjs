import { readdir, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const imageRoot = path.join(repoRoot, 'public', 'images')
const require = createRequire(path.join(repoRoot, 'package.json'))
const sharp = require('sharp')
const minBytes = 0

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) return walk(fullPath)
      return /\.(png|jpe?g)$/i.test(entry.name) ? [fullPath] : []
    }),
  )
  return files.flat()
}

async function optimize(file) {
  const sourceStat = await stat(file)
  if (sourceStat.size < minBytes) return null

  const output = file.replace(/\.(png|jpe?g)$/i, '.webp')
  let outputStat = null
  try {
    outputStat = await stat(output)
  } catch {
    outputStat = null
  }

  if (outputStat && outputStat.mtimeMs >= sourceStat.mtimeMs) {
    return { file, output, source: sourceStat.size, webp: outputStat.size, skipped: true }
  }

  await sharp(file)
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 78, effort: 4 })
    .toFile(output)

  outputStat = await stat(output)
  return { file, output, source: sourceStat.size, webp: outputStat.size, skipped: false }
}

const results = (await Promise.all((await walk(imageRoot)).map(optimize))).filter(Boolean)
const sourceTotal = results.reduce((sum, item) => sum + item.source, 0)
const webpTotal = results.reduce((sum, item) => sum + item.webp, 0)

for (const item of results) {
  const relSource = path.relative(repoRoot, item.file)
  const relOutput = path.relative(repoRoot, item.output)
  const delta = item.source ? Math.round((1 - item.webp / item.source) * 100) : 0
  console.log(`${item.skipped ? 'skip' : 'write'} ${relOutput} (${delta}% smaller than ${relSource})`)
}

if (results.length) {
  const delta = sourceTotal ? Math.round((1 - webpTotal / sourceTotal) * 100) : 0
  console.log(`Optimized ${results.length} images: ${sourceTotal} -> ${webpTotal} bytes (${delta}% smaller).`)
} else {
  console.log('No images above threshold.')
}
