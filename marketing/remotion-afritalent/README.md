# Remotion AfriTalent Launch Video

This folder contains an isolated Remotion mini-project for AfriTalent launch-film work.

Why isolated:

- it keeps video experimentation out of the main frontend build
- it avoids risk to the deployed app
- it gives future sessions a safe place to iterate on marketing assets

## Contents

- `src/AfriTalentLaunch.tsx` — main launch composition
- `src/root.tsx` — composition registration
- `src/index.ts` — Remotion entrypoint

## Setup

```bash
cd marketing/remotion-afritalent
npm install
```

## Run locally

```bash
npm run dev
```

## Render

```bash
npm run render
```

Output target:

- `marketing/remotion-afritalent/out/afritalent-launch.mp4`

## Related Assets

- Storyboard: `docs/marketing/video/2026-04-07-afritalent-launch-video-storyboard.md`
- Sora prompts: `docs/marketing/video/2026-04-07-sora-prompts.md`
- Figma board: `https://www.figma.com/design/YzkZdEQPbeE9th1Lxkg1GY`

## Notes

- Sora renders are blocked until `OPENAI_API_KEY` is available in the environment.
- The current composition focuses on premium brand motion and message beats, not UI capture.
- A future pass should add exported UI stills or animated product closeups from the latest frontend.
