export interface Hook {
    unregister: () => void;
}

interface Apps {
    RegisterForAppOverviewChanges: (e: (e: ArrayBuffer) => void) => Hook;
    RegisterForAppDetails: any;
    RegisterForLocalizationChanges: any;
    RegisterForWorkshopChanges: any;
    RegisterForWorkshopItemDownloads: any;
    GetLibraryBootstrapData: any;
    RegisterForAchievementChanges: any;
    GetFriendAchievementsForApp: any;
    GetMyAchievementsForApp: any;
    AddUserTagToApps: any;
    RemoveUserTagFromApps: any;
    ClearUserTagsOnApps: any;
    ClearAndSetUserTagsOnApp: any;
    SetAppHidden: any;
    ResetHiddenState: any;
    SetAppLaunchOptions: any;
    SetAppResolutionOverride: any;
    SetAppCurrentLanguage: any;
    SetAppAutoUpdateBehavior: any;
    SetAppBackgroundDownloadsBehavior: any;
    ToggleAppFamilyBlockedState: any;
    ToggleAppSteamCloudEnabled: any;
    ToggleAppSteamCloudSyncOnSuspendEnabled: any;
    ToggleOverrideResolutionForInternalDisplay: any;
    ToggleEnableSteamOverlayForApp: any;
    ToggleEnableDesktopTheatreForApp: any;
    BrowseLocalFilesForApp: any;
    BrowseScreenshotsForApp: any;
    BrowseScreenshotForApp: any;
    BackupFilesForApp: any;
    VerifyFilesForApp: any;
    CreateDesktopShortcutForApp: any;
    JoinAppContentBeta: any;
    JoinAppContentBetaByPassword: any;
    GetAchievementsInTimeRange: any;
    GetSubscribedWorkshopItems: any;
    SubscribeWorkshopItem: any;
    GetDownloadedWorkshopItems: any;
    DownloadWorkshopItem: any;
    SetLocalScreenshotCaption: any;
    SetLocalScreenshotSpoiler: any;
    GetDetailsForScreenshotUpload: any;
    UploadLocalScreenshot: any;
    DeleteLocalScreenshot: any;
    GetScreenshotsInTimeRange: any;
    GetFriendsWhoPlay: any;
    RequestLegacyCDKeysForApp: any;
    GetSoundtrackDetails: any;
    GetStoreTagLocalization: any;
    GetLaunchOptionsForApp: any;
    GetResolutionOverrideForApp: any;
    ScanForShortcuts: any;
    GetAllShortcuts: () => Promise<SteamShortcut[]>;
    GetShortcutData: any;
    AddShortcut: any;
    RemoveShortcut: any;
    InstallFlatpakAppAndCreateShortcut: any;
    ListFlatpakApps: any;
    UninstallFlatpakApp: any;
    ShowControllerConfigurator: any;
    SetThirdPartyControllerConfiguration: any;
    ToggleAllowDesktopConfiguration: any;
    SetControllerRumblePreference: any;
    GetCachedAppDetails: any;
    SetCachedAppDetails: any;
    ReportLibraryAssetCacheMiss: any;
    SaveAchievementProgressCache: any;
    SetStreamingClientForApp: any;
    SetCustomArtworkForApp: any;
    ClearCustomArtworkForApp: any;
    SetCustomLogoPositionForApp: any;
    ClearCustomLogoPositionForApp: any;
    RequestIconDataForApp: any;
    SpecifyCompatTool: any;
    GetAvailableCompatTools: any;
    SetShortcutName: any;
    SetShortcutExe: any;
    SetShortcutStartDir: any;
    SetShortcutLaunchOptions: any;
    SetShortcutIsVR: any;
    PromptToChangeShortcut: any;
    PromptToSelectShortcutIcon: any;
    InstallApp: any;
    RunGame: any;
    VerifyApp: any;
    StreamGame: any;
    CancelLaunch: any;
    TerminateApp: any;
    UninstallApps: any;
    ShowStore: any;
    SetDLCEnabled: any;
    ContinueGameAction: any;
    CancelGameAction: any;
    GetActiveGameActions: any;
    GetGameActionDetails: any;
    GetGameActionForApp: any;
    SkipShaderProcessing: any;
    MarkEulaAccepted: any;
    MarkEulaRejected: any;
    LoadEula: any;
    GetConflictingFileTimestamps: any;
    GetCloudPendingRemoteOperations: any;
    ClearProton: any;
    RegisterForMarketingMessages: any;
    FetchMarketingMessages: any;
    MarkMarketingMessageSeen: any;
    ReportMarketingMessageSeen: any;
    RegisterForGameActionStart: (
        e: (actionType: number, id: string, action: string) => void
    ) => Hook;
    RegisterForGameActionEnd: any;
    RegisterForGameActionTaskChange: any;
    RegisterForGameActionUserRequest: any;
    RegisterForGameActionShowError: any;
    RegisterForGameActionShowUI: (e: (e: string) => void) => Hook;
    OpenAppSettingsDialog: any;
}

interface Window {
    RegisterForExternalDisplayChanged: any;
    SetManualDisplayScaleFactor: any;
    SetAutoDisplayScale: any;
    Minimize: any;
    ProcessShuttingDown: any;
    ToggleMaximize: any;
    MoveTo: any;
    ResizeTo: any;
    SetMinSize: any;
    SetResizeGrip: any;
    SetComposition: any;
    GamescopeBlur: any;
    BringToFront: any;
    SetForegroundWindow: any;
    SetKeyFocus: any;
    FlashWindow: any;
    StopFlashWindow: any;
    ShowWindow: any;
    HideWindow: any;
    SetWindowIcon: any;
    GetWindowDimensions: any;
    GetWindowRestoreDetails: any;
    PositionWindowRelative: any;
    GetMousePositionDetails: any;
    IsWindowMinimized: any;
    GetBrowserID: any;
}

export interface SteamClient {
    Apps: Apps;
    Browser: any;
    BrowserView: any;
    ClientNotifications: any;
    Cloud: any;
    Console: any;
    Downloads: any;
    FamilySharing: any;
    FriendSettings: any;
    Friends: any;
    GameSessions: any;
    Input: any;
    InstallFolder: any;
    Installs: any;
    MachineStorage: any;
    Messaging: any;
    Notifications: any;
    OpenVR: any;
    Overlay: any;
    Parental: any;
    RegisterIFrameNavigatedCallback: any;
    RemotePlay: any;
    RoamingStorage: any;
    Screenshots: any;
    Settings: any;
    SharedConnection: any;
    Stats: any;
    Storage: any;
    Streaming: any;
    System: any;
    UI: any;
    URL: any;
    Updates: any;
    User: any;
    WebChat: any;
    Window: Window;
}

export interface SteamShortcut {
    appid: number;
    data: {
        bIsApplication: boolean;
        strAppName: string;
        strExePath: string;
        strArguments: string;
        strShortcutPath: string;
        strSortAs: string;
    };
}
export interface AppAchievement {
    strID: string;
    strName: string;
    strDescription: string;
    bAchieved: boolean;
    rtUnlocked: number;
    strImage: string;
    bHidden: boolean;
    flMinProgress: number;
    flCurrentProgress: number;
    flMaxProgress: number;
    flAchieved: number;
}

export interface AppAchievements {
    nAchieved: number;
    nTotal: number;
    vecAchievedHidden: AppAchievement[];
    vecHighlight: AppAchievement[];
    vecUnachieved: AppAchievement[];
}

export interface AppLanguages {
    strDisplayName: string;
    strShortName: string;
}

export interface AppDetails {
    achievements: AppAchievements;
    bCanMoveInstallFolder: boolean;
    bCloudAvailable: boolean;
    bCloudEnabledForAccount: boolean;
    bCloudEnabledForApp: boolean;
    bCloudSyncOnSuspendAvailable: boolean;
    bCloudSyncOnSuspendEnabled: boolean;
    bCommunityMarketPresence: boolean;
    bEnableAllowDesktopConfiguration: boolean;
    bFreeRemovableLicense: boolean;
    bHasAllLegacyCDKeys: boolean;
    bHasAnyLocalContent: boolean;
    bHasLockedPrivateBetas: boolean;
    bIsExcludedFromSharing: boolean;
    bIsSubscribedTo: boolean;
    bOverlayEnabled: boolean;
    bOverrideInternalResolution: boolean;
    bRequiresLegacyCDKey: boolean;
    bShortcutIsVR: boolean;
    bShowCDKeyInMenus: boolean;
    bShowControllerConfig: boolean;
    bSupportsCDKeyCopyToClipboard: boolean;
    bVRGameTheatreEnabled: boolean;
    bWorkshopVisible: boolean;
    eAppOwnershipFlags: number;
    eAutoUpdateValue: number;
    eBackgroundDownloads: number;
    eCloudSync: number;
    eControllerRumblePreference: number;
    eDisplayStatus: number;
    eEnableThirdPartyControllerConfiguration: number;
    eSteamInputControllerMask: number;
    iInstallFolder: number;
    lDiskUsageBytes: number;
    lDlcUsageBytes: number;
    nBuildID: number;
    nCompatToolPriority: number;
    nPlaytimeForever: number;
    nScreenshots: number;
    rtLastTimePlayed: number;
    rtLastUpdated: number;
    rtPurchased: number;
    selectedLanguage: {
        strDisplayName: string;
        strShortName: string;
    };
    strCloudBytesAvailable: string;
    strCloudBytesUsed: string;
    strCompatToolDisplayName: string;
    strCompatToolName: string;
    strDeveloperName: string;
    strDeveloperURL: string;
    strDisplayName: string;
    strExternalSubscriptionURL: string;
    strFlatpakAppID: string;
    strHomepageURL: string;
    strLaunchOptions: string;
    strManualURL: string;
    strOwnerSteamID: string;
    strResolutionOverride: string;
    strSelectedBeta: string;
    strShortcutExe: string;
    strShortcutLaunchOptions: string;
    strShortcutStartDir: string;
    strSteamDeckBlogURL: string;
    unAppID: number;
    vecBetas: any[];
    vecDLC: any[];
    vecDeckCompatTestResults: any[];
    vecLanguages: AppLanguages[];
    vecLegacyCDKeys: any[];
    vecMusicAlbums: any[];
    vecPlatforms: string[];
    vecScreenShots: any[];
}

export interface AppOverview {
    __proto__: any;
    appid: number;
    display_name: string;
    app_type: number;
    mru_index: number;
    rt_recent_activity_time: number;
    minutes_playtime_forever: string;
    minutes_playtime_last_two_weeks: number;
    rt_last_time_played_or_installed: number;
    rt_last_time_played: number;
    rt_last_time_locally_played: number;
    rt_original_release_date: number;
    rt_steam_release_date: number;
    size_on_disk: string;
    m_gameid: string;
    visible_in_game_list: boolean;
    m_ulGameId: {
        low: number;
        high: number;
        unsigned: boolean;
    };
    library_capsule_filename: string;
    most_available_clientid: string;
    selected_clientid: string;
    rt_custom_image_mtime: number;
    sort_as: string;
    association: {
        name: string;
        type: number;
    }[];
    m_setStoreCategories: Set<number>;
    m_setStoreTags: Set<number>;
    per_client_data: [
        {
            clientid: string;
            client_name: string;
            display_status: number;
            status_percentage: number;
            installed: boolean;
            bytes_downloaded: string;
            bytes_total: string;
            is_available_on_current_platform: boolean;
            cloud_status: number;
        }
    ];
    canonicalAppType: number;
    local_per_client_data: {
        clientid: string;
        client_name: string;
        display_status: number;
        status_percentage: number;
        installed: boolean;
        bytes_downloaded: string;
        bytes_total: string;
        is_available_on_current_platform: boolean;
        cloud_status: number;
    };
    most_available_per_client_data: {
        clientid: string;
        client_name: string;
        display_status: number;
        status_percentage: number;
        installed: boolean;
        bytes_downloaded: string;
        bytes_total: string;
        is_available_on_current_platform: boolean;
        cloud_status: number;
    };
    selected_per_client_data: {
        clientid: string;
        client_name: string;
        display_status: number;
        status_percentage: number;
        installed: boolean;
        bytes_downloaded: string;
        bytes_total: string;
        is_available_on_current_platform: boolean;
        cloud_status: number;
    };
    review_score_with_bombs: number;
    review_percentage_with_bombs: number;
    review_score_without_bombs: number;
    review_percentage_without_bombs: number;
    steam_deck_compat_category: number;
}

declare global {
    // @ts-ignore
    let SteamClient: SteamClient;
}
