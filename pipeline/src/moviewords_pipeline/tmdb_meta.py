"""Shape raw TMDB detail (+credits,+keywords) payloads into a flat analysis
record and the minimal per-film blurb sidecar. Pure functions — no network."""

CAST_LIMIT = 20


def _names(items, key="name"):
    return [i[key] for i in (items or []) if isinstance(i, dict) and i.get(key)]


def _crew_by_job(crew, jobs):
    return [c["name"] for c in (crew or [])
            if c.get("job") in jobs and c.get("name")]


def parse_record(raw: dict, imdb_id: str) -> dict:
    raw = raw or {}
    coll = raw.get("belongs_to_collection") or {}
    credits = raw.get("credits") or {}
    crew = credits.get("crew") or []
    cast = sorted((c for c in (credits.get("cast") or []) if c.get("name")),
                  key=lambda c: c.get("order") if c.get("order") is not None
                  else 1_000_000)[:CAST_LIMIT]
    kw = (raw.get("keywords") or {}).get("keywords") or []
    composers = _crew_by_job(crew, {"Original Music Composer", "Music", "Composer"})
    dops = _crew_by_job(crew, {"Director of Photography", "Cinematography"})
    return {
        "imdb_id": imdb_id,
        "tmdb_id": raw.get("id"),
        "original_title": raw.get("original_title") or "",
        "overview": raw.get("overview") or "",
        "tagline": raw.get("tagline") or "",
        "runtime": raw.get("runtime") or 0,
        "release_date": raw.get("release_date") or "",
        "status": raw.get("status") or "",
        "homepage": raw.get("homepage") or "",
        "adult": bool(raw.get("adult", False)),
        "collection_id": coll.get("id"),
        "collection_name": coll.get("name"),
        "budget": raw.get("budget") or 0,
        "revenue": raw.get("revenue") or 0,
        "tmdb_popularity": raw.get("popularity"),
        "tmdb_vote_average": raw.get("vote_average"),
        "tmdb_vote_count": raw.get("vote_count"),
        "tmdb_genres": _names(raw.get("genres")),
        "keywords": _names(kw),
        "spoken_languages": [s.get("english_name") or s.get("name")
                             for s in (raw.get("spoken_languages") or [])
                             if s.get("english_name") or s.get("name")],
        "production_countries": _names(raw.get("production_countries")),
        "production_companies": _names(raw.get("production_companies")),
        "director": _crew_by_job(crew, {"Director"}),
        "writers": _crew_by_job(crew, {"Writer", "Screenplay", "Story",
                                       "Novel", "Author"}),
        "composer": composers[0] if composers else None,
        "cinematographer": dops[0] if dops else None,
        "producers": _crew_by_job(crew, {"Producer"}),
        "cast": [{"name": c["name"], "character": c.get("character", ""),
                  "order": c.get("order", 0)} for c in cast],
    }


def blurb_of(record: dict) -> dict:
    out = {}
    if record.get("overview"):
        out["overview"] = record["overview"]
    if record.get("tagline"):
        out["tagline"] = record["tagline"]
    if record.get("runtime"):
        out["runtime"] = record["runtime"]
    return out
