import { AppAchievements, AppDetails, AppOverview, Hook } from './SteamClient';

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

export interface AppDetailsStore {
    __proto__: any;
    GetAppDetails: (id: number) => AppDetails;
    RegisterForAppData: (app_id: any, callback: (data: AppDetails) => void) => Hook;

    GetAchievements(app_id: number): AppAchievements;
}

declare global {
    let appStore: AppStore;
}
