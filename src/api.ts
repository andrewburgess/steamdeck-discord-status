import { Router, sleep } from '@decky/ui';
import { callable, toaster } from '@decky/api';
import { EventEmitter } from 'eventemitter3';
import { logger } from './util';
import { AppDetails } from '@decky/ui/dist/globals/steam-client/App';
import { AppOverview, AppType, Hook } from './SteamClient';
import { AppLifetimeNotification } from '@decky/ui/dist/globals/steam-client/GameSessions';
import { ESuspendResumeProgressState, SuspendProgress } from '@decky/ui/dist/globals/steam-client/User';

const log = logger('API');

enum StorageKeys {
    Activities = 'discord-status:activities',
    DetectableCache = 'discord-status:apps',
    DiscordShortcut = 'discord-status:shortcut',
    RunningActivity = 'discord-status:running-activity',
    SuspendTime = 'discord-status:suspend-time'
}

export interface Activity {
    appId: string;
    details: {
        name: string;
    };
    discordId?: string;
    startTime: number;
    imageUrl: string;
    localImageUrl: string;
}

/** An entry from Discord's detectable applications endpoint. */
interface DiscordDetectableApplication {
    aliases?: string[];
    id: string;
    name: string;
}

/**
 * Name lookups built from that endpoint. The raw response is ~12MB of
 * executables, hashes and overlay settings we never read; the two maps below
 * come to well under 1MB.
 */
interface DetectableApplicationIndex {
    /** Exact display names. Tried first so a fuzzy collision cannot beat one. */
    exact: Record<string, string>;
    /** Normalised names plus aliases, with ambiguous keys removed. */
    normalised: Record<string, string>;
}

interface CachedDetectableApplications extends DetectableApplicationIndex {
    lastFetch: number;
    version: number;
}

/** Bumped when the cached shape or contents change, so old entries refetch. */
const DETECTABLE_CACHE_VERSION = 3;
const DETECTABLE_CACHE_TTL = 1000 * 60 * 60 * 24;

export enum Event {
    connect = 'connect',
    connecting = 'connecting',
    deviceNameSet = 'device-name-set',
    /**
     * The Discord *application* we report presence as changed -- a snowflake
     * from the Discord developer portal, used as the RPC client_id. Not to be
     * confused with discordShortcutFound.
     */
    discordApplicationIdSet = 'discord-application-id-set',
    /**
     * We located Discord itself in the Steam library. Carries the *Steam* app id
     * of the non-Steam shortcut, which is what we launch. Nothing to do with
     * Discord's own application ids.
     */
    discordShortcutFound = 'discord-shortcut-set',
    disconnect = 'disconnect',
    update = 'update'
}

/** Kept in sync with DEFAULT_DEVICE_NAME in main.py. */
export const DEFAULT_DEVICE_NAME = 'Steam Deck';

/** The plugin's own Discord application, and CLIENT_ID in main.py. */
export const DEFAULT_DISCORD_APPLICATION_ID = '1055680235682672682';

const DISCORD_SHORTCUT_COMMANDS = ['com.discordapp.Discord', 'dev.vencord.Vesktop'];

async function isDiscord(appInfo: AppOverview) {
    return new Promise((resolve) => {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        try {
            const { unregister } = SteamClient.Apps.RegisterForAppDetails(
                appInfo.appid,
                (appDetails: AppDetails) => {
                    clearTimeout(timeoutId);

                    const isDiscordCommand = DISCORD_SHORTCUT_COMMANDS.some(
                        (command) =>
                            appDetails.strShortcutExe?.includes(command) ||
                            appDetails.strShortcutLaunchOptions?.includes(command)
                    );
                    unregister();
                    resolve(isDiscordCommand);
                }
            );

            timeoutId = setTimeout(() => {
                unregister();
                resolve(false);
            }, 3000);
        } catch (e) {
            log('Error checking if app is Discord', e);
            clearTimeout(timeoutId);
            resolve(false);
        }
    });
}

/**
 * Steam and Discord spell the same game differently -- "HELLDIVERS™ 2" against
 * "HELLDIVERS 2", "For The King II" against "For the King II", "Tavern Keeper
 * 🍻" against "Tavern Keeper". Fold away the decoration so those still line up.
 */
function normaliseName(name: string): string {
    return name
        .toLowerCase()
        .replace(/[™®©]/g, '')
        .replace(/[‘’]/g, "'")
        .replace(/[^a-z0-9']+/g, ' ')
        .trim();
}

/**
 * Sequels are where Steam and Discord disagree beyond punctuation: "Slay the
 * Spire 2" against "Slay the Spire II". Indexing both spellings lets either
 * side win.
 *
 * Bare I, V and X are deliberately absent: they are far more often part of a
 * title ("Mega Man X") than a number, and mapping them would manufacture keys
 * like "mega man 10".
 */
const NUMERAL_ALIASES: Array<[string, string]> = [
    ['ii', '2'],
    ['iii', '3'],
    ['iv', '4'],
    ['vi', '6'],
    ['vii', '7'],
    ['viii', '8'],
    ['ix', '9'],
    ['xi', '11'],
    ['xii', '12'],
    ['xiii', '13'],
    ['xiv', '14'],
    ['xv', '15'],
    ['xvi', '16'],
    ['xvii', '17'],
    ['xviii', '18'],
    ['xix', '19'],
    ['xx', '20']
];

/** Alternate spellings of a normalised key with its numerals swapped. */
function numeralVariants(key: string): string[] {
    const tokens = key.split(' ');
    const variants = new Set<string>();

    for (const [roman, arabic] of NUMERAL_ALIASES) {
        for (const [from, to] of [
            [roman, arabic],
            [arabic, roman]
        ]) {
            if (!tokens.includes(from)) {
                continue;
            }

            variants.add(tokens.map((token) => (token === from ? to : token)).join(' '));
        }
    }

    variants.delete(key);

    return [...variants];
}

function buildDetectableIndex(
    applications: DiscordDetectableApplication[]
): DetectableApplicationIndex {
    // Null prototype so a game called "constructor" cannot collide with
    // something inherited from Object.prototype.
    const exact: Record<string, string> = Object.create(null);
    const normalised: Record<string, string> = Object.create(null);
    const variants: Record<string, string> = Object.create(null);
    const ambiguous = new Set<string>();
    const ambiguousVariants = new Set<string>();

    const claim = (
        map: Record<string, string>,
        contested: Set<string>,
        key: string,
        id: string
    ) => {
        if (key in map) {
            if (map[key] !== id) {
                contested.add(key);
            }
            return;
        }

        map[key] = id;
    };

    const namesOf = (application: DiscordDetectableApplication) => [
        application.name,
        ...(application.aliases ?? [])
    ];

    const usable = applications.filter((application) => application?.id && application?.name);

    for (const application of usable) {
        exact[application.name] = application.id;

        for (const name of namesOf(application)) {
            const key = normaliseName(name ?? '');
            if (key) {
                claim(normalised, ambiguous, key, application.id);
            }
        }
    }

    // A key two different applications both claim would be a coin flip, and
    // reporting the wrong game is worse than reporting none.
    for (const key of ambiguous) {
        delete normalised[key];
    }

    // Numerals go in a second pass so an invented spelling can never displace
    // or contest a name some application actually publishes.
    for (const application of usable) {
        for (const name of namesOf(application)) {
            const key = normaliseName(name ?? '');
            if (!key) {
                continue;
            }

            for (const variant of numeralVariants(key)) {
                if (!(variant in normalised)) {
                    claim(variants, ambiguousVariants, variant, application.id);
                }
            }
        }
    }

    for (const key of ambiguousVariants) {
        delete variants[key];
    }

    return { exact, normalised: Object.assign(variants, normalised) };
}

function findDetectableApplicationId(
    index: DetectableApplicationIndex | null,
    name: string
): string | undefined {
    if (!index) {
        return undefined;
    }

    // These come from JSON.parse, so a game called "constructor" would
    // otherwise pick up something off Object.prototype.
    const match = index.exact[name] ?? index.normalised[normaliseName(name)];

    return typeof match === 'string' ? match : undefined;
}

function convertAppOverviewToActivity(
    appInfo: AppOverview,
    detectable: DetectableApplicationIndex | null,
    startTime?: Date
): Activity {
    let image =
        appInfo.app_type === AppType.Shortcut
            ? 'https://cdn.discordapp.com/app-assets/1055680235682672682/1057044202631987340.png'
            : appStore.GetVerticalCapsuleURLForApp(appInfo);
    let localImageUrl = image;
    if (appInfo.app_type === AppType.Shortcut) {
        const urls = appStore.GetCustomVerticalCapsuleURLs(appInfo);
        if (urls.length) {
            localImageUrl = urls[urls.length - 1];
        }
    }

    const discordRemoteId = findDetectableApplicationId(detectable, appInfo.display_name);

    if (!discordRemoteId && appInfo.app_type === AppType.Shortcut) {
        image = 'steamdeck';
    }

    return {
        appId: appInfo.appid.toString(),
        details: {
            name: appInfo.display_name
        },
        discordId: discordRemoteId,
        startTime: startTime?.getTime() ?? Date.now(),
        imageUrl: image,
        localImageUrl: localImageUrl
    };
}

export class Api extends EventEmitter {
    private static instance: Api;

    private _clearActivity = callable<[], boolean>('clear_activity');
    private _disconnect = callable<[], boolean>('disconnect');
    private _getDeviceName = callable<[], string>('get_device_name');
    private _getDiscordApplicationId = callable<[], string>('get_discord_application_id');
    private _isConnected = callable<[], boolean>('is_connected');
    private _setDeviceName = callable<[string], string>('set_device_name');
    private _setDiscordApplicationId = callable<[string], string>('set_discord_application_id');
    private _updateActivity = callable<[Activity], boolean>('update_activity');

    private _activities: {
        [appId: string]: Activity;
    };
    public get activities() {
        return this._activities;
    }

    /** Parsed once per refresh rather than per activity. */
    private _detectableApplications: DetectableApplicationIndex | null = null;

    private _deviceName: string = DEFAULT_DEVICE_NAME;
    /** The device the presence reports playing on, e.g. "Steam Deck". */
    public get deviceName() {
        return this._deviceName;
    }

    private _discordApplicationId: string = DEFAULT_DISCORD_APPLICATION_ID;
    /**
     * The Discord application used for games Discord does not recognise. Its
     * name in the developer portal is the bold line of the presence, which
     * SET_ACTIVITY cannot override -- swapping applications is the only way to
     * change that text.
     */
    public get discordApplicationId() {
        return this._discordApplicationId;
    }

    private _connected: boolean = false;
    public get connected() {
        return this._connected;
    }

    private _runningActivity: string | null;
    public get runningActivity(): Activity | null {
        if (this._runningActivity) {
            return this._activities[this._runningActivity];
        }
        return null;
    }
    private set runningActivity(activity: Activity | null) {
        if (activity) {
            this._runningActivity = activity.appId || '0';
        } else {
            this._runningActivity = null;
        }
    }

    private hooks: Hook[];

    private constructor() {
        super();

        this._activities = {};
        this._runningActivity = null;
        this.hooks = [];

        this.hooks.push(
            SteamClient.GameSessions.RegisterForAppLifetimeNotifications(
                this.onAppLifetimeNotification.bind(this)
            )
        );

        this.hooks.push(
            SteamClient.User.RegisterForResumeSuspendedGamesProgress(this.onResume.bind(this))
        );
        this.hooks.push(SteamClient.User.RegisterForPrepareForSystemSuspendProgress(this.onSuspend.bind(this)));

        // Seed from the last run so activities built before the first refresh
        // completes still resolve to a Discord application.
        const cached = this.readDetectableCache();
        if (cached) {
            this._detectableApplications = { exact: cached.exact, normalised: cached.normalised };
        }

        this.updateActivityState();
    }

    public static initialize() {
        Api.instance = new Api();

        return Api.instance;
    }

    public async checkConnection(): Promise<boolean> {
        log('Checking connection');
        this.emit(Event.connecting);

        const [discordShortcutAppId] = await Promise.all([
            this.findDiscordShortcutAppId(),
            this.loadDetectableDiscordApps(),
            this.loadDeviceName(),
            this.loadDiscordApplicationId()
        ]);
        if (!discordShortcutAppId) {
            log('No Discord app found');
            return false;
        }

        this._connected = await this._isConnected();

        if (this._connected) {
            log('Connected');
            this.emit(Event.connect);

            if (this.runningActivity) {
                await this.updateActivity(this.runningActivity);
            }
        } else {
            log('Disconnected');
            this.emit(Event.disconnect);
        }

        await this.updateActivityState();
        if (this.runningActivity) {
            await this.updateActivity(this.runningActivity);
        }

        return this._connected;
    }

    public async disconnect(): Promise<void> {
        log('Disconnecting');

        await this._disconnect();

        this._connected = false;
        this.emit(Event.disconnect);
    }

    public unregister(): void {
        this._connected = false;
        this.hooks.forEach((hook) => hook.unregister());
    }

    public async clearActivity(): Promise<boolean> {
        const appId = this.runningActivity?.appId;
        this.runningActivity = null;

        if (!this._connected) {
            log('Not connected, not clearing activity');
            return false;
        }

        log('Clearing activity', appId);
        const result = await this._clearActivity();

        this.emit('update');

        return result;
    }

    public async loadDeviceName(): Promise<string> {
        try {
            this._deviceName = await this._getDeviceName();
        } catch (e) {
            log('Failed to load device name', e);
            this._deviceName = DEFAULT_DEVICE_NAME;
        }

        this.emit(Event.deviceNameSet, this._deviceName);

        return this._deviceName;
    }

    /**
     * Saves the device name and re-pushes the current activity so Discord picks
     * the new name up straight away rather than at the next game change.
     */
    public async setDeviceName(name: string): Promise<string> {
        log('Setting device name', name);

        try {
            this._deviceName = await this._setDeviceName(name);
        } catch (e) {
            log('Failed to save device name', e);
            return this._deviceName;
        }

        this.emit(Event.deviceNameSet, this._deviceName);

        if (this.runningActivity) {
            await this.updateActivity(this.runningActivity);
        }

        return this._deviceName;
    }

    public async loadDiscordApplicationId(): Promise<string> {
        try {
            this._discordApplicationId = await this._getDiscordApplicationId();
        } catch (e) {
            log('Failed to load Discord application id', e);
            this._discordApplicationId = DEFAULT_DISCORD_APPLICATION_ID;
        }

        this.emit(Event.discordApplicationIdSet, this._discordApplicationId);

        return this._discordApplicationId;
    }

    /**
     * Saves the Discord application id. The backend rejects anything that is not
     * a snowflake and hands back the id still in effect, so a typo leaves the
     * setting alone rather than breaking the presence.
     */
    public async setDiscordApplicationId(applicationId: string): Promise<string> {
        log('Setting Discord application id', applicationId);

        const requested = applicationId.trim();

        try {
            this._discordApplicationId = await this._setDiscordApplicationId(applicationId);
        } catch (e) {
            log('Failed to save Discord application id', e);
            return this._discordApplicationId;
        }

        const rejected = requested !== '' && requested !== this._discordApplicationId;

        // Emitted either way so the panel resets its draft back to whatever is
        // actually in effect, including when the backend refused the input.
        this.emit(Event.discordApplicationIdSet, this._discordApplicationId);

        if (rejected) {
            toaster.toast({
                title: 'Discord',
                body: 'That is not a valid application ID. It should be 17-20 digits.'
            });

            return this._discordApplicationId;
        }

        if (this.runningActivity) {
            await this.updateActivity(this.runningActivity);
        }

        return this._discordApplicationId;
    }

    public async updateActivity(activity: Activity | null): Promise<boolean> {
        if (!activity) {
            return this.clearActivity();
        }

        this.runningActivity = activity;

        if (!this._connected) {
            log('Not connected, not updating activity');
            return false;
        }

        log('Updating activity', activity);
        const result = await this._updateActivity(activity);

        if (result) {
            this.emit('update');
            return true;
        }

        log('Failed to update activity', result);
        return false;
    }

    public async updateActivityState(): Promise<void> {
        for (const app of Router.RunningApps) {
            const appId = app.appid.toString();
            const gameInfo = appStore.GetAppOverviewByGameID(appId);
            if (await isDiscord(gameInfo)) {
                return;
            }

            log('Initializing with activity', appId, gameInfo.display_name);
            this.activities[appId.toString()] = convertAppOverviewToActivity(
                gameInfo,
                this._detectableApplications
            );
        }

        if (Router.MainRunningApp && !this._runningActivity) {
            const gameInfo = appStore.GetAppOverviewByGameID(
                Router.MainRunningApp.appid.toString()
            );
            if (!(await isDiscord(gameInfo))) {
                log('Setting running activity to', Router.MainRunningApp.appid.toString());
                this._runningActivity = Router.MainRunningApp.appid.toString();
            }
        }
    }

    protected async onAppLifetimeNotification(app: AppLifetimeNotification) {
        const gameId = app.unAppID.toString();

        const gameInfo = appStore.GetAppOverviewByGameID(gameId);

        if (app.bRunning) {
            if (await isDiscord(gameInfo)) {
                const connected = await this.checkConnection();
                if (connected && this.runningActivity) {
                    await this.updateActivity(this.runningActivity);
                }
            } else {
                const activity = convertAppOverviewToActivity(
                    gameInfo,
                    this._detectableApplications
                );
                this._activities[gameId] = activity;

                const previousRunning = this.runningActivity;

                this._runningActivity = gameId;
                await this.updateActivity(this._activities[gameId]);

                if (this.connected && previousRunning && previousRunning.appId !== gameId) {
                    toaster.toast({
                        title: 'Discord',
                        body: `Now playing ${this._activities[gameId].details.name}`
                    });
                }
            }
        } else {
            if (await isDiscord(gameInfo)) {
                this._connected = false;
                this.emit(Event.disconnect);
                return;
            }

            let wasCleared = false;
            if (gameId === this.runningActivity?.appId) {
                const cleared = await this.clearActivity();
                if (cleared) {
                    this.runningActivity = null;
                    wasCleared = true;
                }
            }

            if (this._activities[gameId]) {
                delete this._activities[gameId];
            }

            if (wasCleared) {
                // Let a new app pop up
                await new Promise((resolve) => setTimeout(resolve, 5000));

                const running = Router.MainRunningApp;
                if (running && this._activities[running.appid.toString()]) {
                    this._runningActivity = running.appid.toString();
                    await this.updateActivity(this._activities[this._runningActivity]);

                    if (this.connected) {
                        toaster.toast({
                            title: 'Discord',
                            body: `Now playing ${
                                this._activities[this._runningActivity].details.name
                            }`
                        });
                    }
                }
            }
        }
    }

    protected async onResume(progress: SuspendProgress) {
        if (progress.state !== ESuspendResumeProgressState.Complete) {
            return;
        }

        await sleep(2000);
        await this.checkConnection();

        const suspendTimeValue = localStorage.getItem(StorageKeys.SuspendTime);
        let suspendTime = 0;
        if (suspendTimeValue) {
            suspendTime = parseInt(suspendTimeValue, 10);
        }

        const activitiesValue = localStorage.getItem(StorageKeys.Activities);
        if (activitiesValue) {
            this._activities = JSON.parse(activitiesValue);
        }

        const runningActivityValue = localStorage.getItem(StorageKeys.RunningActivity);
        if (runningActivityValue) {
            this.runningActivity = JSON.parse(runningActivityValue);
        }

        Object.values(this.activities).forEach((activity) => {
            const previousPlaytime = suspendTime - activity.startTime;
            activity.startTime = Date.now() - previousPlaytime;
        });

        if (this.runningActivity) {
            await this.updateActivity(this.runningActivity);
        }

        log('Resuming', {
            activities: this.activities,
            runningActivity: this.runningActivity,
            suspendTime
        });

        localStorage.removeItem(StorageKeys.SuspendTime);
        localStorage.removeItem(StorageKeys.Activities);
        localStorage.removeItem(StorageKeys.RunningActivity);
    }

    protected async onSuspend(progress: SuspendProgress) {
        if (progress.state !== ESuspendResumeProgressState.Working) {
            return;
        }

        localStorage.setItem(StorageKeys.SuspendTime, Date.now().toString());
        localStorage.setItem(StorageKeys.Activities, JSON.stringify(this.activities));

        if (this.runningActivity) {
            localStorage.setItem(StorageKeys.RunningActivity, JSON.stringify(this.runningActivity));
            await this.clearActivity();
            log('Suspending with running activity', {
                suspendTime: Date.now().toString(),
                activities: this.activities,
                runningActivity: this.runningActivity
            });
        } else {
            log('Suspending', Date.now().toString(), JSON.stringify(this.activities));
        }

        if (this._connected) {
            await this.disconnect();
        }
    }

    /** Finds the Steam app id of the Discord shortcut in the user's library. */
    protected async findDiscordShortcutAppId() {
        const existingItem = window.localStorage.getItem(StorageKeys.DiscordShortcut);
        if (existingItem) {
            const appInfo = appStore.GetAppOverviewByGameID(existingItem);
            if (await isDiscord(appInfo)) {
                log('Found existing Discord shortcut', existingItem);
                this.emit(Event.discordShortcutFound, existingItem);
                return existingItem;
            }
        }

        const { allApps } = appStore;
        const shortcuts = allApps.filter((app) => app.app_type === AppType.Shortcut);

        const possiblyDiscord = shortcuts.filter(
            (app) =>
                app.display_name.toLowerCase().includes('discord') ||
                app.display_name.toLowerCase().includes('vesktop') ||
                app.display_name.toLowerCase().includes('vencord')
        );

        for (const app of possiblyDiscord) {
            const gameInfo = appStore.GetAppOverviewByGameID(app.appid.toString());
            if (await isDiscord(gameInfo)) {
                window.localStorage.setItem(StorageKeys.DiscordShortcut, app.appid.toString());
                this.emit(Event.discordShortcutFound, app.appid.toString());
                return app.appid.toString();
            }
        }

        for (const app of shortcuts) {
            const gameInfo = appStore.GetAppOverviewByGameID(app.appid.toString());
            if (await isDiscord(gameInfo)) {
                window.localStorage.setItem(StorageKeys.DiscordShortcut, app.appid.toString());
                this.emit(Event.discordShortcutFound, app.appid.toString());
                return app.appid.toString();
            }
        }

        log('No Discord app found');
        return null;
    }

    /**
     * Refreshes the detectable application index, daily at most. Only the name
     * lookups are kept: the raw response is ~12MB and re-parsing that for every
     * activity we build cost tens of milliseconds a time.
     */
    protected async loadDetectableDiscordApps(): Promise<void> {
        const parsed = this.readDetectableCache();
        const stale = parsed && { exact: parsed.exact, normalised: parsed.normalised };

        if (parsed && stale && Date.now() - parsed.lastFetch < DETECTABLE_CACHE_TTL) {
            this._detectableApplications = stale;
            log('Loaded cached detectable apps');
            return;
        }

        try {
            const response = await fetch('https://discord.com/api/v10/applications/detectable');
            const data = (await response.json()) as DiscordDetectableApplication[];
            const index = buildDetectableIndex(data);

            // Deliberately the same key as the old full response: writing the
            // trimmed index back replaces that ~12MB blob instead of orphaning
            // it in localStorage forever.
            window.localStorage.setItem(
                StorageKeys.DetectableCache,
                JSON.stringify({
                    ...index,
                    lastFetch: Date.now(),
                    version: DETECTABLE_CACHE_VERSION
                })
            );

            this._detectableApplications = index;
            log('Loaded detectable apps', Object.keys(index.exact).length);
        } catch (e) {
            // Better a day-old index than none, so a deck offline at startup
            // still recognises games.
            log('Failed to load detectable apps', e);
            this._detectableApplications = stale ?? null;
        }
    }

    /** Reads the cached index, or null when absent, unreadable or outdated. */
    private readDetectableCache(): CachedDetectableApplications | null {
        const cached = window.localStorage.getItem(StorageKeys.DetectableCache);
        if (!cached) {
            return null;
        }

        try {
            const parsed = JSON.parse(cached) as CachedDetectableApplications;

            return parsed?.version === DETECTABLE_CACHE_VERSION ? parsed : null;
        } catch (e) {
            log('Discarding unreadable detectable app cache', e);
            return null;
        }
    }

    public async launchDiscord() {
        const discordShortcutAppId = await this.findDiscordShortcutAppId();

        if (!discordShortcutAppId) {
            toaster.toast({
                title: 'Discord',
                body: 'Could not find Discord shortcut. Make sure it is added to your library as a Non-Steam game.'
            });

            return;
        }

        log('Launching Discord');

        const game = appStore.GetAppOverviewByAppID(parseInt(discordShortcutAppId));
        const gameId = game.m_gameid;

        await SteamClient.Apps.RunGame(gameId, '', -1, 100);

        await sleep(3000);
    }
}
