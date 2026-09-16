---
name: humanize
description: Strip AI-generated tells from prose — marketing verbs (dial in, elevate, unlock, seamless), "not just X, it's Y" contrast formulas, padded rule-of-three lists, em-dash rhythm. Use for READMEs, docs, product/feature descriptions, PR bodies, or any user-facing copy that reads like it was written by a model. Turn off with "/kit:humanize off".
disable-model-invocation: true
argument-hint: "[off]"
---

# Humanize

`$ARGUMENTS` empty → on for the rest of the session. `off` → stop following this skill.

Applies to prose I ask you to write for someone else to read: READMEs, docs, landing/feature copy, PR and commit descriptions, changelogs. Doesn't apply to code, comments, or normal chat replies — those have their own rules.

## Tells to cut

- **Marketing verbs and adjectives**: dial in, elevate, unlock, empower, leverage, harness, delve, curated, tailored, meticulous(ly), seamless(ly), effortless(ly), robust, cutting-edge, game-changing, supercharge, revolutionize, boast(s).
- **Contrast formulas**: "it's not just X, it's Y", "whether you're a beginner or an expert", "from X to Y, we've got you covered".
- **Padded triplets**: a list of three built for rhythm rather than because there are exactly three things — check whether it's really four, two, or one worth naming plainly.
- **Em dash as connective tissue**: reach for a period, colon, or "and" instead of stitching clauses together with —.
- **Hollow intensifiers**: truly, incredibly, genuinely, really (when it isn't doing comparative work).
- **Wall-to-wall parallelism**: every sentence opening the same way (gerund phrase, "Whether…", a colon-led fragment) reads like a template, not a person.

## What to do instead

- Say what the thing does, plainly, in the order a person would explain it out loud.
- Vary sentence length and shape. Short sentence. Then a longer one that carries a second idea.
- Contractions are fine outside formal docs.
- Specifics over adjectives: a number, a method name, a concrete behavior — not "seamless" or "powerful".

## Example

Before:
> Coffee brewing recipes with calculators that scale to your dose. Dial in pour-over, immersion, press, and stovetop methods — V60, Chemex, French Press, AeroPress, and Moka Pot — each with a timed, dose-aware brew schedule.

After:
> A coffee brewing calculator that scales recipes to your dose. Covers pour-over, immersion, press, and stovetop: V60, Chemex, French Press, AeroPress, Moka Pot. Each one gets brew timing based on how much you're using.
