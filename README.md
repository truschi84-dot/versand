# Tresch Kombi-App (Firmen-Handy)

Nur die **Firmen-App** liegt hier im Root – alles andere unter **`projekt/`**.  
Ausnahme: **`kaninchen/`** bleibt im Root (feste Online-URL: `/versand/kaninchen/`).

| Was | Wo |
|-----|-----|
| **Handy-App öffnen** | `index.html` |
| **PC Control Center** | `projekt/pc/control-center.html` |
| **Deploy / Docs / Tools** | `projekt/` |

```powershell
# Server + Admin
projekt\scripts\start-buero-server.ps1
# → App:     http://localhost:8080/index.html
# → Admin:   http://localhost:8080/projekt/pc/control-center.html

# APK auf Handy
projekt\scripts\deploy-android.ps1
```

Details: `projekt/README.md`
