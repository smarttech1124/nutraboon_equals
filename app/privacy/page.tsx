import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { SiteFrame } from "@/components/site/site-shell";
import { currentAIServices } from "@/lib/privacy/processors";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Nutraboom Equals does with the information you share in the chat.",
};

const LAST_UPDATED = "9 October 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/**
 * User-facing privacy notice (ADR-053). Facts mirror README.md "Privacy
 * and data"; the AI services named are read from the live settings, and the
 * operator's identity and contact come from PRIVACY_CONTROLLER_NAME and
 * PRIVACY_CONTACT_EMAIL. Have it reviewed against the NDPA 2023 before launch.
 */
export default async function PrivacyPage() {
  // Per request: the AI services in use can change from the admin page.
  await connection();
  const services = await currentAIServices();
  const controller = process.env.PRIVACY_CONTROLLER_NAME?.trim();
  const contact = process.env.PRIVACY_CONTACT_EMAIL?.trim();

  return (
    <SiteFrame>
      <div className="mx-auto w-full max-w-2xl space-y-8 text-ink">
        <div className="space-y-2">
          <Link href="/" className="text-sm text-brand-text underline underline-offset-2">
            ← Back to Nutraboom Equals
          </Link>
          <h1 className="font-display text-4xl font-bold">Privacy</h1>
          <p className="text-muted">Last updated {LAST_UPDATED}</p>
          <p>
            Nutraboom Equals is a nutrition assistant. The chat works without an account. If you
            create one (for the Meal Planner, nutritionist sessions or a paid plan), we keep the
            details below. This page explains what happens to what you type or say.
          </p>
        </div>

        <Section title="What you share">
          <p>
            Your messages can include health details: pregnancy, a child&apos;s age, allergies,
            medical conditions or medicines, as well as your household, budget, the food you have
            and your state or city. Share only what you are comfortable sharing. Everything is
            optional, and the assistant works with less.
          </p>
        </Section>

        <Section title="How long we keep it">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Your conversation and the facts you shared are stored so the assistant remembers them
              (for example, an allergy). They are{" "}
              <strong>deleted 2 hours after your last message</strong>, unless you are signed in and
              the chat is saved to your account (below).
            </li>
            <li>
              To stop abuse, we count requests per connection for about one minute, using a
              scrambled (hashed) form of your internet address, never the address itself.
            </li>
            <li>
              Our server logs record timings and outcomes only, never the text of your messages.
            </li>
          </ul>
        </Section>

        <Section title="If you have an account">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Your name, email and a scrambled (hashed) password, kept until you ask us to delete
              the account.
            </li>
            <li>
              <strong>Continue with Google:</strong> Google tells us your name, email address and an
              account number that identifies you to us. We never receive your Google password and do
              not keep Google&apos;s access tokens.
            </li>
            <li>
              <strong>Saved chats:</strong> while you are signed in, your chats with the assistant
              and the facts you shared in them are saved to your account, up to your plan&apos;s
              limit, so you can come back to them. Each is deleted when you delete it (under
              &quot;Saved chats&quot; in the chat) or after a period without new messages that your
              plan sets (30 days on the free plan).
            </li>
            <li>
              <strong>Meal Planner:</strong> your planning conversation and the facts it records
              (who you plan for, ages, pregnancy, allergies, health conditions, budget) and your
              plans are kept until you delete them. Each conversation and plan has a delete button.
            </li>
            <li>
              <strong>Nutritionist sessions:</strong> when you request a session, the nutritionist
              sees your name, email and the note you chose to write, never your chats or plans.
            </li>
            <li>
              <strong>Nutritionists</strong> who join share their professional details and
              qualification documents. Documents are stored privately with Cloudinary and seen only
              by them and our reviewers.
            </li>
            <li>
              <strong>Sponsored products:</strong> verified vendors pay to have products suggested
              when they match foods in your chat or plan. We count how often each product is shown,
              opened and its shop links used, never who you are; vendors see only those counts.
            </li>
            <li>
              <strong>Hospital appointments:</strong> when you book, the hospital sees your name,
              email, the needs you ticked and your note. Appointments are kept with your account.
            </li>
            <li>
              <strong>Hospital messages:</strong> your conversation is shared with that
              hospital&apos;s staff, and our assistant (the AI service below) reads each message to
              pass it to the right team. Closed conversations are{" "}
              <strong>deleted 90 days after closing</strong>, and you can delete one at any time.
            </li>
            <li>
              <strong>Finding a hospital:</strong> a place you type is looked up with OpenStreetMap
              (the OpenStreetMap Foundation&apos;s Nominatim service), without your name or account.
              If you choose &quot;use my location&quot;, your device&apos;s position is used for
              that search only and is not saved.
            </li>
            <li>
              <strong>Paid plans</strong> are paid through Paystack or Flutterwave; we never see
              your card details.
            </li>
            <li>
              Account emails (sign-in links, notifications) are sent by Resend. They never include
              health details.
            </li>
          </ul>
        </Section>

        <Section title="Who processes your messages">
          <p>
            To write a reply, your messages are sent to{" "}
            {services.length > 0 ? <strong>{list(services)}</strong> : "an AI service"}, under that
            company&apos;s terms for its API.
            {services.length > 1 && " If the first is unavailable, the next one answers."}
          </p>
          <p>
            If you use the microphone, your browser&apos;s own speech service turns your voice into
            text (in Chrome and Edge, the audio is processed by Google or Microsoft). We only
            receive the text you choose to send. Replies are read aloud by your device.
          </p>
          <p>
            If you chat with us on <strong>WhatsApp</strong>, your messages travel through
            Meta&apos;s WhatsApp service and are answered the same way. We keep a coded version of
            your phone number (not the number itself) to continue your conversation, and delivery
            receipts. The conversation is kept for the same limited time as a chat on this website.
            If you send a <strong>voice note or video</strong>, it is turned into text by Google
            (Gemini) or OpenAI and then deleted: we never keep the recording. If you ask for voice
            replies, the reply text is turned into speech by OpenAI. Reply RESET to make us forget
            the conversation, and SIGN OFF (or STOP) to stop messages at any time.
          </p>
          <p>
            Pictures shown with some replies are loaded from Wikimedia Commons, which sees that your
            device requested the picture, as with any website image.
          </p>
        </Section>

        <Section title="Stored on your device">
          <p>
            Your chosen reply language is saved in your browser only, so the chat remembers it. You
            can change it in the chat&apos;s settings, or clear it by clearing this site&apos;s data
            in your browser.
          </p>
          <p>
            The chat you have open is kept in this browser tab only, so reloading the page does not
            lose it. Closing the tab or starting a new chat removes it.
          </p>
        </Section>

        <Section title="Not medical advice">
          <p>
            Nutraboom Equals gives general nutrition information. It does not diagnose, prescribe or
            replace a doctor, midwife, dietitian or pharmacist. In an emergency, go to the nearest
            hospital or call 112.
          </p>
        </Section>

        <Section title="Your rights and contact">
          <p>
            Under the Nigeria Data Protection Act 2023 you can ask what information is held about
            you, and ask for it to be corrected or deleted. Chat conversations without an account
            are deleted after 2 hours, so we usually cannot link a request to one; closing the chat
            and waiting 2 hours removes it. For an account, write to us from its email address.
          </p>
          {controller || contact ? (
            <p>
              This service is operated by {controller ?? "the Nutraboom Equals team"}.
              {contact && (
                <>
                  {" "}
                  For privacy questions, write to{" "}
                  <a
                    href={`mailto:${contact}`}
                    className="text-brand-text underline underline-offset-2"
                  >
                    {contact}
                  </a>
                  .
                </>
              )}
            </p>
          ) : (
            <p className="text-muted">Contact details for privacy questions will be added here.</p>
          )}
        </Section>
      </div>
    </SiteFrame>
  );
}
