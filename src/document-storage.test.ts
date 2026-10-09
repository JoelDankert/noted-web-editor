import { describe, expect, it, vi } from 'vitest'
import { DOCUMENT_STORAGE_KEY, restoreDocument, saveDocument } from './document-storage'

function memoryStorage(initial: string | null = null) {
  let value = initial
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => { value = next })
  }
}

describe('document storage', () => {
  it('saves and restores editor text under the namespaced key', () => {
    const storage = memoryStorage()

    saveDocument('notes\nthat persist', storage)

    expect(storage.setItem).toHaveBeenCalledTimes(1)
    expect(storage.setItem).toHaveBeenCalledWith(
      DOCUMENT_STORAGE_KEY,
      JSON.stringify({ version: 1, text: 'notes\nthat persist' })
    )
    expect(restoreDocument(storage)).toBe('notes\nthat persist')
  })

  it.each(['not json', '{}', '{"version":1,"text":42}', '{"version":2,"text":"old"}'])(
    'ignores malformed or unsupported data: %s',
    value => expect(restoreDocument(memoryStorage(value))).toBe('')
  )

  it('does not throw when storage is unavailable', () => {
    const storage = {
      getItem: vi.fn(() => { throw new Error('blocked') }),
      setItem: vi.fn(() => { throw new Error('full') })
    }

    expect(restoreDocument(storage)).toBe('')
    expect(() => saveDocument('text', storage)).not.toThrow()
  })
})
