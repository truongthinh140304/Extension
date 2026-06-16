export type PendingAutomationState = 'ready' | 'needs_mapping' | 'failed';

export type PendingAutomationItem = {
  boardId: string;
  itemId: string;
  itemName: string;
  columnId: string;
  statusIndex: string;
  statusName: string;
  targetGroupId?: string;
  targetGroupTitle?: string;
  state: PendingAutomationState;
  failureReason?: string;
  updatedAt: string;
};

export type PendingBoardAutomation = {
  boardId: string;
  pendingItems: Record<string, PendingAutomationItem>;
  nextBatchItems: Record<string, PendingAutomationItem>;
  isProcessing: boolean;
  updatedAt: string;
};

export type PendingAutomationStore = {
  boardsById: Record<string, PendingBoardAutomation>;
  updatedAt: string;
};

export type StatusGroupMapping = {
  boardId: string;
  columnId: string;
  statusIndex: string;
  statusName: string;
  groupId: string;
  groupTitle: string;
  updatedAt: string;
};

export type StatusGroupMappingStore = {
  mappingsByKey: Record<string, StatusGroupMapping>;
  updatedAt: string;
};
