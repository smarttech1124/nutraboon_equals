import type { Metadata } from "next";
import { NotAllowed, PageHeader } from "@admin/components/shell";
import { adminAccess } from "@admin/lib/access";
import { ActionForm } from "@/components/ui/action-form";
import { Badge, Card } from "@/components/ui";
import { getEntitlementService } from "@/lib/billing";
import { SPEECH_TO_TEXT_PROVIDERS, TEXT_TO_SPEECH_PROVIDERS } from "@/lib/billing/settings";
import { saveAudioAction } from "./actions";

export const metadata: Metadata = { title: "Audio" };

/**
 * Speech providers for the chat and the hospital accessibility service
 * (ADR-069). Today speech runs in the user's browser; N-ATLaS is listed so it
 * can be switched on once a self-hosted deployment exists.
 */
export default async function AudioPage() {
  const access = await adminAccess("audio.manage");
  if (!access.ok) return <NotAllowed />;
  const current = await getEntitlementService().audioSettings();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Audio"
        description="Which service turns speech into text, and text into speech."
      />
      <Card
        title="Speech to text"
        description="The user's browser does the recognition (in Chrome and Edge, its vendor's speech service); the audio never reaches our server."
      >
        <ActionForm action={saveAudioAction} submitLabel="Save">
          <fieldset className="flex flex-col gap-3">
            <legend className="sr-only">Speech-to-text provider</legend>
            {Object.entries(SPEECH_TO_TEXT_PROVIDERS).map(([key, p]) => (
              <label key={key} className="flex items-start gap-2 text-sm text-ink">
                <input
                  type="radio"
                  name="speechToText"
                  value={key}
                  defaultChecked={current.speechToText === key}
                  disabled={!p.available}
                  className="mt-1"
                />
                <span>
                  {p.label} {p.available ? null : <Badge>Not available yet</Badge>}
                  {key === "n-atlas" && (
                    <span className="block text-muted">
                      Nigerian-English, Yoruba, Hausa and Igbo speech. Needs a self-hosted model
                      server; not set up.
                    </span>
                  )}
                </span>
              </label>
            ))}
          </fieldset>
        </ActionForm>
      </Card>
      <Card title="Text to speech">
        <ul className="flex flex-col gap-2 text-sm text-ink">
          {Object.entries(TEXT_TO_SPEECH_PROVIDERS).map(([key, p]) => (
            <li key={key} className="flex items-center gap-2">
              {p.label} <Badge tone="success">In use</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
