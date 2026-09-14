# Homepage & site UX overhaul - design

2026-09-14. Source: Andrew's 8-point review request plus an "impatient user"
self-review pass. Goal: a mildly-curious visitor who spends under a minute on
the site should instantly see what it does and hit something interesting on
every page they touch.

## 1. Hero shows the product, not just the pitch

The current hero is a full viewport of text before anything visual. Restructure
the homepage top into a two-column hero (stacking on mobile):

- **Left:** "FADE IN:" kicker, the "Every film has a vocabulary." headline
  (kept - it works), one-line subhead, and the movie search box.
- **Right:** the featured trend chart, moved up from the bottom of the page,
  with its title, ◀/▶ cycle buttons and "N of M" indicator - the same
  interaction as Trends. The chart IS the explanation for low-attention users.

The old "Watch a word move" section lower down is removed (it's now the hero).
"Pull a script off the shelf" moves up accordingly.

## 2. Logo / favicon

A simple SVG mark combining film + words, matching the screenplay aesthetic
(ink lines, highlighter yellow). Concept: a strip of film seen head-on -
sprocket holes left and right - whose frame contains lines of "dialogue"
with one line highlighted in marker yellow. Reads at 16px.

- Used as the favicon (`app/public/favicon.svg`, replacing both the inline
  data-URI icon in index.html and the leftover Vite-era public assets).
- Used in the header as a ~24px mark before the MOVIEWORDS wordmark.
- One source of truth: a `Logo` React component renders the header mark; the
  favicon is a standalone SVG file with the same geometry.

## 3. Decades become a destination

New `#/decades` index page, sibling of `#/genres`:

- One card per decade (1910s-2020s, from `signature/decades.json`), with a
  per-decade SVG motif (era-evocative: gramophone horn, art-deco sunburst,
  jukebox, lava lamp, boombox, brick phone, flip phone, smartphone...), film
  count, and link to the existing `#/decade/:id` study page.
- "Decades" join the header nav (after Genres).
- The homepage "Or wander a decade" section is replaced by a full-width banner
  card - "Wander the decades" with a row of mini decade motifs - linking to
  `#/decades`. More attention-grabbing, less vertical space.

## 4. Footer reorder

"Explore the data yourself." retitles to "Grab the data" and moves below
"Got an idea?" (broader appeal first).

## 5. Leaderboard opens on an Overview

New default tab `overview` ("The headlines") on `#/leaderboard` showing top-5
tasters of every board, each section linking to its dedicated tab:

- On the rise / Fading out (top 5 each, with sparklines) → Risers & fallers
- The four film superlatives (top 5 each) → Film superlatives
- Interesting adjectives (top 5 from the pre-baked leaderboard, filtered to
  pos=adjective, non-stopword) → Top words with the adjectives filter
- One-film wonders (top 5) → One-film wonders
- Said by every film (top 5) → Said by every film

All data comes from already-pre-baked JSONs - no DuckDB on the default view.
`?b=words` keeps the old Top words board; existing deep links keep working.

## 6. Theme toggle gets an icon

Sun/moon SVG glyph added to the DAY/NIGHT button so it reads as a theme
toggle at a glance.

## 7. Compare featured matchups cycle

The Compare page's featured matchup gets the same ◀/▶ + "N of M" controls
as Trends (stateful index seeded from the day index), replacing the current
inline "other matchup" links.

## 8. A big batch of featured trends and matchups

Both featured pools move to `app/src/lib/featured.ts` and grow to 50+ each:

- **Trends (`FEATURED`):** editorial titles over 1-4 word groups. Words are
  drawn from the verified shifts leaderboard (100 risers/fallers) plus a
  handful of extra words verified against `word_year.parquet` during this
  work. Themes: technology, swearing, politeness, war, romance, money, drugs,
  family, titles/honorifics, food, feelings...
- **Matchups (`MATCHUPS`):** typed refs (genre/decade/movie) with titles.
  Genre-vs-genre, decade-vs-decade, mixed, and movie-vs-movie pairs. Every
  movie id is validated against `movies-index.json` (the corpus is partial -
  e.g. no Goodfellas or Casablanca - so nothing ships unverified).
- A unit test guards shape: no duplicate titles, 1-4 words per trend, 2-3
  refs per matchup, movie refs look like imdb ids.

## 9. Impatient-user review pass

After the above ships to the branch, click through the whole site in a browser
as a first-time, low-patience visitor (desktop + mobile widths, light + dark)
and fix the quick wins found. Findings that are bigger than quick wins get
listed in the session record instead.

## Non-goals

- No visual redesign of the established screenplay aesthetic - we're
  amplifying it, not replacing it.
- No new data pipeline work; only pre-baked JSONs and existing parquet files.
- Copy follows the site style: " - ", never em-dashes.
