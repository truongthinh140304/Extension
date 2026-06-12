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
