import { describe, expect, it } from 'vitest'
import { activeLayer, isLayoutModifier, NOTED_MAP, translateCode } from './noted-layout'

describe('official Noted mapping', () => {
  it('has a result or an intentional dead/unmapped value on every mapped key and level', () => {
    for (const [code, levels] of Object.entries(NOTED_MAP)) {
      expect(levels, code).toHaveLength(4)
      levels.forEach((expected, index) => {
        const layer = (index + 1) as 1 | 2 | 3 | 4
        const actual = translateCode(code, { shift: layer === 2, mod3: layer === 3, mod4: layer === 4 })
        if (expected && expected !== 'Dead') expect(actual, `${code} L${layer}`).toMatchObject({ value: expected, layer })
        else expect(actual, `${code} L${layer}`).toBeNull()
      })
    }
  })
  it('uses German physical positions', () => {
    expect(translateCode('KeyY', { shift: false, mod3: false, mod4: false })?.value).toBe('p')
    expect(translateCode('KeyZ', { shift: false, mod3: false, mod4: false })?.value).toBe('v')
  })
  it('tracks modifier combinations and declines unsupported layers/shortcuts/IME', () => {
    expect(activeLayer({ shift: false, mod3: true, mod4: false })).toBe(3)
    expect(activeLayer({ shift: true, mod3: false, mod4: true })).toBe(4)
    expect(activeLayer({ shift: true, mod3: true, mod4: false })).toBeNull()
    expect(activeLayer({ shift: false, mod3: false, mod4: false, ctrl: true })).toBeNull()
    expect(activeLayer({ shift: false, mod3: false, mod4: false, composing: true })).toBeNull()
  })
  it('classifies fourth-layer PageUp as a command, not the literal text', () => {
    expect(translateCode('KeyQ', { shift: false, mod3: false, mod4: true })).toMatchObject({ kind: 'command', value: 'PageUp' })
  })
  it('recognizes both Mod3 and Mod4 keys', () => {
    for (const code of ['CapsLock', 'Quote', 'IntlBackslash', 'AltRight']) expect(isLayoutModifier(code)).toBe(true)
  })
  it('is stable for repeat and held CapsLock events', () => {
    const held = { shift: false, mod3: true, mod4: false }
    expect(translateCode('KeyE', held)).toEqual(translateCode('KeyE', held))
    expect(translateCode('KeyE', held)?.value).toBe('[')
  })
})
