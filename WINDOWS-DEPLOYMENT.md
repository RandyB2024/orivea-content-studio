# ORIVÈA Content Studio op Windows en Cloudflare Tunnel

## 1. Applicatie voorbereiden

Open PowerShell in de projectmap en voer uit:

```powershell
node --version
npm --version
npm install
Copy-Item .env.example .env
```

Vul `.env` in en start één keer handmatig:

```powershell
npm run start:prod
```

Controleer `http://localhost:3000/health` en `http://localhost:3000/login`. `/health` retourneert alleen `{"status":"ok"}`.

## 2. Node automatisch starten

Gebruik Windows Taakplanner. Open PowerShell **als administrator** in de projectmap en voer uit:

```powershell
$script = (Resolve-Path .\scripts\start-windows.ps1).Path
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
Register-ScheduledTask -TaskName "ORIVEA Content Studio" -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -User $env:USERNAME
Start-ScheduledTask -TaskName "ORIVEA Content Studio"
```

Controleer de status met `Get-ScheduledTask -TaskName "ORIVEA Content Studio"`. Logs komen in `data/logs/`. Stel in Taakplanner desgewenst **Uitvoeren ongeacht of gebruiker is aangemeld** in; Windows vraagt dan éénmalig om het lokale accountwachtwoord.

## 3. Cloudflare Tunnel handmatig maken

Voer deze accountacties zelf uit. Installeer eerst `cloudflared` volgens de officiële Cloudflare-documentatie. Open daarna een administrator-CMD in de map met `cloudflared.exe`:

```cmd
cloudflared.exe tunnel login
cloudflared.exe tunnel create orivea-content-studio
cloudflared.exe tunnel list
cloudflared.exe tunnel route dns orivea-content-studio content.orivea.nl
```

Noteer de tunnel-UUID. Maak `%USERPROFILE%\.cloudflared\config.yml`:

```yaml
tunnel: <TUNNEL-UUID>
credentials-file: C:\Users\<WINDOWS-GEBRUIKER>\.cloudflared\<TUNNEL-UUID>.json

ingress:
  - hostname: content.orivea.nl
    service: http://localhost:3000
  - service: http_status:404
```

Valideer en test vóór installatie als service:

```cmd
cloudflared.exe tunnel ingress validate
cloudflared.exe tunnel ingress rule https://content.orivea.nl
cloudflared.exe tunnel run orivea-content-studio
```

De DNS-route is een CNAME van `content.orivea.nl` naar `<TUNNEL-UUID>.cfargotunnel.com`. Het route-commando maakt die record aan; wijzig DNS niet vanuit de applicatie.

## 4. Cloudflared als Windows-service

Volg voor de service de actuele officiële Windows-handleiding. In hoofdlijnen: plaats `cloudflared.exe` in `C:\Cloudflared\bin`, installeer vanuit administrator-CMD met `cloudflared.exe service install`, kopieer `config.yml` en de tunnelcredentials naar `C:\Windows\System32\config\systemprofile\.cloudflared\`, en laat de service met die configuratie starten.

Controlecommando’s:

```cmd
sc query cloudflared
sc start cloudflared
```

Open geen poort 3000 in Windows Firewall of de router. Het gewenste pad is: internet → Cloudflare → Tunnel → `localhost:3000` → Content Studio.

## 5. Eindcontrole

1. Herstart Windows.
2. Controleer de Taakplanner-taak en `sc query cloudflared`.
3. Open `https://content.orivea.nl/health`.
4. Log in en test dashboard, contentupload, kalender en publicatielog.
5. Herstart de Node-taak en controleer dat content, uploads en geplande posts behouden zijn.
6. Voer `npm run backup` uit en controleer de timestampmap.

Als de computer uitstaat, slaapt of geen internet heeft, is Content Studio offline en publiceert de scheduler niet.

## Optioneel: Cloudflare Access

In Cloudflare Zero Trust kan vóór `content.orivea.nl` een self-hosted Access-app worden geplaatst met alleen jouw toegestane identiteit. Dit is optioneel: de ORIVÈA-login blijft altijd actief als tweede beveiligingslaag.
