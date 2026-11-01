import { Eye, EyeOff } from "lucide-react";
import { useRewards } from "@virel/api-client";
import { formatRewardUsd } from "@virel/shared";
import { Panel, Button, Notice } from "@virel/ui";
export function Rewards() {
  const rewards = useRewards();
  const { balance, history, busy, error } = rewards;
  if (balance === undefined) return <Notice>Loading your rewards…</Notice>;
  if (!balance) return null;
  const amount = (value: number | null) =>
    balance.hidden || value === null ? "••••" : formatRewardUsd(value);
  return (
    <Panel className="rewards-panel">
      <div className="rewards-heading">
        <div>
          <span className="eyebrow">ONLY VISIBLE TO YOU</span>
          <h2>Your rewards</h2>
        </div>
        <button
          className="rewards-visibility"
          aria-label={
            balance.hidden ? "Show reward balance" : "Hide reward balance"
          }
          aria-pressed={balance.hidden}
          disabled={busy}
          onClick={() => void rewards.toggleHidden()}
        >
          {balance.hidden ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>
      <dl className="rewards-balances">
        <div>
          <dt>Pending</dt>
          <dd>{amount(balance.pendingUsdMicros)}</dd>
        </div>
        <div>
          <dt>Available</dt>
          <dd>{amount(balance.availableUsdMicros)}</dd>
        </div>
        <div>
          <dt>Total rewards</dt>
          <dd>{amount(balance.earnedUsdMicros)}</dd>
        </div>
      </dl>
      <p>
        {balance.syncing
          ? "Syncing your existing rewards…"
          : "Remix rewards are held pending review. Earnings are separate from your generation credits."}
      </p>
      <Button disabled>Withdrawals coming later</Button>
      <h3>Reward activity</h3>
      {history.status === "LoadingFirstPage" ? (
        <p role="status">Loading reward activity…</p>
      ) : !history.results.length ? (
        <p>
          When eligible creators remix your videos, your rewards will appear
          here.
        </p>
      ) : (
        <ul className="reward-history">
          {history.results.map((e) => (
            <li key={e._id}>
              <div>
                <span>
                  {e.kind === "award"
                    ? "Remix reward · Pending"
                    : e.kind === "release"
                      ? "Reward released"
                      : "Reward reversed"}
                </span>
                <time dateTime={new Date(e.createdAt).toISOString()}>
                  {new Date(e.createdAt).toLocaleDateString()}
                </time>
              </div>
              <strong>{amount(e.usdMicros)}</strong>
            </li>
          ))}
        </ul>
      )}
      {history.status === "CanLoadMore" && (
        <Button onClick={() => history.loadMore(10)}>
          More reward activity
        </Button>
      )}
      {history.status === "LoadingMore" && (
        <p role="status">Loading more reward activity…</p>
      )}
      {error && (
        <Notice error>
          {error}
          <Button disabled={busy} onClick={() => void rewards.retry()}>
            Retry
          </Button>
        </Notice>
      )}
    </Panel>
  );
}
