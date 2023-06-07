import { definePlugin, ServerAPI, staticClasses } from 'decky-frontend-lib';
import { FaDiscord } from 'react-icons/fa';
import { Api } from './api';
import { Provider } from './context';
import QuickAccessPanel from './QuickAccessPanel';

export default definePlugin((serverApi: ServerAPI) => {
    const api = Api.initialize(serverApi);
    // Attempt to reconnect on load
    api.reconnect().catch(() => {});

    return {
        title: <div className={staticClasses.Title}>Discord Status</div>,
        content: (
            <Provider api={api}>
                <QuickAccessPanel />
            </Provider>
        ),
        icon: <FaDiscord />,
        onDismount: () => {
            api.unregister();
        }
    };
});
