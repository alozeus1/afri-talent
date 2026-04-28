# AfriTalent Learning Hub Content Model

This pass implements starter learning content in `frontend/src/lib/early-tester-content.ts` so the Learning Hub is useful even when the backend catalog is empty.

## Lesson Fields

- `id`: stable lesson identifier.
- `title`: learner-facing title.
- `description`: short summary.
- `category`: AWS Cloud Demos, Cybersecurity Demos, DevOps Demos, AI Tools for Career Growth, or Job Search Skills.
- `difficulty`: BEGINNER, INTERMEDIATE, or ADVANCED.
- `durationHours`: estimated time.
- `provider`: currently `AfriTalent Starter Lab`.
- `skills`: searchable skill tags.
- `outcomes`: what the learner should understand or produce.
- `steps`: practical step-by-step lesson content.
- `checklist`: completion or safety checklist.
- `practiceTask`: optional learner exercise.
- `isFree`: true for early tester starter lessons.
- `featured`: true for beginner starter lessons.

## Early Tester Behavior

- If backend learning content exists, the page uses it.
- If backend content is empty or unavailable, the page falls back to starter lessons.
- Completion is stored in browser local storage under `afritalent_learning_completed_lessons`.
- Completion is intentionally labeled local-only until backend progress tracking is added.

## Categories Seeded

- AWS Cloud Demos
- Cybersecurity Demos
- DevOps Demos
- AI Tools for Career Growth
- Job Search Skills

## Migration Recommendation

When ready for backend persistence:

- Add a `learning_progress` model keyed by `userId` and `lessonId`.
- Add optional `contentVersion` for lesson updates.
- Add `startedAt`, `completedAt`, and `lastViewedAt`.
- Keep local storage fallback for anonymous early testers.

