import React, { createContext, useEffect, useReducer } from 'react';
import { ActionsUnion, createAction, createActionPayload } from './actions';
import { Api, Event } from './api';

export enum ConnectionStatus {
    DISCONNECTED,
    CONNECTING,
    CONNECTED
}

interface State {
    connectionStatus: ConnectionStatus;
}

const DEFAULT_STATE: State = {
    connectionStatus: ConnectionStatus.DISCONNECTED
};

export const ACTION_CONNECT = 'action:connect';
export const ACTION_SET_CONNECTION_STATUS = 'action:set-connection-status';

export const Actions = {
    connect: createAction<typeof ACTION_CONNECT>(ACTION_CONNECT),
    setConnectionStatus: createActionPayload<typeof ACTION_SET_CONNECTION_STATUS, ConnectionStatus>(
        ACTION_SET_CONNECTION_STATUS
    )
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
        default:
            return state;
    }
}

function enhancedDispatch(api: Api, dispatch: React.Dispatch<AcceptedActions>, state: State) {
    return async (action: AcceptedActions) => {
        switch (action.type) {
            case ACTION_CONNECT:
                dispatch(Actions.setConnectionStatus(ConnectionStatus.CONNECTING));

                const status = await api.reconnect();

                dispatch(
                    Actions.setConnectionStatus(
                        status ? ConnectionStatus.CONNECTED : ConnectionStatus.DISCONNECTED
                    )
                );

                break;
            default:
                dispatch(action);
                break;
        }
    };
}

interface ProviderProps {
    api: Api;
}

const Provider: React.FC<ProviderProps> = (props) => {
    const [state, baseDispatch] = useReducer(reducer, DEFAULT_STATE);

    const dispatch = enhancedDispatch(props.api, baseDispatch, state);

    useEffect(() => {
        props.api
            .on(Event.connect, () =>
                dispatch(Actions.setConnectionStatus(ConnectionStatus.CONNECTED))
            )
            .on(Event.disconnect, () =>
                dispatch(Actions.setConnectionStatus(ConnectionStatus.DISCONNECTED))
            )
            .on(Event.connecting, () =>
                dispatch(Actions.setConnectionStatus(ConnectionStatus.CONNECTING))
            );

        dispatch(
            Actions.setConnectionStatus(
                props.api.connected ? ConnectionStatus.CONNECTED : ConnectionStatus.DISCONNECTED
            )
        );

        return () => {
            props.api.removeAllListeners();
        };
    }, [props.api]);

    return <Context.Provider value={[state, dispatch]}>{props.children}</Context.Provider>;
};

export { Context, Provider };
