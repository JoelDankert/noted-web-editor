import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('./')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test('types Noted level 1, repeats, and keeps clipboard shortcut untouched', async ({ page }) => {
  const editor = page.locator('.cm-content')
  await editor.click()
  await page.keyboard.press('KeyQ')
  await page.keyboard.down('KeyW'); await page.keyboard.press('KeyW'); await page.keyboard.up('KeyW')
  await expect(editor).toHaveText('zyy')
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Control+C')
  await expect(editor).toHaveText('zyy')
})

test('uses held right Mod3 and releases it', async ({ page }) => {
  const editor = page.locator('.cm-content')
  await editor.click()
  await page.keyboard.down('Quote')
  await page.keyboard.press('KeyE')
  await page.keyboard.up('Quote')
  await page.keyboard.press('KeyE')
  await expect(editor).toHaveText('[u')
})

test('uses CapsLock only while held as Mod3 and then releases it', async ({ page }) => {
  const editor = page.locator('.cm-content')
  await editor.click()
  await page.keyboard.down('CapsLock')
  await page.keyboard.press('KeyE')
  await page.keyboard.up('CapsLock')
  await page.keyboard.press('KeyE')
  await expect(editor).toHaveText('[u')
})

test('shows only the editor and line numbers', async ({ page }) => {
  await expect(page.locator('#app > main > #editor')).toBeVisible()
  await expect(page.locator('.settings-overlay')).toHaveCount(0)
  await expect(page.locator('header, footer, aside, .badge, .notice, .statusbar')).toHaveCount(0)
  await expect(page.locator('.cm-lineNumbers')).toBeVisible()
  await expect(page.locator('.cm-gutterElement').filter({ hasText: /^1$/ })).toBeVisible()
})

test('uses distinct bright colors for dark-mode syntax tokens', async ({ page }) => {
  const editor = page.locator('.cm-content')
  await editor.click()
  await page.keyboard.insertText('const greeting = "hello world"; // readable comment')
  await expect.poll(async () => editor.locator('span').evaluateAll(elements =>
    [...new Set(elements.map(element => getComputedStyle(element).color))]
  )).toEqual(expect.arrayContaining(['rgb(255, 155, 242)', 'rgb(185, 246, 165)', 'rgb(184, 192, 204)']))
})

test('Shift+Enter toggles syntax highlighting without changing text or inserting a newline', async ({ page }) => {
  const editor = page.locator('.cm-content')
  const text = 'const greeting = "hello world"; // readable comment'
  await editor.fill(text)
  const tokenColors = () => editor.locator('.cm-line span').evaluateAll(elements =>
    elements.map(element => getComputedStyle(element).color)
  )
  await expect.poll(tokenColors).toContain('rgb(255, 155, 242)')
  await page.keyboard.press('Shift+Enter')
  await expect(editor).toHaveText(text)
  await expect.poll(tokenColors).not.toContain('rgb(255, 155, 242)')
  await editor.fill('const updated = "highlight me";')
  await expect.poll(tokenColors).not.toContain('rgb(255, 155, 242)')
  await page.keyboard.press('Shift+Enter')
  await expect(editor).toHaveText('const updated = "highlight me";')
  await expect.poll(tokenColors).toContain('rgb(255, 155, 242)')
})

test('opens and operates the three-toggle settings using only the keyboard', async ({ page }) => {
  const editor = page.locator('.cm-content')
  await editor.fill('unchanged text')
  await page.keyboard.press('Control+Home')
  await page.keyboard.press('Shift+ArrowRight')

  await page.keyboard.press('Escape')
  const dialog = page.getByRole('dialog', { name: 'Einstellungen' })
  await expect(dialog).toBeVisible()
  const toggles = dialog.getByRole('switch')
  await expect(toggles).toHaveCount(3)
  await expect(toggles).toHaveText(['Syntaxhervorhebungan', 'Noted-Tastaturemulationan', 'Vimaus'])
  await expect(toggles.nth(0)).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(toggles.nth(1)).toBeFocused()
  await page.keyboard.press('Space')
  await expect(dialog.getByRole('switch').nth(1)).toHaveAttribute('aria-checked', 'false')
  await page.keyboard.press('Escape')

  await expect(dialog).toHaveCount(0)
  await expect(editor).toBeFocused()
  await expect(editor).toHaveText('unchanged text')
  await page.keyboard.press('Backspace')
  await expect(editor).toHaveText('nchanged text')
})

test('persists overlay settings across reload and restores syntax highlighting', async ({ page }) => {
  const editor = page.locator('.cm-content')
  await editor.fill('const greeting = "hello";')
  await expect.poll(() => editor.locator('span').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).color)))
    .toContain('rgb(255, 155, 242)')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Space')
  await page.keyboard.press('Escape')
  await expect.poll(() => editor.locator('span').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).color)))
    .not.toContain('rgb(255, 155, 242)')

  await page.reload()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('switch').nth(0)).toHaveAttribute('aria-checked', 'false')
  await page.keyboard.press('Space')
  await page.keyboard.press('Escape')
  await expect.poll(() => page.locator('.cm-content span').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).color)))
    .toContain('rgb(255, 155, 242)')
})

test('turns physical Noted emulation off and back on immediately', async ({ page }) => {
  const editor = page.locator('.cm-content')
  await page.keyboard.press('KeyQ')
  await expect(editor).toHaveText('z')
  await page.keyboard.press('Escape')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape')
  await page.keyboard.press('KeyQ')
  await expect(editor).toHaveText('zq')
  await page.keyboard.press('Escape')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Space')
  await page.keyboard.press('Escape')
  await page.keyboard.press('KeyQ')
  await expect(editor).toHaveText('zqz')
})

test('supports Vim insert, normal movement, visual mode, and settings Escape', async ({ page }) => {
  const editor = page.locator('.cm-content')
  await editor.fill('abc')
  await page.keyboard.press('Escape')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Space')
  await page.keyboard.press('Escape')

  await page.keyboard.press('KeyI')
  await page.keyboard.press('KeyD')
  await expect(editor).toHaveText('abci')
  await page.keyboard.press('Escape')
  await page.keyboard.press('KeyH')
  await page.keyboard.press('KeyV')
  await page.keyboard.press('KeyL')
  await expect(page.locator('.cm-selectionBackground')).not.toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Einstellungen' })).toBeVisible()
  await expect(editor).toHaveText('abci')
})

test('Vim insert mode keeps Noted emulation when both switches are on', async ({ page }) => {
  const editor = page.locator('.cm-content')
  await page.keyboard.press('Escape')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Space')
  await page.keyboard.press('Escape')
  await page.keyboard.press('KeyI')
  await page.keyboard.press('KeyQ')
  await expect(editor).toHaveText('z')
  await page.keyboard.press('Escape')
  await page.keyboard.press('KeyH')
  await expect(editor).toHaveText('z')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Einstellungen' })).toBeVisible()
})

test('restores Vim and emulation preferences after reload', async ({ page }) => {
  await page.keyboard.press('Escape')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Space')
  await page.keyboard.press('Escape')
  await page.reload()

  const editor = page.locator('.cm-content')
  await page.keyboard.press('KeyI')
  await page.keyboard.press('KeyQ')
  await expect(editor).toHaveText('q')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('switch').nth(1)).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByRole('switch').nth(2)).toHaveAttribute('aria-checked', 'true')
})

test('uses Mod4 navigation and shift selection', async ({ page }) => {
  const editor = page.locator('.cm-content')
  await editor.click()
  await page.keyboard.type('abc')
  await page.keyboard.down('AltRight')
  await page.keyboard.press('KeyS')
  await page.keyboard.down('Shift'); await page.keyboard.press('KeyS'); await page.keyboard.up('Shift')
  await page.keyboard.up('AltRight')
  await page.keyboard.press('KeyQ')
  // "abc" itself is translated from the physical keys to "cöü".
  await expect(editor).toHaveText('czü')
})

test('unsupported layers and dead slots do not leak physical QWERTZ characters', async ({ page }) => {
  const editor = page.locator('.cm-content')
  await editor.click()
  await page.keyboard.down('Quote')
  await page.keyboard.down('Shift')
  await page.keyboard.press('KeyQ')
  await page.keyboard.up('Shift')
  await page.keyboard.down('AltRight')
  await page.keyboard.press('KeyQ')
  await page.keyboard.up('AltRight')
  await page.keyboard.up('Quote')
  await page.keyboard.press('Backslash')
  await expect(editor).toHaveText('')
})

test('does not translate synthetic composition input', async ({ page }) => {
  const editor = page.locator('.cm-content')
  await editor.click()
  await editor.dispatchEvent('compositionstart', { data: '' })
  await editor.dispatchEvent('compositionend', { data: '漢' })
  await expect(editor).toBeVisible()
})

test('highlights a short JavaScript snippet without waiting for 24 characters', async ({ page }) => {
  const editor = page.locator('.cm-content')
  await editor.fill('const x = 1;')
  await expect.poll(async () => editor.locator('span').evaluateAll(elements =>
    elements.map(element => getComputedStyle(element).color)
  )).toContain('rgb(255, 155, 242)')
})

test('restores syntax highlighting immediately after refreshing a saved document', async ({ page }) => {
  const editor = page.locator('.cm-content')
  await editor.fill('const greeting = "hello world"; // readable comment')
  await expect.poll(async () => editor.locator('span').evaluateAll(elements =>
    elements.map(element => getComputedStyle(element).color)
  )).toContain('rgb(255, 155, 242)')
  await page.reload()
  await expect(page.locator('.cm-content')).toContainText('const greeting')
  await expect.poll(async () => page.locator('.cm-content span').evaluateAll(elements =>
    elements.map(element => getComputedStyle(element).color)
  )).toContain('rgb(255, 155, 242)')
})

test('Ctrl+Enter opens a Google search for only the current cursor line', async ({ page }) => {
  const editor = page.locator('.cm-content')
  await editor.fill('first line\n  C++ & TypeScript  \nlast line')
  await page.locator('.cm-line').nth(1).click()
  const popupPromise = page.waitForEvent('popup')
  await page.keyboard.press('Control+Enter')
  const popup = await popupPromise
  await expect.poll(() => popup.url()).toBe('https://www.google.com/search?q=C%2B%2B%20%26%20TypeScript')
  await expect(page.locator('.cm-line')).toHaveText(['first line', '  C++ & TypeScript  ', 'last line'])
  await popup.close()
})

test('Ctrl+Enter searches only selected text instead of the whole cursor line', async ({ page }) => {
  const editor = page.locator('.cm-content')
  await editor.fill('alpha beta gamma\nlast line')
  await editor.click()
  await page.keyboard.press('Control+Home')
  for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowRight')
  await page.evaluate(() => { window.open = (url) => { document.documentElement.dataset.searchUrl = String(url); return null } })
  await page.keyboard.press('Control+Enter')
  await expect(page.locator('html')).toHaveAttribute('data-search-url', 'https://www.google.com/search?q=alpha')
  await expect(page.locator('.cm-line')).toHaveText(['alpha beta gamma', 'last line'])
})

test('Ctrl+Enter searches a multi-line selection including its line break', async ({ page }) => {
  const editor = page.locator('.cm-content')
  await editor.fill('alpha\nbeta')
  await editor.click()
  await page.keyboard.press('Control+A')
  await page.evaluate(() => { window.open = (url) => { document.documentElement.dataset.searchUrl = String(url); return null } })
  await page.keyboard.press('Control+Enter')
  await expect(page.locator('html')).toHaveAttribute('data-search-url', 'https://www.google.com/search?q=alpha%0Abeta')
  await expect(page.locator('.cm-line')).toHaveText(['alpha', 'beta'])
})

test('Ctrl+Enter on an empty line opens no tab and inserts no newline', async ({ page, context }) => {
  const editor = page.locator('.cm-content')
  await editor.fill('first line\n   \nlast line')
  await page.locator('.cm-line').nth(1).click()
  const before = context.pages().length
  await page.keyboard.press('Control+Enter')
  await expect(page.locator('.cm-line')).toHaveText(['first line', '   ', 'last line'])
  expect(context.pages()).toHaveLength(before)
})

test('restores editor content after a page reload', async ({ page }) => {
  const editor = page.locator('.cm-content')
  await editor.fill('A persistent local note.\nSecond line.')

  await expect.poll(() => page.evaluate(() => localStorage.getItem('noted-web-editor:document:v1')))
    .toContain('A persistent local note.')
  await page.reload()

  await expect(page.locator('.cm-line')).toHaveText(['A persistent local note.', 'Second line.'])
})
