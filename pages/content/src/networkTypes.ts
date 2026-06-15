export type MondayNetworkTransport = 'fetch' | 'xhr';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = {
  [key: string]: JsonValue;
};

export type MondayNetworkEventPayload = {
  transport: MondayNetworkTransport;
  url: string;
  method: string;
  requestBody: JsonValue | null;
  responseBody: JsonValue | null;
  status: number | null;
  timestamp: number;
};

export type MondayNetworkEventMessage = {
  source: 'MONDAY_BOARD_ASSISTANT';
  type: 'MONDAY_NETWORK_EVENT';
  payload: MondayNetworkEventPayload;
};

export type MondayMoveItemsRequestPayload = {
  requestId: string;
  boardId: string;
  itemIds: string[];
  targetGroupId: string;
};

export type MondayMoveItemsRequestMessage = {
  source: 'MONDAY_BOARD_ASSISTANT';
  type: 'MONDAY_MOVE_ITEMS_REQUEST';
  payload: MondayMoveItemsRequestPayload;
};

export type MondayMoveItemFailure = {
  itemId: string;
  status: number | null;
  reason: 'HTTP_403' | 'HTTP_500' | 'NETWORK_ERROR' | 'CSRF_TOKEN_UNAVAILABLE';
};

export type MondayMoveItemsResultPayload = {
  requestId: string;
  boardId: string;
  targetGroupId: string;
  succeededItemIds: string[];
  failedItems: MondayMoveItemFailure[];
};

export type MondayMoveItemsResultMessage = {
  source: 'MONDAY_BOARD_ASSISTANT';
  type: 'MONDAY_MOVE_ITEMS_RESULT';
  payload: MondayMoveItemsResultPayload;
};
