import type { MondayAutomationSettings } from '@extension/shared';

export const MONDAY_AUTOMATION_SETTINGS_STORAGE_KEY = 'mondayAutomationSettingsV1';

function createDefaultSettings(): MondayAutomationSettings {
  return {
    enabledBoardIds: [],
    updatedAt: new Date().toISOString(),
  };
}

function isAutomationSettings(value: unknown): value is MondayAutomationSettings {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<MondayAutomationSettings>;
  return Array.isArray(candidate.enabledBoardIds) && candidate.enabledBoardIds.every(id => typeof id === 'string') && typeof candidate.updatedAt === 'string';
}

function uniqueBoardIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

export async function getAutomationSettings(): Promise<MondayAutomationSettings> {
  try {
    const result = await chrome.storage.local.get(MONDAY_AUTOMATION_SETTINGS_STORAGE_KEY);
    const settings = result[MONDAY_AUTOMATION_SETTINGS_STORAGE_KEY];

    if (!isAutomationSettings(settings)) {
      return createDefaultSettings();
    }

    return {
      enabledBoardIds: uniqueBoardIds(settings.enabledBoardIds),
      updatedAt: settings.updatedAt,
    };
  } catch {
    console.warn('Unable to read monday automation settings.');
    return createDefaultSettings();
  }
}
