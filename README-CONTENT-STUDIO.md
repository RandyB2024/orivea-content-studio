# ORIVÈA Content Studio

Private Node.js/Express-app voor `https://content.orivea.nl`. De broncode staat in GitHub; GitHub Pages wordt niet gebruikt. De applicatie, SQLite-database, uploads en scheduler draaien op de eigen Windows-computer.

## Lokaal starten

1. Installeer Node.js LTS en controleer `node --version` en `npm --version`.
2. Voer in de projectmap `npm install` uit.
3. Kopieer `.env.example` naar `.env`.
4. Genereer een hash met `node -e "console.log(require('bcryptjs').hashSync('KIES-EEN-STERK-WACHTWOORD',12))"`.
5. Vul minimaal `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET` en `ENCRYPTION_KEY` in.
6. Start met `npm start` en open `http://localhost:3000/login`.

De tabellen worden automatisch aangemaakt in `data/orivea-content-studio.sqlite`. Private media staat in `data/uploads`. Beide locaties zijn uitgesloten van Git.

## Productie draaien op Windows

De volledige procedure voor automatisch starten, Cloudflare Tunnel en controles staat in [WINDOWS-DEPLOYMENT.md](WINDOWS-DEPLOYMENT.md). Productie gebruikt:

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
BASE_URL=https://content.orivea.nl
DATABASE_PATH=data/orivea-content-studio.sqlite
UPLOAD_PATH=data/uploads
```

Start handmatig met `npm run start:prod`. De server luistert uitsluitend op `127.0.0.1:3000`; open geen routerpoort en maak geen port-forwarding. Cloudflare Tunnel routeert `https://content.orivea.nl` naar `http://localhost:3000` en verzorgt publieke HTTPS.

## Scheduler en offline gedrag

De scheduler draait alleen zolang Windows en de Node-app actief zijn. Bij herstart worden vervallen geplande posts opnieuw gecontroleerd. Een post die meer dan twee uur is gemist wordt `action_required` en nooit automatisch uren of dagen later gepubliceerd. De gebruiker kiest daarna zelf **Nu publiceren** of **Annuleren**.

## Back-up

Voer `npm run backup` uit. Dit maakt `backups/backup-YYYYMMDD-HHMMSS/` met:

- een consistente SQLite-snapshot;
- `metadata.json` zonder tokenwaarden;
- een kopie van private uploads;
- `upload-manifest.json`.

Bewaar regelmatig een kopie buiten deze computer. De map `backups/` staat niet in Git.

## Callback-URL's

- Meta: `https://content.orivea.nl/auth/meta/callback`
- TikTok: `https://content.orivea.nl/auth/tiktok/callback`
- Pinterest: `https://content.orivea.nl/auth/pinterest/callback`

De app blijft privé achter de eigen login. Alle pagina’s sturen `X-Robots-Tag: noindex, nofollow`; dashboardpagina’s bevatten ook een robots-meta-tag. Cloudflare Access kan optioneel als extra laag vóór de eigen login worden gezet.
