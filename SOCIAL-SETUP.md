# Officiële social-koppelingen

De Content Studio simuleert geen verbindingen of publicaties. Alle vier platformen tonen `Niet geconfigureerd` tot een echte OAuth-flow en productiegoedkeuring aanwezig zijn.

## Meta: Instagram en Facebook

Maak een Meta developer-app, koppel de Facebook-pagina en het professionele Instagram-account en configureer de Meta callback uit `.env.example`. Vul `META_APP_ID`, `META_APP_SECRET` en `META_REDIRECT_URI`. Permissions en endpoints moeten vlak voor implementatie opnieuw tegen de actuele officiële Graph API-documentatie worden gecontroleerd en waar nodig door App Review.

## TikTok

Maak een TikTok developer-app voor de officiële Content Posting API. Configureer de callback en vul `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` en `TIKTOK_REDIRECT_URI`. Direct Post vereist de relevante scope en kan een audit vereisen. De app rapporteert niet dat test- of private posts publiek zijn.

## Pinterest

Maak een Pinterest developer-app, configureer de callback en vul `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET` en `PINTEREST_REDIRECT_URI`. Boardselectie en Pin-publicatie worden pas geactiveerd na een echte OAuth-koppeling. Boards worden nooit automatisch aangemaakt.

Tokens moeten versleuteld in `social_accounts` worden opgeslagen met `ENCRYPTION_KEY`; ze mogen nooit in frontendcode of logs verschijnen. De OAuth- en publishservices behoren tot de volgende externe integratiefasen en zijn bewust nog niet als werkend gepresenteerd.
