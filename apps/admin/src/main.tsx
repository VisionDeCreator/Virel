import { creditEventLabel } from "@virel/shared";
import { Component, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BackendProvider, ConvexReactClient } from "@virel/api-client/provider";
import {
  api,
  useAuthActions,
  useEmailSignIn,
  useConvexAuth,
  useQuery,
  useMutation,
  usePaginatedQuery,
  type Id,
} from "@virel/api-client";
import "@virel/design-tokens/styles.css";
import "./styles.css";

function message(
  error: unknown,
  fallback = "The request failed. Check your connection and try again.",
) {
  if (
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    typeof error.data === "string"
  )
    return error.data;
  return fallback;
}
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: unknown }
> {
  state: { error: unknown } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <section role="alert">
          <h2>Unable to load administration</h2>
          <p>{message(this.state.error)}</p>
          <button onClick={() => location.reload()}>Reload</button>
        </section>
      );
    return this.props.children;
  }
}
function Login() {
  const login = useEmailSignIn();
  return (
    <section>
      <h2>Administrator sign in</h2>
      <p>Use the email associated with your administrator account.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void (login.challenge ? login.verify() : login.request());
        }}
      >
        <label>
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={login.email}
            readOnly={!!login.challenge}
            onChange={(event) => login.setEmail(event.target.value)}
          />
        </label>
        {login.challenge && (
          <>
            <p>
              Enter the six-digit code sent to your email. It expires in 10
              minutes.
            </p>
            <label>
              Verification code
              <input
                required
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={login.code}
                onChange={(event) =>
                  login.setCode(event.target.value.replace(/\D/g, ""))
                }
              />
            </label>
          </>
        )}
        {login.expired && (
          <p role="alert">This code has expired. Request a new code.</p>
        )}
        <button
          disabled={
            login.busy ||
            (login.challenge
              ? login.expired || login.code.length !== 6
              : login.wait > 0)
          }
        >
          {login.busy
            ? "Please wait…"
            : login.challenge
              ? "Verify & sign in"
              : login.wait
                ? `Try again in ${login.wait}s`
                : "Send sign-in code"}
        </button>
      </form>
      {login.challenge && (
        <>
          <button
            disabled={login.busy || login.wait > 0}
            onClick={() => void login.request()}
          >
            {login.wait ? `Resend in ${login.wait}s` : "Resend code"}
          </button>
          <button disabled={login.busy} onClick={login.changeEmail}>
            Use another email
          </button>
        </>
      )}
      {login.error && <p role="alert">{login.error}</p>}
    </section>
  );
}
function History({ userId }: { userId: Id<"users"> }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.admin.creditHistory,
    { userId },
    { initialNumItems: 20 },
  );
  return (
    <section>
      <h3>Credit history</h3>
      {results.map((row) => (
        <article key={row._id}>
          <strong>
            {creditEventLabel(row.kind)}:{" "}
            {Math.abs(row.amount).toLocaleString()}
          </strong>
          <p>
            {row.note} · {new Date(row._creationTime).toLocaleString()}
          </p>
        </article>
      ))}
      {!results.length && <p>No transactions yet.</p>}
      {status !== "Exhausted" && (
        <button
          disabled={status !== "CanLoadMore"}
          onClick={() => loadMore(20)}
        >
          Load more transactions
        </button>
      )}
    </section>
  );
}
function Users() {
  const [email, setEmail] = useState("");
  const [search, setSearch] = useState("");
  const user = useQuery(
    api.admin.lookupUser,
    search ? { email: search } : "skip",
  );
  return (
    <>
      <section>
        <h2>Find a user</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(email.trim().toLowerCase());
          }}
        >
          <label>
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button>Search</button>
        </form>
      </section>
      {search && user === undefined && <p role="status">Searching…</p>}
      {search && user === null && (
        <p role="status">No existing account has this email.</p>
      )}
      {user && <UserDetail key={user.userId} user={user} />}
    </>
  );
}
type User = NonNullable<
  ReturnType<typeof useQuery<typeof api.admin.lookupUser>>
>;
function UserDetail({ user }: { user: User }) {
  const grant = useMutation(api.admin.grantCredits);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<{
    amount: number;
    reason: string;
    requestId: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function submit() {
    if (!pending) return;
    setBusy(true);
    setError("");
    try {
      const result = await grant({
        ...pending,
        userId: user.userId,
        email: user.email,
      });
      setSuccess(
        `${result.duplicate ? "This grant was already recorded." : "Credits granted."} Balance after this grant: ${result.balance.toLocaleString()}.`,
      );
      setPending(null);
      setAmount("");
      setReason("");
    } catch (err) {
      setError(
        message(
          err,
          "The request failed. Retry the same grant to safely check whether it was applied.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section>
        <h2>{user.name || user.email}</h2>
        <p>
          {user.email} {user.username && `· @${user.username}`}
        </p>
        <p className="balance">
          {user.available.toLocaleString()} available{" "}
          <span>· {user.reserved.toLocaleString()} reserved</span>
        </p>
        {!pending ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSuccess("");
              setError("");
              setPending({
                amount: Number(amount),
                reason: reason.trim(),
                requestId: crypto.randomUUID(),
              });
            }}
          >
            <label>
              Promotional credits
              <input
                type="number"
                min="1"
                max="1000000"
                step="1"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label>
              Reason
              <textarea
                minLength={3}
                maxLength={500}
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button>Review grant</button>
          </form>
        ) : (
          <div>
            <h3>Review credit grant</h3>
            <p>
              Recipient: <strong>{user.email}</strong>
            </p>
            <p>
              Increase:{" "}
              <strong>
                {pending.amount.toLocaleString()} promotional credits
              </strong>
            </p>
            <p>
              Current balance: {user.available.toLocaleString()}. Estimated
              balance: {(user.available + pending.amount).toLocaleString()}.
            </p>
            <p>The balance may change while generations run.</p>
            <p>Reason: {pending.reason}</p>
            <button disabled={busy} onClick={() => void submit()}>
              {busy
                ? "Submitting…"
                : error
                  ? "Retry same grant"
                  : "Confirm grant"}
            </button>
            <button disabled={busy} onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        {success && <p role="status">{success}</p>}
      </section>
      <History key={user.userId} userId={user.userId} />
      <section>
        <h3>Recent generations</h3>
        {user.jobs.map((job) => (
          <article key={job.id}>
            {job.status} · {job.credits} credits · {job.financialState}
            <p>
              Supplier estimate maximum: $
              {(job.supplierMaximumUsdMicros / 1000000).toFixed(4)} · Actual:{" "}
              {job.supplierActualUsdMicros === undefined
                ? "pending"
                : `$${(job.supplierActualUsdMicros / 1000000).toFixed(4)}`}
            </p>
            <p>
              Pricing: {job.pricing?.pricingVersion ?? "legacy"} · Provider job:{" "}
              {job.providerJobId ?? "not submitted"}
            </p>
            <p>{new Date(job.createdAt).toLocaleString()}</p>
          </article>
        ))}
        {!user.jobs.length && <p>No generations yet.</p>}
      </section>
    </>
  );
}
function Audit() {
  const [filters, setFilters] = useState<{
    actorEmail?: string;
    targetEmail?: string;
    action?: "credits.grant" | "admin.promote";
    from?: number;
    to?: number;
  }>({});
  const { results, status, loadMore } = usePaginatedQuery(
    api.admin.audit,
    filters,
    { initialNumItems: 20 },
  );
  return (
    <section>
      <h2>Audit history</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setFilters({
            actorEmail: String(data.get("actor") || "").trim() || undefined,
            targetEmail: String(data.get("target") || "").trim() || undefined,
            action: (String(data.get("action") || "") || undefined) as
              "credits.grant" | "admin.promote" | undefined,
            from: data.get("from")
              ? new Date(`${String(data.get("from"))}T00:00:00`).getTime()
              : undefined,
            to: data.get("to")
              ? new Date(`${String(data.get("to"))}T23:59:59.999`).getTime()
              : undefined,
          });
        }}
      >
        <label>
          Administrator email
          <input name="actor" />
        </label>
        <label>
          Recipient email
          <input name="target" type="email" />
        </label>
        <label>
          Action
          <select name="action">
            <option value="">All actions</option>
            <option value="credits.grant">Credit grants</option>
            <option value="admin.promote">Admin promotions</option>
          </select>
        </label>
        <label>
          From
          <input name="from" type="date" />
        </label>
        <label>
          Through
          <input name="to" type="date" />
        </label>
        <button>Filter</button>
      </form>
      {results.map((row) => (
        <article key={row._id}>
          <strong>
            {row.action}{" "}
            {row.amount !== undefined && `· +${row.amount.toLocaleString()}`}
          </strong>
          <p>
            {row.targetEmail} · by {row.actorEmail}
          </p>
          <p>{row.reason}</p>
          {row.before !== undefined && (
            <p>
              {row.before} → {row.after} credits
            </p>
          )}
          <small>{new Date(row._creationTime).toLocaleString()}</small>
        </article>
      ))}
      {!results.length && <p>No matching audit entries.</p>}
      {status !== "Exhausted" && (
        <button
          disabled={status !== "CanLoadMore"}
          onClick={() => loadMore(20)}
        >
          Load more audit entries
        </button>
      )}
    </section>
  );
}
function Authorized() {
  const me = useQuery(api.admin.me);
  const { signOut } = useAuthActions();
  const [tab, setTab] = useState("users");
  const [error, setError] = useState("");
  if (me === undefined) return <p>Checking access…</p>;
  return (
    <>
      <div className="toolbar">
        <p>
          {me
            ? `${me.email} · ${me.role}`
            : "This account does not have verified administrator access."}
        </p>
        <button
          onClick={() =>
            void signOut().catch(() =>
              setError("Unable to sign out. Try again."),
            )
          }
        >
          Sign out
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {me && (
        <>
          <nav>
            <button
              aria-pressed={tab === "users"}
              onClick={() => setTab("users")}
            >
              Users & credits
            </button>
            <button
              aria-pressed={tab === "audit"}
              onClick={() => setTab("audit")}
            >
              Audit history
            </button>
          </nav>
          {tab === "users" ? <Users /> : <Audit />}
        </>
      )}
    </>
  );
}
function App() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  return isLoading ? (
    <p>Checking session…</p>
  ) : isAuthenticated ? (
    <Authorized />
  ) : (
    <Login />
  );
}
const url = import.meta.env.VITE_CONVEX_URL;
const client = url ? new ConvexReactClient(url) : null;
createRoot(document.getElementById("root")!).render(
  <main>
    <header>
      <span className="eyebrow">VIREL / OPERATIONS</span>
      <h1>Administration</h1>
    </header>
    <ErrorBoundary>
      {client ? (
        <BackendProvider client={client} apiUrl={import.meta.env.VITE_API_URL}>
          <App />
        </BackendProvider>
      ) : (
        <section>
          <h2>Connect the admin backend</h2>
          <p>
            Set VITE_CONVEX_URL in apps/admin/.env.local and restart the admin
            app.
          </p>
        </section>
      )}
    </ErrorBoundary>
  </main>,
);
