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
  await page.keyboard.press('Space')
  await page.keyboard.press('Escape')
  await editor.fill('2+3=')
  await page.keyboard.press('Escape')
  await expect(page.locator('.cm-expression-result')).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(editor).toHaveText('2+3=')
})

test('file actions are keyboard rows, roundtrip a mocked native handle, and leave settings untouched', async ({ page }) => {
  await page.addInitScript(() => {
    let contents = ''
    const handle = {
      name: 'note.txt',
      async createWritable() { return { async write(value: string) { contents = value }, async close() {} } },
      async getFile() { return new File([contents], 'note.txt', { type: 'text/plain' }) }
    }
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: async () => handle })
    Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: async () => [handle] })
  })
  await page.reload()
  const editor = page.locator('.cm-content')
  await editor.fill('saved bytes äöü')
  await page.keyboard.press('Shift+Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('switch')).toHaveCount(4)
  await expect(dialog.getByRole('button', { name: 'Datei öffnen' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Datei speichern' })).toBeVisible()
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(dialog).toHaveCount(0)
  await editor.fill('temporary')
  await page.keyboard.press('Shift+Enter')
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown')
  page.once('dialog', prompt => prompt.accept())
  await page.keyboard.press('Space')
  await expect(editor).toHaveText('saved bytes äöü')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('noted-web-editor:settings:v1'))).toBeNull()
})

test('fallback downloads a real file and opens it after storage is cleared', async ({ page }, testInfo) => {
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
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown')
  const downloadPromise = page.waitForEvent('download')
  await page.keyboard.press('Space')
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('notiz.txt')
  const path = testInfo.outputPath('noted-export.txt')
  await download.saveAs(path)
  expect(await readFile(path, 'utf8')).toBe('real blob content')
  await expect.poll(() => page.evaluate(() => (window as typeof window & { downloadedText?: Promise<string> }).downloadedText)).toBe('real blob content')

  await page.evaluate(() => localStorage.clear())
  await editor.fill('')
  await page.keyboard.press('Shift+Enter')
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown')
  const chooser = page.waitForEvent('filechooser')
  await page.keyboard.press('Enter')
  await (await chooser).setFiles({ name: 'manual.txt', mimeType: 'text/plain', buffer: await readFile(path) })
  await expect(editor).toHaveText('real blob content')
})
