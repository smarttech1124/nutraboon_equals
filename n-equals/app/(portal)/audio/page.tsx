import type { Metadata } from "next";
import { NotAllowed, PageHeader } from "@admin/components/shell";
import { adminAccess } from "@admin/lib/access";
import { ActionForm } from "@/components/ui/action-form";
import { Badge, Card } from "@/components/ui";
import { getEntitlementService } from "@/lib/billing";
import { SPEECH_TO_TEXT_PROVIDERS, TEXT_TO_SPEECH_PROVIDERS } from "@/lib/billing/settings";
import { describeSpeechSetup } from "@/lib/speech";
import { speechKeyFor } from "@/lib/speech/runtime";
import { saveAudioAction } from "./actions";

export const metadata: Metadata = { title: "Audio" };

/**
 * Speech providers for the chat and the hospital accessibility service
 * (ADR-069). Today speech runs in the user's browser; N-ATLaS is listed so it
 * can be switched on once a self-hosted deployment exists. WhatsApp voice
 * notes need server speech providers (ADR-090), set in the environment.
 */
export default async function AudioPage() {
  const access = await adminAccess("audio.manage");
  if (!access.ok) return <NotAllowed />;
  const current = await getEntitlementService().audioSettings();
  const server = await describeSpeechSetup(speechKeyFor);

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
      <Card
        title="WhatsApp voice notes and spoken replies"
        description="Server speech providers (ADR-090), set with SPEECH_TO_TEXT_PROVIDERS and TEXT_TO_SPEECH_PROVIDER. Keys are the AI keys the app already has: the environment variable, or the active key above when it is for the same provider. Recordings are never stored."
      >
        <ul className="flex flex-col gap-3 text-sm text-ink">
          {server.map((p) => (
            <li key={p.name} className="flex flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{p.label}</span>
                {p.speechToTextPosition !== null && (
                  <Badge tone={p.hasKey ? "success" : undefined}>
                    Speech to text, choice {p.speechToTextPosition}
                  </Badge>
                )}
                {p.usedForSpeech && (
                  <Badge tone={p.hasKey ? "success" : undefined}>Spoken replies</Badge>
                )}
                {!p.speechToText && !p.textToSpeech && <Badge>No audio support</Badge>}
                {(p.speechToTextPosition !== null || p.usedForSpeech) && !p.hasKey && (
                  <Badge>No key</Badge>
                )}
              </span>
              <span className="text-muted">{p.note}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
