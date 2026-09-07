# ORIVÈA Content Agent en Ollama

De Content Agent gebruikt uitsluitend de lokale Ollama-API. Er worden geen betaalde AI-services aangeroepen. Standaardconfiguratie:

```env
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:7b
OLLAMA_TIMEOUT_MS=120000
AUTO_APPROVE_TRUSTED_CONTENT=false
AI_AUTO_APPROVE_MIN_CONFIDENCE=0.90
```

## Verwerkingsflow

Na een upload maakt de backend een echte `agent_task`. Bij onbekende rechten wacht de taak op menselijke controle. Bij vertrouwde rechten analyseert Ollama de beschikbare metadata en oorspronkelijke caption. Het gekozen model heeft geen vision-capability, dus beeldinhoud wordt niet verzonnen of via fictieve herkenning ingevuld.

Ollama retourneert JSON. De server valideert categorie, contenttype, kanalen, captions, hashtags, ORIVÈA-URL en confidence. Ongeldige JSON krijgt één herstelpoging. Daarna wordt een lokale template gebruikt. Fallbackteksten en teksten met niet-gevalideerde claims worden nooit automatisch goedgekeurd.

Auto-approve vereist tegelijk:

- vertrouwde gebruiksrechten;
- echte Ollama-output, geen fallback;
- confidence boven de ingestelde grens;
- geldige campagne;
- doel-URL op `orivea.nl`;
- geen duplicate-cooldown;
- alle aanbevolen accounts werkelijk gekoppeld.

Standaard staat auto-approve uit. Extern publiceren blijft onder de bestaande scheduler- en OAuth-controles vallen. Chat mag nooit direct publiceren.

## Content Agent

Het dashboard toont echte `agent_tasks`, `agent_events` en heartbeats. SSE via `/api/agent/stream` ververst status en activiteiten zonder paginareload. Pauzeren stopt alleen automatische contenttaken, niet reeds goedgekeurde publicaties.

Chat ondersteunt veilige samenvattingen, weekvoorstellen, interne taken en gevalideerde herplanning. Ollama levert alleen een gestructureerd actievoorstel; de backend voert uitsluitend toegestane acties uit na ID-, datum- en statuscontrole.

## Windows

De normale Ollama Windows-app draait na installatie op de achtergrond en biedt de API op `http://localhost:11434`. Controleer na iedere Windows-herstart:

```powershell
ollama list
Invoke-RestMethod http://127.0.0.1:11434/api/tags
```

Controleer in **Taakbeheer → Opstart-apps** dat Ollama ingeschakeld is. Voor een echte Windows-service kan de officiële standalone CLI met `ollama serve` via een servicemanager worden gebruikt; configureer dit niet dubbel naast de desktop-app.

Als Ollama offline is, blijft Content Studio werken. De agent gebruikt templates, toont `Ollama niet beschikbaar` en laat scheduler/publicatie van reeds goedgekeurde posts ongemoeid.
