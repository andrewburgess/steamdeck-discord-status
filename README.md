# Steam Deck Discord Status

Updates Discord Rich Presence with the currently running game while on Steam Deck.

## How to Use

Discord must be running in order for this plugin to work. You should have Discord installed as a Flatpak
and setup as a Non-Steam Game that can be launced from Steam. This will ensure the plugin can detect
when Discord is running.

### Device Name

Your presence reads `on Steam Deck` by default. SteamOS runs on plenty of other hardware now, so
the quick access panel has a **Device Name** field — set it to `ROG Ally`, `Steam Machine`, or
whatever you are actually playing on, and the presence follows. Clearing the field puts it back to
`Steam Deck`. The name is saved on the deck and applies immediately to whatever is currently
running.

### Discord Application ID (advanced)

The bold first line of your status is the *name of the Discord application* the plugin connects as,
and Discord gives no way to override it from a rich presence payload — `SET_ACTIVITY` accepts
`details`, `state`, `timestamps`, `assets` and friends, but no `name`. The only way to change that
text is to connect as a different application.

So under **Advanced Settings** you can point the plugin at a Discord application of your own:
create one in the [developer portal](https://discord.com/developers/applications), name it whatever
you want the bold line to read, and paste its ID in. Leave the field blank to go back to the
plugin's own application. Games that Discord already recognises are unaffected — those connect as
the game's own application so the status shows the real game name.

## Development

Requires Node (see `mise.toml`) and pnpm. No Docker, no `decky` CLI, no WSL — the deploy script
uses only `ssh` and `tar`, both of which ship with Windows 11, macOS and Linux.

Copy `deck.example.json` to `deck.json` and fill in your deck's hostname and sudo password.
The file is gitignored. SSH uses key auth, so make sure `ssh deck@<host>` works first.

```sh
pnpm install
pnpm deck          # build, ship to the deck, restart decky
pnpm deck:watch    # same, on every change to src/ or main.py
pnpm zip           # build out/<plugin>.zip for a manual install, no deploy
```

`pnpm deck` accepts `--no-build` (redeploy the current `dist/`), `--no-restart` (leave the running
plugin alone), `--full-restart` and `--zip`.

By default a deploy reloads *just this plugin* through decky rather than restarting
`plugin_loader`, which would tear down the quick access menu and close whatever panel you have
open. That path talks to Steam's CEF debugging port (8081, override with `cefPort` in `deck.json`)
and needs decky's developer mode switched on. If it is unavailable the script says so and falls
back to a full restart on its own; `--full-restart` forces one.

Backend changes apply the moment the reload finishes. A panel that is already on screen keeps
rendering the React tree it mounted from the previous bundle, so back out of it and reopen to pick
up frontend changes — still far quicker than a restart, which closes the menu entirely.

> Use `pnpm deck`, not `pnpm deploy` — `deploy` is a built-in pnpm command and would not run
> the script.

The plugin is installed to `/home/deck/homebrew/plugins/<PluginName>`, with spaces stripped from
the name in `plugin.json`, which is the same folder decky itself uses when installing from the store.

### Confirming what is deployed

The bottom of the quick access panel shows the version from `package.json`. Builds that go to a
deck also get a short hash covering both the frontend bundle and `main.py`, so the panel reads
`Version 1.5.0 (e5fc95b5b)` — if that hash matches the one printed by your build, the deck is
running the code you just wrote. Release builds (`pnpm build`, `pnpm zip`) omit the hash and show
`Version 1.5.0` alone.
