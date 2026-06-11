# Erledigt vs. deine Schritte

## Bereits erledigt (automatisch / von Cursor)

| Punkt | Status |
|--------|--------|
| `deploy.config.json` mit **LogistikApp**-Pfad | ✓ |
| Deploy-Skripte + VS-Code-Aufgaben | ✓ |
| **Handy per USB erkannt** (ADB) | ✓ Gerät verbunden |
| Android **MainActivity** mit Druck, Sprache, ZPL, Zurück-Taste | ✓ |
| Doppelte/kaputte MainActivity-Dateien entfernt | ✓ |
| Fehlende JS-Module werden beim Deploy mitkopiert | ✓ |

## Was du noch machen musst

### 1. Einmal: App aufs Handy deployen

In **Cursor**: `Terminal` → `Aufgaben ausführen` →  
**„Kombi: Web kopieren + auf Handy installieren (USB)“**

Oder im Terminal:

```powershell
cd C:\Users\Trusc\Desktop\assets
powershell -ExecutionPolicy Bypass -File scripts\deploy-android.ps1
```

- Handy per **USB** verbunden lassen  
- Beim ersten Mal ggf. am Handy **„USB-Debugging erlauben“** bestätigen  
- Dauer: ca. 1–3 Minuten (Gradle-Build)

### 2. Nach jeder Web-Änderung (dein Alltag)

Nur noch dieselbe Aufgabe ausführen – **Android Studio musst du nicht öffnen**, außer bei nativem Kotlin/Java.

### 3. Optional: Nur APK (wenn Gradle in Cursor hakt)

Zuerst in Android Studio einmal **Run ▶**, danach in Cursor:  
**„Kombi: Nur APK installieren (USB)“**

### 4. Internet auf dem Handy

Die App lädt noch **CDN-Skripte** (Barcode, PDF, Excel) aus dem Internet. WLAN/Mobilfunk muss an sein, sonst fehlen Scanner/PDF.

### 5. Wenn der Build fehlschlägt

- Android Studio → **LogistikApp** öffnen → **File → Sync Project with Gradle Files**  
- Einmal **Build → Rebuild Project**  
- Danach Deploy-Aufgabe in Cursor erneut starten

---

**Kurz:** Alles Vorbereitete ist da – du musst vor allem **einmal die Deploy-Aufgabe starten** (Handy am Kabel). Danach reicht Cursor allein.
