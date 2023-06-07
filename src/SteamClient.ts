export interface Hook {
    unregister: () => void;
}

export enum AppType {
    Invalid = 0,
    Game = 1,
    Application = 2,
    Tool = 4,
    Demo = 8,
    Deprecated = 16,
    DLC = 32,
    Guide = 64,
    Driver = 128,
    Config = 256,
    Hardware = 512,
    Franchise = 1024,
    Video = 2048,
    Plugin = 4096,
    Music = 8192,
    Series = 16384,
    Comic = 32768,
    Beta = 65536,
    Shortcut = 1073741824
}

export enum GameAction {
    LaunchApp = 'LaunchApp'
}

export interface AppLifetimeNotification {
    bRunning: boolean;
    nInstanceID: number;
    unAppID: number;
}

interface AppOverview {
    app_type: AppType;
    appid: number;
    canonicalAppType: number;
    display_name: string;
    icon_data: string;
    icon_data_format: string;
    m_gameid: string;
}

export interface AppStore {
    UpdateAppOverview: any;
    GetAppOverviewByAppID: (id: number) => AppOverview;
    GetAppOverviewByGameID: (id: string) => AppOverview;
    CompareSortAs: any;
    allApps: any;
    storeTagCounts: any;
    GetTopStoreTags: any;
    OnLocalizationChanged: any;
    GetStoreTagLocalization: any;
    GetLocalizationForStoreTag: any;
    AsyncGetLocalizationForStoreTag: any;
    sharedLibraryAccountIds: any;
    siteLicenseApps: any;
    GetCachedLandscapeImageURLForApp: any;
    GetCachedVerticalCapsuleURL: any;
    GetCustomHeroImageURLs: any;
    GetCustomImageURLs: any;
    GetCustomLandcapeImageURLs: any;
    GetCustomLogoImageURLs: any;
    GetCustomVerticalCapsuleURLs: any;
    GetIconURLForApp: any;
    GetLandscapeImageURLForApp: any;
    GetPregeneratedVerticalCapsuleForApp: any;
    GetStorePageURLForApp: any;
    GetVerticalCapsuleURLForApp: any;
}

export interface SteamClient {
    GameSessions: {
        RegisterForAppLifetimeNotifications: (
            callback: (notification: AppLifetimeNotification) => void
        ) => Hook;
    };
    System: any;
}

declare global {
    // @ts-ignore
    let appStore: AppStore;
    // @ts-ignore
    let SteamClient: SteamClient;
}
