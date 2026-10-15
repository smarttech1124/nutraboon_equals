import type { Metadata } from "next";
import { connection } from "next/server";
import {
  AddConfigForm,
  ConfigActions,
  XEELAA_PROVIDER,
  type ProviderOption,
} from "@admin/components/ai/forms";
import { XeelaaRowActions } from "@admin/components/ai/xeelaa";
import { Pagination } from "@admin/components/pagination";
import { NotAllowed, PageHeader } from "@admin/components/shell";
import { adminAccess } from "@admin/lib/access";
import { pageOf, pageParam } from "@admin/lib/pagination";
import { describeXeelaa, type XeelaaView } from "@admin/lib/xeelaa-status";
import { DEFAULT_CLAUDE_MODEL } from "@/lib/ai/claude";
import { DEFAULT_GEMINI_MODEL } from "@/lib/ai/gemini";
import { PROVIDER_KINDS, PROVIDERS } from "@/lib/ai/settings/providers";
import { getAISettings, getXeelaa } from "@/lib/ai/settings/runtime";
import type { XeelaaView as XeelaaState } from "@/lib/xeelaa/service";
import type { AuditEvent, ProviderConfigView } from "@/lib/ai/settings/types";
import { addConfigAction, manageConfigAction, xeelaaManageAction } from "./actions";

export const metadata: Metadata = { title: "AI providers" };

const dateFormat = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Lagos",
});
const formatDate = (d: Date | null) => (d ? dateFormat.format(d) : "—");

const STATUS_LABEL = {
  active: "Active",
  verified: "Inactive",
  failed: "Failed check",
  revoked: "Key deleted",
} as const;

const AUDIT_LABEL: Record<AuditEvent["action"], string> = {
  credential_added: "Key added",
  verification_succeeded: "Check passed",
  verification_failed: "Check failed",
  activated: "Activated",
  deactivated: "Deactivated",
  revoked: "Key deleted",
  model_changed: "Model changed",
};

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-8">{children}</div>;
}

/**
 * AI provider credentials and the XEELAA integration (ADR-047, ADR-052),
 * "ai.manage" only. XEELAA is added and listed like any other provider (ADR-080).
 */
export default async function AISettingsPage({ searchParams }: PageProps<"/ai">) {
  // Decided per request: env settings must never be baked in at build time.
  await connection();
  const access = await adminAccess("ai.manage");
  if (!access.ok) return <NotAllowed />;
  const params = await searchParams;

  const settings = getAISettings();
  let configs: ProviderConfigView[] = [];
  let audit: AuditEvent[] = [];
  let xeelaa: XeelaaState = { configured: false, enabled: false, active: false };
  let loadError = false;
  const xeelaaService = getXeelaa();
  if (settings.ok && xeelaaService.ok) {
    try {
      [configs, audit, xeelaa] = await Promise.all([
        settings.service.list(),
        settings.service.listAudit(200),
        xeelaaService.service.view(),
      ]);
    } catch {
      loadError = true;
    }
  }
  const active = configs.find((c) => c.isActive);
  // Dates are formatted here: the panel is a client component.
  const xeelaaRow: XeelaaView = {
    configured: xeelaa.configured,
    enabled: xeelaa.enabled,
    active: xeelaa.active,
    ...(xeelaa.keyHint ? { keyHint: xeelaa.keyHint } : {}),
    ...(xeelaa.status ? { status: xeelaa.status } : {}),
    ...(xeelaa.lastCheckedAt ? { lastChecked: formatDate(xeelaa.lastCheckedAt) } : {}),
    ...(xeelaa.lastError ? { lastError: xeelaa.lastError } : {}),
  };
  const providers: ProviderOption[] = [
    ...PROVIDER_KINDS.map((kind) => ({
      value: kind,
      label: PROVIDERS[kind].label,
      modelSuggestions: PROVIDERS[kind].modelSuggestions,
      keyFormatHint: PROVIDERS[kind].keyFormatHint,
    })),
    {
      value: XEELAA_PROVIDER,
      label: "XEELAA API",
      modelSuggestions: [],
      keyFormatHint: "a XEELAA key, xla_<key id>:<secret>. XEELAA has no model to choose",
    },
  ];
  const xeelaaStatus = describeXeelaa(xeelaaRow);
  const [configPage, configPaging] = pageOf(configs, pageParam(params.page));
  const [auditPage, auditPaging] = pageOf(audit, pageParam(params.activity));
  const query = {
    page: configPaging.page > 1 ? String(configPaging.page) : undefined,
    activity: auditPaging.page > 1 ? String(auditPaging.page) : undefined,
  };
  const envProvider = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();
  const envModel =
    envProvider === "mock"
      ? "Demo mode (mock provider, no AI)"
      : envProvider === "claude"
        ? `Anthropic Claude ${process.env.CLAUDE_MODEL || DEFAULT_CLAUDE_MODEL}`
        : `Google Gemini ${process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL}`;

  return (
    <Shell>
      <PageHeader
        title="AI providers"
        description="Choose which AI key and model the chat assistant uses. XEELAA is added like any other provider."
      />

      {!settings.ok && (
        <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-danger">
          Saved keys need {settings.missing.join(" and ")} on the server. Until then chat uses the
          environment settings ({envModel}).
        </p>
      )}
      {loadError && (
        <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-danger">
          Could not load the saved configurations. Check the database and reload.
        </p>
      )}

      {settings.ok && !loadError && (
        <>
          <section
            aria-labelledby="in-use"
            className="rounded-2xl border border-line bg-surface p-5"
          >
            <h2 id="in-use" className="text-lg font-semibold">
              In use now
            </h2>
            {/* A live region, so a switch is announced; row messages reset when their row changes. */}
            <p role="status" className="mt-1">
              {xeelaa.active ? "XEELAA API first, falling back to: " : ""}
              {active
                ? `${PROVIDERS[active.provider].label} · ${active.model} · ${active.keyHint}${active.label ? ` (${active.label})` : ""}`
                : `Environment settings: ${envModel}`}
            </p>
            <p className="mt-1 text-sm text-muted">
              Other server instances pick up a change within 30 seconds. Safety checks apply to
              every provider, but test a new provider with the safety prompts before relying on it.
            </p>
          </section>

          <section aria-labelledby="saved" className="flex flex-col gap-3">
            <h2 id="saved" className="text-lg font-semibold">
              Saved configurations
            </h2>
            {configs.length === 0 && !xeelaa.configured ? (
              <p className="text-muted">No keys saved yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
                <table className="w-full min-w-[56rem] text-left text-sm">
                  <thead className="border-b border-line text-muted">
                    <tr>
                      {[
                        "Name",
                        "Provider",
                        "Model",
                        "Key",
                        "Status",
                        "Last checked",
                        "Activated / deactivated",
                        "Added",
                        "Actions",
                      ].map((h) => (
                        <th key={h} scope="col" className="px-3 py-2 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {xeelaa.configured && configPaging.page === 1 && (
                      <tr className="border-b border-line align-top">
                        <th scope="row" className="px-3 py-3 font-medium">
                          XEELAA API
                        </th>
                        <td className="px-3 py-3">XEELAA</td>
                        <td className="px-3 py-3 text-muted">Chosen by XEELAA</td>
                        <td className="px-3 py-3 font-mono text-xs whitespace-nowrap">
                          {xeelaaRow.keyHint ?? "—"}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              xeelaaStatus.tone === "on"
                                ? "bg-brand text-white"
                                : xeelaaStatus.tone === "warn"
                                  ? "bg-danger-soft text-danger"
                                  : "bg-subtle text-ink"
                            }`}
                          >
                            {xeelaaStatus.label}
                          </span>
                          <p className="mt-1 max-w-[14rem] text-xs text-muted">
                            {xeelaaStatus.text}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          {xeelaaRow.lastChecked ?? "—"}
                          {xeelaaRow.lastError && (
                            <p className="text-xs text-muted">{xeelaaRow.lastError}</p>
                          )}
                        </td>
                        <td className="px-3 py-3 text-muted">—</td>
                        <td className="px-3 py-3 text-muted">—</td>
                        <td className="px-3 py-3">
                          <XeelaaRowActions
                            key={`${xeelaa.enabled}:${xeelaa.status}`}
                            view={xeelaaRow}
                            action={xeelaaManageAction}
                          />
                        </td>
                      </tr>
                    )}
                    {configPage.map((c) => {
                      const name = c.label || `${PROVIDERS[c.provider].label} ${c.model}`;
                      const status = c.isActive ? "active" : c.status;
                      return (
                        <tr key={c.id} className="border-b border-line align-top last:border-0">
                          <th scope="row" className="px-3 py-3 font-medium">
                            {c.label || "—"}
                          </th>
                          <td className="px-3 py-3">{PROVIDERS[c.provider].label}</td>
                          <td className="px-3 py-3 font-mono text-xs whitespace-nowrap">
                            {c.model}
                          </td>
                          <td className="px-3 py-3 font-mono text-xs whitespace-nowrap">
                            {c.keyHint}
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                status === "active"
                                  ? "bg-brand text-white"
                                  : status === "verified"
                                    ? "bg-subtle text-ink"
                                    : "bg-danger-soft text-danger"
                              }`}
                            >
                              {STATUS_LABEL[status]}
                            </span>
                          </td>
                          <td className="px-3 py-3">{formatDate(c.verifiedAt)}</td>
                          <td className="px-3 py-3">
                            {formatDate(c.activatedAt)} / {formatDate(c.deactivatedAt)}
                          </td>
                          <td className="px-3 py-3">{formatDate(c.createdAt)}</td>
                          <td className="px-3 py-3">
                            <ConfigActions
                              key={`${c.status}:${c.isActive}:${c.model}`}
                              action={manageConfigAction}
                              config={{
                                id: c.id,
                                name,
                                status: c.status,
                                isActive: c.isActive,
                                model: c.model,
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination
              path="/ai"
              query={{ activity: query.activity }}
              paging={configPaging}
              label="Saved configuration pages"
            />
          </section>

          <section
            aria-labelledby="add"
            className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5"
          >
            <h2 id="add" className="text-lg font-semibold">
              Add an API key
            </h2>
            <AddConfigForm action={addConfigAction} providers={providers} />
          </section>

          <section aria-labelledby="audit" className="flex flex-col gap-3">
            <h2 id="audit" className="text-lg font-semibold">
              Recent activity
            </h2>
            {audit.length === 0 ? (
              <p className="text-muted">No activity yet.</p>
            ) : (
              <ul className="divide-y divide-line rounded-2xl border border-line bg-surface text-sm">
                {auditPage.map((e) => (
                  <li key={e.id} className="flex flex-wrap gap-x-3 gap-y-1 px-4 py-2">
                    <span className="text-muted">{formatDate(e.createdAt)}</span>
                    <span className="font-medium">{AUDIT_LABEL[e.action]}</span>
                    <span>
                      {e.provider === "xeelaa" ? "XEELAA" : PROVIDERS[e.provider].label} · {e.model}{" "}
                      · {e.keyHint}
                    </span>
                    {e.detail && <span className="text-muted">({e.detail})</span>}
                  </li>
                ))}
              </ul>
            )}
            <Pagination
              path="/ai"
              query={{ page: query.page }}
              paging={auditPaging}
              param="activity"
              label="Activity pages"
            />
          </section>
        </>
      )}
    </Shell>
  );
}
