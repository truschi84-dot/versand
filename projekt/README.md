# Tresch Kombi-App – Projekt & Tools

Alles außer der **Firmen-Handy-App** liegt hier unter `projekt/`.  
Die App selbst (Root): siehe `../README.md`

## Schnellstart

| Was | Wo öffnen / Befehl |
|-----|-------------------|
| **Control Center (Desktop)** | Einmal: `scripts/Control-Center-Desktop.bat` → Verknüpfung auf dem Desktop |
| **Control Center starten** | Desktop-Verknüpfung **oder** `scripts/Control-Center-Starten.bat` |
| **Handy-App** | `../index.html` oder Server → http://localhost:8080 |
| **PC Control Center** | http://localhost:8080/projekt/pc/control-center.html → Tab **Updates & Deploy** |
| **Deploy Android (USB)** | Im Control Center oder `scripts/deploy-android.ps1` |
| **Firebase sichern** | `docs/FIREBASE_SICHERHEIT.md` |

```powershell
# Vom Repo-Root:
projekt\scripts\start-buero-server.ps1
projekt\scripts\deploy-android.ps1

# Firebase-Regeln deployen (aus diesem Ordner):
cd projekt
firebase deploy --only database
```

---

## Ordnerstruktur

```
assets/                          ← Firmen-App (nur das aufs Handy)
├── index.html
├── app-update.json, app-version.json
├── app-secrets.json             ← lokal, nicht in Git
├── manifest.webmanifest, sw.js
├── js/, css/, lib/, icons/
├── kaninchen/                   ← Ausnahme: feste GitHub-URL /versand/kaninchen/
│
└── projekt/                     ← alles andere
    ├── pc/                      ← PC-Admin (nicht in APK)
    │   ├── control-center.html
    │   ├── kontingent.html
    │   ├── Checkliste.html
    │   └── kaninchen.html
    ├── docs/                    ← Anleitungen
    ├── config/                  ← Vorlagen, Firebase-Regeln
    ├── scripts/                 ← Deploy & Publish
    ├── dist/                    ← APK, Verteiler
    ├── server.js
    ├── firebase.json
    └── deploy.config.json       ← lokal, nicht in Git
```

---

## Wichtig

- **Nicht auf GitHub:** `../app-secrets.json`, `deploy.config.json`
- **PC-Dateien** (`pc/`) und **projekt/** werden nicht in die APK kopiert
- **Kaninchen** (`../kaninchen/`) liegt im Root für GitHub-URL, geht **nicht** in die Firmen-APK
- **Lokale Backups (später):** `backups-local/` – getrennt von Firebase `/backup`
- **Firebase Hosting** (`firebase.json`) veröffentlicht nur den App-Root (`..`), nicht `projekt/`

---

## Geplant nach Urlaub (noch nichts verschoben)

Siehe `docs/ROADMAP-NACH-URLAUB.md` – Aufräumen Hasen-App, Archiv-Ordner, Backups trennen.  
**Bis dahin:** alles bleibt an den jetzigen Pfaden, damit App + GitHub + Deploy weiterlaufen.
