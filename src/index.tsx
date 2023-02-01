import {
    ButtonItem,
    definePlugin,
    Field,
    PanelSection,
    PanelSectionRow,
    ServerAPI,
    Spinner,
    staticClasses
} from 'decky-frontend-lib';
import { useCallback, useEffect, useState, VFC } from 'react';
import { FaCheck, FaDiscord } from 'react-icons/fa';
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

    return (
        <PanelSection>
            {!connected && loading && (
                <PanelSectionRow>
                    <Field label="Checking connection status...">
                        <Spinner />
                    </Field>
                </PanelSectionRow>
            )}
            {!connected && !loading && (
                <ButtonItem layout="below" onClick={onClick}>
                    Reconnect to Discord
                </ButtonItem>
            )}
            {connected && !loading && (
                <PanelSectionRow>
                    <Field label="Connected">
                        <FaCheck />
                    </Field>
                </PanelSectionRow>
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
