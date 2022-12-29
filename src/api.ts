import { ServerAPI } from 'decky-frontend-lib';
import { Hook } from './SteamClient';

export interface Activity {
    appId: string;
    details: {
        name: string;
    };
    startTime: number;
    imageUrl: string;
}

const NONSTEAM_APP_TYPE = 1073741824;

export class Api {
    private static instance: Api;

    private _activities: {
        [appId: string]: Activity;
    };
    public get activities() {
        return this._activities;
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
            this._runningActivity = activity.appId;
        } else {
            this._runningActivity = null;
        }
    }

    private suspendTime: number = 0;
    private hooks: Hook[];
    private serverApi: ServerAPI;

    private constructor(serverApi: ServerAPI) {
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
            SteamClient.Apps.RegisterForGameActionTaskChange(this.onGameActionTaskChange.bind(this))
        );

        this.hooks.push(
            SteamClient.System.RegisterForOnResumeFromSuspend(this.onResume.bind(this))
        );
        this.hooks.push(SteamClient.System.RegisterForOnSuspendRequest(this.onSuspend.bind(this)));
    }

    public static initialize(serverApi: ServerAPI) {
        Api.instance = new Api(serverApi);

        return Api.instance;
    }

    public async reconnect(): Promise<boolean> {
        const result = await this.serverApi.callPluginMethod<{}, boolean>('reconnect', {});

        return result.success && result.result;
    }

    public unregister(): void {
        this.hooks.forEach((hook) => hook.unregister());
    }

    public async clearActivity(): Promise<boolean> {
        if (this.runningActivity) {
            const result = await this.serverApi.callPluginMethod<{}, boolean>('clear_activity', {});

            return result.success && result.result;
        }

        return false;
    }

    public async updateActivity(activity: Activity): Promise<boolean> {
        const result = await this.serverApi.callPluginMethod<{ activity: Activity }, boolean>(
            'update_activity',
            {
                activity
            }
        );

        if (result.success && result.result) {
            this.runningActivity = activity;
            return true;
        }

        return false;
    }

    protected async onAppLifetimeNotification(app: any) {
        let appId = app.unAppID.toString();

        if (appId === '0') {
            appId = app.nInstanceId.toString();
        }

        if (!app.bRunning) {
            if (appId === this.runningActivity?.appId) {
                const cleared = await this.clearActivity();
                if (cleared) {
                    this.runningActivity = null;
                }
            }

            if (this._activities[appId]) {
                delete this._activities[appId];
            }
        } else {
            if (this.runningActivity?.appId === '0') {
                this.runningActivity.appId = appId;
                this._activities[appId] = this.runningActivity;
                delete this._activities['0'];
            }
        }
    }

    protected async debug(args: any) {
        await this.serverApi.callPluginMethod<any, {}>('debug', { args });
    }

    protected async onGameActionTaskChange(
        _actionType: number,
        appId: string,
        action: string,
        status: string
    ) {
        const gameInfo = appStore.GetAppOverviewByGameID(appId);
        const appIdToSet = gameInfo.app_type === NONSTEAM_APP_TYPE ? '0' : appId;

        if (action === 'LaunchApp' && status === 'Completed') {
            const image =
                gameInfo.app_type === NONSTEAM_APP_TYPE
                    ? 'steamdeck'
                    : appStore.GetVerticalCapsuleURLForApp(gameInfo);

            // TODO: Handle this better
            if (
                gameInfo.app_type === NONSTEAM_APP_TYPE &&
                gameInfo.display_name.toLowerCase().includes('discord')
            ) {
                const connected = await this.reconnect();
                if (connected && this.runningActivity) {
                    await this.updateActivity(this.runningActivity);
                }
            } else {
                this._activities[appIdToSet] = {
                    appId,
                    details: {
                        name: gameInfo.display_name
                    },
                    imageUrl: image,
                    startTime: Date.now()
                };

                this._runningActivity = appIdToSet;
                await this.updateActivity(this._activities[appIdToSet]);
            }
        }
    }

    protected async onResume() {
        Object.values(this.activities).forEach((activity) => {
            const previousPlaytime = this.suspendTime - activity.startTime;
            activity.startTime = Date.now() - previousPlaytime;
        });

        if (this.runningActivity) {
            await this.updateActivity(this.runningActivity);
        }

        this.suspendTime = 0;
    }

    protected async onSuspend() {
        if (this.runningActivity) {
            this.suspendTime = Date.now();
            await this.clearActivity();
        }
    }
}
