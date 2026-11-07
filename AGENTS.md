# Seeking Light Journal Development

## Scope and product rules

- This is a shared family workspace. Modify only the journal allowlist in
  `.gitignore`; unrelated family files are not part of this project.
- Follow the user's independent-judgment rules. Distinguish facts, hypotheses,
  visual preferences, and verified behavior. Never claim mocked findings are AI.
- Read README.md, docs/development.md, COPILOT.md and the prototype design contract
  before making changes. The prototype is the current design reference; the root
  app remains the existing runtime. Do not silently replace one with the other.
- Keep freeform input and exact original text. No forced scores, split sentences,
  streak judgments, diagnoses, or unsupported positive conclusions.
- Preserve both storage keys and existing records. Storage migrations require
  fixtures, compatibility tests and a recoverable plan before implementation.
- Keep credentials, actual diary entries, model transcripts and private exports
  out of Git, command arguments, logs, test fixtures and screenshots.
- Load the frontend-design skill for UI changes. Verify changed flows in a real
  browser at desktop and mobile sizes; source audits are not browser tests.

## Changes and validation

- Use apply_patch for manual edits. Make focused changes and preserve user work.
- Add new files explicitly to the allowlist. Never force-add ignored files.
- Run npm test after relevant changes. Report failures and untested behavior.
- Do not run a live model test or transmit diary data without explicit consent.
- Do not push, publish, configure a public backend or change authentication as
  part of routine local development without the user's authorization.

## Agent team

- Do not launch agents merely because these instructions describe a team.
  Launch only when the user explicitly requests agent work for a concrete task.
- Before delegation, inspect the baseline and identify the immediate task to
  handle locally. Delegate independent, bounded work with disjoint write sets.
- Give each agent a file scope, acceptance criteria and privacy constraints.
  Ask coding agents to edit their files and list all changed paths in the result.
- Treat the main agent as integrator. Review patches and run integrated tests
  before committing; an agent's completion message is not verification.
- Use short feature branches and an approved isolated worktree where appropriate.
  Never reset or overwrite someone else's changes to resolve conflicts.
- Keep the user informed about actual progress, unresolved risks and decisions.
