# Kaninchen-Seite online – ohne die Kombi-App zu stören

## Kurz: Kein Konflikt mit dem anderen Projekt

| Thema | Kombi-App (Logistik/Rechner) | Kaninchen-Seite |
|--------|------------------------------|-----------------|
| Datei | `index.html`, `script.js`, … | nur `kaninchen.html` (~30 KB) |
| App-Update / Version | `app-update.json`, `app-version.json` | **wird nicht angefasst** |
| Handy-Cache / Service Worker | `sw.js` | eigener `kaninchen-sw.js` (nur Netzwerk, **löscht keine Daten**) |
| Firebase | `/backup` (Lieferdaten) | `/kaninchen_futter_2026` (eigener Pfad) |
| Traffic / „Volumen“ | nur wenn jemand die App öffnet | nur wenn jemand den Kaninchen-Link öffnet |

Die Kombi-App läuft weiter wie bisher. Eine extra HTML-Datei im gleichen GitHub-Repo verbraucht praktisch kein zusätzliches Kontingent, solange ihr **nicht** bei jedem Kaninchen-Push die App-Version hochdreht.

---

## Empfohlen: Gleiches GitHub Pages, eigener Publish-Befehl

**URL nach dem Upload:**

https://truschi84-dot.github.io/versand/kaninchen.html

**Nur die Kaninchen-Seite hochladen** (ohne `-BumpVersion`, ohne `publish-github.ps1`):

```powershell
cd C:\Users\Trusc\Desktop\assets
powershell -File scripts\publish-kaninchen.ps1 -PushToGitHub -Message "Kaninchen-Futterplan online"
```

Das Skript committet **nur** `kaninchen.html` und `KANINCHEN_ONLINE.md` – **nicht** `index.html`, `app-update.json`, `script.js`.

WhatsApp-Link zum Teilen: dieselbe URL oben.

**App installieren:** In der Seite unten „App aufs Handy“ – Android: „App installieren“; iPhone: Safari → Teilen → Zum Home-Bildschirm. **Einträge in der Cloud bleiben** beim Installieren.

---

## Was ihr NICHT tun solltet (damit die App ruhig bleibt)

- **Nicht** `publish-github.ps1 -BumpVersion` nur wegen der Kaninchen-Seite  
  → sonst steigt `webVersion` und Kollegen bekommen ein App-Update angeboten.
- **Nicht** `kaninchen.html` in `index.html` einbinden  
  → die Kombi-App lädt sie nicht mit.
- **Nicht** Kaninchen in `sw.js` (Kombi) einbauen  
  → stattdessen nur `kaninchen-sw.js` (kein Cache-Löschen, Firebase/localStorage unberührt).
- **Nicht** den Kaninchen-Pfad unter `/backup` speichern  
  → eigener Pfad `kaninchen_futter_2026` (siehe unten).

---

## Firebase (gemeinsame Nutzung, getrennte Daten)

Ihr könnt dasselbe Firebase-Projekt nutzen – **andere Datenbank-Pfade**, kein Extra-Abo für die kleine Seite.

In der Console → **Realtime Database** → **Regeln** ergänzen:

```json
"kaninchen_futter_2026": {
  ".read": true,
  ".write": true
}
```

`/backup` und die App bleiben unverändert.

---

## Optional: Komplett eigenes Repo (maximale Trennung)

Nur nötig, wenn ihr die Kaninchen-URL **ohne** `/versand/` wollt.

1. Neues GitHub-Repo z. B. `kaninchen-plan`
2. Nur `kaninchen.html` (und ggf. `KANINCHEN_ONLINE.md`) hinein
3. GitHub Pages aktivieren → URL z. B.  
   `https://truschi84-dot.github.io/kaninchen-plan/`

Eigenes Pages-Kontingent, **null** Einfluss auf `versand`.

---

## Firebase-Regel einmalig (für alle Geräte)

Ohne Regel: Seite läuft im **Vorschau-Modus** nur auf einem Gerät.  
Mit Regel: alle sehen dieselbe Liste über WhatsApp-Link.
