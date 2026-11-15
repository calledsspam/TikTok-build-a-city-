# 📱 TikTok-Stadt nur mit dem Handy streamen – einfache Anleitung

## Wie das funktioniert (kurz)
1. Das Spiel ist eine **Webseite**. Du öffnest sie im Handy-Browser (Chrome oder Safari).
2. Du startest in der TikTok-App einen LIVE im Modus **„Mobile Gaming“** (Bildschirm teilen).
   Deine Zuschauer sehen dann **deinen Handy-Bildschirm**, also die Stadt, und hören die Musik.
3. Ein kleines Programm (der „Server“) liest die Geschenke, Likes und Follows aus deinem LIVE und schickt sie an die Stadt.
   **Dieses Programm muss irgendwo laufen.** Dafür gibt es unten drei Wege.

## ✅ Was du brauchst (ehrlich)
* **LIVE-Zugang** auf deinem Account. Meist ab 18 Jahren und ab ca. 1.000 Followern (je nach Land unterschiedlich).
  Geschenke empfangen geht nur ab 18.
* **„Mobile Gaming“ in der TikTok-App.** Diese Option hat **nicht jeder Account**. So prüfst du es:
  TikTok öffnen → **+** → **LIVE**. Wenn du dort neben „Kamera“ auch **„Mobile Gaming“** (oder „Spiele“) siehst, klappt es.
  Fehlt die Option, hat TikTok sie deinem Account (noch) nicht freigeschaltet. Dann geht es nur über einen PC
  (TikTok LIVE Studio / OBS, siehe README.md).
* Gutes WLAN, Handy am Ladekabel.
* Kein Passwort nötig. Das Spiel braucht **nur deinen TikTok-Namen**.

---

## Schritt 1: Den Server laufen lassen (einen Weg auswählen)

### Weg A: Android, alles auf dem Handy (kostenlos, ohne PC)
1. **Termux** aus F-Droid installieren (https://f-droid.org → „Termux“. Die Play-Store-Version ist veraltet).
2. Die Datei `tiktok-stadt-flach.zip` aufs Handy laden (z. B. in „Downloads“).
3. Termux öffnen und nacheinander eintippen (jede Zeile mit Enter bestätigen):
   ```
   termux-setup-storage
   pkg install -y nodejs unzip
   mkdir -p ~/tiktok-stadt && cd ~/tiktok-stadt && unzip ~/storage/downloads/tiktok-stadt-flach.zip
   npm install
   termux-wake-lock
   npm start -- DEINNAME
   ```
   (`DEINNAME` = dein TikTok-Name ohne @. `termux-wake-lock` sorgt dafür, dass Android den Server nicht schlafen legt.)
4. Termux **offen lassen** (einfach zur Seite wischen, nicht schließen).
5. Im Browser öffnen: **http://localhost:8080**

Beim nächsten Mal reicht: Termux öffnen → `cd tiktok-stadt && termux-wake-lock && npm start -- DEINNAME`.

### Weg B: iPhone **oder** Android, Server kostenlos im Internet (Render.com)
Einmalige Einrichtung, am einfachsten am PC/Laptop (geht aber auch im Handy-Browser):
1. Kostenlosen Account bei **GitHub** anlegen → neues Repository „tiktok-stadt“ → **Add file → Upload files**.
   Die ZIP `tiktok-stadt-flach.zip` vorher in der Dateien-App antippen (entpackt automatisch), dann **alle Dateien**
   auf einmal auswählen und hochladen (es gibt keine Unterordner) → **Commit changes**.
2. Kostenlosen Account bei **https://render.com** anlegen (mit GitHub anmelden) → **New → Blueprint** → dein Repository wählen.
   Render liest die Datei `render.yaml` automatisch.
3. Bei **TIKTOK_USERNAME** deinen TikTok-Namen eintragen → **Apply**. Nach 2–3 Minuten bekommst du eine Adresse wie
   `https://tiktok-stadt-xxxx.onrender.com`.
4. Deinen Admin-Schlüssel findest du bei Render unter **Environment → ADMIN_KEY**. Dein persönlicher Link ist dann:
   `https://tiktok-stadt-xxxx.onrender.com/?key=DEIN_ADMIN_KEY` (Lesezeichen setzen und nicht weitergeben).

Hinweise: Der kostenlose Server „schläft“ nach 15 Minuten ohne Besucher. Öffne die Seite also **ein bis zwei Minuten vor dem LIVE**,
dann wacht er auf. Während die Seite offen ist, bleibt er wach.

### Weg C: Du hast einen PC/Laptop zu Hause
Am PC: Node.js installieren, im Projektordner `npm install` ausführen, **cloudflared** installieren
(https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) und dann:
```
npm run online -- DEINNAME
```
Es erscheint ein **HANDY-LINK** (`https://….trycloudflare.com/?key=…`). Den öffnest du auf dem Handy.
Der Link gilt nur, solange das Programm am PC läuft, und ändert sich bei jedem Start.

---

## Schritt 2: Spiel auf dem Handy vorbereiten
1. Deinen Link (Weg A, B oder C) in **Chrome** (Android) oder **Safari** (iPhone) öffnen.
2. Auf **„🔊 Tippe hier, um zu starten“** tippen. Jetzt laufen Musik und Sounds.
   Steht dort „Noch kein TikTok-Name eingetragen“: Namen eintippen → **Verbinden**.
3. Für echtes Vollbild ohne Adressleiste:
   * iPhone: Safari → Teilen-Symbol → **„Zum Home-Bildschirm“** → die Stadt ab jetzt über das neue Symbol öffnen.
   * Android: Beim Antippen geht die Seite automatisch in den Vollbildmodus (sonst Chrome-Menü ⋮ → „Zum Startbildschirm hinzufügen“).
4. Testen: Taste/Knopf ist auf dem Handy nicht nötig. Die Stadt reagiert, sobald dein LIVE läuft.
   (Testen ohne LIVE geht am PC mit Taste **S**.)

## Schritt 3: LIVE starten
1. **„Nicht stören“** einschalten (damit keine Nachrichten im Stream auftauchen) und Handy ans Ladekabel.
2. TikTok öffnen → **+** → **LIVE** → **Mobile Gaming** auswählen.
3. Als Spiel ein **Hochformat-Spiel** oder „Andere“ wählen und auf **Hochformat (Portrait)** achten. Sonst sehen die Zuschauer nur einen schmalen Streifen.
4. Titel eingeben, z. B. „Baut meine Stadt mit Geschenken! 🏙️“ → **LIVE starten**.
5. Bildschirmaufnahme erlauben:
   * iPhone: Im Fenster **„Bildschirmübertragung“** TikTok auswählen → **Übertragung starten**.
   * Android: **„Gesamten Bildschirm“** teilen (nicht nur eine App) und, falls gefragt, **Audio/Medienton mitschneiden** erlauben.
6. **Sofort zur Stadt wechseln** (Browser bzw. Home-Bildschirm-Symbol). Ab jetzt sehen die Zuschauer die Stadt.
7. Oben rechts in der Stadt muss nach ein paar Sekunden **🟢 LIVE** stehen. Dann kommen die Geschenke an.
   Steht dort **OFFLINE**: kurz warten (der Server versucht es alle 30 Sekunden neu) und prüfen, ob der Name stimmt.

## 🔊 Ton
* **Medienlautstärke** am Handy hochdrehen; iPhone: **Stummschalter aus**.
* Die Musik und alle Sounds sind **selbst erzeugt** (keine fremden Lieder). Damit gibt es kein Urheberrechts-Problem auf TikTok.
* TikTok überträgt beim Bildschirm-Teilen den Ton des Handys. Bei manchen Android-Handys muss man beim Start „Audio aufnehmen“ erlauben.
  Zusätzlich hört TikTok oft dein **Mikrofon**: Du kannst also ganz normal mit den Zuschauern reden.
* Lautstärke / Musik aus: am PC im Test-Panel (Taste **S**) oder in `config.json` unter `"audio"`.

## Erkläre den Zuschauern die Regeln
„🌹 Rose = Baum, 🍩 Donut = Laden, 🫶 Handherzen = Wohnhaus, 🌌 Galaxie = Wolkenkratzer, 🦁 Löwe = Stadion!
Folgen = dein eigenes Haus mit deinem Namen, Likes = mehr Leute in der Stadt, schreib **!park** für einen Park.“
(Die Legende unten im Spiel zeigt das auch an.)

## Wenn etwas nicht klappt
* **Zuschauer sehen TikTok statt der Stadt:** Du bist noch in der TikTok-App. Wechsle zum Browser.
* **Zuschauer sehen nur einen schmalen Streifen:** LIVE im Querformat gestartet. Beenden und im Hochformat neu starten.
* **Keine Geschenke kommen an:** Steht oben rechts 🟢 LIVE? Ist der Name richtig? Läuft der Server (Termux offen / Render-Seite erreichbar)?
* **Kein Ton:** einmal auf die Stadt tippen, Lautstärke hoch, Stummschalter aus.
* **Stadt ist weg:** Die Stadt wird im Browser gespeichert. Ein anderer Browser oder der private Modus hat eine eigene, leere Stadt.

⚠️ Die Verbindung zu TikTok läuft über das inoffizielle Open-Source-Paket `tiktok-live-connector`. Das ist keine offizielle TikTok-Schnittstelle
und kann ausfallen, wenn TikTok etwas ändert.
