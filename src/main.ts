import './style.css'
import { EditorState, Compartment, type Extension } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, drawSelection } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, deleteCharBackward, deleteCharForward, cursorCharLeft, cursorCharRight, cursorLineUp, cursorLineDown, cursorLineBoundaryBackward, cursorLineBoundaryForward, cursorPageUp, cursorPageDown, selectCharLeft, selectCharRight, selectLineUp, selectLineDown, selectLineBoundaryBackward, selectLineBoundaryForward, selectPageUp, selectPageDown } from '@codemirror/commands'
import { bracketMatching, defaultHighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language'
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

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <header class="topbar">
    <div class="brand"><span class="mark">N</span><span>Noted Editor</span></div>
    <div class="badges"><span id="language" class="badge">Nur Text</span><span id="layer" class="badge accent">Ebene 1</span></div>
  </header>
  <main>
    <section class="editor-shell" aria-label="Noted Texteditor">
      <div id="editor"></div>
      <footer class="statusbar">
        <span id="position">Zeile 1, Spalte 1</span>
        <span>Noted XKB · Ebenen 1–4</span>
      </footer>
    </section>
    <aside class="notice" aria-labelledby="hinweis-title">
      <div><strong id="hinweis-title">Hinweis zur Tastatur</strong><p>Die Übersetzung gilt nur in diesem Editor und verändert dein Betriebssystem nicht.</p></div>
      <details><summary>Browser-Einschränkungen</summary><p>Caps Lock wird als gehaltenes Mod3 verwendet, sofern der Browser Keydown und Keyup liefert. Manche Systeme schalten Caps Lock trotzdem um oder verschlucken Ereignisse. Tote Tasten und Compose lassen sich im Browser nicht vollständig wie XKB nachbilden. Nutze alternativ die rechte Ä-Taste als Mod3.</p></details>
    </aside>
  </main>`

const languageSlot = new Compartment()
const languageLabel = document.querySelector('#language')!
const layerLabel = document.querySelector('#layer')!
const position = document.querySelector('#position')!
const held = { mod3Caps: false, mod3Right: false, mod4Angle: false, mod4Alt: false }
let detectionTimer = 0
let currentLanguage = 'plaintext'

for (const [name, grammar] of Object.entries({ javascript: javascriptGrammar, typescript: typescriptGrammar, json: jsonGrammar, python: pythonGrammar, xml: xmlGrammar, css: cssGrammar, markdown: markdownGrammar, java: javaGrammar, cpp: cppGrammar, rust: rustGrammar, sql: sqlGrammar })) {
  hljs.registerLanguage(name, grammar)
}

const languages: Record<string, { label: string; load: () => Promise<Extension> }> = {
  javascript: { label: 'JavaScript', load: async () => (await import('@codemirror/lang-javascript')).javascript() },
  typescript: { label: 'TypeScript', load: async () => (await import('@codemirror/lang-javascript')).javascript({ typescript: true }) },
  json: { label: 'JSON', load: async () => (await import('@codemirror/lang-json')).json() },
  python: { label: 'Python', load: async () => (await import('@codemirror/lang-python')).python() },
  xml: { label: 'HTML/XML', load: async () => (await import('@codemirror/lang-html')).html() },
  html: { label: 'HTML', load: async () => (await import('@codemirror/lang-html')).html() },
  css: { label: 'CSS', load: async () => (await import('@codemirror/lang-css')).css() },
  markdown: { label: 'Markdown', load: async () => (await import('@codemirror/lang-markdown')).markdown() },
  java: { label: 'Java', load: async () => (await import('@codemirror/lang-java')).java() },
  cpp: { label: 'C/C++', load: async () => (await import('@codemirror/lang-cpp')).cpp() },
  c: { label: 'C/C++', load: async () => (await import('@codemirror/lang-cpp')).cpp() },
  rust: { label: 'Rust', load: async () => (await import('@codemirror/lang-rust')).rust() },
  sql: { label: 'SQL', load: async () => (await import('@codemirror/lang-sql')).sql() }
}

function updateLayer(event?: KeyboardEvent) {
  const number = held.mod3Caps || held.mod3Right ? (event?.shiftKey ? 5 : 3) : held.mod4Angle || held.mod4Alt ? 4 : event?.shiftKey ? 2 : 1
  layerLabel.textContent = number > 4 ? 'Ebene 5 aus' : `Ebene ${number}`
  layerLabel.classList.toggle('inactive', number > 4)
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
  if (value === 'Escape') { view.contentDOM.blur(); return true }
  if (value === 'Insert') return true
  return commands[value]?.(view) ?? false
}

function modifierChange(event: KeyboardEvent, down: boolean): boolean {
  if (event.code === 'CapsLock') held.mod3Caps = down
  else if (event.code === 'Quote') held.mod3Right = down
  else if (event.code === 'IntlBackslash') held.mod4Angle = down
  else if (event.code === 'AltRight') held.mod4Alt = down
  else return false
  updateLayer(event)
  return true
}

function clearLanguage() {
  if (currentLanguage === 'plaintext') return
  currentLanguage = 'plaintext'
  languageLabel.textContent = 'Nur Text'
  view.dispatch({ effects: languageSlot.reconfigure([]) })
}

async function detectLanguage(text: string) {
  if (text.trim().length < 24) { clearLanguage(); return }
  const result = hljs.highlightAuto(text.slice(0, 20_000), Object.keys(languages))
  const name = result.language ?? 'plaintext'
  if (!languages[name] || (result.relevance ?? 0) < 2) { clearLanguage(); return }
  if (name === currentLanguage) return
  currentLanguage = name
  languageLabel.textContent = languages[name].label
  const extension = await languages[name].load()
  if (currentLanguage === name) view.dispatch({ effects: languageSlot.reconfigure(extension) })
}

const view = new EditorView({
  parent: document.querySelector('#editor')!,
  state: EditorState.create({
    doc: '',
    extensions: [
      lineNumbers(), highlightActiveLineGutter(), history(), drawSelection(), indentOnInput(), bracketMatching(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }), keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]), languageSlot.of([]),
      EditorView.lineWrapping,
      EditorView.domEventHandlers({
        keydown(event, editor) {
          if (event.isComposing || event.key === 'Process') return false
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
        keyup(event) { if (modifierChange(event, false)) { event.preventDefault(); return true } return false },
        blur() { held.mod3Caps = held.mod3Right = held.mod4Angle = held.mod4Alt = false; updateLayer() }
      }),
      EditorView.updateListener.of(update => {
        const head = update.state.selection.main.head
        const line = update.state.doc.lineAt(head)
        position.textContent = `Zeile ${line.number}, Spalte ${head - line.from + 1}`
        if (update.docChanged) { window.clearTimeout(detectionTimer); detectionTimer = window.setTimeout(() => { void detectLanguage(update.state.doc.toString()) }, 450) }
      })
    ]
  })
})

view.focus()
