import { normalizeJobDescription, splitJobDescriptionSections } from "../job-description";

describe("job description formatting", () => {
  it("decodes escaped html and preserves readable structure", () => {
    const input = "&lt;p&gt;&lt;strong&gt;Who we are&lt;/strong&gt;&lt;/p&gt;&lt;p&gt;Build things&amp;nbsp;that matter.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Own delivery&lt;/li&gt;&lt;li&gt;Guide teams&lt;/li&gt;&lt;/ul&gt;";

    expect(normalizeJobDescription(input)).toBe([
      "Who we are",
      "",
      "Build things that matter.",
      "",
      "- Own delivery",
      "- Guide teams",
    ].join("\n"));
  });

  it("splits normalized descriptions into renderable sections", () => {
    const input = "<p>First section</p><p>Second section</p>";

    expect(splitJobDescriptionSections(input)).toEqual(["First section", "Second section"]);
  });
});
