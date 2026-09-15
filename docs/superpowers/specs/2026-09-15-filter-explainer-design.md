# Filter explainer: clarify original-language filtering vs English-subtitle words

**Date:** 2026-09-15
**Status:** approved
**Goal:** Make it clear what the corpus language filter actually filters, and why
the words shown are always English - so selecting "Spanish" and seeing English
words is understood, not surprising.

## Background

The corpus language filter (PR #21) selects films by their TMDB
`original_language`. But every word count on the site comes from the film's
**English** subtitles: the pipeline ingests only the OPUS `raw/en.zip` track
(`config.py:9`, `corpus_index.py:11`). So for a non-English film, the counts are
its **English translation**, never the original dialogue. Filtering to Spanish
therefore shows the English-subtitle vocabulary of Spanish-*origin* cinema (with
the occasional untranslated loanword - "panna", "cotta", "samurai"). This is
correct but unintuitive, and there is currently no in-app explanation.

Original-language dialogue is obtainable from OPUS in principle (per-language
tracks) but would require a large pipeline re-run; **out of scope** here. This
spec adds explanation only - no data or pipeline changes.

## Design

### 1. Explainer modal

A reusable accessible modal (`role="dialog"`, `aria-modal`, Escape + backdrop
close, focus moved to the dialog, matches the site's hard-border card style)
containing the explainer copy (terse site voice, hyphens only):

- **What you're filtering** - the film's *original language* (where it was made,
  from TMDB), not the language of the words below.
- **What the words are** - every count comes from the film's **English
  subtitles**. We only have the English OpenSubtitles track, so for a non-English
  film these are its **English translation**, not the original dialogue. (That's
  why an untranslated word occasionally slips through.)
- **So "Spanish" means** - the English-subtitle vocabulary of Spanish-*origin*
  cinema, not Spanish words.
- Closing line: original-language dialogue isn't in the dataset - just the
  English translation.

### 2. Trigger points (all open the same modal)

- **Dropdown:** a "How does this work?" text link in the `LanguageFilter` menu
  footer, next to Apply.
- **Filtered aggregate views:** extend the existing "Based on N films" labels to
  "Based on N <Language>-language films, measured from their English subtitles.
  [How does this work?]" where the trailing phrase is the modal trigger. Applies
  on Home, Leaderboard, Trends, Entity, Decades, Genres (wherever the label
  already renders when a filter is active).
- **Movie pages:** the existing `LangBadge` (rendered on every non-English film,
  regardless of filter) becomes a button that opens the modal, with a `title`
  tooltip. This addresses the sharpest confusion (a foreign film's page showing
  English words even with no filter active).

### 3. Components

- **Create** `app/src/components/Modal.tsx` - reusable dialog: props
  `{ open, onClose, title, children }`; renders a fixed backdrop + centered
  card; closes on Escape and backdrop click; moves focus into the dialog on
  open and restores it on close; no external dependency.
- **Create** `app/src/components/FilterExplainer.tsx` - the modal content plus
  `<ExplainerLink variant="link" | "badge">`, a self-contained trigger that owns
  its open state and renders the shared modal. `variant="link"` renders the
  underlined "How does this work?" text; `variant="badge"` renders the language
  badge look.
- **Modify** `app/src/components/ui.tsx` - `LangBadge` renders an
  `<ExplainerLink variant="badge">` instead of a static badge.
- **Modify** `app/src/App.tsx` (dropdown link), and the aggregate views that
  show the "Based on N films" label (Home, Leaderboard, Trends, Entity, Decades,
  Genres) to append the clarifier + link when a language filter is active.

## Non-goals

- No pipeline/data changes; no original-language word ingestion.
- No relabeling of the filter options (keep "Spanish", etc.); the modal + inline
  clarifier carry the nuance.
- No routing/new page; the explanation is a modal, reachable from any view.

## Testing

- Unit: `ExplainerLink` opens/closes the modal (both variants); Modal closes on
  Escape and backdrop click and restores focus.
- Browser: verify the dropdown link, a filtered aggregate view clarifier, and a
  non-English movie-page badge all open the modal; verify copy and a11y roles.
