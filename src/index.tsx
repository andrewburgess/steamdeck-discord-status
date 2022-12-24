import {
    ButtonItem,
    definePlugin,
    PanelSection,
    ServerAPI,
    staticClasses
} from 'decky-frontend-lib';
import { useCallback, useEffect, useState, VFC } from 'react';
import { FaDiscord } from 'react-icons/fa';

import { AppStore } from './AppStore';
import { SteamClient } from './SteamClient';

declare global {
    // @ts-ignore
    let SteamClient: SteamClient;
    let appStore: AppStore;
}

interface UpdateActivity {
    actionType: number;
    appId: string;
    action: string;
    details: any;
}

const Content: VFC<{ serverAPI: ServerAPI }> = ({ serverAPI }) => {
    const [connected, setConnected] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const onLoad = async () => {
            setLoading(true);
            const result = await serverAPI.callPluginMethod<{}, boolean>('reconnect', {});
            setLoading(false);
            if (result.success) {
                if (result.result) {
                    setConnected(true);
                } else {
                    setConnected(false);
                }
            }
        };
        onLoad();
    }, []);

    const onClick = useCallback(async () => {
        setLoading(true);
        const result = await serverAPI.callPluginMethod<{}, boolean>('reconnect', {});
        setLoading(false);
        if (result.success) {
            if (result.result) {
                setConnected(true);
            } else {
                setConnected(false);
            }
        }
    }, []);

    let status = 'Connected';
    if (!connected && loading) {
        status = 'Checking connection status...';
    } else if (!connected && !loading) {
        status = 'Reconnect to Discord';
    }

    return (
        <PanelSection title="Discord Status">
            <ButtonItem disabled={connected || loading} layout="below" onClick={onClick}>
                {status}
            </ButtonItem>
        </PanelSection>
    );
};

export default definePlugin((serverApi: ServerAPI) => {
    /*const focusChangeEvent = SteamClient.System.UI.RegisterForFocusChangeEvents(
        (event: any) => {
            serverApi.callPluginMethod<{}, {}>('rand', {
                app: event
            });
        }
    );*/

    const lifetimeHook = SteamClient.GameSessions.RegisterForAppLifetimeNotifications(
        (app: any) => {
            if (!app.bRunning) {
                serverApi.callPluginMethod<Pick<UpdateActivity, 'appId'>, {}>('clear_activity', {
                    appId: app.unAppID.toString()
                });
            } else {
                serverApi.callPluginMethod<{}, {}>('rand', { app });
            }
        }
    );

    const taskHook = SteamClient.Apps.RegisterForGameActionTaskChange(
        (actionType: number, id: string, action: string, status: string) => {
            if (action === 'LaunchApp' && status === 'Completed') {
                let gameInfo: any = appStore.GetAppOverviewByGameID(id);
                if (gameInfo.display_name.toLowerCase().includes('discord')) {
                    serverApi.callPluginMethod<{}, {}>('reconnect', {});
                } else {
                    serverApi.callPluginMethod<UpdateActivity, {}>('update_activity', {
                        actionType,
                        appId: id,
                        action,
                        details: gameInfo
                    });
                }
            }
        }
    );
    return {
        title: <div className={staticClasses.Title}>Discord Status</div>,
        content: <Content serverAPI={serverApi} />,
        icon: <FaDiscord />,
        onDismount: () => {
            // focusChangeEvent.unregister();
            lifetimeHook.unregister();
            taskHook.unregister();
        }
    };
});
