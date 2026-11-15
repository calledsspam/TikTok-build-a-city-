# 🏙️ TikTok-Stadt – interaktives LIVE-Spiel

Eine Stadt, die **live durch Geschenke deiner Zuschauer wächst**. Rosen pflanzen Bäume, Donuts eröffnen Läden,
eine Galaxie baut einen Wolkenkratzer, ein Löwe ein Stadion mit Feuerwerk. Likes bringen Spaziergänger,
jeder neue Follower bekommt ein eigenes Haus mit Namensschild.

Das Spiel läuft im Browser im TikTok-Hochformat **1080 × 1920** und wird in TikTok LIVE Studio oder OBS als Quelle eingebunden.

> **Flache Version:** Alle Dateien liegen direkt im Hauptordner (keine Unterordner), damit man sie z. B. am iPhone über GitHub „Add file → Upload files“ hochladen kann.

---

## 1. Installation

1. **Node.js** installieren (Version 18 oder neuer, empfohlen 20+): https://nodejs.org → „LTS“ herunterladen und installieren.
2. Die ZIP in einen neuen, leeren Ordner entpacken, z. B. nach `C:\tiktok-stadt` oder `~/tiktok-stadt`.
3. Eingabeaufforderung / Terminal **in diesem Ordner** öffnen und einmalig ausführen:

```bash
npm install
```

## 2. Starten

**Mit deinem TikTok-Account** (Name ohne @, so wie in `tiktok.com/@deinname`):

```bash
npm start -- deinname
```

Alternativ den Namen in `config.json` bei `"tiktokUsername"` eintragen und nur `npm start` ausführen.

**Nur testen, ohne LIVE:**

```bash
npm start              # Server ohne TikTok, Test-Panel im Browser nutzen
npm run demo           # schickt zusätzlich automatisch alle 1,6 s ein zufälliges Fake-Event
```

Danach im Browser öffnen: **http://localhost:8080/**

Oben rechts zeigt ein Punkt den Status: 🟢 `LIVE` (verbunden), 🟠 `TEST` (nur Simulation), 🔴 `OFFLINE` (du bist gerade nicht live,
der Server versucht es automatisch alle 30 s erneut, du kannst ihn also schon vor dem LIVE starten).

## 3. Testen ohne LIVE (Simulation)

* Im Browser die Taste **S** drücken (oder http://localhost:8080/?sim=1 öffnen), dann erscheint das **Test-Panel**:
  Name und Combo-Anzahl eingeben und auf ein Geschenk klicken; dazu Likes, Follow, Teilen, `!park`, Feuerwerk,
  Tag/Nacht und „Stadt zurücksetzen“.
* Tastenkürzel: **1–9** = Geschenke (Rose … Universum), **L** = Likes, **F** = Follow, **P** = `!park`, **N** = Tag/Nacht.
* Das Panel ist **nur auf deinem PC** sichtbar, solange es geöffnet ist. Vor dem LIVE mit **S** wieder schließen.
* Simulation über das Terminal (zweites Fenster, Server muss laufen):

```bash
npm run sim                                   # 30 zufällige Events
npm run showcase                              # schöne Demo mit allen Gebäuden
node simulate.js gift Rose 10 Lena    # Lena schickt 10x Rose (Combo)
node simulate.js gift Lion 1 Max
node simulate.js like 200 Mia
node simulate.js follow Jonas
node simulate.js chat "!park" Emma
node simulate.js reset                # Stadt zurücksetzen
```

## 4. In TikTok LIVE Studio oder OBS einbinden

**TikTok LIVE Studio**
1. Server starten (`npm start -- deinname`).
2. In LIVE Studio im **Hochformat (Portrait)** streamen.
3. Quelle hinzufügen → **„Link“ bzw. „Browser“** (je nach Version), URL `http://localhost:8080/`, Größe **1080 × 1920**.
   Falls deine Version keine Browser-Quelle hat: Seite in Chrome im Vollbild (F11) öffnen und als **„Fenster“ / „Fensteraufnahme“** hinzufügen.
4. Quelle auf die komplette Bildfläche ziehen.

**OBS Studio**
1. Einstellungen → Video: Basis- und Ausgabeauflösung **1080 × 1920**.
2. Quellen → **+** → **Browser** → URL `http://localhost:8080/`, Breite **1080**, Höhe **1920**, „Seite aktualisieren, wenn Szene aktiv wird“ **aus**.
3. Streamen z. B. über den TikTok-Stream-Key (falls dein Account einen hat) oder per OBS-Virtual-Camera in LIVE Studio.

Tipp: Die Geschenk-Legende ganz unten wird in der TikTok-App oft vom Chat verdeckt. Du kannst sie in `config.json`
mit `"showLegend": false` ausblenden.

## 5. Geschenke & Aktionen anpassen (`config.json`)

Alles steht in **`config.json`**. Nach dem Speichern den Server neu starten bzw. die Seite neu laden (F5 bzw. in OBS „Cache leeren & neu laden“).

```json
"Rose":   { "de": "Rose",   "emoji": "🌹", "diamonds": 1,     "actions": [{ "build": "tree" }] },
"Galaxy": { "de": "Galaxie","emoji": "🌌", "diamonds": 1000,  "actions": [{ "build": "skyscraper" }, { "event": "fireworks" }] }
```

* Der **Schlüssel** (z. B. `"Rose"`) ist der **englische Geschenkname**, wie TikTok ihn sendet. `de` ist der Anzeigename.
* `actions`: Liste von Aktionen. `{ "build": "…", "count": 2 }` baut Gebäude, `{ "event": "…" }` löst einen Effekt aus.
* **Gebäude:** `tree` (Baum), `flowers` (Blumenbeet), `house` (Kleines Haus), `familyHouse` (Familienhaus), `followerHouse` (Haus mit Namensschild),
  `shop` (Laden), `apartment` (Wohnhaus), `park` (Park), `skyscraper` (Wolkenkratzer), `tower` (Fernsehturm), `stadium` (Stadion, 2×2 Felder)
* **Events:** `fireworks` (Feuerwerk), `daynight` (Tag/Nacht-Wechsel), `festival` (Stadtfest: großes Feuerwerk + Konfetti + Nacht),
  `confetti` (Konfettiregen), `cars` (mehr Autos, `count` = Anzahl)
* `"legend": false` blendet ein Geschenk in der Legende unten aus (es funktioniert trotzdem).
* **Unbekannte Geschenke** werden über `unknownGiftTiers` nach Diamantenwert zugeordnet. Es funktioniert also jedes Geschenk.
* **Combos** (z. B. 10× Rose): Jede Rose zählt; die Gebäude entstehen nacheinander, die Einblendung zählt hoch („Rose ×10“).
* **Likes:** `likesPerWalker` (pro X Likes ein Spaziergänger), `likesPerGrowth` (pro Y Likes ein Blumenbeet).
* **Follows:** `follow.build` (Standard: Haus mit Namensschild, ein Haus pro Follower).
* **Chat-Befehle:** unter `commands.list`, z. B. `!park`, `!baum`, `!blumen`, `!feuerwerk`, jeweils mit Abklingzeit pro Zuschauer (`cooldownSec`)
  und für alle (`globalCooldownSec`), damit niemand spammen kann.
* `buildSpeedPerSecond`: wie viele Gebäude pro Sekunde maximal entstehen.
* `levels`: Stufen der Stadt (Siedlung → Dorf → … → Megacity) und benötigte Punkte.

### Aktuelle Zuordnung

| Geschenk | 💎 | Effekt |
|---|---|---|
| 🌹 Rose, 💗 Heart Me | 1 | Baum |
| 🎮 GG, 🍦 Eistüte | 1 | Blumenbeet |
| 🎵 TikTok | 1 | Kleines Haus |
| 🫰 Fingerherz | 5 | Familienhaus |
| 🧴 Parfüm, 🍩 Donut | 20/30 | Laden |
| 🫶 Handherzen | 100 | Wohnhaus |
| 🎊 Konfetti | 100 | Park + Konfettiregen |
| 🐕 Corgi | 299 | 2× Wohnhaus |
| 💸 Geldkanone | 500 | Wolkenkratzer |
| 🌌 Galaxie | 1.000 | Wolkenkratzer + Feuerwerk |
| 🏎️ Sportwagen | 7.000 | Wolkenkratzer + 6 Autos |
| 🚀 Interstellar | 10.000 | Fernsehturm + Feuerwerk |
| 🦁 Löwe | 29.999 | Stadion + Feuerwerk + Tag/Nacht-Wechsel |
| 🪐 Universum | 34.999 | Stadtfest + Stadion + 3× Wolkenkratzer + Fernsehturm |
| ❤️ Likes | – | Spaziergänger (pro 20) + Blumenbeet (pro 200) |
| ➕ Folgen | – | Haus mit Namensschild des Followers |
| 🔗 Teilen | – | Konfetti |
| 💬 `!park` / `!baum` / `!blumen` / `!feuerwerk` | – | Park / Baum / Blumenbeet / Mini-Feuerwerk (mit Abklingzeit) |

Die Diamantenwerte von TikTok können sich ändern. Für die Top-Unterstützer-Liste zählt bei Live-Geschenken der echte Wert, den TikTok mitsendet.

## 6. Musik & Sounds

* **Alles selbst erzeugt:** Hintergrundmusik (ruhiger Lo-Fi-Loop) und alle Effekte werden live im Browser per WebAudio synthetisiert.
  Es gibt keine Audiodateien und keine fremde Musik, damit ist alles **lizenzfrei und sicher für TikTok**.
* Effekte: „Plopp“ für Bäume/Blumen, Hammer für Häuser/Läden/Wohnhäuser (+ Glöckchen beim Laden), Whoosh + Glockenspiel für
  Wolkenkratzer/Fernsehturm, Jubel + Pfiff + Fanfare fürs Stadion, Raketen & Knallen beim Feuerwerk, Konfetti-Plopp,
  Blips für Likes/Follows/Chat-Befehle, Fanfare bei großen Geschenken und bei neuer Stadt-Stufe.
* **Lautstärke:** in `config.json` unter `"audio"` (`master`, `music`, `sfx`, `musicEnabled`, `muted`) oder im Test-Panel (Taste **S**: Regler + Stumm-Knopf).
  Taste **M** = stumm an/aus. Die Einstellungen im Test-Panel werden im Browser gespeichert und haben Vorrang vor der config.json.
* **Autoplay:** Normale Browser spielen Ton erst nach einem Klick. Deshalb erscheint „🔊 Tippe hier, um zu starten“.
  **OBS und TikTok LIVE Studio** erlauben Autoplay, dort startet der Ton automatisch und das Overlay erscheint nicht.
  In OBS bei der Browser-Quelle **„Audio über OBS steuern“** aktivieren, damit der Ton im Stream landet.
  Mit `?autostart=1` an der URL wird das Overlay immer übersprungen.

## 7. Am Handy streamen / online stellen

Siehe **[Anleitung_Handy.md](Anleitung_Handy.md)**. Kurz:
* `npm run online -- deinname` stellt das Spiel per Cloudflare-Tunnel unter einer öffentlichen HTTPS-Adresse bereit (cloudflared nötig).
* `render.yaml` ermöglicht kostenloses Hosting auf Render.com (Umgebungsvariablen `TIKTOK_USERNAME`, `ADMIN_KEY`).
* **Admin-Schlüssel:** Wer die Seite über das Internet öffnet, kann nur zuschauen. Nur mit `?key=…` darf man den TikTok-Namen setzen
  oder Fake-Events schicken. Der Schlüssel steht beim Serverstart im Terminal (oder fest per `ADMIN_KEY` bzw. `"adminKey"` in config.json).

## 8. Speicherstand & Zurücksetzen

Die Stadt wird automatisch im Browser gespeichert (localStorage) und ist nach einem Neuladen wieder da, inklusive Top-Unterstützern.
**Wichtig:** OBS/LIVE Studio und dein normaler Chrome haben **getrennte** Speicherstände.

Zurücksetzen: im Test-Panel (Taste S) **„🗑️ Stadt zurücksetzen“**, oder `node simulate.js reset` (setzt alle offenen Spielfenster zurück),
oder die Adresse einmal mit `?reset=1` öffnen.

## 9. Wichtige Hinweise

* **LIVE-Zugang nötig:** Um live zu gehen, braucht dein TikTok-Account LIVE-Berechtigung (in der Regel mindestens **1.000 Follower** und 18+;
  Geschenke empfangen ist ebenfalls erst ab 18 möglich). Für TikTok LIVE Studio gelten ggf. zusätzliche Voraussetzungen.
* **Inoffizielle Schnittstelle:** Die Live-Verbindung nutzt das Open-Source-Paket [`tiktok-live-connector`](https://github.com/zerodytrash/TikTok-Live-Connector).
  Das ist **keine offizielle TikTok-API**. Es kann jederzeit durch Änderungen bei TikTok ausfallen; dann hilft meist `npm update tiktok-live-connector`.
  Das Paket nutzt für die Verbindung einen externen Signatur-Dienst (Euler Stream). Bei vielen Verbindungen kann ein kostenloser API-Key nötig sein:
  `SIGN_API_KEY=dein_key npm start -- deinname` oder `"signApiKey"` in `config.json`.
* Es wird **nur gelesen** (Geschenke, Likes, Follows, Chat). Das Programm kann nichts in deinem Namen posten und braucht kein Passwort.
* Bei sehr großen Streams schickt TikTok nicht jedes Like einzeln, deshalb kann die Zahl der Likes abweichen.

## Dateien

| Datei | Zweck |
|---|---|
| `server.js` | Webserver + Brücke TikTok LIVE → Browser (WebSocket `/ws`) |
| `config.json` | **Alle Einstellungen**: Geschenke, Likes, Befehle, Stufen |
| `game.js` | Das Spiel (Canvas-2D, isometrische Stadt, Effekte) |
| `audio.js` | Musik & Sounds (WebAudio-Synthese, lizenzfrei) |
| `online.js` | Öffentliche HTTPS-Adresse per Cloudflare-Tunnel (`npm run online`) |
| `render.yaml` | Kostenloses Hosting auf Render.com |
| `Anleitung_Handy.md` | Schritt-für-Schritt: Streamen nur mit dem Handy |
| `simulate.js` | Fake-Events aus dem Terminal |
| `index.html`, `style.css`, `manifest.webmanifest`, `icon*.png`, `icon.svg`, `apple-touch-icon.png` | Spielseite, Aussehen, Home-Bildschirm-Symbol |
