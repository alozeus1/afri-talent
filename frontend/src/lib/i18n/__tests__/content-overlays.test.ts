import { EARLY_LEARNING_CATEGORIES, EARLY_LEARNING_LESSONS, TOP_PAYING_ROLE_GUIDANCE } from "@/lib/early-tester-content";
import { HIRING_RESOURCE_GUIDES, MARKET_SALARY_BENCHMARKS, OFFICIAL_IMMIGRATION_GUIDES } from "@/lib/market-reference-data";
import ar from "../content/ar";
import es from "../content/es";
import fr from "../content/fr";
import pt from "../content/pt";
import { localizeContent } from "../content";

const overlays = { fr, es, pt, ar };

describe.each(Object.entries(overlays))("content overlay %s", (_locale, overlay) => {
  it("covers every public dataset entry and only real entries", () => {
    expect(Object.keys(overlay.lessons ?? {}).sort()).toEqual(EARLY_LEARNING_LESSONS.map((l) => l.id).sort());
    expect(Object.keys(overlay.topPayingRoles ?? {}).sort()).toEqual(TOP_PAYING_ROLE_GUIDANCE.map((r) => r.role).sort());
    expect(Object.keys(overlay.salaryBenchmarks ?? {}).sort()).toEqual(MARKET_SALARY_BENCHMARKS.map((b) => b.role).sort());
    expect(Object.keys(overlay.immigrationGuides ?? {}).sort()).toEqual(
      OFFICIAL_IMMIGRATION_GUIDES.map((g) => `${g.country}|${g.pathway}`).sort(),
    );
    expect(Object.keys(overlay.hiringGuides ?? {}).sort()).toEqual(HIRING_RESOURCE_GUIDES.map((g) => g.title).sort());
    expect(Object.keys(overlay.learningCategories ?? {}).sort()).toEqual([...EARLY_LEARNING_CATEGORIES].sort());
  });

  it("keeps list lengths aligned with the English source", () => {
    for (const lesson of EARLY_LEARNING_LESSONS) {
      const patch = overlay.lessons?.[lesson.id];
      expect(patch?.steps?.length).toBe(lesson.steps.length);
      expect(patch?.outcomes?.length).toBe(lesson.outcomes.length);
      expect(patch?.checklist?.length).toBe(lesson.checklist.length);
    }
    for (const guide of OFFICIAL_IMMIGRATION_GUIDES) {
      expect(overlay.immigrationGuides?.[`${guide.country}|${guide.pathway}`]?.requirements?.length).toBe(guide.requirements.length);
    }
    for (const guide of HIRING_RESOURCE_GUIDES) {
      expect(overlay.hiringGuides?.[guide.title]?.points?.length).toBe(guide.points.length);
    }
    for (const benchmark of MARKET_SALARY_BENCHMARKS) {
      expect(overlay.salaryBenchmarks?.[benchmark.role]?.levels?.length).toBe(benchmark.levels.length);
    }
  });
});

describe("localizeContent", () => {
  it("returns English data unchanged for en and translated fields otherwise", () => {
    expect(localizeContent("en").lessons(EARLY_LEARNING_LESSONS)[0].title).toBe(EARLY_LEARNING_LESSONS[0].title);
    const french = localizeContent("fr").lessons(EARLY_LEARNING_LESSONS)[0];
    expect(french.title).not.toBe(EARLY_LEARNING_LESSONS[0].title);
    // Non-display fields stay intact.
    expect(french.id).toBe(EARLY_LEARNING_LESSONS[0].id);
    expect(french.difficulty).toBe(EARLY_LEARNING_LESSONS[0].difficulty);
    const benchmark = localizeContent("ar").salaryBenchmarks(MARKET_SALARY_BENCHMARKS)[0];
    expect(benchmark.levels[0].avg).toBe(MARKET_SALARY_BENCHMARKS[0].levels[0].avg);
  });
});
