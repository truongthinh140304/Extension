export const EXTENSION_NAME = 'Monday Board Assistant';

export const MONDAY_HOST_PATTERNS = ['https://*.monday.com/*', 'https://monday.com/*'] as const;

export const KNOWN_STATUSES = [
  'Waiting for reply',
  'Answered',
  'Done',
  'Working on it',
  'Stuck',
  'Not started',
  'In progress',
] as const;
