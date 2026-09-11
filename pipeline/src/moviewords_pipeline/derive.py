import json
import math
from importlib import resources

import duckdb

from . import config


def _load_wordlist(name):
    text = resources.files("moviewords_pipeline").joinpath(name).read_text()
    return {w.strip() for w in text.splitlines()
            if w.strip() and not w.startswith("#")}


def load_stopwords() -> set[str]:
    return _load_wordlist("stopwords_en.txt")


def load_profanity() -> set[str]:
    return _load_wordlist("profanity_en.txt")


def log_odds(movie_counts: dict[str, int], corpus_counts: dict[str, int],
             alpha0: float = 100.0, min_count: int = 3) -> list[tuple[str, float]]:
    """Monroe et al. log-odds-ratio with an informative Dirichlet prior drawn
    from corpus word frequencies. Returns (word, z) pairs sorted descending
    by z, i.e. words most overrepresented in `movie_counts` relative to the
    corpus come first.
    """
    n_movie = sum(movie_counts.values())
    n_corpus = sum(corpus_counts.values())
    out = []
    for word, y in movie_counts.items():
        if y < min_count:
            continue
        y_c = corpus_counts.get(word, 0)
        prior = alpha0 * y_c / n_corpus if n_corpus else 0
        if prior == 0:
            continue
        delta = (math.log((y + prior) / (n_movie + alpha0 - y - prior))
                 - math.log((y_c + prior) / (n_corpus + alpha0 - y_c - prior)))
        variance = 1.0 / (y + prior) + 1.0 / (y_c + prior)
        out.append((word, delta / math.sqrt(variance)))
    return sorted(out, key=lambda t: -t[1])


def run():
    out = config.OUT_DIR
    (out / "words_by_movie").mkdir(parents=True, exist_ok=True)
    (out / "words_by_word").mkdir(parents=True, exist_ok=True)
    (out / "json" / "movie").mkdir(parents=True, exist_ok=True)

    con = duckdb.connect()
    w = config.WORK_DIR
    con.sql(f"""
        CREATE VIEW curated AS SELECT * FROM '{w / "curated.parquet"}';
        CREATE VIEW stats AS SELECT * FROM '{w / "movie_stats.parquet"}';
        CREATE VIEW wc AS SELECT * FROM '{w / "word_counts.parquet"}';
        CREATE VIEW matched AS SELECT * FROM '{w / "corpus_index.parquet"}';
        CREATE TABLE tmdb AS SELECT * FROM read_json(
            '{w / "tmdb"}/*.json',
            columns={{'imdb_id': 'VARCHAR', 'countries': 'VARCHAR[]',
                      'original_language': 'VARCHAR'}}
        );
    """)
    con.sql(f"""
        CREATE TABLE movies AS
        SELECT c.imdb_id, c.title, c.year, t.countries, c.genres,
               c.runtime_minutes, c.rating, c.votes,
               s.total_words, s.unique_words, s.words_per_minute
        FROM curated c
        JOIN stats s USING (imdb_id)
        JOIN tmdb t USING (imdb_id)
        WHERE t.original_language = '{config.LANG}';
    """)
    con.sql(f"COPY movies TO '{out / 'movies.parquet'}' (FORMAT parquet)")

    con.sql(f"""
        COPY (
            SELECT wc.* FROM wc JOIN movies USING (imdb_id)
            ORDER BY imdb_id, count DESC
        ) TO '{out / "words_by_movie" / "data.parquet"}' (FORMAT parquet);
    """)
    con.sql(f"""
        COPY (
            SELECT wc.* FROM wc JOIN movies USING (imdb_id)
            ORDER BY word, imdb_id
        ) TO '{out / "words_by_word" / "data.parquet"}' (FORMAT parquet);
    """)
    con.sql(f"""
        COPY (
            SELECT word, year, SUM(count)::BIGINT AS count,
                   COUNT(DISTINCT wc.imdb_id) AS movie_count
            FROM wc JOIN movies USING (imdb_id)
            GROUP BY word, year
            QUALIFY SUM(SUM(count)) OVER (PARTITION BY word) >= 20
            ORDER BY word, year
        ) TO '{out / "word_year.parquet"}' (FORMAT parquet);
    """)

    _write_json_hot_paths(con, out)
    _write_wordlists(out)
    _write_report(con, out)


def _write_json_hot_paths(con, out):
    stop = load_stopwords()
    corpus = dict(con.sql(
        "SELECT word, SUM(count) FROM wc JOIN movies USING (imdb_id) GROUP BY word"
    ).fetchall())

    movie_cols = ["imdb_id", "title", "year", "total_words", "unique_words",
                  "words_per_minute"]
    movies = con.sql(f"SELECT {', '.join(movie_cols)} FROM movies").fetchall()

    for row in movies:
        m = dict(zip(movie_cols, row))
        rows = con.sql(
            "SELECT word, count FROM wc WHERE imdb_id = ? ORDER BY count DESC",
            params=[m["imdb_id"]]).fetchall()
        counts = dict(rows)
        payload = {
            "imdb_id": m["imdb_id"],
            "title": m["title"],
            "year": m["year"],
            "stats": {
                "total_words": m["total_words"],
                "unique_words": m["unique_words"],
                "words_per_minute": m["words_per_minute"],
            },
            "top": [[wd, c] for wd, c in rows if wd not in stop][:200],
            "top_all": [[wd, c] for wd, c in rows][:50],
            "distinctive": [[wd, round(z, 2)]
                             for wd, z in log_odds(counts, corpus)[:50]],
        }
        (out / "json" / "movie" / f"{m['imdb_id']}.json").write_text(
            json.dumps(payload))

    board = con.sql("""
        SELECT word, SUM(count)::BIGINT AS count,
               COUNT(DISTINCT wc.imdb_id) AS movie_count
        FROM wc JOIN movies USING (imdb_id)
        GROUP BY word
        ORDER BY count DESC
    """).fetchall()
    (out / "json" / "leaderboard-default.json").write_text(json.dumps({
        "words": [[wd, c, mc] for wd, c, mc in board if wd not in stop][:1000],
        "stopwords": [[wd, c, mc] for wd, c, mc in board if wd in stop][:50],
    }))


def _write_wordlists(out):
    # Published alongside the dataset so the frontend can offer a stopword-hiding
    # toggle and compute swearing counts client-side without shipping its own
    # copies of these lists (which would drift from the pipeline's).
    (out / "json" / "wordlists.json").write_text(json.dumps({
        "stopwords": sorted(load_stopwords()),
        "profanity": sorted(load_profanity()),
    }))


def _write_report(con, out):
    n = lambda q: con.sql(q).fetchone()[0]
    curated_n = n("SELECT COUNT(*) FROM curated")
    matched_n = n("SELECT COUNT(*) FROM matched")
    counted_n = n("SELECT COUNT(*) FROM stats")
    enriched_n = n("SELECT COUNT(*) FROM tmdb WHERE imdb_id IS NOT NULL")
    final_n = n("SELECT COUNT(*) FROM movies")
    report = (
        "# Pipeline report\n\n"
        f"- curated (IMDb movies meeting the vote threshold): {curated_n}\n"
        f"- matched (subtitle file found in OpenSubtitles corpus): {matched_n}\n"
        f"- counted (word counts + stats computed): {counted_n}\n"
        f"- enriched (TMDB metadata found): {enriched_n}\n"
        f"- final (English-original movies published): {final_n}\n\n"
        "## Drop reasons\n\n"
        f"- curated → matched ({curated_n - matched_n} dropped): no usable "
        "subtitle file found in the OpenSubtitles corpus\n"
        f"- matched → counted ({matched_n - counted_n} dropped): subtitle "
        "file failed word counting (unparseable)\n"
        f"- counted → enriched ({counted_n - enriched_n} dropped): no TMDB "
        "match found for the IMDb id\n"
        f"- enriched → final ({enriched_n - final_n} dropped): TMDB "
        f"original_language was not '{config.LANG}'\n"
    )
    (out / "report.md").write_text(report)
