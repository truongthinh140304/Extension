import { getLocalValue, setLocalValue } from '@extension/storage';
import type { MondayAutomationSettings } from '@extension/shared';

export const MONDAY_AUTOMATION_SETTINGS_STORAGE_KEY = 'mondayAutomationSettingsV1';
export type { MondayAutomationSettings };

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
    const settings = await getLocalValue<unknown>(MONDAY_AUTOMATION_SETTINGS_STORAGE_KEY, null);
    if (!isAutomationSettings(settings)) {
      return createDefaultSettings();
    }

    return {
      enabledBoardIds: uniqueBoardIds(settings.enabledBoardIds),
      updatedAt: settings.updatedAt,
    };
  } catch {
    return createDefaultSettings();
  }
}

export async function saveAutomationSettings(settings: MondayAutomationSettings): Promise<MondayAutomationSettings> {
  const next: MondayAutomationSettings = {
    enabledBoardIds: uniqueBoardIds(settings.enabledBoardIds),
    updatedAt: settings.updatedAt,
  };

  try {
    await setLocalValue(MONDAY_AUTOMATION_SETTINGS_STORAGE_KEY, next);
  } catch {
    return createDefaultSettings();
  }

  return next;
}

export async function setBoardEnabled(boardId: string, enabled: boolean): Promise<MondayAutomationSettings> {
  const current = await getAutomationSettings();
  const enabledBoardIds = enabled
    ? uniqueBoardIds([...current.enabledBoardIds, boardId])
    : current.enabledBoardIds.filter(id => id !== boardId);

  return saveAutomationSettings({
    enabledBoardIds,
    updatedAt: new Date().toISOString(),
  });
}

export function readAutomationSettingsFromChange(newValue: unknown): MondayAutomationSettings {
  return isAutomationSettings(newValue)
    ? {
        enabledBoardIds: uniqueBoardIds(newValue.enabledBoardIds),
        updatedAt: newValue.updatedAt,
      }
    : createDefaultSettings();
}
