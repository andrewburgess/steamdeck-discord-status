#!/usr/bin/env node
/**
 * Build and deploy this plugin to a Steam Deck.
 *
 * Replaces the decky CLI for local development. That tool exists mainly to run
 * `pnpm build` inside a container and to build a Rust/Docker backend; this
 * plugin has neither a custom backend nor py_modules, so the container buys us
 * nothing and only ships for Linux/macOS.
 *
 * The staged layout and the remote install steps match what the CLI produces
 * (see SteamDeckHomebrew/cli src/cli/plugin/{build,deploy}.rs) so the result on
 * the deck is identical to a store install.
 *
 * Usage:
 *   node scripts/deploy.mjs [--watch] [--zip] [--no-build] [--no-deploy] [--no-restart]
 */

import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import { createReadStream } from "node:fs"
import path from "node:path"
import readline from "node:readline"
import os from "node:os"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const OUT = path.join(ROOT, "out")

/** Files copied verbatim into the plugin folder, if they exist. */
const PLUGIN_FILES = ["main.py", "plugin.json", "package.json", "README.md", "LICENSE"]
/** Directories copied into the plugin folder. `defaults` is flattened into the root. */
const PLUGIN_DIRS = ["dist", "bin", "py_modules"]

// --------------------------------------------------------------------------
// args
// --------------------------------------------------------------------------

const args = process.argv.slice(2)
const flags = {
    watch: args.includes("--watch"),
    zip: args.includes("--zip"),
    build: !args.includes("--no-build"),
    deploy: !args.includes("--no-deploy"),
    restart: !args.includes("--no-restart")
}

const unknown = args.filter((a) => !["--watch", "--zip", "--no-build", "--no-deploy", "--no-restart"].includes(a))
if (unknown.length > 0) {
    fail(`unknown argument(s): ${unknown.join(", ")}`)
}

// --------------------------------------------------------------------------
// helpers
// --------------------------------------------------------------------------

function log(message) {
    console.log(`\x1b[36m›\x1b[0m ${message}`)
}

function fail(message) {
    console.error(`\x1b[31m✖\x1b[0m ${message}`)
    process.exit(1)
}

/**
 * Runs a command with no shell involved, so nothing we pass gets re-parsed by
 * cmd.exe or sh. `stdin` may be a string or a stream to pipe in.
 */
function run(command, commandArgs, { stdin, capture = false } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, commandArgs, {
            cwd: ROOT,
            stdio: [stdin === undefined ? "inherit" : "pipe", capture ? "pipe" : "inherit", "inherit"]
        })

        let output = ""
        if (capture) {
            child.stdout.setEncoding("utf8")
            child.stdout.on("data", (chunk) => (output += chunk))
        }

        child.on("error", reject)
        child.on("close", (code) =>
            code === 0 ? resolve(output) : reject(new Error(`${command} exited with code ${code}`))
        )

        if (typeof stdin === "string") {
            child.stdin.end(stdin)
        } else if (stdin !== undefined) {
            stdin.pipe(child.stdin)
            stdin.on("error", reject)
        }
    })
}

async function exists(target) {
    try {
        await fs.stat(target)
        return true
    } catch {
        return false
    }
}

/**
 * Wraps a value in single quotes for the remote POSIX shell. Characters that
 * would survive the quoting are rejected outright rather than escaped -- none
 * of them belong in a hostname or a path, and a mistake here runs as root.
 */
function shellQuote(value, label) {
    const str = String(value)
    if (/['"`$\\\n]/.test(str)) {
        fail(`${label} contains characters that cannot be safely quoted: ${str}`)
    }
    return `'${str}'`
}

function promptPassword(query) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
        process.stdout.write(query)
        rl._writeToOutput = () => {}
        rl.question("", (answer) => {
            rl.close()
            process.stdout.write("\n")
            resolve(answer)
        })
    })
}

// --------------------------------------------------------------------------
// config
// --------------------------------------------------------------------------

/**
 * Reads deck.json. Also accepts the key names the decky CLI writes
 * (deckip/deckport/deckpass/deckkey/deckdir) so an existing file keeps working.
 */
async function readConfig() {
    const candidates = [path.join(ROOT, "deck.json"), path.join(ROOT, ".vscode", "deck.json")]

    let configPath
    for (const candidate of candidates) {
        if (await exists(candidate)) {
            configPath = candidate
            break
        }
    }

    if (!configPath) {
        fail("deck.json not found. Copy deck.example.json to deck.json and fill it in.")
    }

    const raw = JSON.parse(await fs.readFile(configPath, "utf8"))

    const identity = raw.identityFile ?? raw.deckkey?.replace(/^-i\s+/, "")
    const config = {
        host: raw.host ?? raw.deckip,
        user: raw.user ?? "deck",
        port: String(raw.port ?? raw.deckport ?? 22),
        password: raw.password ?? raw.deckpass,
        deckDir: (raw.deckDir ?? raw.deckdir ?? "/home/deck").replace(/\/+$/, ""),
        identityFile: identity
            ? path
                  .resolve(identity.replace(/^~|^\$HOME|^\$\{env:HOME\}/, os.homedir()))
                  .replace(/\\/g, path.sep)
            : undefined
    }

    if (!config.host || config.host === "0.0.0.0") {
        fail("deck.json is missing a usable `host`")
    }

    if (config.identityFile && !(await exists(config.identityFile))) {
        fail(`ssh key not found: ${config.identityFile}`)
    }

    return config
}

function sshArgs(config, extra = []) {
    return [
        "-p",
        config.port,
        ...(config.identityFile ? ["-i", config.identityFile] : []),
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-o",
        "BatchMode=yes",
        ...extra,
        `${config.user}@${config.host}`
    ]
}

// --------------------------------------------------------------------------
// build + stage
// --------------------------------------------------------------------------

async function build() {
    log("building frontend")
    await fs.rm(path.join(ROOT, "dist"), { recursive: true, force: true })
    await run(process.execPath, [path.join(ROOT, "node_modules", "rollup", "dist", "bin", "rollup"), "-c"])
}

/**
 * Assembles out/<Plugin Name>/ with exactly the contents the CLI puts in its
 * zip: dist, the loose plugin files, and the optional bin/py_modules dirs.
 * The contents of `defaults/` are flattened into the plugin root, matching the
 * `strip_prefix("defaults")` the CLI applies while zipping.
 */
async function stage(folderName) {
    log(`staging out/${folderName}`)

    const staged = path.join(OUT, folderName)
    await fs.rm(staged, { recursive: true, force: true })
    await fs.mkdir(staged, { recursive: true })

    for (const file of PLUGIN_FILES) {
        const source = path.join(ROOT, file)
        if (await exists(source)) {
            await fs.copyFile(source, path.join(staged, file))
        } else if (file === "main.py" || file === "plugin.json" || file === "package.json") {
            fail(`required file missing: ${file}`)
        }
    }

    // Any other top level python module the CLI would have picked up via glob.
    for (const entry of await fs.readdir(ROOT, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith(".py") && !PLUGIN_FILES.includes(entry.name)) {
            await fs.copyFile(path.join(ROOT, entry.name), path.join(staged, entry.name))
        }
    }

    for (const dir of PLUGIN_DIRS) {
        const source = path.join(ROOT, dir)
        if (!(await exists(source))) {
            if (dir === "dist") fail("dist/ is missing -- run without --no-build")
            continue
        }
        await copyDir(source, path.join(staged, dir))
    }

    const defaults = path.join(ROOT, "defaults")
    if (await exists(defaults)) {
        await copyDir(defaults, staged)
    }

    return staged
}

async function copyDir(source, destination) {
    await fs.mkdir(destination, { recursive: true })
    for (const entry of await fs.readdir(source, { withFileTypes: true })) {
        if (entry.name === "__pycache__") continue

        const from = path.join(source, entry.name)
        const to = path.join(destination, entry.name)

        if (entry.isDirectory()) {
            await copyDir(from, to)
        } else {
            await fs.copyFile(from, to)
        }
    }
}

async function makeZip(folderName) {
    const target = path.join(OUT, `${folderName}.zip`)
    await fs.rm(target, { force: true })

    const version = await run("tar", ["--version"], { capture: true }).catch(() => "")
    if (!version.includes("bsdtar")) {
        console.warn(`\x1b[33m!\x1b[0m --zip needs bsdtar (libarchive); found: ${version.split("\n")[0] || "nothing"}`)
        return
    }

    log(`writing out/${folderName}.zip`)
    await run("tar", ["-a", "-cf", target, "-C", OUT, folderName])
}

// --------------------------------------------------------------------------
// deploy
// --------------------------------------------------------------------------

/**
 * Ships the staged folder in two ssh connections. The tarball goes up as the
 * deck user (no privileges needed for /tmp), then a second connection feeds the
 * sudo password on stdin -- which is why the upload cannot share it, stdin is
 * already carrying the archive.
 */
async function deploy(config, folderName, pluginName) {
    const pluginsDir = `${config.deckDir}/homebrew/plugins`
    const remoteTmp = `/tmp/decky-deploy-${Date.now()}.tgz`

    log(`uploading to ${config.user}@${config.host}:${remoteTmp}`)
    const tar = spawn("tar", ["-czf", "-", "-C", OUT, folderName], {
        cwd: ROOT,
        stdio: ["ignore", "pipe", "inherit"]
    })
    await run("ssh", sshArgs(config, []).concat(`cat > ${shellQuote(remoteTmp, "temp path")}`), {
        stdin: tar.stdout
    })

    const target = `${pluginsDir}/${folderName}`
    // Guard against an install that used the plugin name verbatim: two folders
    // declaring the same plugin makes decky load it twice.
    const stale = folderName === pluginName ? [] : [`rm -rf ${shellQuote(`${pluginsDir}/${pluginName}`, "plugin path")}`]

    const script = [
        "set -e",
        "umask 022",
        `mkdir -p ${shellQuote(pluginsDir, "deckDir")}`,
        `rm -rf ${shellQuote(target, "plugin path")}`,
        ...stale,
        `tar -xzf ${shellQuote(remoteTmp, "temp path")} -C ${shellQuote(pluginsDir, "deckDir")}`,
        `rm -f ${shellQuote(remoteTmp, "temp path")}`,
        `chown -R root:root ${shellQuote(target, "plugin path")}`,
        // `=` not `+`: tarballs built on Windows carry NTFS-derived 0777/0666
        // modes, so adding bits would leave root-owned files world-writable.
        `chmod -R u=rwX,go=rX ${shellQuote(target, "plugin path")}`,
        `if [ -d ${shellQuote(`${target}/bin`, "plugin path")} ]; then chmod -R a+x ${shellQuote(`${target}/bin`, "plugin path")}; fi`,
        ...(flags.restart ? ["systemctl restart plugin_loader"] : [])
    ].join("\n")

    log(flags.restart ? "installing and restarting decky" : "installing")

    const password = config.password ?? (await promptPassword(`sudo password for ${config.user}@${config.host}: `))
    await run("ssh", sshArgs(config, []).concat(`sudo -S -p '' sh -c "${script}"`), {
        stdin: `${password}\n`
    })
}

// --------------------------------------------------------------------------
// main
// --------------------------------------------------------------------------

async function once(config, folderName, pluginName) {
    if (flags.build) await build()
    await stage(folderName)
    if (flags.zip) await makeZip(folderName)
    if (flags.deploy) await deploy(config, folderName, pluginName)
    log("done")
}

async function watch(config, folderName, pluginName) {
    const watched = ["src", "main.py", "plugin.json", "package.json", "rollup.config.js"]
    let running = false
    let queued = false

    const trigger = async () => {
        if (running) {
            queued = true
            return
        }

        running = true
        try {
            await once(config, folderName, pluginName)
        } catch (error) {
            console.error(`\x1b[31m✖\x1b[0m ${error.message}`)
        } finally {
            running = false
            if (queued) {
                queued = false
                setTimeout(trigger, 0)
            }
        }
    }

    let debounce
    for (const entry of watched) {
        const target = path.join(ROOT, entry)
        if (!(await exists(target))) continue

        const watcher = fs.watch(target, { recursive: true })
        void (async () => {
            for await (const _ of watcher) {
                clearTimeout(debounce)
                debounce = setTimeout(trigger, 300)
            }
        })()
    }

    log(`watching ${watched.join(", ")} -- ctrl+c to stop`)
    await trigger()
}

const pluginName = JSON.parse(await fs.readFile(path.join(ROOT, "plugin.json"), "utf8")).name
if (!pluginName) fail("plugin.json has no `name`")

// decky installs into a folder named after the plugin with spaces removed
// ("Discord Status" -> "DiscordStatus"). Match it so a deploy overwrites the
// store install rather than sitting alongside it.
const folderName = pluginName.replace(/ /g, "")

const config = flags.deploy ? await readConfig() : null

try {
    if (flags.watch) {
        await watch(config, folderName, pluginName)
    } else {
        await once(config, folderName, pluginName)
    }
} catch (error) {
    fail(error.message)
}
