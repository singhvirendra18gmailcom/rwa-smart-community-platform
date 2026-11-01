import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const dist = 'dist'
const page = await readFile(join(dist, 'index.html'), 'utf8')
assert.match(page, /rel=["']stylesheet["']/, 'Vite entry must load CSS eagerly on initial page load')

const assetsDir = join(dist, 'assets')
const cssFiles = (await readdir(assetsDir)).filter(name => name.endsWith('.css'))
assert.ok(cssFiles.length, 'Vite build must contain a CSS asset')

const styles = (await Promise.all(cssFiles.map(name =>
  readFile(join(assetsDir, name), 'utf8')
))).join('\n')

for (const selector of [
  '.webchat-root',
  '.webchat-header',
  '.webchat-row.resident',
  '.webchat-bubble',
  '.webchat-choices',
  '.webchat-choice-index',
  '.webchat-composer',
  '.webchat-send'
]) {
  assert.ok(styles.includes(selector), `Production CSS is missing ${selector}`)
}
console.log('Web complaint chat CSS is bundled and linked from production index.html.')
