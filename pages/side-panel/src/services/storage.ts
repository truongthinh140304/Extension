import type { MondayBoardScanResult } from '@extension/shared';
import { getLocalValue, removeLocalValue, setLocalValue } from '@extension/storage';

const SCAN_RESULT_KEY = 'monday-board-assistant:last-scan';

export const getLastScanResult = () => getLocalValue<MondayBoardScanResult | null>(SCAN_RESULT_KEY, null);

export const saveLastScanResult = (result: MondayBoardScanResult) => setLocalValue(SCAN_RESULT_KEY, result);

export const clearLastScanResult = () => removeLocalValue(SCAN_RESULT_KEY);
