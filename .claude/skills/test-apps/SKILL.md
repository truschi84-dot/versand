# Skill: test-apps

## Trigger
Wenn der Nutzer "testen", "prüfen ob alles läuft", "app testen", "/test-apps" sagt.

## Was dieser Skill macht
Startet den Preview-Server und testet beide Apps (Rechner + Logistik) automatisch.

## Schritte

### 1. Server starten
`preview_start` mit Name "app" (launch.json ist konfiguriert).

### 2. Rechner-App testen (index.html)
- Screenshot: PIN-Screen muss erscheinen
- PIN "3132" eingeben, auf "Entsperren" klicken
- Screenshot: Rechner-App muss erscheinen (Header "Tresch & Sohn", Tabs LKW/Sort/Nölke)
- Burger-Menü öffnen → "LKW-Auswertung" muss vorhanden sein
- Prüfen: onclick enthält "logistik.html"

### 3. Logistik-App testen (logistik.html)
- Zu logistik.html navigieren
- Screenshot: PIN-Screen muss erscheinen
- PIN "3132" eingeben
- Screenshot: Logistik-App muss erscheinen (Header "Logistik", Datum/Lieferant/Mitarbeiter)
- Burger-Menü öffnen → "Zum Rechner" muss vorhanden sein

### 4. Navigation testen
- In Logistik: "Zum Rechner" → muss zu index.html führen
- In Rechner (Menü): "LKW-Auswertung" → muss zu logistik.html führen

### 5. Bericht
Liste was funktioniert ✅ und was nicht ❌.

## Bekannte PINs (nur für Tests)
- Firmen-PIN: 3132
- Admin-PIN: steht nur in den Cloud-Einstellungen (Control Center → Einstellungen) — bewusst nicht im Repo
