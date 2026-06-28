# Skill: pi-info

Zeigt alle wichtigen Infos zum Raspberry Pi Setup — IPs, Dienste, SSH-Befehl.

## Trigger
Wenn der Nutzer "/pi-info", "/ssh", "pi info", "pi adresse", "ssh pi", "ssh befehl" oder "was ist die pi ip" sagt.

## Output

Gib folgende Informationen aus:

---

**SSH verbinden:**
```
ssh thome@100.103.139.63
```

**Dienste:**
| Dienst | URL |
|--------|-----|
| Immich (Fotos) | http://100.103.139.63:2283 |
| Home Assistant | http://100.103.139.63:8123 |
| Pi Dashboard | http://100.103.139.63:5000 |
| Cockpit | http://100.103.139.63:9090 |

**Lokale IP:** 192.168.2.140  
**Tailscale IP:** 100.103.139.63  
**Benutzer:** thome

**Wichtige Befehle:**
```bash
sudo systemctl restart pi-dashboard   # Dashboard neu starten
sudo docker restart homeassistant     # Home Assistant neu starten
cat /proc/mdstat                      # RAID Status
df -h /mnt/nas                        # NAS Speicher
```

Für alle Details: Lies die Memory-Datei `project_pi_setup.md`
