import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import sharp from 'sharp'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scratch = await mkdtemp(path.join(os.tmpdir(), 'pubburi-images-'))

try {
  const images = path.join(scratch, 'public', 'images')
  await mkdir(images, { recursive: true })
  await mkdir(path.join(scratch, 'scripts'))
  await writeFile(path.join(scratch, 'package.json'), '{"type":"module"}')
  await symlink(path.join(repoRoot, 'node_modules'), path.join(scratch, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
  await copyFile(path.join(repoRoot, 'scripts', 'optimize-images.mjs'), path.join(scratch, 'scripts', 'optimize-images.mjs'))

  const pixels = Buffer.alloc(40 * 20 * 3, 120)
  const input = () => sharp(pixels, { raw: { width: 40, height: 20, channels: 3 } })
  await input().png().toFile(path.join(images, 'sample.png'))
  await input().withMetadata({ orientation: 6 }).jpeg().toFile(path.join(images, 'rotated.jpg'))
  await promisify(execFile)(process.execPath, [path.join(scratch, 'scripts', 'optimize-images.mjs')])

  for (const [name, width, height] of [['sample', 40, 20], ['rotated', 20, 40]]) {
    const metadata = await sharp(await readFile(path.join(images, `${name}.webp`))).metadata()
    assert.equal(metadata.format, 'webp')
    assert.equal(metadata.width, width)
    assert.equal(metadata.height, height)
  }
  console.log('PNG and oriented JPEG conversion passed; repository assets were not modified.')
} finally {
  await rm(scratch, { recursive: true, force: true })
}
