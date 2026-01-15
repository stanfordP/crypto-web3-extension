/**
 * Chrome Alarms Adapter
 * 
 * Production implementation of IAlarmsAdapter using Chrome's alarms API.
 * 
 * @module adapters/ChromeAlarmsAdapter
 */

import type {
  IAlarmsAdapter,
  AlarmCreateOptions,
  AlarmInfo,
  AlarmCallback,
} from './types';

/**
 * Chrome Alarms Adapter - wraps chrome.alarms API
 */
export class ChromeAlarmsAdapter implements IAlarmsAdapter {
  private alarmListeners = new Map<
    AlarmCallback,
    (alarm: chrome.alarms.Alarm) => void
  >();

  create(name: string, options: AlarmCreateOptions): void {
    chrome.alarms.create(name, options);
  }

  async clear(name: string): Promise<boolean> {
    return chrome.alarms.clear(name);
  }

  async clearAll(): Promise<boolean> {
    return chrome.alarms.clearAll();
  }

  async get(name: string): Promise<AlarmInfo | undefined> {
    const alarm = await chrome.alarms.get(name);
    if (!alarm) return undefined;
    
    return {
      name: alarm.name,
      scheduledTime: alarm.scheduledTime,
      periodInMinutes: alarm.periodInMinutes,
    };
  }

  onAlarm(callback: AlarmCallback): void {
    const chromeListener = (alarm: chrome.alarms.Alarm) => {
      callback({
        name: alarm.name,
        scheduledTime: alarm.scheduledTime,
        periodInMinutes: alarm.periodInMinutes,
      });
    };

    this.alarmListeners.set(callback, chromeListener);
    chrome.alarms.onAlarm.addListener(chromeListener);
  }

  offAlarm(callback: AlarmCallback): void {
    const chromeListener = this.alarmListeners.get(callback);
    if (chromeListener) {
      chrome.alarms.onAlarm.removeListener(chromeListener);
      this.alarmListeners.delete(callback);
    }
  }

  /**
   * Cleanup - remove all listeners
   */
  destroy(): void {
    for (const chromeListener of this.alarmListeners.values()) {
      chrome.alarms.onAlarm.removeListener(chromeListener);
    }
    this.alarmListeners.clear();
  }
}
