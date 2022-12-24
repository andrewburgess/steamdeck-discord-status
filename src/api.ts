import { ServerAPI } from 'decky-frontend-lib';

export interface Activity {
    appId: string;
    details: {
        name: string;
    };
    startTime: number;
    gameInfo: any;
}

interface Hook {
    unregister: () => void;
}

interface UpdateActivity {
    appId: string;
    name: string;
    startTime: number;
}

export class Api {
    private static instance: Api;

    private _runningActivity: Activity | null;
    public get runningActivity(): Activity | null {
        return this._runningActivity;
    }
    private set runningActivity(activity: Activity | null) {
        this._runningActivity = activity;
    }

    private suspendTime: number = 0;
    private onAppLifetimeNotificationHook: Hook;
    private onGameActionTaskChangeHook: Hook;
    private onResumeHook: Hook;
    private onSuspendHook: Hook;
    private serverApi: ServerAPI;

    private constructor(serverApi: ServerAPI) {
        this._runningActivity = null;
        this.serverApi = serverApi;

        this.onAppLifetimeNotificationHook =
            SteamClient.GameSessions.RegisterForAppLifetimeNotifications(
                this.onAppLifetimeNotification.bind(this)
            );
        this.onGameActionTaskChangeHook = SteamClient.Apps.RegisterForGameActionTaskChange(
            this.onGameActionTaskChange.bind(this)
        );

        this.onResumeHook = SteamClient.System.RegisterForOnResumeFromSuspend(
            this.onResume.bind(this)
        );
        this.onSuspendHook = SteamClient.System.RegisterForOnSuspendRequest(
            this.onSuspend.bind(this)
        );
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
        this.onAppLifetimeNotificationHook.unregister();
        this.onGameActionTaskChangeHook.unregister();
        this.onResumeHook.unregister();
        this.onSuspendHook.unregister();
    }

    public async clearActivity(): Promise<boolean> {
        await this.debug({
            message: 'clearActivity',
            runningActivity: this.runningActivity
        });

        if (this.runningActivity) {
            const result = await this.serverApi.callPluginMethod<{}, boolean>('clear_activity', {});

            return result.success && result.result;
        }

        return false;
    }

    public async updateActivity(activity: Activity): Promise<boolean> {
        await this.debug({
            message: 'updateActivity',
            activity
        });

        const result = await this.serverApi.callPluginMethod<UpdateActivity, boolean>(
            'update_activity',
            {
                appId: activity.appId,
                name: activity.details.name,
                startTime: activity.startTime
            }
        );

        if (result.success && result.result) {
            this.runningActivity = activity;
            return true;
        }

        return false;
    }

    protected async onAppLifetimeNotification(app: any) {
        await this.debug({
            message: 'lifetimeNotification',
            app,
            runningActivity: this.runningActivity
        });

        if (!app.bRunning) {
            if (app.unAppID.toString() === this.runningActivity?.appId) {
                const cleared = await this.clearActivity();
                if (cleared) {
                    this.runningActivity = null;
                }
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
        await this.debug({
            _actionType,
            appId,
            action,
            status
        });
        if (action === 'LaunchApp' && status === 'Completed') {
            const gameInfo = appStore.GetAppOverviewByGameID(appId);

            // TODO: Handle this better
            if (gameInfo.display_name.toLowerCase().includes('discord')) {
                await this.reconnect();
            } else {
                this.runningActivity = {
                    appId,
                    details: {
                        name: gameInfo.display_name
                    },
                    gameInfo,
                    startTime: Date.now()
                };
                const launched = await this.updateActivity(this.runningActivity);
                if (!launched) {
                    this.runningActivity = null;
                }
            }
        }
    }

    protected async onResume() {
        await this.debug({
            message: 'on resume'
        });
        if (this.runningActivity) {
            // Move startTime up by the amount of time suspended so that
            // playtime in Discord is somewhat accurate
            this.runningActivity.startTime =
                this.runningActivity.startTime + (Date.now() - this.suspendTime);
            await this.updateActivity(this.runningActivity);
            this.suspendTime = 0;
        }
    }

    protected async onSuspend() {
        await this.debug({
            message: 'on suspend'
        });
        if (this.runningActivity) {
            this.suspendTime = Date.now();
            await this.clearActivity();
        }
    }
}
