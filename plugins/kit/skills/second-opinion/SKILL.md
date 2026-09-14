---
name: second-opinion
description: Get an independent opinion from a different model (OpenAI Codex CLI) on a genuinely uncertain or hard-to-reverse technical decision, or a bug you're stuck on. Use sparingly — when two approaches are close, a claim can't be verified, or several hypotheses have failed. Not a rubber stamp.
argument-hint: "[the decision or question]"
---

# Second opinion

1. **Write a brief** to a temp file (your scratchpad): the problem and constraints, relevant files (paths), the decision or question, the reasoning so far, the alternatives considered, and what's already been ruled out. Ask for:
   - a verdict: AGREE / DISAGREE / CONDITIONAL
   - specific concerns, each with reasoning or evidence
   - a recommendation (for CONDITIONAL: the exact conditions)
2. **Ask Codex**, read-only, from the repo root so it can read the code:
   ```bash
   codex exec --sandbox read-only "$(cat <brief file>)"
   ```
   If `codex` isn't installed or fails, spawn `kit:reviewer` (model `opus`) in **plan-critique** mode with the same brief instead, and say you did.
3. **Report**: its verdict, where it agrees and disagrees with you, and your recommendation after weighing it. Verify any factual claim it makes before relying on it.
