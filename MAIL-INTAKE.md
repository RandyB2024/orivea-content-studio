# ORIVÈA Mail Intake Agent

De webshop verstuurt formulieren en betaalde orders altijd via EmailJS. De Content Studio leest die berichten later via Microsoft Graph en maakt lokale database-records. Uitval van Content Studio heeft daardoor geen invloed op formulieren of PayPal.

## Microsoft Graph configureren

Registreer in Microsoft Entra ID een server-app met application permission `Mail.Read` en geef admin consent. Beperk de app bij voorkeur met een Exchange Application Access Policy tot alleen `shop@orivea.nl`.

```env
MAIL_TENANT_ID=...
MAIL_CLIENT_ID=...
MAIL_CLIENT_SECRET=...
MAILBOX_ADDRESS=shop@orivea.nl
MAIL_POLL_INTERVAL_MINUTES=3
```

Secrets blijven uitsluitend in de lokale `.env`. De agent gebruikt OAuth client credentials en slaat geen mailboxwachtwoord op.

## EmailJS templates

De webshop levert bij ieder ondersteund bericht `request_id` en `orivea_data`. Voeg in de beheeromgeving van EmailJS onderaan de interne mailtemplate deze variabele toe:

```text
{{orivea_data}}
```

Contact-, B2B-, nieuwsbrief- en Scent Club-berichten bevatten het blok ook in hun bestaande berichtveld. Voor de ordertemplate is `{{orivea_data}}` noodzakelijk.

## Gedrag

- Bij startup volgt na drie seconden een controle; daarna wordt iedere 1-5 minuten gepolld.
- De eerste controle kijkt standaard veertien dagen terug. Daarna wordt `last_mail_sync_at` gebruikt.
- `message_id` voorkomt dubbele mailverwerking; `request_id` voorkomt dubbele entities als API en mailbox hetzelfde verzoek leveren.
- Orders uit e-mail krijgen altijd `payment_status=verification_required`. Een capture-ID in een mail is identificatie, geen server-side betaalbewijs.
- Onduidelijke e-mails blijven als `review_required` zichtbaar onder **Mail Intake**.
- Handmatig synchroniseren kan via **Mail Intake → Controleer mailbox nu**.
