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
