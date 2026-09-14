# Mislabeled subtitle: tt0149624 shows LOTR words — 2026-09-14

**Project:** moviewords   **Branch/commit:** main @ 1afaccf (investigation only, no code changed)   **Status:** root cause found — handed off to the data-pipeline session for the fix

## Summary

Andrew reported that https://moviewords.org/#/movie/tt0149624 ("All the Pretty
Horses", 2000) shows top words that obviously belong to a different film — they
are unmistakably **The Lord of the Rings: The Fellowship of the Ring** (frodo,
gandalf, mordor, bilbo, baggins, sauron, shire, gondor, isildur).

Investigated with systematic-debugging. **Root cause: source-data corruption in
the OPUS OpenSubtitles corpus** — the subtitle file filed under IMDb id 149624
is actually LOTR dialogue, mislabeled at OpenSubtitles.org upload time. The
pipeline mapped and published it faithfully; it has **no content-vs-metadata
sanity check** to catch a subtitle whose dialogue doesn't match its assigned
film. This is **not fixed** in this session by request — handed off to the other
Claude session already working on data-pipeline changes.

## What changed

Nothing. Investigation only. No files were edited. (The pre-existing loose edit
to `config.py`, `MIN_VOTES 1000→300`, and the `.claude/worktrees/dual-corpus/`
worktree belong to the other pipeline session and were left untouched.)

## Evidence gathered

- Live `https://data.moviewords.org/json/movie/tt0149624.json`:
  `title="All the Pretty Horses", year=2000`, but `top` = ring/frodo/gandalf/
  mordor/bilbo/baggins/sauron/shire/gondor/isildur. `total_words=8317`.
- Metadata (title, year, rating 5.8, votes 15273, genres Drama/Romance/Western)
  is **correct** — it comes from IMDb/TMDB, independent of subtitles. Only the
  subtitle-derived word data is wrong. So the corruption is purely in the
  subtitle → word-count path, not in the movie index/metadata.
- The real LOTR Fellowship entry `tt0120737` exists and is correct, with a
  **different, larger** subtitle (`total_words=11575` vs the mislabeled 8317).
  So this is a genuinely distinct, mislabeled subtitle file — not a duplicate of
  the correct LOTR one.

## Root cause (traced)

- `pipeline/src/moviewords_pipeline/corpus_index.py:10` —
  `PATH_RE = OpenSubtitles/raw/en/\d{4}/(\d+)/\d+\.xml$`; `imdb_id_from_path()`
  derives the IMDb id **purely from the OPUS directory path**
  (`.../en/<year>/<imdb-number>/<file>.xml`). This mapping is correct and
  standard (unit test confirms `110912`→`tt0110912` = Pulp Fiction).
- Therefore OPUS directory `2000/149624/` contains a subtitle whose **content is
  LOTR** but is filed under All-the-Pretty-Horses' imdb id + year — i.e. an
  uploader on OpenSubtitles.org mislabeled a LOTR subtitle. Source-data error,
  faithfully carried through.
- `select_best()` (`corpus_index.py:20`) picks the largest in-band file per
  directory. All-the-Pretty-Horses runtime ~116 min → token band ~2,320–29,000;
  the LOTR file (~8,317 tokens) sits inside the band, so nothing rejected it. If
  a correct subtitle also existed in dir 149624, the larger file would win — the
  next session should confirm whether dir 149624 has more than one candidate,
  but the core defect is the mislabeled source file, not the selection heuristic.

## Learnings / gotchas

- Movie **metadata is trustworthy** (IMDb/TMDB); **subtitle-derived data is not**
  — OpenSubtitles is user-uploaded, so mislabeled files under the wrong IMDb id
  are an expected class of error across the 18,761-film corpus. tt0149624 is
  very likely not the only one.
- There is currently **no validation** anywhere that a film's dialogue matches
  its title/year. The token-rate band (`MIN/MAX_TOKENS_PER_MIN`) only rejects
  implausibly-sized files, not mislabeled-but-plausibly-sized ones.

## Open threads & next steps (for the data-pipeline session)

1. **Confirm the mechanism**: unzip/inspect OPUS `raw/en/2000/149624/` — how many
   `.xml` candidates are there, and are they all LOTR, or is a correct
   All-the-Pretty-Horses subtitle present but out-competed by `select_best`?
2. **Decide remediation approach** (pipeline-side, this session's domain):
   - Blocklist known-mislabeled (imdb_id, zip_name) pairs; and/or
   - Add a content-vs-metadata sanity check — e.g. compare a film's signature
     words against its title/known entities, or cross-check for near-duplicate
     word signatures across unrelated films (the LOTR fingerprint appearing under
     two unrelated ids is detectable), flag/drop the mismatch.
   - Consider a systemic detector: films whose top signature words are dominated
     by proper nouns matching a *different* film's fingerprint.
3. **Republish** affected movie JSON + index after the pipeline fix (dataset is
   on R2 at data.moviewords.org; see prior session on `upload_r2` / stale-cache).
4. Watch for the same LOTR fingerprint (frodo/gandalf/mordor…) leaking onto other
   ids as a quick way to find sibling cases.

## Related docs

- `docs/sessions/2026-Q3/2026-09-14-cookieless-analytics.md` — most recent session
- `pipeline/src/moviewords_pipeline/corpus_index.py` — the OPUS→IMDb mapping + `select_best`
- `docs/ARCHITECTURE.md` — dataset contract & methodology
