import { FC, Fragment, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
    ButtonItem,
    DropdownItem,
    Field,
    PanelSection,
    PanelSectionRow,
    Spinner,
    TextField
} from '@decky/ui';
import { BUILD_HASH, VERSION } from 'virtual:build-info';
import { Actions, ConnectionStatus, Context } from './context';
import { DEFAULT_DEVICE_NAME } from './api';
import { FaCheck } from 'react-icons/fa';

const QuickAccessPanel: FC<{}> = () => {
    const [state, dispatch] = useContext(Context);

    const onClick = useCallback(async () => {
        dispatch(Actions.connect());
    }, [dispatch]);

    const onLaunchDiscord = useCallback(async () => {
        dispatch(Actions.launchDiscord());
    }, []);

    // Held locally while typing so we save once the field is done with, rather
    // than pushing a new presence to Discord on every keystroke. Both drafts
    // follow settingsRevision so they snap back to the stored value after a
    // save, including one the backend normalized or refused.
    const [deviceNameDraft, setDeviceNameDraft] = useState(state.deviceName);
    const [applicationIdDraft, setApplicationIdDraft] = useState(state.discordApplicationId);
    const [showAdvanced, setShowAdvanced] = useState(false);

    useEffect(() => {
        setDeviceNameDraft(state.deviceName);
    }, [state.deviceName, state.settingsRevision]);

    useEffect(() => {
        setApplicationIdDraft(state.discordApplicationId);
    }, [state.discordApplicationId, state.settingsRevision]);

    const onDeviceNameCommit = useCallback(() => {
        if (deviceNameDraft.trim() === state.deviceName) {
            return;
        }

        dispatch(Actions.changeDeviceName(deviceNameDraft));
    }, [deviceNameDraft, dispatch, state.deviceName]);

    const onApplicationIdCommit = useCallback(() => {
        if (applicationIdDraft.trim() === state.discordApplicationId) {
            return;
        }

        dispatch(Actions.changeDiscordApplicationId(applicationIdDraft));
    }, [applicationIdDraft, dispatch, state.discordApplicationId]);

    const options = useMemo(
        () => [
            ...state.runningApps.map((app) => ({
                label: <Fragment>{app.details.name}</Fragment>,
                data: app
            })),
            {
                label: '<None>',
                data: null
            }
        ],
        [state]
    );

    return (
        <PanelSection>
            <PanelSectionRow>
                {state.connectionStatus === ConnectionStatus.CONNECTING && (
                    <Fragment>
                        <Field childrenLayout="inline" label="Checking connection...">
                            <Spinner />
                        </Field>
                        <div style={{ padding: '4px 0px' }}>
                            Discord must be running for this plugin to connect.
                        </div>
                    </Fragment>
                )}
                {state.connectionStatus === ConnectionStatus.DISCONNECTED &&
                    !state.discordShortcutAppId && (
                        <Fragment>
                            <ButtonItem layout="below" onClick={onClick}>
                                Reconnect to Discord
                            </ButtonItem>
                            <div style={{ padding: '4px 0px' }}>
                                Discord must be running for this plugin to connect.
                            </div>
                        </Fragment>
                    )}
                {state.connectionStatus === ConnectionStatus.DISCONNECTED &&
                    state.discordShortcutAppId && (
                        <Fragment>
                            <ButtonItem layout="below" onClick={onLaunchDiscord}>
                                Launch Discord
                            </ButtonItem>
                            <div style={{ padding: '4px 0px' }}>
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
                                layout="below"
                                rgOptions={options}
                                onChange={(option) => {
                                    if (option && option.data) {
                                        dispatch(Actions.changeRunningApp(option.data));
                                    } else if (option && !option.data) {
                                        dispatch(Actions.changeRunningApp(null));
                                    }
                                }}
                                selectedOption={
                                    state.currentApp
                                        ? state.runningApps.find(
                                              (a) => a.appId === state.currentApp?.appId
                                          )
                                        : null
                                }
                            />
                        </PanelSectionRow>
                    )}
                </Fragment>
            )}
            <PanelSectionRow>
                <div style={{ padding: '12px 0px 8px' }}>
                    <TextField
                        label="Device Name"
                        description={`Shown in Discord as "on ${
                            state.deviceName || DEFAULT_DEVICE_NAME
                        }". Leave blank to use "${DEFAULT_DEVICE_NAME}".`}
                        value={deviceNameDraft}
                        onChange={(e) => setDeviceNameDraft(e.target.value)}
                        onBlur={onDeviceNameCommit}
                        bShowClearAction={true}
                    />
                </div>
            </PanelSectionRow>
            <PanelSectionRow>
                <ButtonItem layout="below" onClick={() => setShowAdvanced((shown) => !shown)}>
                    {showAdvanced ? 'Hide Advanced Settings' : 'Advanced Settings'}
                </ButtonItem>
            </PanelSectionRow>
            {showAdvanced && (
                <PanelSectionRow>
                    <div style={{ padding: '4px 0px 8px' }}>
                        <TextField
                            label="Discord Application ID"
                            description={
                                "This application is the fallback one used when we cannot detect one from Discord's set of applications. " +
                                'By default, this will display "Steam" as the activity, with the game name as a subtitle item'
                            }
                            value={applicationIdDraft}
                            onChange={(e) => setApplicationIdDraft(e.target.value)}
                            onBlur={onApplicationIdCommit}
                            mustBeNumeric={true}
                            bShowClearAction={true}
                        />
                    </div>
                </PanelSectionRow>
            )}
            <PanelSectionRow>
                <Field
                    bottomSeparator="none"
                    focusable={false}
                    padding="none"
                    childrenContainerWidth="max"
                >
                    <div
                        style={{
                            boxSizing: 'border-box',
                            color: '#8b929a',
                            fontSize: '0.7em',
                            padding: '10px 16px 6px',
                            textAlign: 'center',
                            width: '100%'
                        }}
                    >
                        Version {VERSION}
                        {BUILD_HASH && ` (${BUILD_HASH})`}
                    </div>
                </Field>
            </PanelSectionRow>
        </PanelSection>
    );
};

export default QuickAccessPanel;
