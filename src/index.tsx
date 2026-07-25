import { Api } from './api';
import { BUILD_HASH } from 'virtual:build-info';
import { definePlugin } from '@decky/api';
import { FaDiscord } from 'react-icons/fa';
import { Provider } from './context';
import { staticClasses } from '@decky/ui';
import QuickAccessPanel from './QuickAccessPanel';

// Dev builds only (release builds have an empty hash). Lets the deploy script
// confirm which bundle the deck actually has live without opening the panel.
if (BUILD_HASH) {
    (window as unknown as Record<string, string>).__DISCORD_STATUS_BUILD = BUILD_HASH;
}

export default definePlugin(() => {
    const api = Api.initialize();
    // Attempt to reconnect on load
    api.checkConnection().catch(() => {});

    return {
        name: 'Discord Status',
        titleView: <div className={staticClasses.Title}>Discord Status</div>,
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
