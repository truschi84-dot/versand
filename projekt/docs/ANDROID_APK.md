# Kombi-App als Android-APK (WebView)

Die Web-App erwartet in der APK ein **JavascriptInterface** mit dem Namen **`AndroidApp`**.  
Ohne diese Bridge funktionieren Druck, Spracheingabe und ZPL nur im Browser-Fallback.

## Pflicht-Methoden (bereits im Code genutzt)

| Methode | Aufruf von JS | Beschreibung |
|--------|----------------|--------------|
| `printPage()` | `AndroidApp.printPage()` | Systemdruck / Druckdialog für `printArea` |
| `startVoiceInput()` | `AndroidApp.startVoiceInput()` | Spracheingabe starten |
| `sendZplToPrinter(ip, zpl)` | `AndroidApp.sendZplToPrinter(...)` | Etikettendruck (ZPL) |

**Rückruf Sprache:** Nach Erkennung in der Activity:

```java
webView.evaluateJavascript(
    "setVoiceInputResult(" + JSONObject.quote(text) + ");",
    null
);
```

## Empfohlen für APK (neu im Web-Code)

| Methode | Beschreibung |
|--------|--------------|
| `getStatusBarHeightPx()` | Höhe Statusleiste → CSS `--safe-top` |
| `getNavigationBarHeightPx()` | Höhe Navigationsleiste → CSS `--safe-bottom` |
| `lockPortrait()` | Activity auf Hochformat sperren (`SCREEN_ORIENTATION_PORTRAIT`) |

## Hardware-Zurück-Taste

In `onBackPressed()` / `OnBackPressedDispatcher`:

```java
webView.evaluateJavascript(
    "(function(){ return window.handleAndroidBackPress ? handleAndroidBackPress() : false; })()",
    value -> {
        if (!"true".equals(value)) {
            // Web-App hat nichts geschlossen → Activity beenden oder Standard
            super.onBackPressed();
        }
    }
);
```

Reihenfolge in JS: PIN-Overlay → Taschenrechner → Modals → Menüs.

## WebView-Einstellungen (Checkliste)

- `JavaScriptEnabled = true`
- `DomStorageEnabled = true` (localStorage)
- `mixedContentMode = MIXED_CONTENT_ALWAYS_ALLOW` nur wenn nötig
- **Internet** in `AndroidManifest.xml` (`INTERNET`, ggf. `ACCESS_NETWORK_STATE`)
- Firebase / CDN: URLs nicht blockieren
- Dateien: alle Assets aus `assets/` (oder `file:///android_asset/index.html`) – **Pfade relativ** wie im Projekt
- Kein Service Worker nötig für APK (optional weglassen)
- Kamera für Barcode: `CAMERA` + `WebChromeClient.onPermissionRequest`

## Orientierung (AndroidManifest)

```xml
<activity
    android:name=".MainActivity"
    android:screenOrientation="portrait"
    android:configChanges="orientation|screenSize|keyboardHidden" />
```

Portrait in der Manifest ist zuverlässiger als nur JS `screen.orientation.lock`.

## Assets aktualisieren

Nach Änderungen an HTML/JS/CSS den Ordner in die APK kopieren und Version erhöhen.  
Im Web: Cache-Version in `sw.js` / Query `?v=76` – in der APK reicht ein App-Update.

## Erkennung in JavaScript

```javascript
if (typeof AndroidApp !== 'undefined') { /* native APK */ }
// oder: isNativeAndroidApp()
```

Klasse am `<html>`: `is-android-app` + `is-mobile` (Touch-Layout aktiv).
