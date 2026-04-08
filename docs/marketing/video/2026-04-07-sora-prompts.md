# AfriTalent Sora Prompt Pack

Date: April 7, 2026

Sora execution is blocked until `OPENAI_API_KEY` is available in the environment.
These prompts are ready for execution once that is set.

## Prompt 1: Hiring Noise

```text
Use case: launch film opener
Primary request: abstract premium cinematic scene showing a wall of generic job cards and application noise dissolving into motion blur
Scene/background: deep ink interface environment with floating translucent cards
Subject: crowded job cards, notification fragments, blurred profile tiles
Action: beat 1 (0-2s) cards drift in clutter; beat 2 (2-4s) camera pushes through the noise; beat 3 (4-8s) clutter starts clearing toward a single focused path
Camera: slow dolly forward, 50mm lens, precise motion
Lighting/mood: premium, moody, glossy, controlled
Color palette: deep navy, emerald, soft white, warm amber
Style/format: product film, polished UI-adjacent abstraction
Text (verbatim): "Hiring is full of noise"
Constraints: no logos; no real people; keep text legible; avoid fast motion
Avoid: cheap stock footage look, chaotic flashing, exaggerated sci-fi effects
```

## Prompt 2: Trust Appears

```text
Use case: trust reveal sequence
Primary request: premium interface-like scene where trust badges and verified signals emerge in a clean glassmorphism environment
Scene/background: elegant dark interface surface with floating signal modules
Subject: trusted employer card, verified status chips, salary disclosure tags
Action: beat 1 (0-2s) glass panels fade in; beat 2 (2-4s) trust badges illuminate softly; beat 3 (4-8s) layout locks into a clean shortlist view
Camera: subtle orbit with slow push-in
Lighting/mood: premium, confident, calm
Color palette: emerald, ink, ivory, amber
Style/format: cinematic UI motion study
Text (verbatim): "Trust should be visible"
Constraints: no logos; no real people; no unreadable UI clutter
Avoid: glitch effects, purple-heavy startup palette, aggressive movement
```

## Prompt 3: Africa-to-Global Opportunity

```text
Use case: mission sequence
Primary request: abstract elegant visualization of opportunity moving from African cities to global teams through light paths and refined interface cues
Scene/background: map-inspired motion field with subtle interface overlays
Subject: motion lines, destination markers, clean opportunity cards
Action: beat 1 (0-2s) light paths emerge from multiple African points; beat 2 (2-4s) paths connect outward; beat 3 (4-8s) a single premium opportunity card settles at center
Camera: top-down to gentle tilt transition
Lighting/mood: hopeful, premium, expansive
Color palette: deep ink, emerald, gold, soft cloud white
Style/format: sophisticated motion graphic realism
Text (verbatim): "Opportunity should travel farther"
Constraints: no country flags; no stereotypes; no real faces
Avoid: generic corporate globe visuals, literal airport imagery
```

## Prompt 4: End Card

```text
Use case: launch film end card
Primary request: elegant brand end card with premium product-finish feel
Scene/background: glossy dark surface with soft reflections and subtle emerald glow
Subject: AfriTalent wordmark area and final line of copy
Action: beat 1 (0-2s) subtle glow reveals the surface; beat 2 (2-4s) wordmark area comes into focus; beat 3 (4-6s) final copy settles
Camera: locked-off with light parallax only
Lighting/mood: assured, premium, modern
Color palette: ink, emerald, warm amber, soft white
Style/format: restrained brand film
Text (verbatim): "AfriTalent", "Trust-first Africa-to-global hiring"
Constraints: no extra icons; keep text perfectly legible
Avoid: over-animated brand reveal, lens flares, dramatic zooms
```

## Execution Reminder

When ready:

1. set `OPENAI_API_KEY`
2. export `CODEX_HOME=${CODEX_HOME:-$HOME/.codex}`
3. export `SORA_CLI=\"$CODEX_HOME/skills/sora/scripts/sora.py\"`
4. run `create-and-poll` with `--no-augment` and `--prompt-file`
