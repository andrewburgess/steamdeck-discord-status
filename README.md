# Steam Deck Discord Status

Updates Discord Rich Presence with the currently running game while on Steam Deck.

## How to Use

Discord must be running in order for this plugin to work. You should have Discord installed as a Flatpak
and setup as a Non-Steam Game that can be launced from Steam. This will ensure the plugin can detect
when Discord is running.

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

`pnpm deck` accepts `--no-build` (redeploy the current `dist/`), `--no-restart` (leave
`plugin_loader` alone) and `--zip`.

> Use `pnpm deck`, not `pnpm deploy` — `deploy` is a built-in pnpm command and would not run
> the script.

The plugin is installed to `/home/deck/homebrew/plugins/<PluginName>`, with spaces stripped from
the name in `plugin.json`, which is the same folder decky itself uses when installing from the store.
