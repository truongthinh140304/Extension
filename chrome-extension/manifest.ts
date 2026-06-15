const manifest = {
  manifest_version: 3,
  name: 'SIDE PANEL',
  version: '0.1.0',
  description: 'Scan, summarize and analyze monday.com boards from a side panel.',
  permissions: ['sidePanel', 'storage', 'tabs', 'activeTab', 'scripting'],
  host_permissions: ['https://*.monday.com/*', 'https://monday.com/*'],
  background: {
    service_worker: 'background.js',
    type: 'module',
  },
  action: {
    default_title: 'Side Panel',
  },
  side_panel: {
    default_path: 'side-panel/index.html',
  },
  content_scripts: [
    {
      matches: ['https://*.monday.com/*', 'https://monday.com/*'],
      js: ['content/main-world.iife.js'],
      run_at: 'document_start',
      world: 'MAIN',
    },
    {
      matches: ['https://*.monday.com/*', 'https://monday.com/*'],
      js: ['content/index.iife.js'],
      run_at: 'document_start',
    },
  ],
} satisfies chrome.runtime.ManifestV3;

export default manifest;
