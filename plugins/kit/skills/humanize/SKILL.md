---
name: humanize
description: |
  Rewrite AI-sounding prose so it reads like the person shipping it, not a chatbot, without changing what it says. Covers staging tells (not-X-but-Y, one-line closers, staged run-ups like "let's dive in"), rhythm tells (forced triads, em-dash rhythm, repeated sentence openings), inflated or sales language (dial in, elevate, seamless, boasts, nestled), formatting-by-rule (bold-labeled lists, decorative headings), and chatbot leftovers ("I hope this helps!"). Use when writing or reviewing prose meant for someone else to read: READMEs, docs, product/feature copy, PR and commit descriptions, changelogs. Doesn't apply to code, comments, or normal chat replies.
argument-hint: "[file path]"
---

# Humanize

Rewrite AI-sounding prose so it reads like the person shipping it, not a chatbot. Keep every fact; don't add or drop one.

Applies to prose written for someone else to read: READMEs, docs, landing/feature copy, PR and commit descriptions, changelogs, user-facing copy. Doesn't apply to code, comments, or normal chat replies. Those follow their own rules.

## How to work

1. **Mark the tells**, strongest first. Read the whole passage once; a tell can span a paragraph (three parallel examples, the same closer after every section) as easily as one sentence.
2. **Draft the rewrite.** Keep every claim, name, number, date, and citation. Don't invent a detail to fill a gap; ask, or write a plainer sentence instead.
3. **Check the draft.** Read it aloud. Did the rewrite drop or add a fact? Then re-scan for the tells that survive rewrites most often: a not-X-but-Y contrast, a one-line closer, a dash, a padded triad, a bold label.
4. **Write the final version**, stating each point naturally instead of patching flagged phrases one at a time. Vary sentence length. Short sentence. Then one that carries a second idea.

## Voice

Given a writing sample, match its sentence length, word choice, and punctuation, including its dash rate; a sample that uses dashes means §8 below doesn't apply. Without a sample: blog posts, essays, and opinion pieces keep the writer's asides, humor, and uncertainty. Reference, technical, and legal text stays neutral and plain.

## A. Staging instead of stating

Strongest and most frequent tells. Act on one sighting.

**1. Not X but Y.** Watch for: "it's not just X, it's Y"; "not X but Y"; the same contrast split across two sentences ("This doesn't mean X. It means Y."); a clipped negative tail ("..., no guessing"). The negative half names something no one claimed, so the positive half sounds bigger than it is. State the point directly.
> Before: The retry queue isn't just a nice-to-have, it's what keeps the pipeline from stalling on transient errors.
> After: The retry queue keeps the pipeline from stalling on transient errors.

**2. One-line closers and dramatic fragments.** Watch for: a one-sentence paragraph restating the one before it ("That's the real win."); "Read that again."; a row of fragments ("No aesthetic prior. No nostalgia."); ALL CAPS or dot-spaced words for emphasis. Cut a closer that repeats. Merge fragment rows into one sentence with an actual claim.
> Before: The migration runs inside a single transaction. That's the real safeguard.
> After: The migration runs inside a single transaction.

**3. Sayings that sound deep.** Watch for: "at its core"; "what really matters"; "the heart of the matter"; "X is the Y of Z"; "X becomes a trap"; "the language/currency/architecture of". An ordinary point dressed as a hidden truth. Replace it with the specific claim.
> Before: At its core, the real question is whether the team can keep shipping weekly.
> After: The question is whether the team can keep shipping weekly.

**4. Staged run-up before the point.** Watch for: "Let's dive in"; "here's what you need to know"; "Honestly?"; "Look,"; "The thing is". The writer announces the point instead of making it. Cut the run-up, not just its tone.
> Before: Let's dive into how the build cache works. Here's what you need to know: it keys off the lockfile hash.
> After: The build cache keys off the lockfile hash.

**5. Arguing with no one.** Watch for: "To be clear,"; "I'm not saying..."; "A tempting approach would be..."; "One might think... but". Answers an objection that appears nowhere else, usually left over from an earlier draft. Remove it; if it holds a real claim, state the claim.
> Before: A tempting approach would be polling every second, but that would hammer the API. The client subscribes to a webhook instead.
> After: The client subscribes to a webhook instead of polling.

## B. Rhythm by rule

A person may do any one of these on purpose. The ones marked *weak alone* need company from another tell in the same passage.

**6. Forced triads and padded lists.** Ideas arrive in threes, or in a list, to sound complete, not because the meaning has that many parts. Check whether each item adds something distinct; merge or cut the ones that don't.
> Before: The release includes bug fixes, performance improvements, and general polish.
> After: The release includes bug fixes and performance improvements.

**7. Repeated sentence openings.** Several sentences in a row start with the same subject because repetition is handled by rule instead of by ear. Merge the sentences or start with the action.
> Before: She opened the config file. She found the stale flag. She removed it.
> After: She opened the config file, found the stale flag, and removed it.

**8. Dashes as the universal connector.** No em dash (—) or en dash (–) in the final text, unless a given writing sample uses them at a similar rate. A dash lets the writer skip deciding how two clauses relate; use a period, comma, colon, or parentheses instead. Leave dashes inside code, commands, and paths alone.
> Before: The new indexing job — added last sprint — runs nightly.
> After: The new indexing job, added last sprint, runs nightly.

**9. Stacked qualifiers.** *Weak alone.* Watch for: "to be fair"; "it's also possible"; "could potentially"; "in some cases it may". One qualifier patches another until every claim sounds uncertain. Keep a qualifier only when the source needs it.
> Before: It could potentially be argued that the timeout setting might have some effect on latency.
> After: The timeout setting may affect latency.

**10. Hyphenated pairs everywhere.** *Weak alone.* third-party, cross-functional, data-driven, real-time, and similar pairs hyphenated in every position. Keep the hyphen before a noun ("a real-time report"); drop it after ("the report is real time").
> Before: The service is cross-functional, the report is real-time, and the pipeline is end-to-end.
> After: The service is cross functional, the report is real time, and the pipeline is end to end.

**11. Passive voice and missing subjects.** *Weak alone.* The text hides who acts. Use active voice when it makes the actor clearer.
> Before: No manual restart needed. The cache is refreshed automatically.
> After: You don't need to restart it manually. The system refreshes the cache automatically.

## C. Inflation and borrowed authority

The fact underneath is usually fine. Remove the dressing.

**12. Overused AI vocabulary.** dial in, elevate, unlock, empower, leverage, harness, delve, curated, tailored, meticulous(ly), seamless(ly), effortless(ly), robust, cutting-edge, game-changing, supercharge, crucial, pivotal, showcase, underscore (verb), landscape (abstract noun), tapestry (abstract noun), interplay, intricate. Models reach for these far more than people do, especially stacked together. A formal word outside this list isn't a tell by itself.
> Before: Dial in pour-over, immersion, and stovetop methods, each with a seamless, dose-aware brew schedule.
> After: Covers pour-over, immersion, and stovetop methods, each with brew timing based on how much you're using.

**13. Inflated significance.** Watch for: "stands as a testament"; "a pivotal moment"; "marks a turning point"; "setting the stage for"; a stock "Challenges and Future Outlook" send-off; "the future looks bright". An ordinary detail is said to mark a change or promise a future. Keep the fact, cut the significance. End on the last concrete fact.
> Before: The v2 API shipped in March, marking a pivotal moment in the platform's evolution.
> After: The v2 API shipped in March.

**14. Vague connection words.** "associated with," "linked to," "connected to," "tied to" without saying how. Name the actual relationship when the source gives it.
> Before: The outage was tied to a bad deploy that shipped an invalid config.
> After: A bad deploy shipped an invalid config, which caused the outage.

**15. Shallow -ing riders.** "highlighting," "underscoring," "reflecting," "symbolizing," "fostering," "showcasing" bolted onto a fact to make it sound deeper. Keep the fact; keep the rider only when it's actually true.
> Before: The dashboard uses a dark theme, reflecting the team's preference for a cleaner look.
> After: The dashboard uses a dark theme.

**16. Sales language.** "vibrant," "nestled," "in the heart of," "renowned," "stunning," "must-visit". Reads like an ad. State what the thing is.
> Before: Nestled at the top of the settings menu is a small toggle for quick filters.
> After: The toggle for quick filters is at the top of the settings menu.

**17. Borrowed authority.** "experts argue," "observers have cited," unnamed critics, or a list of prestige outlets standing in for what was actually said. Use the real source and claim when the text gives one; otherwise cut it. Never invent a source.
> Before: Engineers say the new scheduler cuts p99 latency by roughly 30%.
> After: The new scheduler cuts p99 latency by roughly 30%.

**18. Avoiding is, are, and has.** "serves as," "stands as," "functions as," "boasts," "features," "offers" in place of a plain verb. Use is, are, or has.
> Before: The plugin serves as a bridge between the CLI and the API, and boasts a registry of 40+ entries.
> After: The plugin bridges the CLI and the API, and has a registry of 40+ entries.

## D. Formatting by rule

**19. Bold as decoration.** Words bolded without reason, or a vertical list giving every item a bold label and colon. Remove the bold. Fold a labeled list into prose when the labels carry no real information.
> Before: - **Speed:** Speed has been improved with a rewritten parser.
> After: The rewritten parser is faster.

**20. Decorative headings.** Title Case On Every Heading, emoji or arrows as bullet decoration, a horizontal rule between every section, a top-level heading that just repeats the title. Use sentence case and drop the decoration.
> Before: ## Strategic Roadmap And Release Planning
> After: ## Strategic roadmap and release planning

**21. Curly quotation marks.** *Weak alone*; most editors auto-curl. Match straight quotes where the target format uses them.

## E. Leftovers from the chat and the draft

Remove these outright. Nothing here needs rewriting.

**22. Chatbot residue.** "I hope this helps!"; "Great question!"; "Let me know if you'd like me to expand"; "Would you like...?" The most certain tell on this list, and the easiest to miss because it wraps real content. Remove the wrapper, keep the content.

**23. Knowledge-limit disclaimers and guesses.** "As of [date]"; "not publicly available, suggesting..."; "likely grew up in...". The text either flags where its knowledge ends or fills a gap with a plausible guess. State what the source doesn't show, or cut the sentence. Never present a guess as fact.

**24. A heading repeated in the first sentence.** A heading followed by a one-line paragraph that just restates it before the real content starts. Cut the repeat.
> Before: `## Performance` / "Performance matters." / "The cache cuts median response time in half."
> After: `## Performance` / "The cache cuts median response time in half."

**25. Writing about the previous version.** Docs or comments describe what the code replaced instead of what it does now. Save that for changelogs and migration guides.
> Before: This endpoint used to load the whole CSV into memory. It now streams rows instead, replacing that old approach.
> After: This endpoint streams CSV rows instead of loading the whole file into memory.

## What to return

- **Pasted text (default).** Return the rewrite plus a short list of remaining patterns you left in place and why.
- **File mode** (`$ARGUMENTS` names a file). Run the full process but write only the final prose to the file. Leave code blocks, inline code, commands, paths, YAML front matter, data, and link targets untouched. Then summarize what changed.
- **Embedded mode** (humanize runs as one step inside a larger task, such as drafting a PR body). Return only the final text.

## When not to act

A person can do any of these on purpose. Leave a watched phrase alone inside a quotation, a title, a proper name, or a passage that discusses the phrase rather than uses it. Act on a *weak alone* tell only when it shares a passage with another tell. Keep what carries the writer's voice: a specific unusual detail, mixed feelings ("I think this is mostly good, but it bothers me"), a dated reference, an explainable first-person choice, a genuine aside.

## Example

Before:
> Coffee brewing recipes with calculators that scale to your dose. Dial in pour-over, immersion, press, and stovetop methods, V60, Chemex, French Press, AeroPress, and Moka Pot, each with a timed, dose-aware brew schedule.

After:
> A coffee brewing calculator that scales recipes to your dose. Covers pour-over, immersion, press, and stovetop: V60, Chemex, French Press, AeroPress, Moka Pot. Each one gets brew timing based on how much you're using.

## Source

Patterns adapted from [blader/humanizer](https://github.com/blader/humanizer) (MIT), itself sourced from Wikipedia's ["Signs of AI writing"](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing).
