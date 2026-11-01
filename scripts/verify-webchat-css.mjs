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
  '.webchat-input-row',
  '.webchat-credit',
  '.webchat-send'
]) {
  assert.ok(styles.includes(selector), `Production CSS is missing ${selector}`)
}
console.log('Web complaint chat CSS is bundled and linked from production index.html.')

const component = await readFile('src/WebComplaintChat.jsx', 'utf8')
const stylesheet = await readFile('src/WebComplaintChat.css', 'utf8')
assert.match(
  component,
  /<footer className="webchat-footer">[\s\S]*?<div className="webchat-input-row">[\s\S]*?<ChatComposer[\s\S]*?<\/div>[\s\S]*?<div className="webchat-credit">/,
  'Composer and attribution must be separate, ordered footer rows'
)
assert.match(
  stylesheet,
  /grid-template-rows:\s*auto auto/,
  'The footer must explicitly reserve a separate row for the credit'
)
assert.match(
  stylesheet,
  /\.webchat-root \.webchat-credit\s*\{[^}]*grid-row:\s*2/,
  'The attribution must occupy row 2 below the input'
)
console.log('Web chat composer and attribution are independent full-width rows.')
