import { useEffect, useMemo, useState } from 'react';
import type { MondayBoardCatalog, MondayBoardSummary } from '@extension/shared';
import {
  MONDAY_AUTOMATION_SETTINGS_STORAGE_KEY,
  getAutomationSettings,
  readAutomationSettingsFromChange,
  setBoardEnabled,
  type MondayAutomationSettings,
} from '../services/automationSettings';
import { MONDAY_BOARD_CATALOG_STORAGE_KEY, getBoardCatalog, readBoardCatalogFromChange } from '../services/boardCatalog';

type WorkspaceBoardGroup = {
  workspaceId?: string;
  workspaceName: string;
  boards: MondayBoardSummary[];
};

function groupBoardsByWorkspace(catalog: MondayBoardCatalog): WorkspaceBoardGroup[] {
  const workspaceNames = new Map(catalog.workspaces.map(workspace => [workspace.id, workspace.name]));
  const groups = new Map<string, WorkspaceBoardGroup>();

  for (const board of catalog.boards) {
    const groupKey = board.workspaceId && workspaceNames.has(board.workspaceId) ? board.workspaceId : 'other';
    const existing = groups.get(groupKey);

    if (existing) {
      existing.boards.push(board);
      continue;
    }

    groups.set(groupKey, {
      workspaceId: groupKey === 'other' ? undefined : groupKey,
      workspaceName: groupKey === 'other' ? 'Other boards' : (workspaceNames.get(groupKey) ?? 'Other boards'),
      boards: [board],
    });
  }

  return [...groups.values()].map(group => ({
    ...group,
    boards: [...group.boards].sort((left, right) => left.name.localeCompare(right.name)),
  }));
}

function countStatusLabels(catalog: MondayBoardCatalog, boardId: string): number {
  return catalog.boardDetailsById[boardId]?.statusColumns.reduce((count, column) => count + column.labels.length, 0) ?? 0;
}

export function BoardAutomationPanel() {
  const [catalog, setCatalog] = useState<MondayBoardCatalog | null>(null);
  const [settings, setSettings] = useState<MondayAutomationSettings | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const enabledBoardIds = useMemo(() => new Set(settings?.enabledBoardIds ?? []), [settings]);
  const boardGroups = useMemo(() => groupBoardsByWorkspace(catalog ?? { workspaces: [], boards: [], boardDetailsById: {}, lastUpdatedAt: '' }), [catalog]);

  const refreshData = async () => {
    setIsRefreshing(true);
    const [nextCatalog, nextSettings] = await Promise.all([getBoardCatalog(), getAutomationSettings()]);
    setCatalog(nextCatalog);
    setSettings(nextSettings);
    setIsRefreshing(false);
  };

  useEffect(() => {
    void refreshData();

    const handleStorageChange = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== 'local') {
        return;
      }

      if (changes[MONDAY_BOARD_CATALOG_STORAGE_KEY]) {
        setCatalog(readBoardCatalogFromChange(changes[MONDAY_BOARD_CATALOG_STORAGE_KEY].newValue));
      }

      if (changes[MONDAY_AUTOMATION_SETTINGS_STORAGE_KEY]) {
        setSettings(readAutomationSettingsFromChange(changes[MONDAY_AUTOMATION_SETTINGS_STORAGE_KEY].newValue));
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const toggleBoard = async (boardId: string, enabled: boolean) => {
    setSettings(current => ({
      enabledBoardIds: enabled
        ? [...new Set([...(current?.enabledBoardIds ?? []), boardId])]
        : (current?.enabledBoardIds ?? []).filter(id => id !== boardId),
      updatedAt: new Date().toISOString(),
    }));

    const nextSettings = await setBoardEnabled(boardId, enabled);
    setSettings(nextSettings);
  };

  const hasBoards = (catalog?.boards.length ?? 0) > 0;

  return (
    <section className="automation-panel">
      <div className="section-title">
        <div>
          <h2>Board automation</h2>
          <p>Chọn các board được phép tự động xử lý khi Status thay đổi.</p>
        </div>
        <button disabled={isRefreshing} onClick={refreshData}>
          {isRefreshing ? 'Đang làm mới' : 'Làm mới danh sách'}
        </button>
      </div>

      {hasBoards ? (
        <div className="workspace-list">
          {boardGroups.map(group => (
            <section className="workspace-group" key={group.workspaceId ?? 'other'}>
              <h3>{group.workspaceName}</h3>
              <div className="board-list">
                {group.boards.map(board => {
                  const details = catalog?.boardDetailsById[board.id];
                  const isEnabled = enabledBoardIds.has(board.id);
                  const statusLabelCount = catalog ? countStatusLabels(catalog, board.id) : 0;

                  return (
                    <label className="board-row" key={board.id}>
                      <input checked={isEnabled} type="checkbox" onChange={event => void toggleBoard(board.id, event.currentTarget.checked)} />
                      <span className="board-row-main">
                        <span className="board-name">{board.name}</span>
                        <span className="board-meta">
                          {isEnabled ? 'Bật' : 'Tắt'}
                          {details ? ` · ${details.groups.length} group · ${statusLabelCount} nhãn Status` : ''}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="empty-state">Chưa tìm thấy board. Hãy mở hoặc tải lại monday.com để extension thu thập dữ liệu.</p>
      )}
    </section>
  );
}
