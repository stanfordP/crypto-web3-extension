/**
 * Popup UI Module Exports
 * 
 * @module ui/popup
 */

export { PopupController, PopupStorageKeys } from './PopupController';
export type {
  StoredSessionData,
  ApiSessionResponse,
  TabSessionResponse,
  PopupControllerConfig,
} from './PopupController';

export { PopupView, truncateAddress, getNetworkName, formatAccountMode } from './PopupView';
export type {
  PopupViewState,
  SessionDisplayData,
  PopupElements,
  PopupViewEventHandlers,
} from './PopupView';
