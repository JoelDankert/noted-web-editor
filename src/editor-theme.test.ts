import { describe, expect, it } from 'vitest'
import { DARK_SYNTAX_COLORS } from './editor-theme'

describe('dark syntax palette', () => {
  it('keeps every syntax color bright against the editor background', () => {
    for (const [token, hex] of Object.entries(DARK_SYNTAX_COLORS)) {
      const channels = hex.match(/[\da-f]{2}/gi)!.map(value => Number.parseInt(value, 16))
      const brightness = channels.reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
      expect(brightness, token).toBeGreaterThan(175)
    }
  })

  it('preserves visually distinct token groups', () => {
    expect(new Set(Object.values(DARK_SYNTAX_COLORS)).size).toBe(Object.values(DARK_SYNTAX_COLORS).length)
  })
})
