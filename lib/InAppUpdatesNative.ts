import {
    NativeModules,
    NativeEventEmitter,
} from 'react-native';
import _ from 'underscore';

import { compareVersions } from './utils';
import {
    IncomingStatusUpdateEvent,
    CheckOptions,
    NeedsUpdateResponse,
    SemverVersionCode,
} from './types';
import InAppUpdatesBase from './InAppUpdatesBase';

const { SpInAppUpdates } = NativeModules;

export const UPDATE_STATUS = {
    AVAILABLE: SpInAppUpdates.UPDATE_AVAILABLE,
    UNAVAILABLE: SpInAppUpdates.UPDATE_NOT_AVAILABLE,
    UNKNOWN: SpInAppUpdates.UPDATE_UNKNOWN,
    DEVELOPER_TRIGGERED: SpInAppUpdates.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS,
    UPDATE_CANCELED: SpInAppUpdates.UPDATE_CANCELED,
    UPDATE_DOWNLOADED: SpInAppUpdates.UPDATE_DOWNLOADED,
    UPDATE_DOWNLOADING: SpInAppUpdates.UPDATE_DOWNLOADING,
    UPDATE_FAILED: SpInAppUpdates.UPDATE_FAILED,
    UPDATE_INSTALLED: SpInAppUpdates.UPDATE_INSTALLED,
    UPDATE_INSTALLING: SpInAppUpdates.UPDATE_INSTALLING,
    UPDATE_PENDING: SpInAppUpdates.UPDATE_PENDING,
};
export const UPDATE_TYPE = {
    IMMEDIATE: SpInAppUpdates.APP_UPDATE_IMMEDIATE,
    FLEXIBLE: SpInAppUpdates.APP_UPDATE_FLEXIBLE,
};

export type UpdateTypeKey = keyof typeof UPDATE_TYPE;
export type UpdateTypeValue = typeof UPDATE_TYPE[UpdateTypeKey];
export type UpdateStatusKey = keyof typeof UPDATE_STATUS;
export type UpdateStatusValue = typeof UPDATE_STATUS[UpdateStatusKey];
export type InAppUpdateExtras = {
    updateAvailability: UpdateStatusValue;
    versionCode: SemverVersionCode;
};
export interface NeedsUpdateResponseNative extends NeedsUpdateResponse {
    other: InAppUpdateExtras;
}
export interface StartUpdateOptionsAndroid {
    updateType: UpdateTypeValue;
}


export default class InAppUpdatesNative extends InAppUpdatesBase {
    constructor() {
        super();
        this.eventEmitter = new NativeEventEmitter(SpInAppUpdates);
        this.eventEmitter.addListener(SpInAppUpdates.IN_APP_UPDATE_STATUS_KEY, this.onIncomingNativeStatusUpdate);
        this.eventEmitter.addListener(SpInAppUpdates.IN_APP_UPDATE_RESULT_KEY, this.onIncomingNativeResult);
    }

    protected onIncomingNativeResult = (event) => {
        this.resultListeners.emitEvent(event);
    }

    protected onIncomingNativeStatusUpdate = (event: IncomingStatusUpdateEvent) => {
        let {bytesDownloaded, totalBytesToDownload} = event;
        // This data comes from Java as a string, since React's WriteableMap doesn't support `long` type values.
        bytesDownloaded = parseInt(bytesDownloaded, 10);
        totalBytesToDownload = parseInt(totalBytesToDownload, 10);
        this.statusUpdateListeners.emitEvent({
            ...event,
            bytesDownloaded,
            totalBytesToDownload,
        });
    }

    public addStatusUpdateListener = (callback: any) => {
        this.statusUpdateListeners.addListener(callback);
        if (this.statusUpdateListeners.hasListeners()) {
            SpInAppUpdates.setStatusUpdateSubscription(true);
        }
    }

    public removeStatusUpdateListener = (callback: any) => {
        this.statusUpdateListeners.removeListener(callback);
        if (!this.statusUpdateListeners.hasListeners()) {
            SpInAppUpdates.setStatusUpdateSubscription(false);
        }
    }

    public addIntentSelectionListener = (callback: any) => {
        this.resultListeners.addListener(callback);
    }

    public removeIntentSelectionListener = (callback: any) => {
        this.resultListeners.removeListener(callback);
    }

    /**
     * Checks if there are any updates available.
     */
    public checkNeedsUpdate = (checkOptions: CheckOptions): Promise<NeedsUpdateResponseNative> => {
        const {
            curVersion,
            toSemverConverter,
            customVersionComparator,
        } = (checkOptions || {});


        if (!curVersion) {
            this.throwError('You have to include at least the curVersion to the options passed in checkNeedsUpdate', 'checkNeedsUpdate');
        }
        return SpInAppUpdates.checkNeedsUpdate()
            .then((inAppUpdateInfo: InAppUpdateExtras) => {
                const { updateAvailability, versionCode } = inAppUpdateInfo || {};

                if (updateAvailability === UPDATE_STATUS.AVAILABLE) {
                    let newAppV = versionCode;
                    if (toSemverConverter) {
                        newAppV = toSemverConverter(versionCode);
                        if (!newAppV) {
                            this.throwError(`Couldnt convert ${versionCode} using your custom semver converter`, 'checkNeedsUpdate');
                        }
                    }
                    const vCompRes = customVersionComparator ?
                        customVersionComparator(newAppV, curVersion)
                        :
                        compareVersions(newAppV, curVersion);

                    if (vCompRes > 0) {
                        // play store version is higher than the current version
                        return {
                            shouldUpdate: true,
                            storeVersion: newAppV,
                            other: { ...inAppUpdateInfo },
                        }
                    }
                    return {
                        shouldUpdate: false,
                        storeVersion: newAppV,
                        reason: `current version (${curVersion}) is already later than the latest store version (${newAppV}${toSemverConverter ? ` - originated from ${versionCode}` : ''})`,
                        other: { ...inAppUpdateInfo },
                    }
                }
                return {
                    shouldUpdate: false,
                    reason: `status: ${updateAvailability} means there's no new version available`,
                    other: { ...inAppUpdateInfo },
                }
            })
            .catch((err: any) => {
                this.throwError(err, 'checkNeedsUpdate');
            });
    }

    /**
     * 
     * Shows pop-up asking user if they want to update, giving them the option to download said update.
     */
    public startUpdate = (updateOptions: StartUpdateOptionsAndroid): Promise<any> => {
        const {
            updateType
        } = updateOptions || {};
        if (updateType !== UPDATE_TYPE.FLEXIBLE && updateType !== UPDATE_TYPE.IMMEDIATE) {
            this.throwError(`updateType should be one of: ${UPDATE_TYPE.FLEXIBLE} or ${UPDATE_TYPE.IMMEDIATE}, ${updateType} was passed.`, 'startUpdate');
        }
        return SpInAppUpdates.startUpdate(updateType)
            .catch((err: any) => {
                this.throwError(err, 'startUpdate');
            });
    }

    public installUpdate = (): void => {
        SpInAppUpdates.installUpdate();
    }
}
