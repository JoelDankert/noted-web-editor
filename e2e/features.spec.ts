import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

type SavePickerState = {
  calls: Array<{ suggestedName?: string }>
  writes: Array<{ name: string, bytes: number[] }>
}

const installSavePickerMock = async (page: import('@playwright/test').Page, names = ['erste.txt', 'zweite.txt']) => {
  await page.addInitScript(fileNames => {
    const state = {
      calls: [] as Array<Record<string, unknown>>,
      writes: [] as Array<{ name: string, bytes: number[] }>,
      names: fileNames
    }
    ;(window as typeof window & { savePickerState: typeof state }).savePickerState = state
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: async function (this: Window, options: Record<string, unknown>) {
        if (this !== window) throw new DOMException('wrong receiver', 'SecurityError')
        const name = state.names[state.calls.length] ?? state.names.at(-1)!
        state.calls.push(options)
        return {
          kind: 'file', name,
          createWritable: async () => {
            let bytes: number[] = []
            return {
              write: async (text: string) => { bytes = [...new TextEncoder().encode(text)] },
              close: async () => { state.writes.push({ name, bytes }) }
            }
          }
        }
      }
    })
  }, names)
  await page.reload()
}

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
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Space')
  await page.keyboard.press('Escape')
  await editor.fill('2+3=')
  await page.keyboard.press('Escape')
  await expect(page.locator('.cm-expression-result')).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(editor).toHaveText('2+3=')
})

test('file actions are first and work even when native picker APIs throw', async ({ page }, testInfo) => {
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
  await expect(buttons.nth(2)).toHaveText('Speichern unter')
  await expect(buttons.first()).toBeFocused()
  await expect(dialog.getByRole('switch')).toHaveCount(4)
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

test('native save picker writes UTF-8, reuses its handle, and Save As replaces it', async ({ page }) => {
  await installSavePickerMock(page)
  const editor = page.locator('.cm-content')
  await editor.fill('Grüße 🌍')
  await page.keyboard.press('Shift+Enter')
  await page.getByRole('button', { name: 'Datei speichern', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => (window as Window & { savePickerState: SavePickerState }).savePickerState.calls.length)).toBe(1)
  expect(await page.evaluate(() => (window as Window & { savePickerState: SavePickerState }).savePickerState.calls[0])).toMatchObject({
    suggestedName: 'notiz.txt',
    types: [{ accept: { 'text/plain': ['.txt'] } }]
  })
  expect(await page.evaluate(() => (window as Window & { savePickerState: SavePickerState }).savePickerState.writes[0].bytes))
    .toEqual([...Buffer.from('Grüße 🌍')])

  await editor.fill('überschrieben')
  await page.keyboard.press('Shift+Enter')
  await page.getByRole('button', { name: 'Datei speichern', exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as Window & { savePickerState: SavePickerState }).savePickerState.writes.length)).toBe(2)
  expect(await page.evaluate(() => (window as Window & { savePickerState: SavePickerState }).savePickerState.calls.length)).toBe(1)

  await page.keyboard.press('Shift+Enter')
  await page.getByRole('button', { name: 'Speichern unter' }).click()
  await expect.poll(() => page.evaluate(() => (window as Window & { savePickerState: SavePickerState }).savePickerState.calls.length)).toBe(2)
  expect(await page.evaluate(() => (window as Window & { savePickerState: SavePickerState }).savePickerState.calls[1].suggestedName)).toBe('erste.txt')
  expect(await page.evaluate(() => (window as Window & { savePickerState: SavePickerState }).savePickerState.writes.at(-1)?.name)).toBe('zweite.txt')
})

test('canceling Save As keeps the old destination and dialog open', async ({ page }) => {
  await installSavePickerMock(page, ['bleibt.txt'])
  const editor = page.locator('.cm-content')
  await editor.fill('eins')
  await page.keyboard.press('Shift+Enter')
  await page.getByRole('button', { name: 'Datei speichern', exact: true }).click()
  await page.evaluate(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: async () => { throw new DOMException('cancelled', 'AbortError') } })
  })
  await page.keyboard.press('Shift+Enter')
  await page.getByRole('button', { name: 'Speichern unter' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('')
  await page.keyboard.press('Escape')
  await editor.fill('zwei')
  await page.keyboard.press('Shift+Enter')
  await page.getByRole('button', { name: 'Datei speichern', exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as Window & { savePickerState: SavePickerState }).savePickerState.writes.length)).toBe(2)
  expect(await page.evaluate(() => (window as Window & { savePickerState: SavePickerState }).savePickerState.writes.at(-1)?.name)).toBe('bleibt.txt')
})

test('a failed native write stays visible and does not download a second copy', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: async () => ({
      kind: 'file', name: 'fehler.txt',
      createWritable: async () => ({ write: async () => { throw new Error('Datenträger voll') }, close: async () => {} })
    }) })
  })
  await page.reload()
  await page.locator('.cm-content').fill('nicht doppelt speichern')
  await page.keyboard.press('Shift+Enter')
  let downloaded = false
  page.on('download', () => { downloaded = true })
  await page.getByRole('button', { name: 'Datei speichern', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Datenträger voll')
  await page.waitForTimeout(100)
  expect(downloaded).toBe(false)
})

test('opening a replacement file clears the previous save destination', async ({ page }) => {
  await installSavePickerMock(page)
  const editor = page.locator('.cm-content')
  await editor.fill('alt')
  await page.keyboard.press('Shift+Enter')
  await page.getByRole('button', { name: 'Datei speichern', exact: true }).click()

  await page.keyboard.press('Shift+Enter')
  let chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Datei öffnen' }).click()
  page.once('dialog', dialog => dialog.dismiss())
  await (await chooser).setFiles({ name: 'verworfen.txt', mimeType: 'text/plain', buffer: Buffer.from('verworfen') })
  await expect(editor).toHaveText('alt')
  await page.getByRole('button', { name: 'Datei speichern', exact: true }).click()
  expect(await page.evaluate(() => (window as Window & { savePickerState: SavePickerState }).savePickerState.calls.length)).toBe(1)

  await page.keyboard.press('Shift+Enter')
  chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Datei öffnen' }).click()
  page.once('dialog', dialog => dialog.accept())
  await (await chooser).setFiles({ name: 'geöffnet.txt', mimeType: 'text/plain', buffer: Buffer.from('neu') })
  await expect(editor).toHaveText('neu')
  await page.keyboard.press('Shift+Enter')
  await page.getByRole('button', { name: 'Datei speichern', exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as Window & { savePickerState: SavePickerState }).savePickerState.calls.length)).toBe(2)
  expect(await page.evaluate(() => (window as Window & { savePickerState: SavePickerState }).savePickerState.calls[1].suggestedName)).toBe('geöffnet.txt')
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
  await page.keyboard.press('ArrowDown')
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
  const chooser = page.waitForEvent('filechooser')
  await page.keyboard.press('Enter')
  await (await chooser).setFiles({ name: 'manual.txt', mimeType: 'text/plain', buffer: await readFile(path) })
  await expect(editor).toHaveText('real blob content')
})
