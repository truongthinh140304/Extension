const manifest = {
  manifest_version: 3,
  name: 'Monday Board Assistant',
  version: '0.1.0',
  description: 'Scan, summarize and analyze monday.com boards from a side panel.',
  permissions: ['sidePanel', 'storage', 'tabs', 'activeTab', 'scripting'],
  host_permissions: ['https://*.monday.com/*', 'https://monday.com/*'],
  background: {
    service_worker: 'background.js',
    type: 'module',
  },
  action: {
    default_title: 'Monday Board Assistant',
  },
  side_panel: {
    default_path: 'side-panel/index.html',
  },
  content_scripts: [
    {
      matches: ['https://*.monday.com/*', 'https://monday.com/*'],
      js: ['content/index.iife.js'],
      run_at: 'document_idle',
    },
  ],
} satisfies chrome.runtime.ManifestV3;

export default manifest;
