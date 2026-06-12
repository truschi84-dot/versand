# Claude Code — Tresch & Sohn Kombi-App

## Projekt-Übersicht
Firmen-PWA für Tresch & Sohn Logistik. Läuft auf mehreren Firmen-Handys.
Deployment: GitHub Pages → `https://truschi84-dot.github.io/versand/`

## App-Struktur
| Datei | Zweck | Nutzer |
|-------|-------|--------|
| `index.html` | Rechner-App (LKW, Sortierung, Leergut, Nölke, Brandenburg) | Alle Mitarbeiter |
| `logistik.html` | Logistik-App (Touren, Lieferanten, Artikel-Zuordnung) | Chef/Admin |
| `kaninchen/index.html` | Kaninchen-App (separate Mini-App) | Extern |
| `projekt/buero/control-center.html` | PC Control Center | Büro-PC |

## JS-Dateien
| Datei | Gehört zu |
|-------|-----------|
| `js/rechner.js` | Rechner-App |
| `js/rechner_scanner.js` | Rechner-App |
| `js/rechner_druck.js` | Rechner-App |
| `js/rechner_reklamation.js` | Rechner-App |
| `js/rechner_leergut.js` | Rechner-App |
| `js/logistik.js` | Logistik-App |
| `js/script.js` | Geteilt (PIN, Cloud, Init) |
| `js/cloud_auth.js` | Geteilt (Firebase Auth) |
| `js/team_brief.js` | Geteilt |
| `js/gemeinsam/datenbank.js` | Geteilt (DB-Zugriff) |
| `js/gemeinsam/metriken.js` | Geteilt |

## Versions-Management
- `WEB_BUILD_VERSION` in `js/script.js` (Zeile ~14) — bei jedem Deploy erhöhen
- `app-version.json` — `webVersion` muss mit `WEB_BUILD_VERSION` übereinstimmen
- `app-update.json` — für OTA-Updates
- CSS/JS-Links in HTML: `?v=XXX` Query-Parameter aktuell halten

## Deployment
```powershell
git add -A
git commit -m "App Update vX.X Build XXX"
git push origin main
```
GitHub Pages deployed automatisch nach dem Push.

## Entwicklung — nur Tresch-Apps (Quelle)
| App | Ordner | Eigenständig |
|-----|--------|--------------|
| **Rechner** | `index.html`, `js/`, `css/` | ja — nur hier ändern |
| **Logistik** | `logistik/` | ja — eigene `core.js`, `app.js`, `metriken.js` |
| **Control Center** | `control/` | ja — nur PC/Büro |
| **Kaninchen** | `kaninchen/` | ja |

**Nicht** in `AndroidStudioProjects/.../app/src/main/assets/` entwickeln.

`assets/` ist **nur Backup/Fallback**: Kopie beim USB-Deploy, falls OTA/GitHub beim Test noch nicht greift. Agent ändert nur Tresch-Apps — Sync nach `assets/` nur auf explizite Deploy-/USB-Anfrage.

### Apps getrennt halten (keine Verschmelzung)
- **Jede App bleibt eigenständig** — kein gemeinsamer Code-Pfad zwischen Rechner ↔ Logistik.
- Fix in Logistik → nur `logistik/`. Fix in Rechner → nur Root/`js/rechner*.js`/`js/script.js` (Rechner).
- **Nicht** `js/gemeinsam/` in Logistik einbinden oder Logistik-Dateien aus Rechner überschreiben (und umgekehrt).
- **Nicht** beim Deploy `gemeinsam/` → `logistik/` synchronisieren.
- Abgleich zwischen Geräten nur über **Cloud/Firebase** (`backup.json`), nicht über geteilte JS-Module.
- `js/gemeinsam/` gehört nur zur **Rechner-App** (Legacy intern), nicht zur Logistik.

## Wichtige Regeln
- `app-secrets.json` NIEMALS committen (steht in .gitignore)
- Vor jedem Commit: `git status` prüfen ob secrets dabei sind
- Bei HTML-Änderungen: Versionsnummer in `?v=XXX` erhöhen
- Beide Apps (index.html + logistik.html) müssen nach Änderungen getestet werden

## Bestätigungspflicht vor Änderungen (PFLICHT)
**Vor jeder Codeänderung** zuerst ankündigen:
- Welche App betroffen ist (Rechner / Logistik / Control Center)
- Welche Datei(en) geändert werden
- Was genau geändert wird
Dann **warten bis der Nutzer "ok" oder eine Bestätigung gibt** — erst dann die Änderung durchführen.
Gilt für alle Edit/Write-Operationen an Quellcode. Ausnahme: reine Leseoperationen (Read, Grep, Glob).

## Sicherheit
- Firebase-Daten werden über `js/cloud_secrets.embed.js` und `js/cloud_auth.js` geschützt
- PIN-System: Firmen-PIN schützt beide Apps
- `app-settings-public.json` enthält öffentliche Einstellungen (kein Secret)

## Skills
- `/deploy` — Version erhöhen, committen, pushen
- `/test-apps` — Beide Apps im Preview testen
- `/security-check` — Secrets und .gitignore prüfen
- `/bump-version` — Nur Versionsnummern erhöhen

## APK-Skills (Android)
- `/build-apk` — Logistik-APK bauen (Gradle)
- `/build-apk rechner` — Rechner/Versand-APK bauen
- `/adb-install` — APK per USB auf Handy installieren
- `/adb-logs` — Logcat lesen (Fehler, JS-Exceptions)
- `/sync-assets` — Web-Dateien → Android assets/ kopieren
- `/apk-full` — Alles in einem: sync + build + install

## Android-Projekte
| App | Android-Projekt | Package |
|-----|-----------------|---------|
| Logistik | `AndroidStudioProjects/LogistikApp` | `com.example.logistikapp` |
| Rechner | `AndroidStudioProjects/Versand` | `com.example.versand` |

ADB: `C:/Users/Trusc/AppData/Local/Android/Sdk/platform-tools/adb.exe`

<!-- cloude-code-toolbox:mcp-skills-awareness-begin -->

### MCP & Skills awareness (Cloude Code ToolBox)

_Last synced: 2026-06-10T16:13:55.744Z._

- **Full report:** `.claude/cloude-code-toolbox-mcp-skills-awareness.md` in this workspace (auto-overwritten on each scan). Use it as ground truth for configured servers and skill folders.
- **MCP:** For **live tools** in Claude Code, enable the matching server via `/mcp`. Servers are configured in `~/.claude.json` (user) and `.mcp.json` (project).
- **When the user's task matches a server** (e.g. Confluence work and a **Confluence** / **Atlassian** MCP is listed), **prefer that server id** and plan on tool use—not only file search.
- **Skills:** Folders below contain `SKILL.md`; attach or cite paths in chat when relevant.

#### Workspace MCP
_No active workspace servers in mcp.json._

#### User MCP
_No active user-scoped servers in mcp.json._

#### Project skills
- `.claude/skills/deploy/SKILL.md` — Deploy auf GitHub Pages
- `.claude/skills/test-apps/SKILL.md` — Beide Apps testen
- `.claude/skills/security-check/SKILL.md` — Secrets prüfen
- `.claude/skills/bump-version/SKILL.md` — Versionsnummern erhöhen

<!-- cloude-code-toolbox:mcp-skills-awareness-end -->

<!-- cloude-code-toolbox:token-optimization-begin -->

### Token Optimization (Claude Code ToolBox)

_Active level: concise_

- Respond concisely: 1-3 sentences max unless the user asks for detail.
- Never restate the user's question or echo file contents back verbatim.
- When showing code changes, show only modified lines with 2 lines of context.
- Skip meta-commentary ("I'll now...", "Let me...", "Here's what I did...").
- Before reading a file, check `.claude/project-map.md` for structural context.
- If you already read a file this session and it hasn't changed, reference your memory instead of re-reading.
- Do not read files matching `.claudeignore` patterns unless explicitly asked.

<!-- cloude-code-toolbox:token-optimization-end -->
