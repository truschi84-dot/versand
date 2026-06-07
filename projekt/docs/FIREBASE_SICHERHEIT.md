# Firebase absichern – Schritt für Schritt

Nach diesem Update ist die Cloud **nicht mehr öffentlich**. App und PC brauchen:

1. **Firebase Auth** (ein Firmen-Konto)
2. **`app-secrets.json`** (lokal, nicht auf GitHub!)
3. **Neue Datenbank-Regeln** (deployen)

---

## Teil 1: Firebase Auth anlegen (einmalig, ~10 Min.)

1. Öffne [Firebase Console](https://console.firebase.google.com/project/tresch-versand-default/authentication/users)
2. **Authentication** → **Get started** (falls noch nicht aktiv)
3. Sign-in method: **E-Mail/Passwort** → **Aktivieren**
4. Tab **Users** → **Add user**
   - E-Mail z. B. `kombi@tresch-sohn.de` (beliebig, nur intern)
   - Passwort: **lang & zufällig** (min. 12 Zeichen) – notieren!

---

## Teil 2: Web API Key holen

1. [Projekteinstellungen](https://console.firebase.google.com/project/tresch-versand-default/settings/general) → **Allgemein**
2. Unter „Deine Apps“ ggf. **Web-App** hinzufügen (Nickname: „Kombi“)
3. **`apiKey`** kopieren (beginnt mit `AIza...`)

---

## Teil 3: `app-secrets.json` anlegen (auf jedem PC + in APK)

Im Ordner `assets`:

```powershell
copy config\app-secrets.example.json app-secrets.json
```

Dann `app-secrets.json` ausfüllen:

```json
{
  "firebaseApiKey": "AIza...",
  "firebaseAuthEmail": "kombi@tresch-sohn.de",
  "firebaseAuthPassword": "DeinLangesGeheimPasswort"
}
```

**Wichtig:**

- `app-secrets.json` steht in `.gitignore` → **nie** auf öffentliches GitHub pushen
- Beim Android-Deploy (`deploy-android.ps1`) wird die Datei **mit** in die APK kopiert (wenn vorhanden)
- Für GitHub Pages: Datei **nur** lokal auf dem Deploy-PC, nicht im Repo

---

## Teil 4: App zuerst testen (wichtig – Reihenfolge!)

**Erst App + Secrets, dann Regeln** – sonst sperrst du dich selbst aus der Cloud.

1. `app-secrets.json` anlegen (Teil 3)
2. `projekt/pc/control-center.html` im Browser öffnen → Cloud laden testen
3. Kombi-App lokal oder per Deploy testen → PIN → Cloud-Sync

Erst wenn das klappt → Teil 5 (Regeln).

---

## Teil 5: Datenbank-Regeln deployen (zuletzt!)

Im Terminal:

```powershell
cd C:\Users\Trusc\Desktop\assets\projekt
firebase deploy --only database
```

Die Datei `database.rules.json` erlaubt Lesen/Schreiben **nur mit Firebase-Login** (`auth != null`) – **ausser** `kaninchen_futter_2026` (öffentlicher Futterplan, ohne Login).

**Test:** Im Browser `https://tresch-versand-default-rtdb.firebaseio.com/backup.json` öffnen → sollte **`Permission denied`** zeigen.

---

## Teil 6: App auf alle Geräte bringen

1. Neue PIN im PC Control Center setzen → **„Einstellungen anwenden & synchronisieren“**
2. Deploy:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy-android.ps1
```

oder OTA: `publish-ota.ps1` (mit `app-secrets.json` im Hosting-Ordner – nur wenn nicht öffentlich!)

3. Jedes Handy: App öffnen → **neue PIN** eingeben

---

## Bei Kündigung eines Mitarbeiters

| Schritt | Wirkung |
|---------|---------|
| 1. Im PC: **neue Logistik-PIN** setzen + synchronisieren | `pinVersion` steigt – Handys löschen **lokale Firmendaten** beim nächsten Öffnen/Sync (ohne dass du das Handy hast) |
| 2. Optional: App auf seinem Handy **löschen** | Rest + Cache sicher weg |
| 3. Optional: Firebase Auth **Passwort ändern** + `app-secrets.json` neu + neu deployen | Cloud-Zugang in alter APK ungültig |

Ohne neue PIN: **kein Cloud-Zugriff**. Nach PIN-Wechsel: **Lieferanten/Sorten auch nicht mehr lokal** auf dem Gerät (sobald die App einmal online war).

---

## Fehlerbehebung

| Symptom | Lösung |
|---------|--------|
| „app-secrets.json fehlt“ | Teil 3 – Datei anlegen |
| „Firebase-Login fehlgeschlagen“ | E-Mail/Passwort in Console prüfen |
| „Permission denied“ bei Cloud | `firebase deploy --only database` |
| Handy lädt keine Daten | `app-secrets.json` in APK? Neu deployen |

---

## Was jetzt geschützt ist

- ✅ Ganze App (Rechner + Logistik) nur mit PIN
- ✅ Cloud-Zugriff nur mit Firebase-Login (Token in App)
- ✅ PIN wird gegen **Cloud** geprüft (alte PIN nach Änderung wirkungslos)
- ✅ `pinVersion` steigt bei PIN-Wechsel
- ⚠️ Alte Daten auf gelöschter App: nur durch **App löschen** am Gerät
