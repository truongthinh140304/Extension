import { BoardAutomationPanel } from './components/BoardAutomationPanel';
import { Header } from './components/Header';

export default function App() {
  return (
    <main className="app-shell">
      <Header />
      <BoardAutomationPanel />
    </main>
  );
}
