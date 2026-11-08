# Mustache Passport

Persoonlijke reis-tracker als PWA: markeer landen op een wereldkaart, bekijk je paspoort (statistieken per continent) en bewaar je reizen met route, vluchten, verblijven, restaurants en activiteiten.

Werkt op telefoon en laptop, ook offline. Optioneel synchroniseert alles tussen toestellen via Firebase.

## Functies

- **Kaart**: zoombare wereldkaart (aanraken, muis, pinch). Tik op een land om het als *bezocht* of *wil ik zien* te markeren, met optioneel jaartal.
- **Paspoort**: kaartoverzicht, `x / 195` VN-landen, voortgang per continent, lijst met landen en niet-VN-gebieden, steden, regio's en luchthavens.
- **Reizen**: statistieken, reizen per jaar met route per land en vervoer. In een reis bewaar je items: **vlucht** (maatschappij, vluchtnummer, van/naar, datum, tijden, zitplaats, klasse, boekingsreferentie), verblijf, restaurant en activiteit.
- **Thema**: zes kleuren (groen, blauw, amber, paars, roze, grafiet) en licht/donker/systeem.
- **Back-up**: exporteren en importeren als JSON.
- **Sync** (optioneel): inloggen met Google, gegevens in Firestore.

## Lokaal draaien

Er is geen buildstap voor de app zelf; het zijn statische bestanden.

```bash
npm run serve      # python3 -m http.server 8080
# open http://localhost:8080
```

Kaart- en landendata opnieuw genereren (alleen nodig bij wijzigingen):

```bash
npm install
npm run build:data
```

Dit schrijft `data/map.json`, `data/countries.json` en `assets/flags/*.svg` uit `world-atlas` (Natural Earth 1:50m), `world-countries` en `flag-icons`.

## Publiceren op GitHub Pages

Repository-instellingen → Pages → bron: branch `main`, map `/ (root)`. Alle paden in de app zijn relatief, dus de app werkt ook onder `https://<gebruiker>.github.io/reisapp/`.

## Sync met Firebase (optioneel)

Zonder configuratie blijft alles lokaal op het toestel (localStorage). Voor sync:

1. Maak een Firebase-project en een **Web-app** aan; kopieer de config naar `js/firebase-config.js` (staat al ingevuld voor `reisapp-d2030`).
2. Zet **Authentication → Google** aan en voeg je Pages-domein (`<gebruiker>.github.io`) toe onder *Authorized domains*.
3. Maak **Firestore** aan en zet de regels uit `firestore.rules` online met `firebase deploy --only firestore:rules` (elke gebruiker ziet alleen zijn eigen document `users/{uid}`).

De volledige app-state staat als één JSON-tekst in `users/{uid}`. Bij een conflict wint de **laatste wijziging** (op tijdstempel) voor de hele state; bewerk dus niet tegelijk offline op twee toestellen.

## Opbouw

```
index.html, manifest.webmanifest, sw.js
css/app.css            thema's (CSS-variabelen) en stijl
js/main.js             router, thema
js/store.js            state + localStorage + hooks voor sync
js/data.js             landenlijst, statistieken
js/map.js              SVG-kaart met pan/zoom
js/trips.js            formulieren voor reizen en items
js/sync.js             Firebase Auth + Firestore (optioneel)
js/views/              kaart, paspoort, reizen, reis, instellingen
scripts/build-data.mjs generator voor kaart- en landendata
```

## Werkwijze (git flow)

- `main`: stabiele versie, wordt gepubliceerd.
- `dev`: integratiebranch.
- `feature/*`: nieuw werk; samenvoegen in `dev` na akkoord.

## Bekende beperkingen

- Steden, regio's en luchthavens zijn eigen lijsten (naam + land), zonder kaartlaag of vooraf geladen database.
- Continenttotalen tellen alleen de 195 VN-landen (Been telt ook gebieden mee, dus de aantallen verschillen).
- De Firebase-koppeling is geschreven maar nog niet getest met een echt project.

## Gegevensbronnen

- `data/airports.json`: [OurAirports](https://ourairports.com/data/) (publiek domein), met coördinaten.
- `js/acticons.js`: [Google Material Symbols](https://fonts.google.com/icons) (Apache 2.0); vulkaan uit [Font Awesome Free](https://fontawesome.com/license/free) (CC BY 4.0); bergen en via ferrata eigen tekening.
- `data/airlines.json`: [OpenFlights](https://openflights.org/data) (Open Database License; vermelding: © OpenFlights.org).
- `vendor/zxing/`: [zxing-wasm](https://github.com/Sec-ant/zxing-wasm) (MIT), leest de streepjescode van een boarding pass lokaal in de browser.
- `data/coasters.json`: [Coasterpedia](https://coasterpedia.net) (CC BY-SA 4.0), achtbanen van Energylandia met treinindeling (wagons, rijen, zitplaatsen per rij).
