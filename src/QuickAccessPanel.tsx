import { Fragment, VFC, useCallback, useContext } from 'react';
import { Actions, ConnectionStatus, Context } from './context';
import {
    ButtonItem,
    Dropdown,
    Field,
    PanelSection,
    PanelSectionRow,
    Spinner
} from 'decky-frontend-lib';
import { FaCheck } from 'react-icons/fa';

const QuickAccessPanel: VFC<{}> = () => {
    const [state, dispatch] = useContext(Context);

    const onClick = useCallback(async () => {
        dispatch(Actions.connect());
    }, [dispatch]);

    return (
        <PanelSection>
            <PanelSectionRow>
                {state.connectionStatus === ConnectionStatus.CONNECTING && (
                    <PanelSectionRow>
                        <Field childrenLayout="inline" label="Checking connection...">
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
            </PanelSectionRow>
            {state.connectionStatus === ConnectionStatus.CONNECTED && (
                <PanelSectionRow>
                    {state.currentApp && (
                        <div>
                            <p>Current App</p>
                            <div style={{ display: 'flex', width: '100%' }}>
                                <div style={{ flex: '0 0 64px' }}>
                                    <img
                                        src={state.currentApp.localImageUrl}
                                        style={{ width: '64px' }}
                                    />
                                </div>
                                <div
                                    style={{
                                        flex: '1 1 auto',
                                        marginLeft: '10px',
                                        width: '100%'
                                    }}
                                >
                                    {state.currentApp.details.name}
                                </div>
                            </div>
                        </div>
                    )}
                    {state.runningApps.length > 0 && (
                        <Dropdown
                            menuLabel="Change Discord App"
                            rgOptions={state.runningApps.map((app) => ({
                                label: <Fragment>{app.details.name}</Fragment>,
                                data: app
                            }))}
                            onChange={(option) => {
                                if (option) {
                                    dispatch(Actions.changeRunningApp(option.data));
                                }
                            }}
                            selectedOption={state.runningApps.find(
                                (a) => a.appId === state.currentApp?.appId
                            )}
                        />
                    )}
                </PanelSectionRow>
            )}
        </PanelSection>
    );
};

export default QuickAccessPanel;
