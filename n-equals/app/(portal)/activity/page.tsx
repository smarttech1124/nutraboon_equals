import type { Metadata } from "next";
import { Stat } from "@admin/components/analytics";
import { Pagination } from "@admin/components/pagination";
import { NotAllowed, PageHeader } from "@admin/components/shell";
import {
  ACTIVITY_SORTS,
  ACTIVITY_WINDOWS,
  activitySummary,
  countActivity,
  listActivity,
  parseActivityFilters,
  SORT_LABEL,
  WINDOW_LABEL,
  type ActivityFilters,
} from "@admin/lib/activity";
import { adminAccess } from "@admin/lib/access";
import { pageParam, paging } from "@admin/lib/pagination";
import { Badge, Card, EmptyState } from "@/components/ui";
import { getPrisma } from "@/lib/db";

export const metadata: Metadata = { title: "User activity" };

const dateFormat = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Lagos",
});
const dayFormat = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeZone: "Africa/Lagos",
});

/** The column each sort orders, for aria-sort. */
const SORTED_COLUMN: Record<ActivityFilters["sort"], string> = {
  last_active: "Last active",
  joined: "Joined",
  chats: "Saved chats",
  plans: "Meal plans",
  name: "Account",
};

const SELECT =
  "min-h-10 w-full rounded-lg border border-line bg-surface px-2 text-sm text-ink sm:w-auto";

function Select({
  id,
  label,
  value,
  options,
}: {
  id: keyof ActivityFilters;
  label: string;
  value: string;
  options: [string, string][];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`f-${id}`} className="text-xs font-medium text-muted">
        {label}
      </label>
      <select id={`f-${id}`} name={id} defaultValue={value} className={SELECT}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * How people use the platform (ADR-091): one row per account with counts and
 * dates, filterable and sortable. Needs "users.activity". No message text,
 * plan contents or health details are read for this page.
 */
export default async function ActivityPage({ searchParams }: PageProps<"/activity">) {
  const access = await adminAccess("users.activity");
  if (!access.ok) return <NotAllowed />;
  const params = await searchParams;
  const filters = parseActivityFilters(params);

  const prisma = getPrisma();
  const [summary, total] = await Promise.all([
    activitySummary(prisma, filters),
    countActivity(prisma, filters),
  ]);
  const p = paging(pageParam(params.page), total);
  const rows = await listActivity(prisma, filters, p);
  const query: Record<string, string> = {
    q: filters.q,
    status: filters.status,
    activity: filters.activity,
    kind: filters.kind,
    sort: filters.sort,
    dir: filters.dir,
  };
  const who = filters.kind === "admins" ? "administrators" : "accounts";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="User activity"
        description="How accounts use Nutraboom Equals. Counts and dates only: what people wrote is never shown here."
      />

      <section aria-label="Activity summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat title={`All ${who}`} value={summary.accounts} />
        <Stat title="Active in 24 hours" value={summary.active1d} />
        <Stat title="Active in 7 days" value={summary.active7d} />
        <Stat title="Active in 30 days" value={summary.active30d} />
        <Stat title="No activity recorded" value={summary.never} />
      </section>

      <form role="search" aria-label="Filter accounts" className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <label htmlFor="f-q" className="text-xs font-medium text-muted">
            Name or email
          </label>
          <input
            id="f-q"
            name="q"
            type="search"
            defaultValue={filters.q}
            className="min-h-10 w-full rounded-lg border border-line bg-surface px-3 text-ink"
          />
        </div>
        <Select
          id="kind"
          label="Accounts"
          value={filters.kind}
          options={[
            ["users", "Platform users"],
            ["admins", "Administrators"],
            ["all", "Everyone"],
          ]}
        />
        <Select
          id="status"
          label="Status"
          value={filters.status}
          options={[
            ["all", "Any status"],
            ["active", "Active"],
            ["suspended", "Suspended"],
          ]}
        />
        <Select
          id="activity"
          label="Activity"
          value={filters.activity}
          options={ACTIVITY_WINDOWS.map((w) => [w, WINDOW_LABEL[w]])}
        />
        <Select
          id="sort"
          label="Sort by"
          value={filters.sort}
          options={ACTIVITY_SORTS.map((s) => [s, SORT_LABEL[s]])}
        />
        <Select
          id="dir"
          label="Order"
          value={filters.dir}
          options={[
            ["desc", "Highest or newest first"],
            ["asc", "Lowest or oldest first"],
          ]}
        />
        <button
          type="submit"
          className="min-h-10 rounded-lg border border-line px-4 text-sm font-semibold text-ink hover:bg-subtle"
        >
          Apply
        </button>
      </form>

      <Card
        title={`${p.total} matching ${p.total === 1 ? "account" : "accounts"}`}
        description="Last active is the latest sign-in, saved chat, Meal Planner use, booking or hospital message. Chats that were not saved to an account are not counted."
      >
        {rows.length === 0 ? (
          <EmptyState title="No accounts match these filters" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[60rem] text-left text-sm">
              <caption className="sr-only">
                Accounts with their activity, sorted by {SORT_LABEL[filters.sort].toLowerCase()}
              </caption>
              <thead className="border-b border-line text-muted">
                <tr>
                  {[
                    "Account",
                    "Status",
                    "Plan",
                    "Joined",
                    "Last active",
                    "Saved chats",
                    "Meal plans",
                    "Bookings",
                    "Hospital messages",
                  ].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      aria-sort={
                        h === SORTED_COLUMN[filters.sort]
                          ? filters.dir === "asc"
                            ? "ascending"
                            : "descending"
                          : undefined
                      }
                      className="px-3 py-2 font-medium"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} className="border-b border-line align-top last:border-0">
                    <th scope="row" className="px-3 py-3 font-normal">
                      <span className="block font-medium text-ink">
                        {u.name}
                        {u.isAdmin && (
                          <span className="ml-2">
                            <Badge>Admin</Badge>
                          </span>
                        )}
                      </span>
                      <span className="block break-all text-muted">{u.email}</span>
                      {!u.emailVerifiedAt && <Badge>Unconfirmed</Badge>}
                    </th>
                    <td className="px-3 py-3">
                      <Badge tone={u.status === "active" ? "success" : "error"}>
                        {u.status === "active" ? "Active" : "Suspended"}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      {u.plan ?? <span className="text-muted">Free</span>}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-muted">
                      {dayFormat.format(u.createdAt)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {u.lastActive ? (
                        dateFormat.format(u.lastActive)
                      ) : (
                        <span className="text-muted">Never</span>
                      )}
                    </td>
                    <td className="px-3 py-3 tabular-nums">{u.chats}</td>
                    <td className="px-3 py-3 tabular-nums">{u.mealPlans}</td>
                    <td className="px-3 py-3 tabular-nums">{u.bookings}</td>
                    <td className="px-3 py-3 tabular-nums">{u.hospitalChats}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Pagination path="/activity" query={query} paging={p} />
    </div>
  );
}
