# Dataset license

The **code** in this repository is MIT-licensed (see [LICENSE](LICENSE)).

The **published dataset** (the Parquet and JSON files on
https://moviewords-data.beveradb.com - per-film word counts, per-word yearly
counts, word metadata, and film metadata) is licensed under
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).

Why non-commercial: `movies.parquet` carries fields derived from the
[IMDb non-commercial datasets](https://developer.imdb.com/non-commercial-datasets/)
(ratings, votes, runtimes, genres), which are licensed for non-commercial use
only. The strictest upstream term wins, so the whole published bundle is
non-commercial. The word counts alone could arguably be freer - the bundle
can't.

Attribution when you use the data:

- Word counts derived from the
  [OPUS OpenSubtitles corpus](https://opus.nlpl.eu/datasets/OpenSubtitles)
  (Lison & Tiedemann, 2016), subtitles by
  [OpenSubtitles.org](https://www.opensubtitles.org/)
- Information courtesy of [IMDb](https://www.imdb.com). Used with permission.
- Film metadata and posters via [TMDB](https://www.themoviedb.org) - this
  product uses the TMDB API but is not endorsed or certified by TMDB.

More on what's in each file: [docs/DATA.md](docs/DATA.md). Questions or
concerns about the data: email andrew@beveridge.uk.
