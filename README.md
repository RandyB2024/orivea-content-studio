# ORIVÈA Workspace + Social Agent

Beveiligde Node/Express workspace voor ORIVÈA. Deze repo bevat:

- dashboard met login
- orders, contactaanvragen en nieuwsbrief-events
- uploadbibliotheek voor afbeeldingen en reels
- social AI agent met concepten, goedkeuren, plannen en publiceren
- beveiligde webhooks voor de ORIVÈA webshop
- lokale SQLite-database voor Windows-hosting

## Installatie

```bash
npm install
```

Maak daarna een `.env` op basis van `.env.example`.

```bash
cp .env.example .env
```

Minimaal nodig:

```env
ADMIN_USERNAME=...
ADMIN_PASSWORD=...
SESSION_SECRET=...
WORKSPACE_WEBHOOK_SECRET=...
```

`ADMIN_PASSWORD` mag gewone tekst zijn of een bcrypt hash.

## Starten

```bash
npm start
```

Voor productie op Windows en publicatie via Cloudflare Tunnel volgt u [WINDOWS-DEPLOYMENT.md](WINDOWS-DEPLOYMENT.md). De server luistert standaard alleen op `127.0.0.1` en gebruikt `process.env.PORT || 3000`.

## Pagina's

- `/login`
- `/dashboard`
- `/orders`
- `/contact`
- `/newsletter`
- `/social`
- `/assets`
- `/audit`
- `/settings`

Alles is beschermd achter login behalve `/health`, `/login` en de webhook endpoints.

## Webhooks

Alle webhook requests moeten deze header bevatten:

```http
X-ORIVEA-WORKSPACE-SECRET: jouw-secret
```

Endpoints:

```http
POST /api/webhooks/order
POST /api/webhooks/contact
POST /api/webhooks/newsletter
```

Voorbeeld order payload:

```json
{
  "order_number": "ORV-20260620-001",
  "customer_name": "Voorbeeld Klant",
  "customer_email": "klant@example.com",
  "customer_phone": "0612345678",
  "customer_address": "Kerkstraat 12\n1234 AB Utrecht",
  "order_date": "2026-06-20",
  "order_items": "Glantier 759 50 ml x 1",
  "subtotal": 12.95,
  "shipping_cost": 6.95,
  "vat_rate": 21,
  "vat_amount": 3.45,
  "total": 19.90,
  "paypal_transaction_id": "PAYPAL-ID",
  "payment_status": "COMPLETED",
  "payment_method": "PayPal"
}
```

Belangrijk voor webshop-integratie: stuur de order pas door nadat PayPal `COMPLETED`/capture bevestigd is en nadat EmailJS geprobeerd is. Als deze workspace API tijdelijk faalt, mag de klantflow niet blokkeren; log de fout in de browser/server en probeer later opnieuw.

## Social Agent

```bash
npm run generate:daily -- --date=2026-06-20
npm run generate:week -- --start=2026-06-22
npm run check
```

Nieuwe concepten komen in `drafts/`, afgekeurde posts in `rejected/`. De kalender staat in `content-calendar/YYYY-MM.json`. Handmatige statuswijzigingen kunnen via de dashboardpagina `/social` of via CLI:

```bash
node src/status-manager.js approve <post-id> <naam>
node src/status-manager.js reject <post-id> <naam> "reden"
node src/status-manager.js schedule <post-id> <naam> 2026-06-20T10:00:00+02:00
node src/status-manager.js published <post-id> <naam>
```

## Veiligheid

- `autoPublish` staat standaard uit.
- Handmatige goedkeuring blijft verplicht.
- Geen medische claims.
- Geen inkomensgaranties.
- Geen directe parfumclaims of designervergelijkingen in social content.
- Partnerposts bevatten disclosure zoals `#ad` of `#samenwerking`.

## Database

SQLite staat standaard op:

```text
data/orivea-content-studio.sqlite
```

Deze database wordt niet in Git opgeslagen en blijft persistent op de lokale Windows-machine. Maak periodiek een back-up met `npm run backup`.
