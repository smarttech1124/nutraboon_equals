# N-ATLaS for Nigerian languages: research and integration plan

Status: **research only, not implemented.** The audio settings already list N-ATLaS as "not available" (ADR-069). Nothing here changes the app.

Sources, read on 10 October 2026:

- https://huggingface.co/seun-ajayi/n-atlas-llm (the page asked about)
- https://huggingface.co/NCAIR1/N-ATLaS and the NCAIR1 organisation (the official release)
- The model cards of `NCAIR1/Yoruba-ASR`, `NCAIR1/Hausa-ASR`, `NCAIR1/Igbo-ASR` and `NCAIR1/NigerianAccentedEnglish`

## 1. What the linked model is

- `seun-ajayi/n-atlas-llm` is a **personal copy of the official `NCAIR1/N-ATLaS` text model**. Its four weight files have the same SHA-256 hashes as the official ones, so it is the same model.
- The copy adds two files for Hugging Face Inference Endpoints, `handler.py` and `requirements.txt`, and is not gated. The official repository is gated: you accept Awarri's terms to download it.
- **The copy carries the same N-ATLaS licence.** Using the copy does not avoid the terms. Prefer the official repository, so updates and accepted terms are traceable.

**N-ATLaS-LLM in short:**

- **Model:** Llama-3 8B, fine-tuned by Awarri Technologies for the Federal Ministry of Communications, Innovation and Digital Economy. Version 1.0, September 2025.
- **Size:** 8 billion parameters, BF16, about 16 GB of weights.
- **Languages:** English, Hausa, Igbo and Yoruba.
- **Training:** about 392 million tokens of instruction data. Much of it was machine-translated (Google Translate, OpenAI models) and then checked by people. Source material includes Nigerian news (BBC Pidgin, Punch).
- **Context:** about 8,000 tokens. Knowledge cutoff December 2023.
- **Text only:** it reads and writes text. It does not hear or speak.

### Human evaluation (from the model card, scores out of 5)

| Language | Ratings |  Average | Fluency | Accuracy | Bias/fairness |
| -------- | ------: | -------: | ------: | -------: | ------------: |
| English  |   1,662 |     4.21 |    4.30 |     4.23 |          3.18 |
| Hausa    |     140 |     3.98 |    4.23 |     3.72 |      **1.11** |
| Igbo     |     296 |     3.87 |    3.89 |     3.92 |          4.01 |
| Yoruba   |     542 | **2.69** |    2.71 |     3.13 |          2.23 |

Yoruba is clearly the weakest language, and the Hausa bias/fairness score is very low. The Hausa sample is small (140 ratings).

## 2. The rest of N-ATLaS: speech recognition

For **audio**, N-ATLaS also includes four speech-recognition models from the official NCAIR1 organisation. All are gated, and none are part of the linked repository:

| Model                            | Language                  | Base                                      |
| -------------------------------- | ------------------------- | ----------------------------------------- |
| `NCAIR1/Yoruba-ASR`              | Yoruba                    | Whisper Small (244M), 627 hours of speech |
| `NCAIR1/Hausa-ASR`               | Hausa                     | Whisper Small (244M)                      |
| `NCAIR1/Igbo-ASR`                | Igbo                      | Whisper Small (244M)                      |
| `NCAIR1/NigerianAccentedEnglish` | Nigerian-accented English | Whisper Small (244M)                      |

- **Input:** 16 kHz audio, at most **30 seconds** per call.
- **Data:** speakers from all six geopolitical zones (the Langeasy platform).
- **Accuracy:** no error rates are published on the model cards.

**There is no N-ATLaS text-to-speech model.** Reading replies aloud in Yoruba, Hausa or Igbo needs a separate voice. Browsers rarely have those voices.

## 3. How it could fit Nutraboom Equals

### What exists today

- **Replies:** in Nigerian, UK or US English, with Yorùbá and Igbo in Beta (`lib/i18n/languages.ts`). The main model (Gemini or Claude) writes the reply directly in the chosen language, plus an English copy. Safety checks run on the English copy, and app-written safety notices stay in English (ADR-050). **Hausa is not offered.**
- **Voice:** the browser's speech recognition and voices (`lib/voice`), reviewed as text before sending. N-ATLaS is registered as an unavailable speech-to-text provider (ADR-069).
- **AI providers:** Gemini, Claude and an OpenAI-compatible client with a configurable base URL (`lib/ai/openai-compatible.ts`).

### Recommended design: N-ATLaS as the translator, not the brain

```text
Typed or spoken message (en-NG / yo / ha / ig)
  │  (speech) browser records ≤30 s → POST /api/speech → N-ATLaS ASR for the chosen language
  │             → transcript shown for review (as today) → sent as text
  ▼
Non-English text → N-ATLaS LLM: translate to English
  ▼
Main model (Gemini/Claude): structured JSON reply in English
  │  allergy, child, pregnancy, medicine and dose checks on English (unchanged)
  ▼
N-ATLaS LLM: translate the checked English message to yo / ha / ig
  ▼
Reply shown in the person's language; safety notices stay in English (and can be translated
  for display with the English kept underneath); the English copy is stored for audit
```

**Why not use N-ATLaS as the chat model?** The orchestrator relies on structured JSON (meal plans, shopping lists, intents) and on strong instruction following. An 8B model with an 8k context, trained mostly on general instructions and with no published JSON-mode results, would weaken the safety and budget features. Use it for what it was built for: Nigerian-language understanding and translation.

### What would change in the code (future phase)

1. **Translator interface:** add `lib/i18n/translator.ts` with `Translator.translate({ text, from, to })` and an N-ATLaS implementation calling an OpenAI-compatible endpoint (vLLM or TGI) with a fixed translation system prompt and low temperature. A setting chooses between "main model writes the language" (today) and "N-ATLaS translates".
2. **Languages:** add `ha-NG` (Hausa) to `LANGUAGES`. Keep Yoruba, Igbo and Hausa as Beta until native speakers review samples.
3. **Speech-to-text:** add `POST /api/speech` (auth-free like chat, rate-limited, audio size limit). It sends the audio to the speech service for the chosen language, and the browser shows the transcript for review, as now. Implement `ServerSpeechToText` behind the existing `SpeechToText` interface, and mark N-ATLaS available in n-equals Audio when configured.
4. **Text-to-speech:** keep the browser voice where one exists. Choose and licence a separate Yoruba, Hausa and Igbo voice before promising spoken replies in those languages.
5. **Privacy:** messages and recordings would go to our own model server instead of, or as well as, Gemini or Claude. Update the privacy notice and processor list, never store audio, and log no content.
6. **Evaluation:** extend `npm run eval:conversations` with Yoruba, Hausa and Igbo cases, especially allergy, pregnancy and child-under-5 messages, scored by native speakers.

## 4. Requirements

**Licence and permission**

- **User cap:** the licence allows **at most 1,000 active end-users in any 30 days**. Above that, or for commercial use, a separate licence from Awarri and the Ministry is required. Nutraboom Equals has paid plans, so plan for a commercial licence before launch.
- **Attribution** on every public use: "N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation and Digital Economy, and powered by Awarri Technologies." Renamed derivatives must carry "Powered by Awarri".
- Derivative works (for example our own fine-tune) must use the same licence.
- **Prohibited uses:** surveillance, profiling and disinformation. Nigerian law governs the licence.
- **To confirm with Awarri:** obligations inherited from the Meta Llama 3 licence (the base model). The N-ATLaS card does not mention them.

**Hosting.** No Hugging Face Inference Provider serves the model, and it cannot run on Vercel. You need GPU hosting:

| Part                     | Minimum to run                                                                                          | Notes                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| N-ATLaS-LLM (8B)         | One GPU with about 24 GB memory at 16-bit (e.g. L4, A10G); a 16 GB GPU with 8-bit or 4-bit quantisation | Serve with vLLM or Text Generation Inference for an OpenAI-compatible API; HF Inference Endpoints, RunPod, Modal or own servers |
| Each speech model (244M) | Small GPU or a CPU (slower)                                                                             | Four models: one per language, loaded together or on demand                                                                     |

- Secrets (`NATLAS_BASE_URL`, `NATLAS_API_KEY`) stay on the server, like the AI keys.
- Expect cold starts on scale-to-zero hosting, and set timeouts so chat falls back to today's path.

**Other prerequisites**

- **Audio pipeline:** browser recording (MediaRecorder, Opus/WebM) converted to 16 kHz mono, clips of 30 seconds or less, and a size limit on uploads.
- **People:** native-speaker reviewers for Yoruba, Hausa and Igbo, ideally with nutrition knowledge, to approve translations of fixed messages and to score samples.
- **The copy's `handler.py` has a bug:** its docstring says requests carry `messages`, but the code reads chat messages from `inputs` and plain text from `prompt`, so a request shaped as documented gets an empty prompt. It also cuts the answer at the first "assistant" line, which is fragile. Use vLLM or TGI rather than this handler, or fix it first.

## 5. Advantages

- **Nigerian languages first:** trained for Hausa, Igbo, Yoruba and Nigerian English, with Nigerian cultural content. Hausa is added, which the app lacks today.
- **Nigerian speech:** speech recognition tuned for Nigerian accents and Nigerian languages, where browser recognition is weak or missing.
- **Data stays with us:** self-hosted, so messages and audio need not go to a foreign AI provider. That suits the NDPA and health-adjacent data.
- **Public-interest backing:** a Federal Government initiative, with explicit permission for accessibility and public-benefit use. That fits the hospital accessibility work and Deaf, blind and low-literacy users.
- **Predictable cost per message:** at scale it can cost less than paying a large commercial model per message (the GPU cost is fixed).
- **Small speech models** (244M) are cheap to run and can be fine-tuned with 10–20 hours of domain audio, for example food and market vocabulary.

## 6. Limitations and risks

- **Quality:**
  - **Yoruba is weak** (2.69/5 overall). Hausa has a very low bias/fairness score (1.11/5).
  - Training data was largely machine-translated, so there are translation artefacts.
  - Human evaluation was small for Hausa and Igbo.
- **Safety:**
  - Translation can change meaning. Allergy, pregnancy, child and medicine messages must be checked in English before translation, and safety notices kept in English alongside.
  - The speech-model cards say not to use them for high-stakes medical use without human oversight. The transcript review step must stay.
- **Speech:**
  - Accuracy drops with noise, children's speech, dialects and **code-switching**. Code-switching (mixing English and a Nigerian language) is common in real messages.
  - Clips are limited to 30 seconds. No error rates are published.
  - There is **no text-to-speech**.
- **Model:** 8k context and knowledge up to December 2023. No published structured-output (JSON) ability, so it is unsuitable as the main chat model.
- **Licence:** the 1,000-user cap and the commercial-licence requirement. Attribution is mandatory. The terms can be revoked for breaches.
- **Operations:** GPU hosting, monitoring, cold starts, and keeping four speech models and one LLM up to date.
- **Unofficial copy:** the linked repository is maintained by an individual, not Awarri or NCAIR. Prefer the official `NCAIR1` repositories.

## 7. Suggested next steps

1. Write to Awarri (datasupport@awarri.com) and NCAIR (ncair@nitda.gov.ng) about a licence covering a subscription product, and about the Llama 3 terms.
2. Run a short trial on a rented GPU:
   - translate a set of real Nutraboom replies, including safety cases, into Yoruba, Hausa and Igbo;
   - transcribe recordings of food and market phrases from speakers of each language;
   - have native speakers score the output against today's Gemini or Claude translations.
3. If it wins clearly for at least one language, build the translator and speech steps behind the interfaces above, language by language, keeping today's path as the fallback.
