# Updates – ohne Speicher-Chaos und ohne Extra-Kosten

## Warum war der Speicher „sofort voll“?

Das war **fast sicher nicht** euer Firebase-Server oder „Volumen“ im Hosting.

| Was ihr dachtet | Was wirklich passiert ist |
|-----------------|---------------------------|
| Server/Hosting frisst Speicher | **Handy-Browser-Cache** (Service Worker) |
| Muss Geld kosten | SW hat **jede** Datei mehrfach gespeichert (`?v=80`, `?v=81`, alte SW-Versionen …) |

Der alte `sw.js` hat bei **jedem** Seitenaufruf `cache.put(...)` gemacht → Hunderte MB auf dem Tablet/Handy, bis „Speicher voll“.

**Eure Lieferdaten** in `localStorage` sind separat (ein paar MB). Problematisch waren die **Cache-API** + **Service Worker**.

### Was jetzt anders ist

- Service Worker **speichert nichts mehr** (nur noch Aufräumen + Abmeldung).
- Beim App-Start: **alle Caches löschen** (`initLeanStorageHygiene`).
- APK bei neuem `webVersion`: **WebView-Cache leeren** (nur eine Version).
- Remote-Laden: `LOAD_NO_CACHE` – kein Anhäufen alter JS-Dateien.

---

## Drei Wege – alle ohne Zusatz-Abo nötig

### 1) Empfohlen: APK + USB (0 €, kein Server)

Wie jetzt: `deploy-android.ps1` → Web-Dateien in die APK, einmal pro Update per USB.

- **Kein** Handy-Cache-Problem vom Server
- **Kein** Hosting
- Nachteil: jedes Gerät einmal am PC

### 2) Kostenlos im Büro-WLAN (0 €, kein Internet-Hosting)

PC startet `node server.js` (Port 8080). In Firebase `app_config` **nur im Büro**:

```json
{
  "webBaseUrl": "http://192.168.1.50:8080",
  "webVersion": 82
}
```

Handys im gleichen WLAN laden die App vom PC – **kein** Firebase Hosting, **kein** Paid-Tier.

- Abends `webBaseUrl` leer lassen oder APK-Fallback → offline mit eingebauter Version

### 3) Firebase Hosting **Free Tier** (0 € bei kleiner Nutzung)

Ihr nutzt **ohnehin** schon Firebase (Backup). Hosting Free Tier reicht für diese App (~10 MB Dateien, wenige Nutzer).

- Das füllt **nicht** das Handy, wenn der SW aus bleibt (siehe oben).
- Kosten erst bei sehr viel Traffic – für ein Team praktisch **0 €**.

**Nur** `app_config` in RTDB (ein kleines JSON) – das verbraucht kaum Volumen.

---

## Wenn du **keinen** Server willst

→ Weg **1** (USB/APK). OTA-Hosting ist **optional**, nicht Pflicht.

`app-shell.json` / `app_config`: **`webBaseUrl` leer lassen** → App läuft aus der APK (Standard).

---

## Cache manuell leeren (Handy)

Rechner-Menü → **„App-Cache leeren“** (oder in der Konsole `clearAppBrowserCache()`).

Löscht Browser-Cache, **nicht** Lieferungen/PIN in `localStorage`.

---

## Kurz

- Früher: SW = Speicher voll → **kein** sinnvolles Server-Problem.
- Heute: SW tot + Cache-Cleanup → Server-OTA ist wieder **möglich**, aber **nicht nötig**.
- **0 €:** USB-Deploy oder Büro-WLAN mit `server.js`.
