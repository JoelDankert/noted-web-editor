# Noted Editor

Ein statischer, responsiver Code-Editor, der Eingaben einer **physischen deutschen QWERTZ-Tastatur** (`KeyboardEvent.code`) im Browser auf das offizielle Noted-XKB-Layout überträgt. Die Syntaxsprache wird lokal und verzögert erkannt; es gibt keine Laufzeit-API und keine Datenübertragung.

## Lokal verwenden

Voraussetzung: Node.js 22 oder neuer (Node 20 kann lokal noch funktionieren, wird vom aktuellen Testwerkzeug aber nicht unterstützt).

```sh
npm install
npm run dev
```

Vite zeigt die lokale URL an. Wegen des für GitHub Pages notwendigen Basispfads ist die App unter `/noted-web-editor/` erreichbar. Produktionsprüfung:

```sh
npm run check
npm run build
npm run test:e2e
```

Für den E2E-Test muss Playwright Chromium einmalig vorhanden sein (`npx playwright install chromium`). Der Build liegt in `dist/`.

## Tastaturlayout

Implementiert sind die offiziellen Noted-Ebenen 1–4:

- Ebene 1: direkt
- Ebene 2: gehaltene Umschalttaste
- Ebene 3: gehaltene Feststelltaste oder die physische rechte Ä-Taste (Noted `AC11`)
- Ebene 4: physische `<`-Taste (`IntlBackslash`) oder rechte Alt-Taste

Die Zuordnung stammt aus [`references/noted.xkb`](references/noted.xkb), Revision `20f43c1a27736a5f894f6fe32620d41e629a5aab` von `dariogoetz/noted-layout`, einschließlich der von `de(neo_base)` geerbten Neo-Belegungen. Der Quelltext der Referenz ist GPL-3.0-lizenziert; die Lizenz liegt unter [`LICENSE`](LICENSE). In XKB entspricht die benutzerseitige Ebene 4 dem Array-Slot 5. Mod4-Navigation unterstützt Auswahl mit Shift. Wiederholte Tastendrücke, Auswahl sowie Editor-Undo/Redo funktionieren über CodeMirror 6. Ctrl-/Meta-Shortcuts, linke Alt-Shortcuts, Einfügen und IME-/Composition-Eingaben werden nicht absichtlich abgefangen.

Die separate Windows-AHK-Umsetzung [JoelDankert/noted-layout-windows-ahk](https://github.com/JoelDankert/noted-layout-windows-ahk) ist verwandte Arbeit, aber **nicht** die Implementierungsquelle dieser Website; sie bildet nur zwei Ebenen ab.

## Grenzen des Browsers

- Browser und Betriebssysteme behandeln Caps Lock unterschiedlich. Die App nutzt Caps Lock nur dann als *gehaltenes* Mod3, wenn sie passende `keydown`- und `keyup`-Ereignisse erhält. Das System kann Caps Lock dennoch umschalten oder Ereignisse verschlucken. Die rechte Ä-Taste ist die verlässlichere Mod3-Alternative.
- Tote Tasten und XKB-Compose können im Browser nicht zuverlässig vollständig nachgebildet werden; Compose sowie Noted-Ebenen 5/6 sind bewusst nicht implementiert. Tote-Tasten-Zuordnungen werden deshalb nicht vorgetäuscht.
- AltGr erscheint je nach Plattform als `AltGraph`, `AltRight` oder als Ctrl+Alt. Die App berücksichtigt die üblichen Varianten, kann aber nicht jede Browser-/Remote-Desktop-Kombination garantieren.
- Die automatische Spracherkennung beginnt erst bei ausreichend Text, ist gedrosselt und wechselt nur bei einem plausiblen Ergebnis. Unterstützt werden JavaScript/TypeScript, JSON, Python, HTML/XML, CSS, Markdown, Java, C/C++, Rust und SQL; unbekannter oder kurzer Inhalt bleibt Nur Text.
- Der Text wird im Browser als Entwurf zwischengespeichert; über „Datei öffnen“ kannst du lokale Dateien laden. „Datei speichern“ lädt den Text als lokale `.txt`-Datei herunter. Der Download-Ordner oder eine Rückfrage zum Speicherort werden in den Browser-Einstellungen festgelegt. Es gibt keine Cloud-Speicherung.

## GitHub Pages

Die Vite-Basis ist auf `/noted-web-editor/` gesetzt. Der Workflow `.github/workflows/deploy.yml` baut bei Push auf `main`, verwendet minimale Pages-Berechtigungen und deployt ausschließlich `dist/`. In den Repository-Einstellungen muss unter **Pages → Source** „GitHub Actions“ ausgewählt sein.
