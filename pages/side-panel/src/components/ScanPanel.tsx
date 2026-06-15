type ScanPanelProps = {
  boardName?: string;
  scannedAt?: string;
  error?: string;
  isScanning: boolean;
  onScan: () => void;
  onRefresh: () => void;
  onClear: () => void;
};

export function ScanPanel({ boardName, scannedAt, error, isScanning, onScan, onRefresh, onClear }: ScanPanelProps) {
  return (
    <section className="toolbar-band">
      <div>
        <h2>Legacy board scan</h2>
        <p>{boardName ? `Last board: ${boardName}` : 'Scan the active monday.com board.'}</p>
        {scannedAt ? <p>{`Last scan: ${new Date(scannedAt).toLocaleString()}`}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
      </div>
      <div className="button-row">
        <button className="primary-button" disabled={isScanning} onClick={onScan}>
          {isScanning ? 'Scanning...' : 'Scan current board'}
        </button>
        <button disabled={isScanning} onClick={onRefresh}>
          Refresh
        </button>
        <button className="danger-button" onClick={onClear}>
          Clear data
        </button>
      </div>
    </section>
  );
}
