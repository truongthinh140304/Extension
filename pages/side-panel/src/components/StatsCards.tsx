import type { MondayBoardScanResult } from '@extension/shared';

type StatsCardsProps = {
  scan: MondayBoardScanResult | null;
};

export function StatsCards({ scan }: StatsCardsProps) {
  const counts = new Map<string, number>();

  for (const item of scan?.items ?? []) {
    counts.set(item.status || 'No status', (counts.get(item.status || 'No status') ?? 0) + 1);
  }

  const withStatus = scan?.items.filter(item => item.status).length ?? 0;
  const withoutStatus = (scan?.items.length ?? 0) - withStatus;

  return (
    <section className="stats-grid">
      <article className="stat-card">
        <span>Total items</span>
        <strong>{scan?.items.length ?? 0}</strong>
      </article>
      <article className="stat-card">
        <span>With status</span>
        <strong>{withStatus}</strong>
      </article>
      <article className="stat-card">
        <span>No status</span>
        <strong>{withoutStatus}</strong>
      </article>
      <article className="stat-card wide">
        <span>Status breakdown</span>
        <div className="status-list">
          {[...counts.entries()].map(([status, count]) => (
            <p key={status}>
              <span>{status}</span>
              <strong>{count}</strong>
            </p>
          ))}
          {counts.size === 0 ? <p>No scanned status data.</p> : null}
        </div>
      </article>
    </section>
  );
}
