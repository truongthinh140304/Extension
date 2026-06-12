import { useEffect, useState } from 'react';
import type { MondayBoardScanResult } from '@extension/shared';
import { Header } from './components/Header';
import { ScanPanel } from './components/ScanPanel';
import { StatsCards } from './components/StatsCards';
import { scanCurrentTab } from './services/scanCurrentTab';
import { clearLastScanResult, getLastScanResult, saveLastScanResult } from './services/storage';

export default function App() {
  const [scan, setScan] = useState<MondayBoardScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void getLastScanResult().then(setScan);
  }, []);

  const runScan = async () => {
    setIsScanning(true);
    setError(undefined);

    const result = await scanCurrentTab();

    if (result.response.ok) {
      setScan(result.response.data);
      await saveLastScanResult(result.response.data);
    } else {
      setError(result.response.error);
    }

    setIsScanning(false);
  };

  const clearData = async () => {
    setScan(null);
    setError(undefined);
    await clearLastScanResult();
  };

  return (
    <main className="app-shell">
      <Header />
      <ScanPanel boardName={scan?.boardName} scannedAt={scan?.scannedAt} error={error} isScanning={isScanning} onScan={runScan} onRefresh={runScan} onClear={clearData} />
      <StatsCards scan={scan} />
    </main>
  );
}
