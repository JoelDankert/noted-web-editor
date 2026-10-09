export const DOCUMENT_STORAGE_KEY = 'noted-web-editor:document:v1'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

interface StoredDocument {
  version: 1
  text: string
}

export function restoreDocument(storage?: StorageLike): string {
  try {
    const value = (storage ?? window.localStorage).getItem(DOCUMENT_STORAGE_KEY)
    if (value === null) return ''

    const document = JSON.parse(value) as Partial<StoredDocument> | null
    return document?.version === 1 && typeof document.text === 'string' ? document.text : ''
  } catch {
    return ''
  }
}

export function saveDocument(text: string, storage?: StorageLike): void {
  try {
    const document: StoredDocument = { version: 1, text }
    ;(storage ?? window.localStorage).setItem(DOCUMENT_STORAGE_KEY, JSON.stringify(document))
  } catch {
    // Storage can be unavailable (for example in private browsing or under a strict policy).
  }
}
