import { Router, ServerAPI } from 'decky-frontend-lib';
import { EventEmitter } from 'eventemitter3';
import { AppLifetimeNotification, AppOverview, AppType, Hook } from './SteamClient';
import { logger } from './util';

const log = logger('API');

enum StorageKeys {
    Activities = 'discord-status:activities',
    RunningActivity = 'discord-status:running-activity',
    SuspendTime = 'discord-status:suspend-time'
}

export interface Activity {
    appId: string;
    details: {
        name: string;
    };
    startTime: number;
    imageUrl: string;
    localImageUrl: string;
}

export enum Event {
    connect = 'connect',
    connecting = 'connecting',
    disconnect = 'disconnect',
    update = 'update'
}

function isDiscord(appInfo: AppOverview) {
    return (
        appInfo.app_type === AppType.Shortcut &&
        appInfo.display_name.toLowerCase().includes('discord')
    );
}

export class Api extends EventEmitter {
    private static instance: Api;

    private _activities: {
        [appId: string]: Activity;
    };
    public get activities() {
        return this._activities;
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
    private serverApi: ServerAPI;

    private constructor(serverApi: ServerAPI) {
        super();

        this._activities = {};
        this._runningActivity = null;
        this.serverApi = serverApi;
        this.hooks = [];

        this.hooks.push(
            SteamClient.GameSessions.RegisterForAppLifetimeNotifications(
                this.onAppLifetimeNotification.bind(this)
            )
        );

        this.hooks.push(
            SteamClient.System.RegisterForOnResumeFromSuspend(this.onResume.bind(this))
        );
        this.hooks.push(SteamClient.System.RegisterForOnSuspendRequest(this.onSuspend.bind(this)));

        Router.RunningApps.forEach((app) => {
            const appId = app.appid.toString();
            const gameInfo = appStore.GetAppOverviewByGameID(appId);
            if (isDiscord(gameInfo)) {
                return;
            }

            const image =
                gameInfo.app_type === AppType.Shortcut
                    ? 'steamdeck'
                    : appStore.GetVerticalCapsuleURLForApp(gameInfo);
            let localImageUrl = image;
            if (gameInfo.app_type === AppType.Shortcut) {
                const urls = appStore.GetCustomVerticalCapsuleURLs(gameInfo);
                if (urls.length) {
                    localImageUrl = urls[urls.length - 1];
                }
            }

            log('Storing activity for', appId, gameInfo.display_name);
            this.activities[appId.toString()] = {
                appId: appId,
                details: {
                    name: gameInfo.display_name
                },
                startTime: Date.now(),
                imageUrl: image,
                localImageUrl: localImageUrl
            };
        });

        if (Router.MainRunningApp) {
            const gameInfo = appStore.GetAppOverviewByGameID(
                Router.MainRunningApp.appid.toString()
            );
            if (!isDiscord(gameInfo)) {
                log('Setting running activity to', Router.MainRunningApp.appid.toString());
                this._runningActivity = Router.MainRunningApp.appid.toString();
            }
        }
    }

    public static initialize(serverApi: ServerAPI) {
        Api.instance = new Api(serverApi);

        return Api.instance;
    }

    public async reconnect(): Promise<boolean> {
        log('Reconnecting');
        this.emit(Event.connecting);

        const result = await this.serverApi.callPluginMethod<{}, boolean>('reconnect', {});

        this._connected = result.success && result.result;

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

        return result.success && result.result;
    }

    public unregister(): void {
        this._connected = false;
        this.hooks.forEach((hook) => hook.unregister());
    }

    public async clearActivity(): Promise<boolean> {
        log('Clearing activity', this.runningActivity?.appId);
        const result = await this.serverApi.callPluginMethod<{}, boolean>('clear_activity', {});

        this.runningActivity = null;

        this.emit('update');

        return result.success && result.result;
    }

    public async updateActivity(activity: Activity): Promise<boolean> {
        log('Updating activity', activity);
        const result = await this.serverApi.callPluginMethod<{ activity: Activity }, boolean>(
            'update_activity',
            {
                activity
            }
        );

        if (result.success && result.result) {
            this.runningActivity = activity;

            this.emit('update');
            return true;
        }

        return false;
    }

    protected async onAppLifetimeNotification(app: AppLifetimeNotification) {
        const gameId = app.unAppID.toString();

        const gameInfo = appStore.GetAppOverviewByGameID(gameId);

        if (app.bRunning) {
            const image =
                gameInfo.app_type === AppType.Shortcut
                    ? 'steamdeck'
                    : appStore.GetVerticalCapsuleURLForApp(gameInfo);

            if (isDiscord(gameInfo)) {
                const connected = await this.reconnect();
                if (connected && this.runningActivity) {
                    await this.updateActivity(this.runningActivity);
                }
            } else {
                let localImageUrl = image;
                if (gameInfo.app_type === AppType.Shortcut) {
                    const urls = appStore.GetCustomVerticalCapsuleURLs(gameInfo);
                    if (urls.length) {
                        localImageUrl = urls[urls.length - 1];
                    }
                }
                this._activities[gameId] = {
                    appId: gameId,
                    details: {
                        name: gameInfo.display_name
                    },
                    startTime: Date.now(),
                    imageUrl: image,
                    localImageUrl
                };

                this._runningActivity = gameId;
                await this.updateActivity(this._activities[gameId]);
            }
        } else {
            if (gameId === this.runningActivity?.appId) {
                const cleared = await this.clearActivity();
                if (cleared) {
                    this.runningActivity = null;
                }
            }

            if (this._activities[gameId]) {
                delete this._activities[gameId];
            }
        }
    }

    protected async onResume() {
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
            this._runningActivity = runningActivityValue;
        }

        Object.values(this.activities).forEach((activity) => {
            const previousPlaytime = suspendTime - activity.startTime;
            activity.startTime = Date.now() - previousPlaytime;
        });

        if (this.runningActivity) {
            await this.updateActivity(this.runningActivity);
        }

        localStorage.removeItem(StorageKeys.SuspendTime);
        localStorage.removeItem(StorageKeys.Activities);
        localStorage.removeItem(StorageKeys.RunningActivity);
    }

    protected async onSuspend() {
        localStorage.setItem(StorageKeys.SuspendTime, Date.now().toString());

        localStorage.setItem(StorageKeys.Activities, JSON.stringify(this.activities));

        if (this.runningActivity) {
            localStorage.setItem(StorageKeys.RunningActivity, JSON.stringify(this.runningActivity));
            await this.clearActivity();
        }
    }
}
