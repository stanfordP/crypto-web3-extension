/**
 * Adapters Module
 * 
 * Exports all adapter interfaces and implementations.
 * 
 * @module adapters
 */

// Types
export type {
  IStorageAdapter,
  IRuntimeAdapter,
  ITabsAdapter,
  IDOMAdapter,
  IAlarmsAdapter,
  IAdapterContainer,
  StorageChange,
  StorageAreaName,
  StorageChangeCallback,
  MessageListener,
  MessageResponseCallback,
  RuntimeMessageSender,
  TabQueryOptions,
  TabInfo,
  TabCreateOptions,
  AlarmCreateOptions,
  AlarmInfo,
  AlarmCallback,
} from './types';

// Chrome Implementations
export { ChromeStorageAdapter } from './ChromeStorageAdapter';
export { ChromeRuntimeAdapter } from './ChromeRuntimeAdapter';
export { ChromeTabsAdapter } from './ChromeTabsAdapter';
export { ChromeAlarmsAdapter } from './ChromeAlarmsAdapter';
export { DOMAdapter } from './DOMAdapter';
