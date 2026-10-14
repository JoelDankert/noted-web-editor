export const SETTINGS_STORAGE_KEY = 'noted-web-editor:settings:v1'

export interface EditorSettings {
  syntaxHighlighting: boolean
  notedKeyboard: boolean
  vim: boolean
  relativeLineNumbers: boolean
  typingSpeed: boolean
  typingPractice: boolean
}

export const DEFAULT_SETTINGS: Readonly<EditorSettings> = {
  syntaxHighlighting: true,
  notedKeyboard: true,
  vim: false,
  relativeLineNumbers: false,
  typingSpeed: false,
  typingPractice: false
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

export function restoreSettings(storage?: StorageLike): EditorSettings {
  try {
    const value = (storage ?? window.localStorage).getItem(SETTINGS_STORAGE_KEY)
    if (value === null) return { ...DEFAULT_SETTINGS }

    const stored = JSON.parse(value) as Record<string, unknown> | null
    if (!stored || stored.version !== 1) return { ...DEFAULT_SETTINGS }
    return {
      syntaxHighlighting: typeof stored.syntaxHighlighting === 'boolean' ? stored.syntaxHighlighting : DEFAULT_SETTINGS.syntaxHighlighting,
      notedKeyboard: typeof stored.notedKeyboard === 'boolean' ? stored.notedKeyboard : DEFAULT_SETTINGS.notedKeyboard,
      vim: typeof stored.vim === 'boolean' ? stored.vim : DEFAULT_SETTINGS.vim,
      relativeLineNumbers: typeof stored.relativeLineNumbers === 'boolean' ? stored.relativeLineNumbers : DEFAULT_SETTINGS.relativeLineNumbers,
      typingSpeed: typeof stored.typingSpeed === 'boolean' ? stored.typingSpeed : DEFAULT_SETTINGS.typingSpeed,
      typingPractice: typeof stored.typingPractice === 'boolean' ? stored.typingPractice : DEFAULT_SETTINGS.typingPractice
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: EditorSettings, storage?: StorageLike): void {
  try {
    ;(storage ?? window.localStorage).setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ version: 1, ...settings }))
  } catch {
    // Storage may be disabled or full. Settings still apply for this session.
  }
}
