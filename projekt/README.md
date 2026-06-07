# Tresch Kombi-App – Projekt & Tools

Alles außer der **Firmen-Handy-App** liegt hier unter `projekt/`.  
Die App selbst (Root): siehe `../README.md`

## Schnellstart

| Was | Wo öffnen / Befehl |
|-----|-------------------|
| **Handy-App** | `../index.html` oder `scripts/start-buero-server.ps1` → http://localhost:8080 |
| **PC Control Center** | `pc/control-center.html` → http://localhost:8080/projekt/pc/control-center.html |
| **Deploy Android** | `scripts/deploy-android.ps1` |
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
- **Firebase Hosting** (`firebase.json`) veröffentlicht nur den App-Root (`..`), nicht `projekt/`
