# Roadmap: Ordner aufräumen (nach Urlaub)

**Stand:** Vorbereitet, aber **noch nichts verschoben** – App, GitHub und Deploy laufen unverändert.

---

## Ziel

- **Ein klarer Hauptordner** (Tresch-App)
- **Control Center** als Programm vom Desktop (Verknüpfung existiert schon)
- **Hasen/Kaninchen, Sylt, Kontingent** → Archiv, nicht im Firmen-App-Root
- **Backups** getrennt: Firebase Live-Daten vs. lokale PC-Sicherungen

---

## Was jetzt schon sicher ist (nicht anfassen nötig)

| Inhalt | Ort heute | In APK? | Online? |
|--------|-----------|---------|---------|
| Firmen-App | `assets/` Root | Ja | GitHub `/versand/` |
| Control Center | `projekt/pc/` | Nein | nur localhost:8080 |
| Kaninchen | `assets/kaninchen/` | Nein | GitHub `/versand/kaninchen/` |
| Tools/Skripte | `projekt/scripts/` | Nein | Nein |
| Firebase Daten | `/backup` in Cloud | — | Ja |

`deploy-android.ps1` kopiert **nur** index.html, js/, css/, lib/, icons/ – **nicht** kaninchen/, **nicht** projekt/.

---

## Schritte später (mit Cursor, gebündelt)

1. **Desktop-Verknüpfung** (falls noch nicht): `scripts/Control-Center-Desktop.bat`
2. **Archiv-Ordner** anlegen, z.B. `projekt/archiv/kaninchen/` – Inhalte **kopieren**, alte URLs per Redirect oder GitHub-Pfad beibehalten bis Umstellung getestet
3. **backups-local/** nutzen für manuelle Exports (Ordner existiert schon)
4. **deploy.config.json** Pfade prüfen nach Verschiebung
5. **Einmal testen:** USB-Deploy + GitHub + Kaninchen-URL + Control Center

---

## Was wir NICHT tun dürfen ohne Test

- Kaninchen-Ordner löschen (GitHub-URL `/versand/kaninchen/`)
- Firebase `/backup` Pfad ändern (alle Handys)
- `index.html` / `app-update.json` Pfade auf GitHub Pages brechen
- Stammdaten in localStorage/Cloud löschen

---

## Kurz für dich bis nach dem Urlaub

- Alles **so lassen**
- Updates: **Control Center → Updates & Deploy**
- Notizen: dieser Plan liegt in `projekt/docs/ROADMAP-NACH-URLAUB.md`
