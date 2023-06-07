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
import { useCallback, useContext, VFC } from 'react';
import { FaCheck, FaDiscord } from 'react-icons/fa';
import { Api } from './api';
import { Actions, ConnectionStatus, Context, Provider } from './context';

const Content: VFC<{}> = () => {
    const [state, dispatch] = useContext(Context);

    const onClick = useCallback(async () => {
        dispatch(Actions.connect());
    }, [dispatch]);

    return (
        <PanelSection>
            <div>Hello</div>
            {state.connectionStatus === ConnectionStatus.CONNECTING && (
                <PanelSectionRow>
                    <Field label="Checking connection status...">
                        <Spinner />
                    </Field>
                </PanelSectionRow>
            )}
            {state.connectionStatus === ConnectionStatus.DISCONNECTED && (
                <ButtonItem layout="below" onClick={onClick}>
                    Reconnect to Discord
                </ButtonItem>
            )}
            {state.connectionStatus === ConnectionStatus.CONNECTED && (
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
    // Attempt to reconnect on load
    api.reconnect().catch((e) => {});

    return {
        title: <div className={staticClasses.Title}>Discord Status</div>,
        content: (
            <Provider api={api}>
                <Content />
            </Provider>
        ),
        icon: <FaDiscord />,
        onDismount: () => {
            api.unregister();
        }
    };
});
