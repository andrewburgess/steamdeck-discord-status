import { Fragment, VFC, useCallback, useContext } from 'react';
import { Actions, ConnectionStatus, Context } from './context';
import {
    ButtonItem,
    DropdownItem,
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
                    <Fragment>
                        <Field childrenLayout="inline" label="Checking connection...">
                            <Spinner />
                        </Field>
                        <div style={{padding: '4px 0px'}}>
                            Discord must be running for this plugin to connect. 
                        </div>
                    </Fragment>
                )}
                {state.connectionStatus === ConnectionStatus.DISCONNECTED && (
                    <Fragment>
                        <ButtonItem layout="below" onClick={onClick}>
                            Reconnect to Discord
                        </ButtonItem>
                        <div style={{padding: '4px 0px'}}>
                            Discord must be running for this plugin to connect. 
                        </div>
                    </Fragment>
                )}
                {state.connectionStatus === ConnectionStatus.CONNECTED && (
                    <Fragment>
                        <Field label="Connected">
                            <FaCheck />
                        </Field>
                    </Fragment>
                )}
            </PanelSectionRow>
            {state.connectionStatus === ConnectionStatus.CONNECTED && (
                <Fragment>
                    {state.currentApp && (
                        <PanelSectionRow>
                            <Field
                                bottomSeparator="none"
                                icon={null}
                                label={null}
                                childrenLayout={undefined}
                                inlineWrap={undefined}
                                padding="none"
                                spacingBetweenLabelAndChild="none"
                                childrenContainerWidth="max"
                            >
                                <div style={{ display: 'flex', width: '100%' }}>
                                    <div style={{ flex: '0 0 48px' }}>
                                        <img
                                            src={state.currentApp.localImageUrl}
                                            style={{ width: '48px' }}
                                        />
                                    </div>
                                    <div
                                        style={{
                                            color: '#dcdedf',
                                            fontSize: '1.2em',
                                            flex: '1 1 auto',
                                            marginLeft: '10px',
                                            width: '100%'
                                        }}
                                    >
                                        {state.currentApp.details.name}
                                    </div>
                                </div>
                            </Field>
                        </PanelSectionRow>
                    )}
                    {state.runningApps.length > 0 && (
                        <PanelSectionRow>
                            <DropdownItem
                                label="Set Reported App"
                                description="Change the game or application that is reported to Discord."
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
                        </PanelSectionRow>
                    )}
                </Fragment>
            )}
        </PanelSection>
    );
};

export default QuickAccessPanel;
