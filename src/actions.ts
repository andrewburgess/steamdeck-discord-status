export interface ActionsWithPayload<TAction, TPayload> {
    payload: TPayload;
    type: TAction;
}

export interface ActionsWithoutPayload<TAction> {
    type: TAction;
}

export function createAction<TAction>(type: TAction): () => ActionsWithoutPayload<TAction> {
    return (): ActionsWithoutPayload<TAction> => {
        return {
            type
        };
    };
}

export function createActionPayload<TAction, TPayload>(
    type: TAction
): (payload: TPayload) => ActionsWithPayload<TAction, TPayload> {
    return (payload: TPayload): ActionsWithPayload<TAction, TPayload> => {
        return {
            payload,
            type
        };
    };
}

interface ActionCreatorsMapObject {
    [key: string]: (...args: any[]) => ActionsWithPayload<any, any> | ActionsWithoutPayload<any>;
}

export type ActionsUnion<A extends ActionCreatorsMapObject> = ReturnType<A[keyof A]>;
