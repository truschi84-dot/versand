# Control Center — Gestaltung „Leitstand"

Stand: 2026-08-18 · gilt für `control/index.html`
Diese Datei ist die Festlegung. Wer hier etwas ändert, ändert es zuerst hier.

---

## Worum es geht

Arbeitswerkzeug fürs Büro im Fleischversand. Robert (Versandleiter) und der Chef,
täglich am PC, oft ab halb sechs morgens: Sortier-Buchungen kontrollieren, Artikel und
Lieferanten pflegen, Auswertungen für die Geschäftsführung ziehen, Tagesexport machen.
Zusätzlich als App auf dem Chef-Tablet.

Daraus folgt: **Lesbarkeit und Übersicht schlagen Effekte.** Zahlen auf einen Blick,
Tabellen scannbar, der Speicherzustand jederzeit sichtbar. Nichts blinkt, nichts hüpft.

## Haltung

**Leitstand.** Helle Arbeitsfläche für Zahlen und Tabellen, dunkler Rahmen für Navigation
und Zustand. Sachlich, ruhig, wertig — wie eine gut gemachte Schaltwarte, nicht wie eine
Verbraucher-App.

## Struktur

Drei feste Zonen:

```
┌──────────┬─────────────────────────────┬──────────────┐
│ Menue    │ Arbeitsflaeche              │ Statusschiene│
│ 244 px   │ flexibel                    │ 268 px       │
│ dunkel   │ hell                        │ hellgrau     │
└──────────┴─────────────────────────────┴──────────────┘
```

- **Kennzahlen:** *eine* Leitzahl gross (zwei Zeilen hoch, blau hinterlegt), der Rest klein
  daneben. Kein gleichförmiges Kachelraster — und dadurch auch kein 4+1-Umbruch.
- **Statusschiene:** unter 900 px wird sie wieder zur Fussleiste unten (Tablet/APK).

## Signatur

Die **Statusschiene rechts**. Datenstand, die zwei Knöpfe und der Verweis auf die selten
gebrauchten Sachen stehen dauerhaft im Blick statt in einer schwebenden Leiste unter dem
Inhalt. Dazu die Leitzahl-Hierarchie auf der Übersicht.

## Farbe — vier Bedeutungen, mehr gibt es nicht

| Rolle | Hex | Wofür |
|---|---|---|
| Hauptaktion | `#1D4F8C` Stahlblau | speichern, anwenden, aktiver Menüpunkt |
| Achtung | `#D64500` Signalorange | ungesichert, offen, Warnung |
| Erledigt | `#2E7D5B` Moosgrün | ok, gesichert, fertig |
| Fehler | `#C0392B` | nur bei echten Fehlern |

Flächen: Grund `#EDF0F4` · Karte `#FFFFFF` · ruhige Fläche `#F5F7FA` ·
Menüspalte `#0E1620` · Statusschiene `#E2E7ED`
Text: `#141A21` · gedämpft `#63707F` · leise `#8A95A3`
Linien: `#DBE1E9` · stärker `#C4CDD8`

**Regel:** eine Farbe hat genau eine Bedeutung. Türkis, Lila, Gelb, WhatsApp-Grün und
GitHub-Schwarz sind ersatzlos gestrichen.

## Schrift

| Rolle | Schrift | Warum |
|---|---|---|
| Überschriften, Zahlen | **Bahnschrift** | DIN-Abstammung, gehört zu Windows, passt zum Betrieb, keine Datei nötig |
| Fließtext, Bedienung | **Segoe UI** | vorhanden, gut lesbar bei 11–14 px |
| Protokoll, Technik | **Cascadia Mono / Consolas** | feste Zeichenbreite |

Ersatzkette: `Bahnschrift → DIN Next → Segoe UI Semibold → Segoe UI → Roboto → sans-serif`.
Auf dem Android-Tablet gibt es Bahnschrift nicht — geprüft: das Layout hält, nichts bricht
um, nichts wird abgeschnitten. Es sieht dort nur weniger eigen aus.
**Keine Schriftdatei mitliefern** (Entscheidung 2026-08-18) — der Firmenserver hat kein
Internet, und eine Datei auszuliefern ist nicht abgesprochen.

## Abstände — nur diese fünf

`--s1: 6px` · `--s2: 12px` · `--s3: 18px` · `--s4: 26px` · `--s5: 40px`
Ecken: `--radius: 6px` (alles), `--radius-gross: 8px` (nur Dialoge)

## Knöpfe — eine Form

Höhe 38 px (Tablet 44 px), Ecke 6 px, kein Schatten, kein Hochspringen beim Zeigen.
`.btn-save` blau · `.btn-success` grün · `.btn-orange` orange ·
`.btn-black` / `.btn-cloud` weiss mit Rand (alles Ruhige).
Auf der Wartungsseite heissen sie `.dbtn…` und sehen genau gleich aus.

## Bewegung

Nur zwei:
1. Seitenwechsel — 160 ms Aufblenden von unten (6 px).
2. Ladebalken oben, wenn `document.body.classList.add('laedt')` gesetzt ist.

`prefers-reduced-motion` schaltet beides ab. Keine Hover-Effekte ausser Farbwechsel.

## Vorbereitete Zustände (brauchen noch eine Zeile Code von Tim)

| Klasse | Setzen wo | Wirkung |
|---|---|---|
| `#sticky-status.ungesichert` | sobald ungespeicherte Änderungen anliegen | Text wird orange |
| `body.laedt` | Start von `pullFromCloud()` / `pushToCloud()`, Ende: entfernen | Ladebalken oben, Knöpfe in der Schiene gesperrt |
| `#wartung-laptop` ausblenden | wenn auf dem Firmenserver | APK-/GitHub-/Anleitungs-Block verschwindet, ohne Lücke |

## Was bewusst nicht angefasst wurde

- Alle `id`-Attribute, alle `onclick`-Aufrufe, alle Funktionsnamen, alle `?v=`-Nummern.
- Die Logik in `js/` — kein einziger Eingriff.
- Die neun Lade-/Speicher-Knöpfe bleiben funktional vollständig erhalten.
