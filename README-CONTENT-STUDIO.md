# ORIVÈA Content Studio

Private Node.js/Express-app voor `https://content.orivea.nl`. SQLite bewaart content, campagnes, posts, platformstatussen, logs en sessies. Media staat buiten `public` en wordt alleen na login via een gecontroleerde route geleverd.

## Lokaal starten

1. Voer `npm install` uit.
2. Kopieer `.env.example` naar `.env`.
3. Genereer een hash met `node -e "console.log(require('bcryptjs').hashSync('KIES-EEN-STERK-WACHTWOORD',12))"`.
4. Vul `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` en een willekeurige `SESSION_SECRET` van minstens 32 tekens in.
5. Start met `npm start` en open `http://localhost:3000/login`.

De database en tabellen worden automatisch aangemaakt. Zet op Render een persistent disk voor `data/` en `uploads/`. Gebruik build command `npm install`, start command `npm start` en healthcheck `/health`.

## Veiligheid en workflow

Alle dashboards vereisen login. Wachtwoorden worden uitsluitend als bcrypt-hash geaccepteerd. Sessies staan in SQLite; cookies zijn HttpOnly, SameSite=Lax en in productie Secure. Mutaties vereisen CSRF, login is begrensd, uploads worden op MIME-type en grootte gecontroleerd en alle responses krijgen `X-Robots-Tag: noindex, nofollow`.

Een post wordt alleen `scheduled` met goedgekeurde gebruiksrechten en `approved_at`. De server-scheduler claimt een post atomair. Zonder officiële social-koppeling wordt geen aanvraag uitgevoerd en ontstaat `action_required` met een publicatielog.

## Deployment en DNS

Maak bij Render een web service voor deze repository en koppel daarna een custom domain `content.orivea.nl`. Voeg bij de DNS-provider de CNAME toe die Render voor dit custom domain toont. HTTPS wordt door Render uitgegeven nadat DNS is gevalideerd.

De app hoort niet in webshopnavigatie, footer of sitemap. Callback-URL's zijn:

- `https://content.orivea.nl/auth/meta/callback`
- `https://content.orivea.nl/auth/tiktok/callback`
- `https://content.orivea.nl/auth/pinterest/callback`

Back-up vóór deployment: kopieer de SQLite-database en de private `uploads/` map samen. Een interactieve ZIP/JSON export en importpreview zijn nog niet geïmplementeerd.
