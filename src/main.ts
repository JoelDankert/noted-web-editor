import './style.css'
import { EditorState, Compartment, Prec, type Extension } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, drawSelection } from '@codemirror/view'
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

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `<main><div id="editor" aria-label="Noted Texteditor"></div></main><div id="settings-root"></div>`

const languageSlot = new Compartment()
const highlightSlot = new Compartment()
const vimSlot = new Compartment()
const held = { mod3Caps: false, mod3Right: false, mod4Angle: false, mod4Alt: false }
let settings = restoreSettings()
let highlightGeneration = 0
let detectionTimer = 0
let saveTimer = 0
let pendingText: string | null = null
let currentLanguage = 'plaintext'

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
    if (settings.vim && !vimIsNormal(view)) {
      const cm = getCM(view)
      if (cm) Vim.handleKey(cm, '<Esc>', 'user')
    } else openSettings()
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

function setSettings(next: EditorSettings) {
  const previous = settings
  settings = next
  saveSettings(settings)
  if (previous.syntaxHighlighting !== settings.syntaxHighlighting) configureSyntaxHighlighting()
  if (previous.vim !== settings.vim) view.dispatch({ effects: vimSlot.reconfigure(settings.vim ? vim() : []) })
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
  { key: 'vim', label: 'Vim' }
]

const settingsRoot = document.querySelector<HTMLDivElement>('#settings-root')!
let settingsOpen = false

function closeSettings() {
  if (!settingsOpen) return
  settingsOpen = false
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
      renderSettings(index)
    })
    list.append(button)
  })
  overlay.append(list)
  overlay.addEventListener('keydown', event => {
    const buttons = [...overlay.querySelectorAll<HTMLButtonElement>('button')]
    const current = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement))
    if (event.key === 'Escape') { event.preventDefault(); closeSettings(); return }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      buttons[(current + delta + buttons.length) % buttons.length].focus()
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

function vimIsNormal(editor: EditorView): boolean {
  const state = getCM(editor)?.state.vim
  return !state || (!state.insertMode && !state.visualMode)
}

const view = new EditorView({
  parent: document.querySelector('#editor')!,
  state: EditorState.create({
    doc: restoreDocument(),
    extensions: [
      lineNumbers(), highlightActiveLineGutter(), history(), drawSelection(), indentOnInput(), bracketMatching(),
      highlightSlot.of(settings.syntaxHighlighting ? syntaxHighlighting(darkHighlightStyle, { fallback: true }) : []),
      vimSlot.of(settings.vim ? vim() : []),
      Prec.highest(keymap.of([
        { key: 'Escape', run(editor) {
          if (!settings.vim || vimIsNormal(editor)) { openSettings(); return true }
          return false
        } },
        { key: 'Shift-Enter', run() { setSettings({ ...settings, syntaxHighlighting: !settings.syntaxHighlighting }); return true } },
        { key: 'Ctrl-Enter', run(editor) {
          const { state } = editor
          const selection = state.selection.main
          const query = (selection.empty
            ? state.doc.lineAt(selection.head).text
            : state.doc.sliceString(selection.from, selection.to)).trim()
          if (query) window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank', 'noopener,noreferrer')
          return true
        } }
      ])),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]), languageSlot.of([]),
      EditorView.lineWrapping,
      EditorView.domEventHandlers({
        keydown(event, editor) {
          if (event.isComposing || event.key === 'Process') return false
          if (!settings.notedKeyboard) return false
          if (settings.vim && !getCM(editor)?.state.vim?.insertMode) return false
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
          return translated.kind === 'text' ? (insert(editor, translated.value), true) : runCommand(editor, translated.value, event.shiftKey)
        },
        keyup(event) {
          if (!settings.notedKeyboard) return false
          if (modifierChange(event, false)) { event.preventDefault(); return true } return false
        },
        blur() { held.mod3Caps = held.mod3Right = held.mod4Angle = held.mod4Alt = false }
      }),
      EditorView.updateListener.of(update => {
        if (update.docChanged) {
          const text = update.state.doc.toString()
          scheduleSave(text)
          window.clearTimeout(detectionTimer)
          detectionTimer = window.setTimeout(() => { void detectLanguage(text) }, 450)
        }
      })
    ]
  })
})

window.addEventListener('pagehide', flushDocument)
if (view.state.doc.length) detectionTimer = window.setTimeout(() => { void detectLanguage(view.state.doc.toString()) }, 0)
view.focus()
