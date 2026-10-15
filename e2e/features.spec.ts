import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test.beforeEach(async ({ page }) => {
  await page.goto('./')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test('shows a ghost result without changing text and Enter accepts it', async ({ page }) => {
  const editor = page.locator('.cm-content')
  await editor.fill('(sqrt(50)*sin(30°))/25.3=')
  await expect(page.locator('.cm-expression-result')).toHaveText('0.139744423159')
  await expect.poll(() => page.evaluate(() => {
    const stored = localStorage.getItem('noted-web-editor:document:v1')
    return stored ? JSON.parse(stored).text : null
  })).toBe('(sqrt(50)*sin(30°))/25.3=')
  await page.keyboard.press('Enter')
  await expect(editor).toHaveText('(sqrt(50)*sin(30°))/25.3=0.139744423159')
})


test('typing practice keeps the prompt stable while typing, advances after spaces, and shows WPM', async ({ page }) => {
  const editor = page.locator('.cm-content')
  await page.keyboard.press('Shift+Enter')
  const dialog = page.getByRole('dialog', { name: 'Einstellungen' })
  await dialog.getByRole('switch', { name: 'Tippgeschwindigkeit' }).click()
  await dialog.getByRole('switch', { name: 'Tippübung' }).click()
  await page.keyboard.press('Shift+Enter')

  const speed = page.getByTestId('typing-speed')
  const preview = page.locator('.typing-word')
  await expect(speed).toHaveText('0 WPM')
  await expect(preview).toHaveCount(5)
  const firstWords = await preview.allTextContents()

  await editor.press('Space')
  await expect.poll(() => preview.allTextContents()).not.toEqual(firstWords)
  const afterSpace = await preview.allTextContents()

  await editor.press('KeyX')
  await expect(preview).toHaveText(afterSpace)
  await editor.press('Space')
  await expect.poll(() => preview.allTextContents()).not.toEqual(afterSpace)
  const afterSecondSpace = await preview.allTextContents()
  await editor.press('Enter')
  await expect.poll(() => preview.allTextContents()).not.toEqual(afterSecondSpace)
  await expect(speed).not.toHaveText('0 WPM')
})

test('typing prompts wrap one word at a time on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 150, height: 720 })
  await page.keyboard.press('Shift+Enter')
  const dialog = page.getByRole('dialog', { name: 'Einstellungen' })
  await dialog.getByRole('switch', { name: 'Tippübung' }).click()
  await page.keyboard.press('Shift+Enter')

  const wordTops = await page.locator('.typing-word').evaluateAll(words => words.map(word => Math.round(word.getBoundingClientRect().top)))
  expect(new Set(wordTops).size).toBeGreaterThan(1)
})

test('computes arithmetic suffixes inside prose and after earlier equals', async ({ page }) => {
  const editor = page.locator('.cm-content')
  await editor.fill('hallo test blabla5*6=30/2=')
  await expect(page.locator('.cm-expression-result')).toHaveText('15')
  await page.keyboard.press('Enter')
  await expect(editor).toHaveText('hallo test blabla5*6=30/2=15')
  await editor.fill('hallo test blabla5*6=')
  await expect(page.locator('.cm-expression-result')).toHaveText('30')
})

test('does not offer invalid, selected, or non-caret expressions', async ({ page }) => {
  const editor = page.locator('.cm-content')
  await editor.fill('hello=')
  await expect(page.locator('.cm-expression-result')).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(page.locator('.cm-line')).toHaveCount(2)
  await editor.fill('1+2=x')
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('.cm-expression-result')).toHaveCount(0)
  await editor.fill('1+2=')
  await page.keyboard.press('Shift+ArrowLeft')
  await expect(page.locator('.cm-expression-result')).toHaveCount(0)
})

test('Noted Enter accepts a result but Vim normal mode leaves it untouched', async ({ page }) => {
  const editor = page.locator('.cm-content')
  await editor.fill('1+2=')
  await page.keyboard.down('AltRight')
  await page.keyboard.press('KeyV')
  await page.keyboard.up('AltRight')
  await expect(editor).toHaveText('1+2=3')

  await page.keyboard.press('Shift+Enter')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Space')
  await page.keyboard.press('Escape')
  await editor.fill('2+3=')
  await page.keyboard.press('Escape')
  await expect(page.locator('.cm-expression-result')).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(editor).toHaveText('2+3=')
})

test('file actions work as downloads even when native picker APIs throw', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: async () => { throw new DOMException('blocked', 'SecurityError') } })
    Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: async () => { throw new DOMException('blocked', 'SecurityError') } })
  })
  await page.reload()
  const editor = page.locator('.cm-content')
  await editor.fill('saved bytes äöü')
  await page.keyboard.press('Shift+Enter')
  const dialog = page.getByRole('dialog')
  const buttons = dialog.locator('button')
  await expect(buttons.first()).toHaveText('Datei öffnen')
  await expect(buttons.nth(1)).toHaveText('Datei speichern')
  await expect(buttons.first()).toBeFocused()
  await expect(dialog.getByRole('switch')).toHaveCount(6)
  await page.keyboard.press('ArrowDown')
  const downloadPromise = page.waitForEvent('download')
  await page.keyboard.press('Enter')
  const download = await downloadPromise
  const path = testInfo.outputPath('blocked-api-notiz.txt')
  await download.saveAs(path)
  expect(await readFile(path, 'utf8')).toBe('saved bytes äöü')
  await page.evaluate(() => localStorage.clear())
  await editor.fill('')
  await page.keyboard.press('Shift+Enter')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Datei öffnen' }).click()
  await (await chooser).setFiles({ name: 'notiz.txt', mimeType: 'text/plain', buffer: await readFile(path) })
  await expect(editor).toHaveText('saved bytes äöü')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('noted-web-editor:settings:v1'))).toBeNull()
})

test('saving downloads a real file and opens it after storage is cleared', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined })
    Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined })
    const original = URL.createObjectURL
    URL.createObjectURL = blob => {
      ;(window as typeof window & { downloadedText?: Promise<string> }).downloadedText = blob.text()
      return original(blob)
    }
  })
  await page.reload()
  const editor = page.locator('.cm-content')
  await editor.fill('real blob content')
  await page.keyboard.press('Shift+Enter')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Datei speichern', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('notiz.txt')
  const path = testInfo.outputPath('noted-export.txt')
  await download.saveAs(path)
  expect(await readFile(path, 'utf8')).toBe('real blob content')
  await expect.poll(() => page.evaluate(() => (window as typeof window & { downloadedText?: Promise<string> }).downloadedText)).toBe('real blob content')

  await page.evaluate(() => localStorage.clear())
  await editor.fill('')
  await page.keyboard.press('Shift+Enter')
  const chooser = page.waitForEvent('filechooser')
  await page.keyboard.press('Enter')
  await (await chooser).setFiles({ name: 'manual.txt', mimeType: 'text/plain', buffer: await readFile(path) })
  await expect(editor).toHaveText('real blob content')
})
