import { describe, expect, it } from "vitest";
import {
  shiftEvents,
  Timeline,
  toChapterList,
  toFfmetadata,
  toNarrationScript,
  toSrt,
} from "../../scripts/demo/timeline";

function recorded() {
  let now = 1_000_000;
  const timeline = new Timeline(now, () => now);
  const at = (seconds: number) => {
    now = 1_000_000 + seconds * 1000;
  };
  at(0);
  timeline.chapter("Home");
  at(3);
  timeline.caption("Understand food.");
  at(6.5);
  timeline.endCaption();
  at(8);
  timeline.chapter("Ask the assistant");
  at(9);
  timeline.caption("Values come from the food database.");
  at(75.25);
  return timeline.finish();
}

describe("demo timeline", () => {
  it("closes chapters and captions at the right times", () => {
    expect(recorded()).toEqual([
      { kind: "chapter", start: 0, end: 8, text: "Home" },
      { kind: "caption", start: 3, end: 6.5, text: "Understand food." },
      { kind: "chapter", start: 8, end: 75.25, text: "Ask the assistant" },
      { kind: "caption", start: 9, end: 75.25, text: "Values come from the food database." },
    ]);
  });

  it("writes SubRip captions with chapter titles first, in time order", () => {
    expect(toSrt(recorded())).toBe(
      [
        "1\n00:00:00,000 --> 00:00:02,500\nHOME\n",
        "2\n00:00:03,000 --> 00:00:06,500\nUnderstand food.\n",
        "3\n00:00:08,000 --> 00:00:10,500\nASK THE ASSISTANT\n",
        "4\n00:00:09,000 --> 00:01:15,250\nValues come from the food database.\n",
      ].join("\n"),
    );
  });

  it("writes ffmpeg chapter metadata, escaping special characters", () => {
    const meta = toFfmetadata(
      [{ kind: "chapter", start: 1.5, end: 4, text: "Budget; = plan" }],
      "Demo",
    );
    expect(meta).toContain(";FFMETADATA1\ntitle=Demo");
    expect(meta).toContain("START=1500\nEND=4000\ntitle=Budget\\; \\= plan");
  });

  it("writes a chapter list and a narration script", () => {
    const events = recorded();
    expect(toChapterList(events)).toBe("0:00 Home\n0:08 Ask the assistant\n");
    expect(toNarrationScript(events)).toContain("[0:09–1:15] Values come from the food database.");
  });

  it("shifts events for a video trimmed at the start, never below zero", () => {
    expect(
      shiftEvents(
        [
          { kind: "chapter", start: 10, end: 20, text: "A" },
          { kind: "caption", start: 2, end: 12, text: "B" },
        ],
        9.7,
      ),
    ).toEqual([
      { kind: "chapter", start: expect.closeTo(0.3), end: expect.closeTo(10.3), text: "A" },
      { kind: "caption", start: 0, end: expect.closeTo(2.3), text: "B" },
    ]);
  });
});
