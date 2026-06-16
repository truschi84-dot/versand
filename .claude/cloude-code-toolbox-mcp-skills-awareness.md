# Cloude Code ToolBox — MCP & Skills awareness

_Generated: 2026-06-15T07:47:08.193Z_

## How to use this report

- **Saved copy:** This file is **`.claude/cloude-code-toolbox-mcp-skills-awareness.md`** — refreshed whenever the toolbox runs an MCP & Skills scan (including on workspace open when auto-scan is enabled). It is meant for **Claude Code workspace context** together with `CLAUDE.md` (which gets a shorter replaceable summary when auto-merge is on).
- **MCP:** Lists **configured** servers from Claude Code config (`~/.claude.json` for user scope, `.mcp.json` for project scope). Use `/mcp` in the Claude Code panel to connect servers for your session.
- **Skills:** **On-disk** folders with `SKILL.md`. Claude Code does not auto-load them; attach `SKILL.md` or paths in chat when useful.
- **Task routing:** When the user’s request matches a server’s purpose (e.g. Confluence → Confluence/Atlassian MCP), prefer that **server id** from the tables below.

---

## MCP — workspace

Workspace `mcp.json` _(folder: Tresch-Apps)_

- **c:\Users\Trusc\Desktop\Tresch-Apps\.mcp.json** — _File missing_

_No active workspace servers in mcp.json._

## MCP — user profile

- **C:\Users\Trusc\.claude.json** — _File exists — no servers defined_

_No active user-scoped servers in mcp.json._

## Skills (local `SKILL.md` folders)

### Project-scoped

- **adb-install** — `c:\Users\Trusc\Desktop\Tresch-Apps\.claude\skills\adb-install`
  - Installs an APK on a connected Android device via ADB.

- **adb-logs** — `c:\Users\Trusc\Desktop\Tresch-Apps\.claude\skills\adb-logs`
  - Liest ADB Logcat vom verbundenen Android-Gerät — zeigt App-Fehler, JavaScript-Exceptions und WebView-Crashes.

- **apk-full** — `c:\Users\Trusc\Desktop\Tresch-Apps\.claude\skills\apk-full`
  - Kompletter APK-Zyklus: Assets sync → Gradle Build → ADB Install — ein Befehl für alles.

- **build-apk** — `c:\Users\Trusc\Desktop\Tresch-Apps\.claude\skills\build-apk`
  - Builds the Android APK for Logistik or Rechner (Versand) app using Gradle.

- **bump-version** — `c:\Users\Trusc\Desktop\Tresch-Apps\.claude\skills\bump-version`
  - Wenn der Nutzer "version erhöhen", "neue version", "build nummer", "/bump-version" sagt.

- **deploy** — `c:\Users\Trusc\Desktop\Tresch-Apps\.claude\skills\deploy`
  - Wenn der Nutzer "deployen", "pushen", "veröffentlichen", "auf GitHub laden" oder "/deploy" sagt.

- **security-check** — `c:\Users\Trusc\Desktop\Tresch-Apps\.claude\skills\security-check`
  - Wenn der Nutzer "sicherheit prüfen", "secrets prüfen", "safe to push", "/security-check" sagt,

- **sync-assets** — `c:\Users\Trusc\Desktop\Tresch-Apps\.claude\skills\sync-assets`
  - Synchronisiert Web-Dateien aus Tresch-Apps nach Android assets/ — für USB-APK-Deploy.

- **test-apps** — `c:\Users\Trusc\Desktop\Tresch-Apps\.claude\skills\test-apps`
  - Wenn der Nutzer "testen", "prüfen ob alles läuft", "app testen", "/test-apps" sagt.

### User-scoped

_None found._

---

## Suggested next steps

- **MCP:** Use this extension’s hub **MCP** tab, or `claude mcp list` in the terminal. In Claude Code, use `/mcp` to connect servers for the session.
- **Edit config:** Open `~/.claude.json` (user MCP) or `<workspace>/.mcp.json` (project MCP) via the extension commands.
- **Refresh this report:** run **Intelligence — scan MCP & Skills awareness** again after changing MCP config or adding skills.

_Report from Cloude Code ToolBox extension._
