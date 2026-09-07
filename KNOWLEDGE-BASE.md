# ORIVÈA Kennisbank

## Ondersteunde bronnen

- TXT en CSV: directe tekstextractie.
- DOCX: mammoth.
- XLSX: xlsx, per werkblad omgezet naar doorzoekbare CSV-tekst.
- PDF: pdf-parse. Een beeld-PDF zonder voldoende tekst krijgt status OCR_REQUIRED.
- JPG, PNG en WebP: privé opgeslagen als documentbron en gemarkeerd voor tekstherkenning. OCR wordt niet stil uitgevoerd.

Documenten staan privé in data/knowledge. Alleen ingelogde gebruikers kunnen bestanden via de gecontroleerde API opvragen.

## Document-memory en retrieval

Tekst wordt genormaliseerd en opgeslagen in overlappende chunks van ongeveer 1.200 tekens. Retrieval combineert exacte tekstmatches, woordoverlap, campagne-overeenkomst, geldigheid en bronprioriteit. Alleen de best scorende chunks gaan mee naar Ollama; volledige documenten worden niet in de prompt geladen.

Verlopen bronnen worden uitgesloten. Gebruikte document- en chunk-ID's worden per post in post_knowledge_sources en knowledge_sources_used opgeslagen.

## Productdata en media

ORIVEA_PRODUCTS_PATH wijst standaard naar ../Orivea/products.js. Alleen productvelden zoals nummer, prijs, maat, categorie, geurnoten, premiumstatus en URL worden als primaire feitelijke context gebruikt.

Media wordt geselecteerd op product, campagne, categorie, rechten, geldigheid, hergebruik en platformverhouding. Niet-optimale formaten worden niet aangepast; originele bestanden blijven intact.

## Quality gate

Iedere AI-post krijgt quality_score en quality_status. Ontbrekende productmatches, ontbrekende media/kennis, verlopen campagnes en captionduplicaten verlagen de score. Automatisch plannen vereist minimaal 90, voldoende AI-confidence, geldige rechten, geen claims/conflicten en gekoppelde social accounts.

OLLAMA_MODEL=qwen2.5:7b verzorgt tekstgeneratie. OLLAMA_VISION_MODEL is optioneel; zonder vision gebruikt de agent bestandsnaam, productreferentie, campagne en handmatige mediabeschrijving.
