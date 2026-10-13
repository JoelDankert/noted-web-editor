import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, restoreSettings, saveSettings } from './settings-storage'

function memoryStorage(initial: string | null = null) {
  let value = initial
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => { value = next })
  }
}

describe('settings storage', () => {
  it('saves and restores settings separately under a versioned key', () => {
    const storage = memoryStorage()
    const settings = { syntaxHighlighting: false, notedKeyboard: false, vim: true }

    saveSettings(settings, storage)

    expect(storage.setItem).toHaveBeenCalledWith(SETTINGS_STORAGE_KEY, JSON.stringify({ version: 1, ...settings }))
    expect(restoreSettings(storage)).toEqual(settings)
  })

  it.each([null, 'not json', '{}', '{"version":2,"vim":true}', '[]'])('uses defaults for malformed or unsupported data: %s', value => {
    expect(restoreSettings(memoryStorage(value))).toEqual(DEFAULT_SETTINGS)
  })

  it('accepts only boolean fields and defaults invalid fields independently', () => {
    const stored = JSON.stringify({ version: 1, syntaxHighlighting: false, notedKeyboard: 'no', vim: 1 })
    expect(restoreSettings(memoryStorage(stored))).toEqual({ syntaxHighlighting: false, notedKeyboard: true, vim: false })
  })

  it('handles unavailable storage without throwing', () => {
    const storage = {
      getItem: vi.fn(() => { throw new Error('blocked') }),
      setItem: vi.fn(() => { throw new Error('full') })
    }
    expect(restoreSettings(storage)).toEqual(DEFAULT_SETTINGS)
    expect(() => saveSettings({ ...DEFAULT_SETTINGS }, storage)).not.toThrow()
  })
})
