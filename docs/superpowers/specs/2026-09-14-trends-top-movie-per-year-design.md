# Trends: per-year top movie table + tooltip — design

**Date:** 2026-09-14
**Status:** approved (Andrew, in-session)

## Goal

On `#/trends`, show *which movie* drove each year's usage of a charted word:

1. A "Top film by year" table below the existing "Films that say X the most"
   table, listing every year plotted on the chart with that year's top
   word-using movie.
2. The chart hover tooltip shows the top movie for the hovered year, per word —
   so a spike (e.g. sword, 1935) is instantly explained on hover.
3. When multiple words are charted, a tab bar switches the tables between
   words — and the existing top-films table comes back for multi-word charts
   (today it disappears entirely with 2+ words).

## Decisions (confirmed)

- **Ranking:** raw count (matches the existing top-films table; raw count is
  what drives a corpus-rate spike). Display the count in table rows.
- **Tabs control both tables** — top-films and top-film-by-year.
- **Tooltip shows top movie per word**, including multi-word charts and the
  featured landing chart.

## Data

One new query in the Trends effect's `Promise.all`, all charted words at once:

```sql
SELECT word, year, imdb_id, title, count FROM (
  SELECT w.word, m.year, w.imdb_id, m.title, w.count::DOUBLE AS count,
         ROW_NUMBER() OVER (PARTITION BY w.word, m.year
                            ORDER BY w.count DESC, m.title) AS rn
  FROM words_by_word w JOIN movies m USING (imdb_id)
  WHERE w.word IN (…)) WHERE rn = 1
```

Shaped into `Map<word, Map<year, { imdb_id, title, count }>>`. Years are
filtered by the same `MIN_YEAR_WORDS` threshold as the chart so the table and
chart always agree on which years exist. No pipeline / parquet changes.

## Components

- **`LineChart`**: point type gains optional `note?: string`; the tooltip
  renders the note as a muted second line under each series row. No new props.
- **`Trends.tsx`**: attaches `note` = `Title (year)` when building points;
  renders a tabbed details section when 1+ user-selected words are charted
  (not for the featured landing chart, matching current behavior):
  - Tab bar styled like the word chips, with each word's series color dot.
    Hidden when only one word. Selection resets when the word list changes.
  - Active word's `TopFilms` table (existing), then the new
    **`TopFilmsByYear`** table: all plotted years ascending, each row =
    year · movie title linked to `#/movie/:id` · count (`12×`). Rendered as a
    compact multi-column grid on wide screens (~90 rows otherwise).
  - Plotted years where the word never occurs get a muted "—" row so the
    year sequence stays unbroken.

## Logic split for tests

Row-shaping (grouping query rows into the per-word map, merging with the
plotted-year list, filling gaps with nulls) lives in `app/src/lib/trends.ts`
as pure functions with vitest coverage — same duckdb-free split as the
min-corpus threshold fix.

## Alternatives rejected

- Per-word queries fired from the tab component: N queries, and the tooltip
  needs the same data anyway.
- Precomputed `top_movie_by_year` parquet: unnecessary, runtime window query
  over `words_by_word` is small.
