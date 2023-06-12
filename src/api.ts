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

function convertAppOverviewToActivity(appInfo: AppOverview, startTime?: Date): Activity {
    const image =
        appInfo.app_type === AppType.Shortcut
            ? 'steamdeck'
            : appStore.GetVerticalCapsuleURLForApp(appInfo);
    let localImageUrl = image;
    if (appInfo.app_type === AppType.Shortcut) {
        const urls = appStore.GetCustomVerticalCapsuleURLs(appInfo);
        if (urls.length) {
            localImageUrl = urls[urls.length - 1];
        }
    }

    return {
        appId: appInfo.appid.toString(),
        details: {
            name: appInfo.display_name
        },
        startTime: startTime?.getTime() ?? Date.now(),
        imageUrl: image,
        localImageUrl: localImageUrl
    };
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

        this.updateActivityState();
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

        this.updateActivityState();
        if (this.runningActivity) {
            await this.updateActivity(this.runningActivity);
        }

        return result.success && result.result;
    }

    public unregister(): void {
        this._connected = false;
        this.hooks.forEach((hook) => hook.unregister());
    }

    public async clearActivity(): Promise<boolean> {
        if (!this._connected) {
            log('Not connected, not clearing activity');
            return false;
        }

        log('Clearing activity', this.runningActivity?.appId);
        const result = await this.serverApi.callPluginMethod<{}, boolean>('clear_activity', {});

        this.runningActivity = null;

        this.emit('update');

        return result.success && result.result;
    }

    public async updateActivity(activity: Activity): Promise<boolean> {
        this.runningActivity = activity;

        if (!this._connected) {
            log('Not connected, not updating activity');
            return false;
        }

        log('Updating activity', activity);
        const result = await this.serverApi.callPluginMethod<{ activity: Activity }, boolean>(
            'update_activity',
            {
                activity
            }
        );

        if (result.success && result.result) {
            this.emit('update');
            return true;
        }

        log('Failed to update activity', result);
        return false;
    }

    public updateActivityState(): void {
        Router.RunningApps.forEach((app) => {
            const appId = app.appid.toString();
            const gameInfo = appStore.GetAppOverviewByGameID(appId);
            if (isDiscord(gameInfo)) {
                return;
            }

            log('Initializing with activity', appId, gameInfo.display_name);
            this.activities[appId.toString()] = convertAppOverviewToActivity(gameInfo);
        });

        if (Router.MainRunningApp && !this._runningActivity) {
            const gameInfo = appStore.GetAppOverviewByGameID(
                Router.MainRunningApp.appid.toString()
            );
            if (!isDiscord(gameInfo)) {
                log('Setting running activity to', Router.MainRunningApp.appid.toString());
                this._runningActivity = Router.MainRunningApp.appid.toString();
            }
        }
    }

    protected async onAppLifetimeNotification(app: AppLifetimeNotification) {
        const gameId = app.unAppID.toString();

        const gameInfo = appStore.GetAppOverviewByGameID(gameId);

        if (app.bRunning) {
            if (isDiscord(gameInfo)) {
                const connected = await this.reconnect();
                if (connected && this.runningActivity) {
                    await this.updateActivity(this.runningActivity);
                }
            } else {
                const activity = convertAppOverviewToActivity(gameInfo);
                this._activities[gameId] = activity;

                const previousRunning = this.runningActivity;

                this._runningActivity = gameId;
                await this.updateActivity(this._activities[gameId]);

                if (this.connected && previousRunning && previousRunning.appId !== gameId) {
                    this.serverApi.toaster.toast({
                        title: 'Discord',
                        body: `Now playing ${this._activities[gameId].details.name}`
                    });
                }
            }
        } else {
            if (isDiscord(gameInfo)) {
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
                if (running && this.activities[running.appid.toString()]) {
                    this._runningActivity = running.appid.toString();
                    await this.updateActivity(this._activities[this._runningActivity]);

                    if (this.connected) {
                        this.serverApi.toaster.toast({
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
            this.runningActivity = JSON.parse(runningActivityValue);
        }

        Object.values(this.activities).forEach((activity) => {
            const previousPlaytime = suspendTime - activity.startTime;
            activity.startTime = Date.now() - previousPlaytime;
        });

        if (this.runningActivity) {
            await this.reconnect();

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

    protected async onSuspend() {
        localStorage.setItem(StorageKeys.SuspendTime, Date.now().toString());
        localStorage.setItem(StorageKeys.Activities, JSON.stringify(this.activities));

        if (this.runningActivity) {
            localStorage.setItem(StorageKeys.RunningActivity, JSON.stringify(this.runningActivity));
            await this.clearActivity();
            log(
                'Suspending with running activity',
                Date.now().toString(),
                JSON.stringify(this.activities),
                JSON.stringify(this.runningActivity)
            );
        } else {
            log('Suspending', Date.now().toString(), JSON.stringify(this.activities));
        }
    }
}
