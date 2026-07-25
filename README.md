# Steam Deck Discord Status

Updates Discord Rich Presence with the currently running game while on Steam Deck.

## How to Use

Discord must be running in order for this plugin to work. You should have Discord installed as a
Flatpak and setup as a Non-Steam Game that can be launched from Steam. This will ensure the plugin
can detect when Discord is running.

### Alternative Discord Clients

Other Discord clients such as Vencord or Vesktop are not officially supported. A workaround can be
found here https://github.com/andrewburgess/steamdeck-discord-status/issues/13 which should enable
those to work.

A PR to add support is also acceptable if someone wants to add that

### Device Name

Your presence reads `on Steam Deck` by default. SteamOS runs on plenty of other hardware now, so the
quick access panel has a **Device Name** field. This can be used to customize the device name.
Clearing the field puts it back to `Steam Deck`.

### Discord Application ID (advanced)

If you want to have a custom fallback application where you can control the main activity name and
some of the image content, you can open up the Advanced Settings and enter the Client ID of your
Discord application.

Create one in the [Discord developer portal](https://discord.com/developers/applications), name it
whatever you want the main activity line to read, and paste its ID in. Leave the field blank to go
back to this plugin's application. This will only affect games that cannot be detected from the list
that Discord publishes.

## Development

Requires Node (see `mise.toml`) and pnpm.

Copy `deck.example.json` to `deck.json` and fill in your deck's hostname and sudo password. SSH uses
key auth, so make sure `ssh deck@<host>` works first.

```sh
pnpm install
pnpm deck          # build, ship to the deck, restart decky
pnpm deck:watch    # same, on every change to src/ or main.py
pnpm zip           # build out/<plugin>.zip for a manual install, no deploy
```

`pnpm deck` accepts `--no-build` (redeploy the current `dist/`), `--no-restart` (leave the running
plugin alone), `--full-restart` and `--zip`.

By default a deploy reloads _just this plugin_ through decky rather than restarting `plugin_loader`,
which would tear down the quick access menu and close whatever panel you have open. That path talks
to Steam's CEF debugging port (8081, override with `cefPort` in `deck.json`) and needs decky's
developer mode switched on. If it is unavailable the script says so and falls back to a full restart
on its own; `--full-restart` forces one.

Backend changes apply the moment the reload finishes. A panel that is already on screen keeps
rendering the React tree it mounted from the previous bundle, so back out of it and reopen to pick
up frontend changes.

> Use `pnpm deck`, not `pnpm deploy` — `deploy` is a built-in pnpm command and would not run the
> script.
