import './style.css'
import { EditorState, Compartment, Prec, type Extension } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, gutter, GutterMarker, highlightActiveLineGutter, drawSelection, Decoration, WidgetType, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, deleteCharBackward, deleteCharForward, cursorCharLeft, cursorCharRight, cursorLineUp, cursorLineDown, cursorLineBoundaryBackward, cursorLineBoundaryForward, cursorPageUp, cursorPageDown, selectCharLeft, selectCharRight, selectLineUp, selectLineDown, selectLineBoundaryBackward, selectLineBoundaryForward, selectPageUp, selectPageDown } from '@codemirror/commands'
import { bracketMatching, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import hljs from 'highlight.js/lib/core'
import javascriptGrammar from 'highlight.js/lib/languages/javascript'
import typescriptGrammar from 'highlight.js/lib/languages/typescript'
import jsonGrammar from 'highlight.js/lib/languages/json'
import pythonGrammar from 'highlight.js/lib/languages/python'
import xmlGrammar from 'highlight.js/lib/languages/xml'
import cssGrammar from 'highlight.js/lib/languages/css'
import markdownGrammar from 'highlight.js/lib/languages/markdown'
import javaGrammar from 'highlight.js/lib/languages/java'
import cppGrammar from 'highlight.js/lib/languages/cpp'
import rustGrammar from 'highlight.js/lib/languages/rust'
import sqlGrammar from 'highlight.js/lib/languages/sql'
import { isLayoutModifier, isMappedCode, translateCode } from './noted-layout'
import { darkHighlightStyle } from './editor-theme'
import { restoreDocument, saveDocument } from './document-storage'
import { getCM, Vim, vim } from '@replit/codemirror-vim'
import { restoreSettings, saveSettings, type EditorSettings } from './settings-storage'
import { evaluateExpression } from './expression'

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `<main><div id="editor" aria-label="Noted Texteditor"></div></main><div id="typing-speed" data-testid="typing-speed" aria-live="polite" hidden>0 WPM</div><div id="settings-root"></div><input id="file-open-fallback" type="file" accept=".txt,text/plain" hidden>`

const languageSlot = new Compartment()
const highlightSlot = new Compartment()
const vimSlot = new Compartment()
const lineNumberSlot = new Compartment()
const held = { mod3Caps: false, mod3Right: false, mod4Angle: false, mod4Alt: false }
const relayedPanelKeys = new WeakSet<KeyboardEvent>()
let settings = restoreSettings()
let highlightGeneration = 0
let detectionTimer = 0
let saveTimer = 0
let pendingText: string | null = null
let currentLanguage = 'plaintext'
let currentFileName = 'notiz.txt'
const typingSpeedElement = document.querySelector<HTMLElement>('#typing-speed')!
const TYPING_SPEED_WINDOW_MS = 5_000
type TypingEvent = { at: number; characters: number }
let typingEvents: TypingEvent[] = []

const germanWords = [
  'abend', 'abstand', 'acker', 'adresse', 'affe', 'alltag', 'ampel', 'apfel', 'arbeit', 'atem', 'auge', 'auto', 'bach', 'bahn', 'ball', 'baum', 'becher', 'berg', 'bild', 'blatt', 'blume', 'boden', 'boot', 'brot', 'brücke', 'buch', 'bühne', 'dach', 'dampf', 'dorf', 'durst', 'ecke', 'ei', 'eimer', 'eis', 'eltern', 'ende', 'engel', 'erde', 'farbe', 'feder', 'feld', 'fenster', 'feuer', 'finger', 'fisch', 'fluss', 'frage', 'frost', 'frühling', 'fuß', 'garten', 'gasse', 'geist', 'geld', 'gesicht', 'glas', 'glück', 'gras', 'grenze', 'großstadt', 'grund', 'hafen', 'hand', 'haus', 'heft', 'herbst', 'herz', 'himmel', 'holz', 'hund', 'hut', 'idee', 'insel', 'jahr', 'karte', 'keller', 'kind', 'kirche', 'kissen', 'klang', 'kleid', 'klippe', 'knopf', 'koffer', 'kopf', 'kraft', 'kreis', 'küche', 'lampe', 'land', 'lärm', 'laub', 'leben', 'lehrer', 'licht', 'lied', 'luft', 'maus', 'meer', 'mensch', 'mittag', 'mond', 'morgen', 'musik', 'nacht', 'nadel', 'nebel', 'netz', 'ofen', 'ort', 'papier', 'park', 'pfad', 'pferd', 'pflanze', 'platz', 'post', 'preis', 'punkt', 'rad', 'radio', 'regen', 'reise', 'ring', 'rock', 'rolle', 'rose', 'salz', 'sand', 'satz', 'schule', 'see', 'segel', 'seite', 'sommer', 'sonne', 'spiel', 'spur', 'stadt', 'stahl', 'stern', 'stimme', 'straße', 'strom', 'stuhl', 'tag', 'tal', 'tanz', 'tee', 'teich', 'tisch', 'tor', 'traum', 'tür', 'uhr', 'vater', 'vogel', 'wald', 'wand', 'wasser', 'weg', 'wein', 'welt', 'wiese', 'wind', 'winter', 'wort', 'wunder', 'zahn', 'zeit', 'zelt', 'ziel', 'zimmer', 'zunge', 'zug'
] as const

function randomPracticeWord(excluded: readonly string[] = []): string {
  const available = germanWords.filter(word => !excluded.includes(word))
  return available[Math.floor(Math.random() * available.length)] ?? germanWords[0]
}

function nextPracticeWords(): string[] {
  const words: string[] = []
  while (words.length < 5) words.push(randomPracticeWord(words))
  return words
}

let practiceWords = nextPracticeWords()

for (const [name, grammar] of Object.entries({ javascript: javascriptGrammar, typescript: typescriptGrammar, json: jsonGrammar, python: pythonGrammar, xml: xmlGrammar, css: cssGrammar, markdown: markdownGrammar, java: javaGrammar, cpp: cppGrammar, rust: rustGrammar, sql: sqlGrammar })) {
  hljs.registerLanguage(name, grammar)
}

const languages: Record<string, { load: () => Promise<Extension> }> = {
  javascript: { load: async () => (await import('@codemirror/lang-javascript')).javascript() },
  typescript: { load: async () => (await import('@codemirror/lang-javascript')).javascript({ typescript: true }) },
  json: { load: async () => (await import('@codemirror/lang-json')).json() },
  python: { load: async () => (await import('@codemirror/lang-python')).python() },
  xml: { load: async () => (await import('@codemirror/lang-html')).html() },
  html: { load: async () => (await import('@codemirror/lang-html')).html() },
  css: { load: async () => (await import('@codemirror/lang-css')).css() },
  markdown: { load: async () => (await import('@codemirror/lang-markdown')).markdown() },
  java: { load: async () => (await import('@codemirror/lang-java')).java() },
  cpp: { load: async () => (await import('@codemirror/lang-cpp')).cpp() },
  c: { load: async () => (await import('@codemirror/lang-cpp')).cpp() },
  rust: { load: async () => (await import('@codemirror/lang-rust')).rust() },
  sql: { load: async () => (await import('@codemirror/lang-sql')).sql() }
}

function insert(view: EditorView, text: string) {
  view.dispatch(view.state.replaceSelection(text), { scrollIntoView: true, userEvent: 'input.type' })
}

function expressionCompletion(editor: EditorView): string | null {
  const selection = editor.state.selection.main
  if (!selection.empty) return null
  if (settings.vim) {
    const cm = getCM(editor)
    if (cm?.state.vim && !cm.state.vim.insertMode) return null
  }
  const line = editor.state.doc.lineAt(selection.head)
  if (selection.head !== line.to || !line.text.endsWith('=')) return null
  const beforeEquals = line.text.slice(0, -1)
  const segment = beforeEquals.slice(beforeEquals.lastIndexOf('=') + 1)
  // Find the longest valid arithmetic suffix, including one attached to prose.
  for (let start = Math.max(0, segment.length - 256); start < segment.length; start++) {
    const result = evaluateExpression(segment.slice(start))
    if (result !== null) return result
  }
  return null
}

class ResultWidget extends WidgetType {
  constructor(readonly result: string) { super() }
  eq(other: ResultWidget) { return other.result === this.result }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-expression-result'
    span.textContent = this.result
    span.setAttribute('aria-hidden', 'true')
    return span
  }
}

function resultDecorations(editor: EditorView): DecorationSet {
  if (settings.typingPractice) return Decoration.none
  const result = expressionCompletion(editor)
  return result ? Decoration.set([Decoration.widget({ widget: new ResultWidget(result), side: 1 }).range(editor.state.selection.main.head)]) : Decoration.none
}

function practiceFragment(editor: EditorView): string {
  const selection = editor.state.selection.main
  if (!selection.empty) return ''
  const line = editor.state.doc.lineAt(selection.head)
  return line.text.slice(0, selection.head - line.from).split(/\s/).at(-1) ?? ''
}

class TypingPreviewWidget extends WidgetType {
  constructor(readonly words: readonly string[]) { super() }
  eq(other: TypingPreviewWidget) { return this.words.join(' ') === other.words.join(' ') }
  toDOM() {
    const preview = document.createElement('span')
    preview.className = 'cm-typing-preview'
    preview.dataset.testid = 'typing-preview'
    preview.setAttribute('aria-hidden', 'true')
    this.words.forEach((word, index) => {
      const item = document.createElement('span')
      item.className = 'typing-word'
      item.textContent = `${index ? ' ' : ''}${word}`
      preview.append(item)
    })
    return preview
  }
}

function typingDecorations(editor: EditorView): DecorationSet {
  if (!settings.typingPractice || !editor.state.selection.main.empty) return Decoration.none
  const fragment = practiceFragment(editor).toLocaleLowerCase('de-DE')
  const first = practiceWords[0]
  const words = [first.startsWith(fragment) ? first.slice(fragment.length) : first, ...practiceWords.slice(1)]
  return Decoration.set([Decoration.widget({ widget: new TypingPreviewWidget(words), side: 1 }).range(editor.state.selection.main.head)])
}

const expressionPreview = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor(editor: EditorView) { this.decorations = resultDecorations(editor) }
  update(update: ViewUpdate) { this.decorations = resultDecorations(update.view) }
}, { decorations: plugin => plugin.decorations })

const typingPreview = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor(editor: EditorView) { this.decorations = typingDecorations(editor) }
  update(update: ViewUpdate) { this.decorations = typingDecorations(update.view) }
}, { decorations: plugin => plugin.decorations })

function acceptExpression(editor: EditorView): boolean {
  const result = expressionCompletion(editor)
  if (!result) return false
  insert(editor, result)
  return true
}

function runCommand(view: EditorView, value: string, shift: boolean): boolean {
  const commands: Record<string, (v: EditorView) => boolean> = {
    Backspace: deleteCharBackward, Delete: deleteCharForward,
    ArrowLeft: shift ? selectCharLeft : cursorCharLeft, ArrowRight: shift ? selectCharRight : cursorCharRight,
    ArrowUp: shift ? selectLineUp : cursorLineUp, ArrowDown: shift ? selectLineDown : cursorLineDown,
    Home: shift ? selectLineBoundaryBackward : cursorLineBoundaryBackward, End: shift ? selectLineBoundaryForward : cursorLineBoundaryForward,
    PageDown: shift ? selectPageDown : cursorPageDown, PageUp: shift ? selectPageUp : cursorPageUp,
    Undo: undo
  }
  if (value === 'Tab') { insert(view, '\t'); return true }
  if (value === 'Enter') { insert(view, '\n'); return true }
  if (value === 'Escape') {
    if (settings.vim) {
      const cm = getCM(view)
      if (cm) Vim.handleKey(cm, '<Esc>', 'user')
    }
    return true
  }
  if (value === 'Insert') return true
  return commands[value]?.(view) ?? false
}

function modifierChange(event: KeyboardEvent, down: boolean): boolean {
  if (event.code === 'CapsLock') held.mod3Caps = down
  else if (event.code === 'Quote') held.mod3Right = down
  else if (event.code === 'IntlBackslash') held.mod4Angle = down
  else if (event.code === 'AltRight') held.mod4Alt = down
  else return false
  return true
}

function clearLanguage() {
  if (currentLanguage === 'plaintext') return
  currentLanguage = 'plaintext'
  view.dispatch({ effects: languageSlot.reconfigure([]) })
}

function updateTypingSpeed() {
  typingSpeedElement.hidden = !settings.typingSpeed
  if (!settings.typingSpeed) return
  const cutoff = performance.now() - TYPING_SPEED_WINDOW_MS
  typingEvents = typingEvents.filter(event => event.at >= cutoff)
  const characters = typingEvents.reduce((total, event) => total + event.characters, 0)
  const minutes = TYPING_SPEED_WINDOW_MS / 60_000
  typingSpeedElement.textContent = `${Math.round((characters / 5) / minutes)} WPM`
}

function resetTypingSpeed() {
  typingEvents = []
  updateTypingSpeed()
}

function advancePractice() {
  const nextWord = randomPracticeWord(practiceWords)
  practiceWords = [...practiceWords.slice(1), nextWord]
}

function setSettings(next: EditorSettings) {
  const previous = settings
  settings = next
  saveSettings(settings)
  if (previous.syntaxHighlighting !== settings.syntaxHighlighting) configureSyntaxHighlighting()
  if (previous.vim !== settings.vim) view.dispatch({ effects: vimSlot.reconfigure(settings.vim ? vim() : []) })
  if (previous.relativeLineNumbers !== settings.relativeLineNumbers) view.dispatch({ effects: lineNumberSlot.reconfigure(numberGutter()) })
  if (previous.typingSpeed !== settings.typingSpeed) resetTypingSpeed()
  if (previous.typingPractice !== settings.typingPractice) {
    practiceWords = nextPracticeWords()
    view.dispatch({})
  }
  updateTypingSpeed()
}

window.setInterval(updateTypingSpeed, 250)

class RelativeNumber extends GutterMarker {
  constructor(readonly label: string) { super() }
  eq(other: GutterMarker) { return other instanceof RelativeNumber && other.label === this.label }
  toDOM() { return document.createTextNode(this.label) }
}

function numberGutter(): Extension {
  if (!settings.relativeLineNumbers) return lineNumbers()
  return gutter({
    class: 'cm-lineNumbers',
    lineMarker(view, line) {
      const current = view.state.doc.lineAt(view.state.selection.main.head).number
      const number = view.state.doc.lineAt(line.from).number
      return new RelativeNumber(String(number === current ? number : Math.abs(number - current)))
    },
    lineMarkerChange: update => update.selectionSet || update.docChanged,
    initialSpacer: view => new RelativeNumber('9'.repeat(String(view.state.doc.lines).length)),
    updateSpacer(spacer, update) {
      const width = String(update.state.doc.lines).length
      return spacer instanceof RelativeNumber && spacer.label.length === width ? spacer : new RelativeNumber('9'.repeat(width))
    }
  })
}

function configureSyntaxHighlighting() {
  highlightGeneration++
  window.clearTimeout(detectionTimer)
  currentLanguage = 'plaintext'
  view.dispatch({ effects: [
    highlightSlot.reconfigure(settings.syntaxHighlighting ? syntaxHighlighting(darkHighlightStyle, { fallback: true }) : []),
    languageSlot.reconfigure([])
  ] })
  if (settings.syntaxHighlighting) void detectLanguage(view.state.doc.toString())
}

function flushDocument() {
  if (pendingText === null) return
  window.clearTimeout(saveTimer)
  saveDocument(pendingText)
  pendingText = null
}

function scheduleSave(text: string) {
  pendingText = text
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(flushDocument, 250)
}

async function detectLanguage(text: string) {
  if (!settings.syntaxHighlighting) return
  if (!text.trim()) { clearLanguage(); return }
  const generation = highlightGeneration
  const result = hljs.highlightAuto(text.slice(0, 20_000), Object.keys(languages))
  const name = result.language ?? 'plaintext'
  if (!languages[name] || (result.relevance ?? 0) < 1) { clearLanguage(); return }
  if (name === currentLanguage) return
  currentLanguage = name
  const extension = await languages[name].load()
  if (settings.syntaxHighlighting && highlightGeneration === generation && currentLanguage === name) view.dispatch({ effects: languageSlot.reconfigure(extension) })
}

const settingRows: ReadonlyArray<{ key: keyof EditorSettings, label: string }> = [
  { key: 'syntaxHighlighting', label: 'Syntaxhervorhebung' },
  { key: 'notedKeyboard', label: 'Noted-Tastaturemulation' },
  { key: 'vim', label: 'Vim' },
  { key: 'relativeLineNumbers', label: 'Relative Zeilennummern' },
  { key: 'typingSpeed', label: 'Tippgeschwindigkeit' },
  { key: 'typingPractice', label: 'Tippübung' }
]

const settingsRoot = document.querySelector<HTMLDivElement>('#settings-root')!
const fallbackOpenInput = document.querySelector<HTMLInputElement>('#file-open-fallback')!
let settingsOpen = false
let settingsStatus = ''

function fileError(error: unknown): string {
  return error instanceof Error ? `Datei konnte nicht verarbeitet werden: ${error.message}` : 'Datei konnte nicht verarbeitet werden'
}

function showSettingsStatus(message: string) {
  settingsStatus = message
  const status = settingsRoot.querySelector<HTMLElement>('.settings-status')
  if (status) status.textContent = message
}

function replaceWithOpenedText(text: string, fileName: string) {
  const current = view.state.doc.toString()
  if (current && current !== text && !window.confirm('Aktuellen Text ersetzen?')) return
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: text.length } })
  currentFileName = fileName
  closeSettings()
}

function openFile() {
  showSettingsStatus('')
  fallbackOpenInput.value = ''
  fallbackOpenInput.click()
}

function downloadText(text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = currentFileName
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  closeSettings()
}

function saveFile() {
  showSettingsStatus('')
  try { downloadText(view.state.doc.toString()) }
  catch (error) { showSettingsStatus(fileError(error)) }
}

fallbackOpenInput.addEventListener('change', () => {
  const file = fallbackOpenInput.files?.[0]
  if (!file) return
  void file.text().then(text => replaceWithOpenedText(text, file.name)).catch(error => showSettingsStatus(fileError(error)))
})

function closeSettings() {
  if (!settingsOpen) return
  settingsOpen = false
  settingsStatus = ''
  settingsRoot.replaceChildren()
  view.focus()
}

function renderSettings(activeIndex = 0) {
  const overlay = document.createElement('div')
  overlay.className = 'settings-overlay'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-label', 'Einstellungen')
  const list = document.createElement('div')
  list.className = 'settings-list'
  for (const [label, action] of [['Datei öffnen', openFile], ['Datei speichern', saveFile]] as const) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'settings-action'
    button.textContent = label
    button.addEventListener('click', action)
    list.append(button)
  }
  settingRows.forEach(({ key, label }, index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'settings-toggle'
    button.setAttribute('role', 'switch')
    button.setAttribute('aria-checked', String(settings[key]))
    button.dataset.setting = key
    button.innerHTML = `<span>${label}</span><span aria-hidden="true">${settings[key] ? 'an' : 'aus'}</span>`
    button.addEventListener('click', () => {
      setSettings({ ...settings, [key]: !settings[key] })
      renderSettings(index + 2)
    })
    list.append(button)
  })
  const status = document.createElement('div')
  status.className = 'settings-status'
  status.setAttribute('role', 'status')
  status.textContent = settingsStatus
  list.append(status)
  overlay.append(list)
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.shiftKey) { event.preventDefault(); closeSettings(); return }
    if (settings.notedKeyboard && isLayoutModifier(event.code)) {
      modifierChange(event, true)
      event.preventDefault()
      return
    }
    let key = event.key
    if (settings.notedKeyboard) {
      const altGraph = held.mod4Alt || event.getModifierState('AltGraph')
      if (!event.metaKey && (!event.ctrlKey || altGraph) && (!event.altKey || altGraph)) {
        const mapped = translateCode(event.code, {
          shift: event.shiftKey, mod3: held.mod3Caps || held.mod3Right,
          mod4: held.mod4Angle || held.mod4Alt || altGraph,
          ctrl: event.ctrlKey && !altGraph, meta: event.metaKey, composing: event.isComposing
        })
        if (mapped?.kind === 'command') key = mapped.value
      }
    }
    const buttons = [...overlay.querySelectorAll<HTMLButtonElement>('button')]
    const current = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement))
    if (key === 'Escape') { event.preventDefault(); closeSettings(); return }
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault()
      const delta = key === 'ArrowDown' ? 1 : -1
      buttons[(current + delta + buttons.length) % buttons.length].focus()
    } else if (key === 'Enter' && event.key !== 'Enter') {
      event.preventDefault()
      buttons[current].click()
    }
  })
  overlay.addEventListener('keyup', event => {
    if (isLayoutModifier(event.code)) {
      modifierChange(event, false)
      if (settings.notedKeyboard) event.preventDefault()
    }
  })
  settingsRoot.replaceChildren(overlay)
  ;[...overlay.querySelectorAll<HTMLButtonElement>('button')][activeIndex]?.focus()
}

function openSettings() {
  if (settingsOpen) return
  settingsOpen = true
  renderSettings()
}

const view = new EditorView({
  parent: document.querySelector('#editor')!,
  state: EditorState.create({
    doc: restoreDocument(),
    extensions: [
      lineNumberSlot.of(numberGutter()), highlightActiveLineGutter(), history(), drawSelection(), indentOnInput(), bracketMatching(),
      highlightSlot.of(settings.syntaxHighlighting ? syntaxHighlighting(darkHighlightStyle, { fallback: true }) : []),
      vimSlot.of(settings.vim ? vim() : []),
      expressionPreview, typingPreview,
      Prec.highest(keymap.of([
        { key: 'Shift-Enter', run() { openSettings(); return true } },
        { key: 'Ctrl-Enter', run(editor) {
          const { state } = editor
          const selection = state.selection.main
          const query = (selection.empty
            ? state.doc.lineAt(selection.head).text
            : state.doc.sliceString(selection.from, selection.to)).trim()
          if (query) window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank', 'noopener,noreferrer')
          return true
        } },
        { key: 'Enter', run: acceptExpression }
      ])),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]), languageSlot.of([]),
      EditorView.lineWrapping,
      Prec.highest(EditorView.domEventHandlers({
        keydown(event, editor) {
          if (event.isComposing || event.key === 'Process') return false
          if (!settings.notedKeyboard) return false
          if (isLayoutModifier(event.code)) { modifierChange(event, true); event.preventDefault(); return true }
          const altGraph = held.mod4Alt || event.getModifierState('AltGraph')
          if (event.metaKey || (event.ctrlKey && !altGraph) || (event.altKey && !altGraph)) return false
          const translated = translateCode(event.code, {
            shift: event.shiftKey, mod3: held.mod3Caps || held.mod3Right, mod4: held.mod4Angle || held.mod4Alt || altGraph,
            ctrl: event.ctrlKey && !altGraph, meta: event.metaKey, composing: event.isComposing
          })
          if (!translated) {
            // Known physical keys must not fall through to the host QWERTZ layout
            // on unsupported combinations, dead keys or intentionally empty slots.
            if (isMappedCode(event.code)) { event.preventDefault(); return true }
            return false
          }
          event.preventDefault()
          const cm = settings.vim ? getCM(editor) : undefined
          if (cm?.state.vim && !cm.state.vim.insertMode) {
            const vimCommands: Record<string, string> = {
              ArrowLeft: '<Left>', ArrowRight: '<Right>', ArrowUp: '<Up>', ArrowDown: '<Down>',
              Home: '<Home>', End: '<End>', PageUp: '<PageUp>', PageDown: '<PageDown>',
              Backspace: '<BS>', Delete: '<Del>', Enter: '<CR>', Tab: '<Tab>', Escape: '<Esc>', Undo: 'u'
            }
            const vimKey = translated.kind === 'text' ? translated.value : vimCommands[translated.value]
            if (vimKey) Vim.handleKey(cm, vimKey, 'user')
            return true
          }
          if (translated.kind === 'command' && translated.value === 'Enter' && acceptExpression(editor)) return true
          return translated.kind === 'text' ? (insert(editor, translated.value), true) : runCommand(editor, translated.value, event.shiftKey)
        },
        keyup(event) {
          if (!settings.notedKeyboard) return false
          if (modifierChange(event, false)) { event.preventDefault(); return true } return false
        },
        blur() { held.mod3Caps = held.mod3Right = held.mod4Angle = held.mod4Alt = false }
      })),
      EditorView.updateListener.of(update => {
        if (update.docChanged) {
          const text = update.state.doc.toString()
          scheduleSave(text)
          window.clearTimeout(detectionTimer)
          detectionTimer = window.setTimeout(() => { void detectLanguage(text) }, 450)

          const inputTransactions = update.transactions.filter(transaction => transaction.isUserEvent('input'))
          if (inputTransactions.length) {
            let inserted = 0
            for (const transaction of inputTransactions) transaction.changes.iterChanges((_fromA, _toA, _fromB, _toB, value) => { inserted += value.length })
            if (settings.typingSpeed && inserted > 0) {
              typingEvents.push({ at: performance.now(), characters: inserted })
              updateTypingSpeed()
            }
            if (settings.typingPractice && inserted > 0 && practiceFragment(update.view) === '') {
              advancePractice()
              update.view.dispatch({})
            }
          }
        }
      })
    ]
  })
})

// Vim's : and / prompts are native inputs in a panel, outside the editor's
// key handler. Translate their physical keys with the same Noted layout.
view.dom.addEventListener('keydown', event => {
  const input = event.target
  if (!(input instanceof HTMLInputElement) || !input.closest('.cm-vim-panel') || !settings.notedKeyboard || relayedPanelKeys.has(event) || event.isComposing) return
  if (isLayoutModifier(event.code)) { modifierChange(event, true); event.preventDefault(); return }
  const altGraph = held.mod4Alt || event.getModifierState('AltGraph')
  if (event.metaKey || (event.ctrlKey && !altGraph) || (event.altKey && !altGraph)) return
  // Real Enter and Escape must reach Vim's dialog handler (submit/cancel).
  if (event.code === 'Enter' || event.code === 'Escape') return
  const mapped = translateCode(event.code, {
    shift: event.shiftKey, mod3: held.mod3Caps || held.mod3Right,
    mod4: held.mod4Angle || held.mod4Alt || altGraph,
    ctrl: event.ctrlKey && !altGraph, meta: event.metaKey, composing: event.isComposing
  })
  if (!mapped) {
    if (isMappedCode(event.code)) { event.preventDefault(); event.stopImmediatePropagation() }
    return
  }
  event.preventDefault()
  event.stopImmediatePropagation()
  if (mapped.kind === 'text' || mapped.value === 'Backspace' || mapped.value === 'Delete') {
    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? start
    const from = mapped.value === 'Backspace' && start === end ? Math.max(0, start - 1) : start
    const to = mapped.value === 'Delete' && start === end ? Math.min(input.value.length, end + 1) : end
    input.setRangeText(mapped.kind === 'text' ? mapped.value : '', from, to, 'end')
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: mapped.kind === 'text' ? 'insertText' : 'deleteContentBackward', data: mapped.kind === 'text' ? mapped.value : null }))
    return
  }
  const keyCodes: Record<string, number> = { Enter: 13, Escape: 27, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Home: 36, End: 35, PageUp: 33, PageDown: 34, Tab: 9 }
  if (keyCodes[mapped.value]) {
    const relayed = new KeyboardEvent('keydown', { key: mapped.value, code: mapped.value, keyCode: keyCodes[mapped.value], bubbles: true, cancelable: true })
    relayedPanelKeys.add(relayed)
    input.dispatchEvent(relayed)
  }
}, true)
view.dom.addEventListener('keyup', event => {
  if (event.target instanceof HTMLInputElement && event.target.closest('.cm-vim-panel') && settings.notedKeyboard && modifierChange(event, false)) event.preventDefault()
}, true)

window.addEventListener('pagehide', flushDocument)
updateTypingSpeed()
if (view.state.doc.length) detectionTimer = window.setTimeout(() => { void detectLanguage(view.state.doc.toString()) }, 0)
view.focus()
