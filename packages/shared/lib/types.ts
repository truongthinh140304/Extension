export type MondayColumnValue = {
  id?: string;
  title: string;
  text: string;
  type?: string;
};

export type MondayItem = {
  id?: string;
  name: string;
  groupName?: string;
  status?: string;
  columns: MondayColumnValue[];
  rawText?: string;
};

export type MondayBoardScanResult = {
  boardName?: string;
  boardUrl: string;
  scannedAt: string;
  items: MondayItem[];
};

export type MondayWorkspaceSummary = {
  id: string;
  name: string;
};

export type MondayBoardSummary = {
  id: string;
  name: string;
  workspaceId?: string;
  kind?: string;
  archived: boolean;
  deleted: boolean;
};

export type MondayGroupSummary = {
  id: string;
  title: string;
  position?: number;
};

export type MondayStatusLabel = {
  index: string;
  name: string;
};

export type MondayStatusColumn = {
  id: string;
  title: string;
  type: string;
  labels: MondayStatusLabel[];
};

export type MondayBoardDetails = {
  id: string;
  name: string;
  workspaceId?: string;
  groups: MondayGroupSummary[];
  statusColumns: MondayStatusColumn[];
  updatedAt: string;
};

export type MondayBoardCatalog = {
  workspaces: MondayWorkspaceSummary[];
  boards: MondayBoardSummary[];
  boardDetailsById: Record<string, MondayBoardDetails>;
  lastUpdatedAt: string;
};

export type MondayWorkspaceData = {
  workspaces: MondayWorkspaceSummary[];
  boards: MondayBoardSummary[];
};

export type MondayAutomationSettings = {
  enabledBoardIds: string[];
  updatedAt: string;
};

export type ScanResponse =
  | {
      ok: true;
      data: MondayBoardScanResult;
    }
  | {
      ok: false;
      error: string;
    };

export type AiMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type AiSettings = {
  provider: 'local' | 'openai-compatible';
  endpoint?: string;
  apiKey?: string;
  model?: string;
};
