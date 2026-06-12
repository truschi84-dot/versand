# Bekannte Wiederkehrende Fehler — Tresch Apps

Diese Datei dokumentiert Fehler die mehrfach aufgetreten sind.
**Vor jeder Änderung hier nachschauen!**

---

## 🔴 Scroll-Lock nach Menü öffnen (Rechner-App)

**Symptom:** Nach dem Öffnen/Schließen des Burger-Menüs scrollt die restliche Seite nicht mehr.

**Ursache:** `body.menu-open { overflow: hidden; touch-action: none; }` in `index.html` — sperrt den ganzen Body, nicht nur den Drawer.

**Fix:** `overflow: hidden` aus `body.menu-open` entfernen. Der Drawer sperrt sich selbst intern. Nur `touch-action: none` darf für das Overlay bleiben wenn nötig.

**Datei:** `index.html` Zeile ~27

**Zuletzt aufgetreten:** Build 114, Build 117

---

## 🔴 Scroll-Lock in Logistik (Bottom Sheet)

**Symptom:** Nach dem Öffnen eines Bottom Sheets in der Logistik-App scrollt die Seite darunter nicht mehr.

**Ursache:** `applyLogistikDocumentScroll()` setzte `overflow: hidden` auf document — blieb hängen unabhängig vom Bottom-Sheet-Status.

**Fix:** `applyLogistikDocumentScroll()` komplett entfernt (Build 114). Kein `overflow: hidden` auf Document/Body in Logistik setzen.

**Datei:** `logistik/js/app.js`

**Zuletzt aufgetreten:** Build 114

---

## 🔴 APK enthält veraltete Web-Dateien

**Symptom:** Installierte APK zeigt alte App-Version, Supabase/neue Features fehlen.

**Ursache:** `AndroidStudioProjects/Versand/app/src/main/assets/` war nicht synchronisiert — Gradle packt was da liegt.

**Fix:** Immer vor APK-Build syncen: Web-Dateien aus `Tresch-Apps/` → `assets/`. Niemals direkt in `assets/` entwickeln.

**Zuletzt aufgetreten:** Build 116/117

---

## 🔴 app-secrets.json in Android assets gelandet

**Symptom:** Geheime Datei wurde in APK eingepackt.

**Ursache:** Beim Sync wurde der komplette Tresch-Apps-Ordner inkl. Secrets kopiert.

**Fix:** Nach Sync immer `Remove-Item "$dst\js\app-secrets.json"` ausführen. Assets-Ordner darf NIEMALS `app-secrets.json` enthalten.

**Zuletzt aufgetreten:** Juni 2026

---

## 🟡 Doppelbuchung bei Artikel-Sync (Rechner)

**Symptom:** Verwaiste Buchungen mit gleicher FertigNr werden doppelt gezählt.

**Fix:** Build 115 — verwaiste Buchungen bei Artikel-Sync bereinigen.

**Datei:** `js/rechner.js`

---

## 🟡 Sitzungs-ID Sortierung — 2x selber Lieferant am gleichen Tag

**Symptom:** Wenn ein Lieferant zweimal am selben Tag sortiert wird (mit Reset dazwischen), zählt die 2. Session falsch.

**Status:** Build 115 gefixt mit Sitzungs-ID für Sortierung.
