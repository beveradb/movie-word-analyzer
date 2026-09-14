"""Pre-baked leaderboard builders. Each function reads duckdb views/tables
(`movies`, `words_by_movie`, `word_year`) and returns JSON-ready structures for
the frontend's leaderboard tabs — computed once at publish time, never at
request time.
"""

import math
from collections import defaultdict

DECADES = list(range(1930, 2030, 10))


def risers_fallers(con, min_total=5000, min_decades=6, top_n=50, quality=None):
    """Words whose per-million rate changed most between early cinema
    (1930s–40s) and now (2010s–20s). Rates are computed against per-decade
    totals so noisier early decades don't skew; +0.1/M smoothing keeps
    born/died words finite. `quality` is an optional word predicate the
    caller uses to drop OCR junk ('rm') that survives the count floors.
    """
    rows = con.sql("""
        SELECT (year // 10) * 10 AS decade, word, SUM(count)::BIGINT AS c
        FROM word_year WHERE year BETWEEN 1930 AND 2029
        GROUP BY decade, word
    """).fetchall()
    totals: dict[int, int] = defaultdict(int)
    per_word: dict[str, dict[int, int]] = defaultdict(dict)
    for decade, word, c in rows:
        totals[decade] += c
        per_word[word][decade] = c
    decades = [d for d in DECADES if totals.get(d)]

    scored = []
    for word, dc in per_word.items():
        if sum(dc.values()) < min_total or len(dc) < min_decades:
            continue
        if quality is not None and not quality(word):
            continue
        rates = {d: dc.get(d, 0) / totals[d] * 1e6 for d in decades}
        early = (rates.get(1930, 0.0) + rates.get(1940, 0.0)) / 2
        late = (rates.get(2010, 0.0) + rates.get(2020, 0.0)) / 2
        scored.append({
            "word": word,
            "score": round(math.log2((late + 0.1) / (early + 0.1)), 2),
            "rates": [[d, round(rates[d], 1)] for d in decades],
        })
    scored.sort(key=lambda r: -r["score"])
    return {
        "decades": decades,
        "risers": [r for r in scored[:top_n] if r["score"] > 0],
        "fallers": [r for r in sorted(scored[-top_n:], key=lambda r: r["score"])
                    if r["score"] < 0],
    }


def film_superlatives(con, profanity, min_words=5000, top_n=20, min_votes=1000):
    """Chattiest (words/min), biggest vocabulary, sweariest (profanity/1k),
    most repetitive (lowest unique/total). Chattiest is guarded against bad
    runtime metadata (needs a feature-length runtime and a sane rate).
    `min_votes` keeps one obscure film with a rough subtitle from topping a
    corpus-wide board now that the corpus floor is 300 votes.
    """
    def films(sql, params=()):
        return [{"id": r[0], "title": r[1], "year": r[2], "value": r[3]}
                for r in con.sql(sql, params=list(params)).fetchall()]

    out = {
        "chattiest": films(f"""
            SELECT imdb_id, title, year, ROUND(words_per_minute, 1)
            FROM movies
            WHERE words_per_minute IS NOT NULL AND runtime_minutes >= 60
              AND total_words >= {min_words} AND words_per_minute < 250
              AND votes >= {min_votes}
            ORDER BY words_per_minute DESC LIMIT {top_n}"""),
        "vocabulary": films(f"""
            SELECT imdb_id, title, year, unique_words FROM movies
            WHERE votes >= {min_votes}
            ORDER BY unique_words DESC LIMIT {top_n}"""),
        "repetitive": films(f"""
            SELECT imdb_id, title, year,
                   ROUND(unique_words / total_words::DOUBLE * 100, 1)
            FROM movies WHERE total_words >= {min_words} AND votes >= {min_votes}
            ORDER BY unique_words / total_words::DOUBLE ASC LIMIT {top_n}"""),
    }
    if profanity:
        placeholders = ", ".join("?" for _ in profanity)
        out["sweariest"] = films(f"""
            SELECT m.imdb_id, m.title, m.year,
                   ROUND(SUM(w.count) / m.total_words::DOUBLE * 1000, 1) AS per1k
            FROM words_by_movie w JOIN movies m USING (imdb_id)
            WHERE w.word IN ({placeholders}) AND m.total_words >= {min_words}
              AND m.votes >= {min_votes}
            GROUP BY m.imdb_id, m.title, m.year, m.total_words
            ORDER BY per1k DESC LIMIT {top_n}""", sorted(profanity))
    else:
        out["sweariest"] = []
    return out


def one_film_wonders(con, min_top=100, min_films=5, dominance=2.0, top_n=50):
    """Words one film says at least `dominance`× more than the rest of cinema
    combined — character names, invented words, catchphrases. Junk guards:
    presence in ≥`min_films` films (subtitle/OCR artifacts like 'apos' cluster
    in one or two releases) and a real-word shape (≥4 chars incl. a vowel,
    killing 'yy'/'rm'-style OCR shrapnel).
    """
    rows = con.sql(f"""
        WITH t AS (
            SELECT word, SUM(count)::BIGINT AS total, MAX(count)::BIGINT AS top,
                   COUNT(DISTINCT imdb_id) AS films
            FROM words_by_movie GROUP BY word
        )
        SELECT t.word, w.imdb_id, m.title, m.year, w.count::BIGINT, t.total
        FROM t
        JOIN words_by_movie w ON w.word = t.word AND w.count = t.top
        JOIN movies m USING (imdb_id)
        WHERE t.top >= {min_top} AND t.films >= {min_films}
          AND t.top >= (t.total - t.top) * {dominance}
          AND LENGTH(t.word) >= 4 AND regexp_matches(t.word, '[aeiouy]')
        QUALIFY ROW_NUMBER() OVER (PARTITION BY t.word ORDER BY w.imdb_id) = 1
        ORDER BY w.count DESC LIMIT {top_n}
    """).fetchall()
    return [{"word": w, "id": i, "title": t, "year": y, "count": c,
             "total": total, "share": round(c / total, 2)}
            for w, i, t, y, c, total in rows]


def ubiquity(con, top_n=50, exclude=frozenset()):
    """Words present in the highest share of films — the words every movie
    says. Callers exclude stopwords, otherwise the list is just 'the/a/and'.
    """
    n_films = con.sql("SELECT COUNT(*) FROM movies").fetchone()[0]
    rows = con.sql(f"""
        SELECT word, COUNT(DISTINCT imdb_id) AS films
        FROM words_by_movie GROUP BY word
        ORDER BY films DESC, word LIMIT {top_n + len(exclude)}
    """).fetchall()
    return [{"word": w, "films": f, "share": round(f / n_films, 4)}
            for w, f in rows if w not in exclude][:top_n]
