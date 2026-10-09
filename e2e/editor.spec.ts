import { test, expect } from '@playwright/test'

test('types Noted level 1, repeats, and keeps clipboard shortcut untouched', async ({ page }) => {
  await page.goto('./')
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
  await page.goto('./')
  const editor = page.locator('.cm-content')
  await editor.click()
  await page.keyboard.down('Quote')
  await page.keyboard.press('KeyE')
  await page.keyboard.up('Quote')
  await page.keyboard.press('KeyE')
  await expect(editor).toHaveText('[u')
})

test('uses CapsLock only while held as Mod3 and then releases it', async ({ page }) => {
  await page.goto('./')
  const editor = page.locator('.cm-content')
  await editor.click()
  await page.keyboard.down('CapsLock')
  await page.keyboard.press('KeyE')
  await page.keyboard.up('CapsLock')
  await page.keyboard.press('KeyE')
  await expect(editor).toHaveText('[u')
})

test('shows only the editor and line numbers', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('#app > main > #editor')).toBeVisible()
  await expect(page.locator('header, footer, aside, .badge, .notice, .statusbar')).toHaveCount(0)
  await expect(page.locator('.cm-lineNumbers')).toBeVisible()
  await expect(page.locator('.cm-gutterElement').filter({ hasText: /^1$/ })).toBeVisible()
})

test('uses distinct bright colors for dark-mode syntax tokens', async ({ page }) => {
  await page.goto('./')
  const editor = page.locator('.cm-content')
  await editor.click()
  await page.keyboard.insertText('const greeting = "hello world"; // readable comment')
  await expect.poll(async () => editor.locator('span').evaluateAll(elements =>
    [...new Set(elements.map(element => getComputedStyle(element).color))]
  )).toEqual(expect.arrayContaining(['rgb(255, 155, 242)', 'rgb(185, 246, 165)', 'rgb(184, 192, 204)']))
})

test('uses Mod4 navigation and shift selection', async ({ page }) => {
  await page.goto('./')
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
  await page.goto('./')
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
  await page.goto('./')
  const editor = page.locator('.cm-content')
  await editor.click()
  await editor.dispatchEvent('compositionstart', { data: '' })
  await editor.dispatchEvent('compositionend', { data: '漢' })
  await expect(editor).toBeVisible()
})
