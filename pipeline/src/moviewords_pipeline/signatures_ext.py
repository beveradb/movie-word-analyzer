"""Extend published decade/genre signature JSON with aggregate stats and a
top-500 word list so the Compare page can show head-to-head rate ratios and
stat rows for non-movie entities without any WASM queries.
"""


def extend_signatures(con, sig: dict, kind: str, profanity: set[str],
                      top_n: int = 2000) -> dict:
    """Return `sig` with each entity gaining `swears_per_1k`, `unique_words`,
    and `top_words` ([word, count], count-ordered, top_n entries). Existing
    keys are preserved. Expects `movies` and `words_by_movie` views on `con`;
    entity membership mirrors derive.py (`(year // 10) * 10` for decades,
    unnested genres). top_n=2000 keeps the head-to-head 'absent word' floor
    low enough that mid-list words still register as standouts.
    """
    genre_join = ("JOIN (SELECT imdb_id, UNNEST(genres) AS genre FROM movies) g "
                  "USING (imdb_id)") if kind == "genres" else ""
    key_expr = "g.genre" if kind == "genres" else "(m.year // 10) * 10"

    out = {}
    for key, entry in sig.items():
        param = int(key) if kind == "decades" else key
        rows = con.sql(f"""
            SELECT w.word, SUM(w.count)::BIGINT AS c,
                   COUNT(DISTINCT w.imdb_id) AS films
            FROM words_by_movie w JOIN movies m USING (imdb_id) {genre_join}
            WHERE {key_expr} = ? GROUP BY w.word ORDER BY c DESC, w.word
        """, params=[param]).fetchall()
        total = sum(c for _, c, _ in rows)
        swears = sum(c for w, c, _ in rows if w in profanity)
        # top_words mirrors derive.py's ≥3-distinct-films signature floor so
        # one film's OCR junk or character name can't dominate head-to-head
        min_films = min(3, entry.get("movie_count", 3))
        out[key] = {
            **entry,
            "swears_per_1k": round(swears / total * 1000, 2) if total else 0.0,
            "unique_words": len(rows),
            "top_words": [[w, c] for w, c, films in rows if films >= min_films][:top_n],
        }
    return out
