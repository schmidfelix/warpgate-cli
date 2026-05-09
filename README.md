# warpgate-cli

> Quick-Access TUI für [Warpgate](https://github.com/warp-tech/warpgate) SSH-Targets — Suchen, Auswählen, Verbinden in unter einer Sekunde.

`warpgate-cli` ist ein kleiner Helper, der das ständige Nachschlagen von Target-Namen im Warpgate Web-UI und das manuelle Eintippen von `ssh user:target@host -p port` überflüssig macht. Ein Tastendruck → durchsuchen → Enter → SSH-Session.

<!-- TODO: Demo-GIF / Screencast hier einfügen -->
<!-- ![Demo](docs/demo.gif) -->

## Features

- Fuzzy-Suche über alle SSH-Targets (Name, Description, Gruppe)
- Gruppierung mit den Bootstrap-Farben aus dem Warpgate Web-UI
- Token-Speicherung im macOS Keychain (kein Klartext auf der Platte)
- Onboarding-Flow beim ersten Aufruf
- Shell-Wrapper (zsh / bash / fish): SSH läuft als direkter Kindprozess der Shell — keine TTY-/Performance-Probleme, `SetEnv`/`ssh_config` greifen normal
- **Datenbanken über SSH-Tunnel**: Tab im Picker → MySQL/MariaDB-Connections für das Target öffnen sich automatisch in TablePlus (siehe [Datenbanken](#datenbanken))

<!-- TODO: Screenshot des Pickers hier einfügen -->
<!-- ![Picker](docs/picker.png) -->

## Voraussetzungen

- **macOS** (für `security` / Keychain — Linux-Support wäre möglich, ist aber aktuell nicht implementiert)
- **[Bun](https://bun.sh)** ≥ 1.0 (für Build / Development)
- Eine erreichbare Warpgate-Instanz und einen API-Token (im Web-UI unter *Profil → API Tokens*)

## Installation

### Option A: Single-Binary bauen (empfohlen)

```bash
git clone https://github.com/<github-user>/warpgate-cli.git
cd warpgate-cli
bun install
bun run build
# erzeugt ./warpgate-cli — irgendwohin in den $PATH legen, z.B.:
mv warpgate-cli /usr/local/bin/
```

### Option B: Über `bun link` (Development)

```bash
bun install
bun link
# `warpgate-cli` ist nun in deinem PATH (über ~/.bun/bin/)
```

### Shell-Wrapper installieren

`warpgate-cli` ist ein Helper-Binary; den eigentlichen `warpgate`-Befehl liefert eine kleine Shell-Function. Einmal einrichten:

```bash
warpgate-cli setup-shell
```

Das fügt einen Block in `~/.zshrc` / `~/.bashrc` (oder eine Datei in `~/.config/fish/functions/` für fish) ein. Anschließend einmal die Shell neu öffnen — fertig.

> **Warum ein Wrapper?** Wenn das CLI selbst `ssh` aufrufen würde, bliebe der Bun-Prozess als Parent stehen. Das verursacht spürbare Latenz, und Direktiven wie `SetEnv` aus deiner `~/.ssh/config` greifen nicht zuverlässig. Der Wrapper lässt `warpgate-cli pick` nur den fertigen `ssh`-Befehl auf stdout drucken, und `eval`'t ihn dann in der Shell. SSH wird dadurch direkter Kindprozess deiner Shell — keine Wrapper-Prozesse mehr im Spiel.

## Verwendung

```bash
warpgate
```

Beim ersten Aufruf wirst du nach Warpgate-URL und API-Token gefragt. Danach: einfach `warpgate` aufrufen, tippen, Enter drücken.

### Tastenkombinationen im Picker

| Taste | Aktion |
| --- | --- |
| `↑` / `↓` | Auswahl bewegen |
| `Enter` | SSH-Verbindung öffnen |
| `Tab` / `→` | Datenbanken für selektiertes Target anzeigen |
| `Esc` / `Ctrl+C` | Abbrechen (im DB-Submenü: zurück zur Hauptliste) |
| Buchstaben | Live-Suche |

### Subcommands

```bash
warpgate-cli login                # Token (neu) setzen
warpgate-cli logout               # Token + Config löschen
warpgate-cli user <username>      # Warpgate-Username manuell setzen
warpgate-cli setup-shell          # Wrapper-Function (re)installieren
warpgate-cli setup-shell --print  # Snippet auf stdout drucken (für eigene rc-Files)
warpgate-cli db                   # Datenbank-Connections auflisten
warpgate-cli db add               # Wizard: neue DB-Connection anlegen
warpgate-cli db remove <id|label> # DB-Connection entfernen
warpgate-cli db edit   <id|label> # DB-Connection bearbeiten
warpgate-cli help                 # Hilfe
```

### Username manuell setzen

Manche Warpgate-Setups liefern für Token-basierte Auth keinen Username über `/info`. In dem Fall fragt das Onboarding nach, oder du setzt ihn nachträglich:

```bash
warpgate-cli user max.mustermann
```

## Datenbanken

Datenbanken (MySQL / MariaDB), die nur lokal vom SSH-Target erreichbar sind (z.B. `dbstage` im internen DNS), lassen sich pro Target hinterlegen und mit einem Tastendruck in TablePlus öffnen — der SSH-Tunnel wird dabei über Warpgate aufgebaut.

> **Warum nicht Warpgate's eingebauter MySQL-Proxy?** Der erwartet erreichbare DB-Hosts. Wenn die DB nur lokal auf dem Target auflösbar ist (z.B. `dbstage` über das interne DNS des Servers), funktioniert er nicht. Stattdessen baut TablePlus selbst einen SSH-Tunnel durch Warpgate auf und löst den DB-Host *am anderen Ende* auf.

<!-- TODO: Screenshot des DB-Submenüs hier einfügen -->
<!-- ![DB-Submenü](docs/db-submenu.png) -->

### DB anlegen

Im Picker auf einem SSH-Target: `Tab` drücken → `+ Neue Datenbank…` wählen → Wizard durchklicken (Label, DB-Host, DB-User, DB-Name, optional Port, Passwort).

Alternativ per CLI:

```bash
warpgate-cli db add                       # Target-Picker, dann Wizard
warpgate-cli db add --target stage-web    # direkt für dieses Target
```

### DB öffnen

Im Picker:

```
warpgate                    # Picker startet
↓ ↑ Target auswählen
Tab                         # Submenü mit DBs des Targets
↓ ↑ DB auswählen
Enter                       # TablePlus öffnet die Connection
```

`warpgate-cli` druckt einen `open '<tableplus-url>'`-Befehl auf stdout, den der Shell-Wrapper per `eval` ausführt. TablePlus baut den SSH-Tunnel selbst auf und nutzt dabei deinen lokalen SSH-Key (`usePrivateKey=true`).

### DB-Verwaltung

```bash
warpgate-cli db                   # alle DB-Connections gruppiert nach Target
warpgate-cli db edit stage-main   # via Label oder UUID; Wizard mit Defaults
warpgate-cli db remove stage-main
```

DBs für nicht (mehr) existierende Targets werden in `db list` als `(verwaist)` markiert — sie werden nicht automatisch gelöscht.

### Speicherung der DB-Daten

| Ort | Inhalt |
| --- | --- |
| `~/.config/warpgate-cli/databases.json` (mode 0600) | Metadaten: Label, Target-Verweis, DB-Host/User/Name/Port, UUID |
| macOS Keychain (Service `warpgate-cli-db`, Account = UUID) | DB-Passwort |

DB-Einträge bleiben bestehen, wenn du `warpgate-cli logout` ausführst — dort wird nur der Warpgate-Token entfernt. DBs entfernst du explizit per `warpgate-cli db remove <…>`.

### Sicherheit

Wenn der Shell-Wrapper `open '<url>'` ausführt, ist die TablePlus-URL inklusive DB-Passwort kurz (~50ms) in `ps`/argv-Listings sichtbar — analog zur Token-Übergabe an `security`. Auf Single-User-Maschinen unkritisch, sollte aber bei geteilten Maschinen bedacht werden.

## Konfiguration

| Ort | Inhalt |
| --- | --- |
| `~/.config/warpgate-cli/config.json` (mode 0600) | `baseUrl`, optional `username` |
| `~/.config/warpgate-cli/databases.json` (mode 0600) | DB-Connection-Metadaten |
| macOS Keychain (`warpgate-cli`, Account = OS-User) | API-Token |
| macOS Keychain (`warpgate-cli-db`, Account = DB-UUID) | DB-Passwörter |

### Umgebungsvariablen

| Variable | Wirkung |
| --- | --- |
| `WARPGATE_MOCK=1` | Lokale Fixtures aus `test/fixtures/` statt echter API verwenden |
| `WARPGATE_KEYCHAIN_SERVICE` | Token-Keychain-Service überschreiben (Default: `warpgate-cli`) |
| `WARPGATE_DB_KEYCHAIN_SERVICE` | DB-Passwort-Keychain-Service überschreiben (Default: `warpgate-cli-db`) |
| `WARPGATE_KEYCHAIN_BACKEND=memory` | In-Memory-Backend statt macOS Keychain — wird in Tests verwendet, damit weder Mac-Passwort-Prompts noch Keychain-Müll entstehen |
| `FORCE_COLOR=1` | Wird vom Shell-Wrapper automatisch gesetzt, damit Farben auch in `$()`-Capture funktionieren |

## Entwicklung

```bash
# Tests laufen lassen
bun test

# Picker mit Mock-Daten lokal testen (kein Server nötig)
WARPGATE_MOCK=1 bun run src/cli.tsx pick

# Type-Check
bunx tsc --noEmit
```

### Projektstruktur

```
src/
├── cli.tsx           # Entry + Subcommand-Routing + Shell-Wrapper-Setup
├── api.ts            # Warpgate HTTP-Client + Mock-Loader
├── config.ts         # ~/.config/warpgate-cli/config.json
├── keychain.ts       # `security`-CLI Wrapper (Token + DB-Passwörter)
├── ssh.ts            # buildSshConnection + buildSshCommandString (mit Shell-Quoting)
├── tableplus.ts      # buildTablePlusUrl + buildOpenCommandString
├── database.ts       # databases.json + DB-Keychain-Helpers
├── colors.ts         # Bootstrap-Theme → ink-Color
├── fuzzy.ts          # Score-Funktion für Live-Suche
├── types.ts          # API-Typen + DatabaseEntry
└── ui/
    ├── Picker.tsx     # Suche + gruppierte Liste + Tastatur-Navigation
    ├── Onboarding.tsx # URL → Token → (optional) Username
    ├── DbSubmenu.tsx  # Sub-Picker für DBs eines Targets
    └── DbWizard.tsx   # Multi-Step-Wizard für neue DB-Connections
test/
├── config.test.ts
├── fuzzy.test.ts
├── ssh.test.ts
├── tableplus.test.ts
├── database.test.ts
└── fixtures/         # Mock-Daten für WARPGATE_MOCK=1
```

## Troubleshooting

**`warpgate: command not found`**
Shell-Wrapper noch nicht installiert oder Shell noch nicht neu geladen → `warpgate-cli setup-shell && exec $SHELL`.

**`Token wurde abgelehnt`**
Token im Warpgate Web-UI noch gültig? Mit `warpgate-cli login` neu setzen.

**`Username konnte nicht ermittelt werden`**
`warpgate-cli user <dein-warpgate-username>`.

**Farben fehlen im Picker**
Du nutzt einen alten Wrapper-Block ohne `FORCE_COLOR=1`. Lösung: `warpgate-cli setup-shell` erneut ausführen — der Block wird in-place aktualisiert.

**`Passwort für DB '…' fehlt im Keychain`**
Der DB-Eintrag ist in `databases.json`, aber der Keychain-Eintrag wurde gelöscht oder nie erstellt. `warpgate-cli db edit <label>` durchläuft den Wizard und schreibt das Passwort neu in den Keychain.

**Conflict mit anderem `warpgate`-Befehl**
Das Binary heißt absichtlich `warpgate-cli`. Der Befehl `warpgate` wird ausschließlich von der Shell-Function bereitgestellt, sodass keine Kollision mit anderen Tools (oder dem Warpgate-Server-Binary selbst) entsteht.

## Sicherheitshinweise

- Der API-Token wird über die `security`-CLI an den Keychain übergeben. macOS' `security add-generic-password` nimmt das Secret ausschließlich als Argv-Parameter entgegen, daher ist der Token kurz (<50ms) in der Prozessliste sichtbar. Auf Single-User-Maschinen unkritisch — bitte trotzdem im Hinterkopf behalten.
- `config.json` wird mit Mode `0600` geschrieben.
- Es findet keine TLS-Cert-Validierung jenseits der Defaults von Bun's `fetch` statt.

## Lizenz

<!-- TODO: Lizenz wählen (MIT empfohlen) und entsprechend ergänzen -->
TBD

## Acknowledgments

- [Warpgate](https://github.com/warp-tech/warpgate) — der eigentliche Proxy
- [ink](https://github.com/vadimdemedes/ink) — React für Terminals
- [Bun](https://bun.sh) — Runtime und Build-Tool
