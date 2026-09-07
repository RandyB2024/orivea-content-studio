# Scent Club intakekoppeling

De bestaande aanvraag op `orivea.nl/scent-club.html` verstuurt via EmailJS en bewaart daarnaast alleen een lokale browserkopie. De Content Studio accepteert aanvragen op:

`POST https://content.orivea.nl/api/webhooks/scent-club-request`

Deze endpoint is uitsluitend bedoeld voor een vertrouwde server-side koppeling. Plaats `WORKSPACE_WEBHOOK_SECRET` nooit in `scent-club.js`, HTML, EmailJS-templatevariabelen of andere openbare browsercode.

## Veilige inrichting

Laat na een succesvolle EmailJS-verzending een server-side automation, EmailJS-webhook of eigen serverless functie onderstaande JSON naar de endpoint sturen. Configureer daar de header `X-ORIVEA-WORKSPACE-SECRET` met dezelfde waarde als op Content Studio. Gebruik een unieke `external_id` zodat retries geen dubbele aanvraag aanmaken.

```json
{
  "external_id": "emailjs-event-12345",
  "source": "emailjs",
  "first_name": "Voornaam",
  "last_name": "Achternaam",
  "email": "klant@example.nl",
  "phone": "0612345678",
  "plan": "signature",
  "preference_gender": "Dames",
  "preference_family": "Bloemig",
  "selection_mode": "Zelf kiezen",
  "notes": ""
}
```

Toegestane plannen zijn `essential`, `signature` en `duo`. De maandprijs wordt door de Content Studio bepaald en wordt niet vertrouwd vanuit de afzender. De endpoint vereist JSON, valideert bron en velden, heeft rate limiting en logt geen volledige klantpayload.

De browserflow blijft EmailJS gebruiken. De koppeling is pas volledig actief zodra de server-side webhook in EmailJS of de gekozen automation is ingesteld; zonder die inrichting blijft de aanvraag alleen per e-mail binnenkomen.
