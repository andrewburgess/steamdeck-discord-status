import {
    ButtonItem,
    definePlugin,
    PanelSection,
    ServerAPI,
    staticClasses
} from 'decky-frontend-lib';
import { useCallback, useEffect, useState, VFC } from 'react';
import { FaDiscord } from 'react-icons/fa';
import { Api } from './api';

const Content: VFC<{ api: Api }> = ({ api }) => {
    const [connected, setConnected] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const onLoad = async () => {
            setLoading(true);
            const reconnected = await api.reconnect();
            setLoading(false);
            setConnected(reconnected);
        };
        onLoad();
    }, [api]);

    const onClick = useCallback(async () => {
        setLoading(true);
        const reconnected = await api.reconnect();
        setLoading(false);
        setConnected(reconnected);
    }, [api]);

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
            {api.runningActivity ? (
                <pre>{JSON.stringify(api.runningActivity.gameInfo, null, 2)}</pre>
            ) : (
                <div>No activity is running...</div>
            )}
        </PanelSection>
    );
};

export default definePlugin((serverApi: ServerAPI) => {
    const api = Api.initialize(serverApi);

    return {
        title: <div className={staticClasses.Title}>Discord Status</div>,
        content: <Content api={api} />,
        icon: <FaDiscord />,
        onDismount: () => {
            api.unregister();
        }
    };
});
