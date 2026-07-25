import React, { createContext, useEffect, useReducer } from 'react';
import { ActionsUnion, createAction, createActionPayload } from './actions';
import { Activity, Api, DEFAULT_DEVICE_NAME, DEFAULT_DISCORD_APPLICATION_ID, Event } from './api';

export enum ConnectionStatus {
    DISCONNECTED,
    CONNECTING,
    CONNECTED
}

interface State {
    currentApp: Activity | null;
    connectionStatus: ConnectionStatus;
    deviceName: string;
    /** Discord's own application id, used as the RPC client_id. */
    discordApplicationId: string;
    /** Steam app id of the Discord shortcut, or null if it was not found. */
    discordShortcutAppId: string | null;
    runningApps: Activity[];
    /**
     * Bumped every time a setting comes back from the backend, even when the
     * value is unchanged. Editable fields watch this to reset their draft after
     * a save the backend rejected or normalized.
     */
    settingsRevision: number;
}

const DEFAULT_STATE: State = {
    currentApp: null,
    connectionStatus: ConnectionStatus.DISCONNECTED,
    deviceName: DEFAULT_DEVICE_NAME,
    discordApplicationId: DEFAULT_DISCORD_APPLICATION_ID,
    discordShortcutAppId: null,
    runningApps: [],
    settingsRevision: 0
};

export const ACTION_CHANGE_DEVICE_NAME = 'action:change-device-name';
export const ACTION_CHANGE_DISCORD_APPLICATION_ID = 'action:change-discord-application-id';
export const ACTION_CHANGE_RUNNING_APP = 'action:change-running-app';
export const ACTION_CONNECT = 'action:connect';
export const ACTION_LAUNCH_DISCORD = 'action:launch-discord';
export const ACTION_SET_CONNECTION_STATUS = 'action:set-connection-status';
export const ACTION_SET_DEVICE_NAME = 'action:set-device-name';
export const ACTION_SET_DISCORD_APPLICATION_ID = 'action:set-discord-application-id';
export const ACTION_SET_DISCORD_SHORTCUT_APP_ID = 'action:set-discord-shortcut-app-id';
export const ACTION_SET_RUNNING_APP = 'action:set-running-app';
export const ACTION_UPDATE_APPS = 'action:update-apps';

export const Actions = {
    changeDeviceName: createActionPayload<typeof ACTION_CHANGE_DEVICE_NAME, string>(
        ACTION_CHANGE_DEVICE_NAME
    ),
    changeDiscordApplicationId: createActionPayload<
        typeof ACTION_CHANGE_DISCORD_APPLICATION_ID,
        string
    >(ACTION_CHANGE_DISCORD_APPLICATION_ID),
    changeRunningApp: createActionPayload<typeof ACTION_CHANGE_RUNNING_APP, Activity | null>(
        ACTION_CHANGE_RUNNING_APP
    ),
    connect: createAction<typeof ACTION_CONNECT>(ACTION_CONNECT),
    launchDiscord: createAction<typeof ACTION_LAUNCH_DISCORD>(ACTION_LAUNCH_DISCORD),
    setConnectionStatus: createActionPayload<typeof ACTION_SET_CONNECTION_STATUS, ConnectionStatus>(
        ACTION_SET_CONNECTION_STATUS
    ),
    setDeviceName: createActionPayload<typeof ACTION_SET_DEVICE_NAME, string>(
        ACTION_SET_DEVICE_NAME
    ),
    setDiscordApplicationId: createActionPayload<typeof ACTION_SET_DISCORD_APPLICATION_ID, string>(
        ACTION_SET_DISCORD_APPLICATION_ID
    ),
    setDiscordShortcutAppId: createActionPayload<typeof ACTION_SET_DISCORD_SHORTCUT_APP_ID, string>(
        ACTION_SET_DISCORD_SHORTCUT_APP_ID
    ),
    setRunningApp: createActionPayload<typeof ACTION_SET_RUNNING_APP, Activity | null>(
        ACTION_SET_RUNNING_APP
    ),
    updateApps: createActionPayload<typeof ACTION_UPDATE_APPS, Activity[]>(ACTION_UPDATE_APPS)
};

export type AcceptedActions = ActionsUnion<typeof Actions>;

const Context = createContext<[State, React.Dispatch<AcceptedActions>]>([
    DEFAULT_STATE,
    () => {
        /* noop */
    }
]);

function reducer(state: State, action: AcceptedActions): State {
    switch (action.type) {
        case ACTION_SET_CONNECTION_STATUS:
            return {
                ...state,
                connectionStatus: action.payload
            };
        case ACTION_SET_DEVICE_NAME:
            return {
                ...state,
                deviceName: action.payload,
                settingsRevision: state.settingsRevision + 1
            };
        case ACTION_SET_DISCORD_APPLICATION_ID:
            return {
                ...state,
                discordApplicationId: action.payload,
                settingsRevision: state.settingsRevision + 1
            };
        case ACTION_SET_DISCORD_SHORTCUT_APP_ID:
            return {
                ...state,
                discordShortcutAppId: action.payload
            };
        case ACTION_SET_RUNNING_APP:
            return {
                ...state,
                currentApp: action.payload
            };
        case ACTION_UPDATE_APPS:
            return {
                ...state,
                runningApps: action.payload
            };
        default:
            return state;
    }
}

function enhancedDispatch(api: Api, dispatch: React.Dispatch<AcceptedActions>) {
    return async (action: AcceptedActions) => {
        switch (action.type) {
            case ACTION_CHANGE_DEVICE_NAME:
                // The backend decides the final value (it substitutes the
                // default for a blank name), so reflect what it stored.
                dispatch(Actions.setDeviceName(await api.setDeviceName(action.payload)));
                break;
            case ACTION_CHANGE_DISCORD_APPLICATION_ID:
                await api.setDiscordApplicationId(action.payload);
                break;
            case ACTION_CHANGE_RUNNING_APP:
                await api.updateActivity(action.payload);
                break;
            case ACTION_CONNECT:
                dispatch(Actions.setConnectionStatus(ConnectionStatus.CONNECTING));

                const status = await api.checkConnection();

                dispatch(
                    Actions.setConnectionStatus(
                        status ? ConnectionStatus.CONNECTED : ConnectionStatus.DISCONNECTED
                    )
                );

                break;
            case ACTION_LAUNCH_DISCORD:
                dispatch(Actions.setConnectionStatus(ConnectionStatus.CONNECTING));

                await api.launchDiscord();

                break;
            default:
                dispatch(action);
                break;
        }
    };
}

interface ProviderProps extends React.PropsWithChildren {
    api: Api;
}

const Provider: React.FC<ProviderProps> = (props) => {
    const [state, baseDispatch] = useReducer(reducer, DEFAULT_STATE);

    const dispatch = enhancedDispatch(props.api, baseDispatch);

    useEffect(() => {
        const cb = () => {
            if (props.api.runningActivity) {
                dispatch(Actions.setRunningApp(props.api.runningActivity));
            }
        };

        window.addEventListener('online', cb);

        return () => {
            window.removeEventListener('online', cb);
        };
    }, [props.api]);

    useEffect(() => {
        props.api
            .on(Event.connect, () =>
                dispatch(Actions.setConnectionStatus(ConnectionStatus.CONNECTED))
            )
            .on(Event.disconnect, () =>
                dispatch(Actions.setConnectionStatus(ConnectionStatus.DISCONNECTED))
            )
            .on(Event.deviceNameSet, (name: string) => dispatch(Actions.setDeviceName(name)))
            .on(Event.discordApplicationIdSet, (id: string) =>
                dispatch(Actions.setDiscordApplicationId(id))
            )
            .on(Event.discordShortcutFound, (appId: string) =>
                dispatch(Actions.setDiscordShortcutAppId(appId))
            )
            .on(Event.connecting, () =>
                dispatch(Actions.setConnectionStatus(ConnectionStatus.CONNECTING))
            )
            .on(Event.update, () => {
                dispatch(Actions.updateApps(Object.values(props.api.activities)));
                dispatch(Actions.setRunningApp(props.api.runningActivity));
            });

        dispatch(
            Actions.setConnectionStatus(
                props.api.connected ? ConnectionStatus.CONNECTED : ConnectionStatus.DISCONNECTED
            )
        );

        dispatch(Actions.updateApps(Object.values(props.api.activities)));
        dispatch(Actions.setRunningApp(props.api.runningActivity));
        dispatch(Actions.setDeviceName(props.api.deviceName));
        dispatch(Actions.setDiscordApplicationId(props.api.discordApplicationId));

        if (!props.api.connected) {
            dispatch(Actions.connect());
        }

        return () => {
            props.api.removeAllListeners();
        };
    }, [props.api]);

    return <Context.Provider value={[state, dispatch]}>{props.children}</Context.Provider>;
};

export { Context, Provider };
