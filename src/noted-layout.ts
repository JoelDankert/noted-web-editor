export type NotedLayer = 1 | 2 | 3 | 4
export type Mapping = readonly [string | null, string | null, string | null, string | null]

// Physical KeyboardEvent.code -> official Noted XKB layers 1–4.
// Layer 4 is XKB slot 5 (Neo's user-facing Ebene 4); XKB slots 4/6 are excluded.
export const NOTED_MAP: Readonly<Record<string, Mapping>> = {
  Backquote: ['Dead', 'Dead', '↻', 'Dead'],
  Digit1: ['1', '°', '¹', 'ª'], Digit2: ['2', '§', '²', 'º'], Digit3: ['3', 'ℓ', '³', '№'],
  Digit4: ['4', '»', '›', null], Digit5: ['5', '«', '‹', '·'], Digit6: ['6', '$', '¢', '£'],
  Digit7: ['7', '€', '¥', '¤'], Digit8: ['8', '„', '‚', 'Tab'], Digit9: ['9', '“', '‘', '/'],
  Digit0: ['0', '”', '’', '*'], Minus: ['-', '—', null, '-'], Equal: ['Dead', 'Dead', 'Dead', 'Dead'],
  KeyQ: ['z', 'Z', '…', 'PageUp'], KeyW: ['y', 'Y', '_', 'Backspace'], KeyE: ['u', 'U', '[', 'ArrowUp'],
  KeyR: ['a', 'A', ']', 'Delete'], KeyT: ['q', 'Q', '^', 'PageDown'], KeyY: ['p', 'P', '!', '¡'],
  KeyU: ['b', 'B', '<', '7'], KeyI: ['m', 'M', '>', '8'], KeyO: ['l', 'L', '=', '9'], KeyP: ['f', 'F', '&', '+'],
  BracketLeft: ['j', 'J', '@', '−'], BracketRight: ['ß', 'ẞ', 'ſ', ';'],
  KeyA: ['c', 'C', '\\', 'Home'], KeyS: ['s', 'S', '/', 'ArrowLeft'], KeyD: ['i', 'I', '{', 'ArrowDown'],
  KeyF: ['e', 'E', '}', 'ArrowRight'], KeyG: ['o', 'O', '*', 'End'], KeyH: ['d', 'D', '?', '¿'],
  KeyJ: ['t', 'T', '(', '4'], KeyK: ['n', 'N', ')', '5'], KeyL: ['r', 'R', '-', '6'], Semicolon: ['h', 'H', ':', '.'],
  Backslash: ['Dead', 'Dead', 'Dead', 'Dead'],
  KeyY_DE: ['v', 'V', '#', 'Escape'],
  KeyX: ['x', 'X', '$', 'Tab'], KeyC: ['ü', 'Ü', '|', 'Insert'], KeyV: ['ä', 'Ä', '~', 'Enter'],
  KeyB: ['ö', 'Ö', '`', 'Undo'], KeyN: ['w', 'W', '+', ':'], KeyM: ['g', 'G', '%', '1'],
  Comma: [',', '–', '"', '2'], Period: ['.', '•', "'", '3'], Slash: ['k', 'K', ';', ';'],
  Space: [' ', ' ', ' ', '0']
}

// DOM codes are position-based: German physical Z is KeyY, German physical Y is KeyZ.
const normalizeCode = (code: string) => code === 'KeyZ' ? 'KeyY_DE' : code

export interface Modifiers { shift: boolean; mod3: boolean; mod4: boolean; ctrl?: boolean; meta?: boolean; composing?: boolean }
export interface Translation { kind: 'text' | 'command'; value: string; layer: NotedLayer }

export function activeLayer(m: Modifiers): NotedLayer | null {
  if (m.composing || m.ctrl || m.meta || (m.mod3 && m.mod4)) return null
  if (m.mod3) return m.shift ? null : 3
  if (m.mod4) return 4
  return m.shift ? 2 : 1
}

const commands = new Set(['Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Tab', 'Enter', 'Escape', 'Insert', 'Undo'])

export function translateCode(code: string, modifiers: Modifiers): Translation | null {
  const layer = activeLayer(modifiers)
  const value = layer && NOTED_MAP[normalizeCode(code)]?.[layer - 1]
  if (!layer || !value || value === 'Dead') return null
  return { kind: commands.has(value) ? 'command' : 'text', value, layer }
}

export function isMappedCode(code: string): boolean {
  return normalizeCode(code) in NOTED_MAP
}

export function isLayoutModifier(code: string): boolean {
  return code === 'CapsLock' || code === 'Quote' || code === 'IntlBackslash' || code === 'AltRight'
}
