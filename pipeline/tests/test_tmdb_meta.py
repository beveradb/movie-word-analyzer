from moviewords_pipeline.tmdb_meta import blurb_of, parse_record

RAW = {
    "id": 550,
    "original_title": "Fight Club",
    "overview": "A ticking-time-bomb insomniac...",
    "tagline": "Mischief. Mayhem. Soap.",
    "runtime": 139,
    "release_date": "1999-10-15",
    "status": "Released",
    "homepage": "",
    "adult": False,
    "belongs_to_collection": {"id": 9, "name": "Fight Club Collection"},
    "budget": 63000000,
    "revenue": 100853753,
    "popularity": 61.4,
    "vote_average": 8.4,
    "vote_count": 27000,
    "genres": [{"id": 18, "name": "Drama"}],
    "spoken_languages": [{"english_name": "English", "name": "English"}],
    "production_countries": [{"iso_3166_1": "US", "name": "United States of America"}],
    "production_companies": [{"id": 1, "name": "Fox 2000 Pictures"}],
    "keywords": {"keywords": [{"id": 1, "name": "dual identity"}, {"id": 2, "name": "nihilism"}]},
    "credits": {
        "cast": [
            {"name": "Edward Norton", "character": "The Narrator", "order": 0},
            {"name": "Brad Pitt", "character": "Tyler Durden", "order": 1},
        ],
        "crew": [
            {"name": "David Fincher", "job": "Director", "department": "Directing"},
            {"name": "Jim Uhls", "job": "Screenplay", "department": "Writing"},
            {"name": "Chuck Palahniuk", "job": "Novel", "department": "Writing"},
            {"name": "Dust Brothers", "job": "Original Music Composer", "department": "Sound"},
            {"name": "Jeff Cronenweth", "job": "Director of Photography", "department": "Camera"},
            {"name": "Art Linson", "job": "Producer", "department": "Production"},
        ],
    },
}


def test_parse_record_flattens_key_fields():
    r = parse_record(RAW, "tt0137523")
    assert r["imdb_id"] == "tt0137523"
    assert r["tmdb_id"] == 550
    assert r["overview"].startswith("A ticking")
    assert r["tagline"] == "Mischief. Mayhem. Soap."
    assert r["runtime"] == 139
    assert r["collection_id"] == 9
    assert r["collection_name"] == "Fight Club Collection"
    assert r["budget"] == 63000000
    assert r["tmdb_vote_average"] == 8.4
    assert r["tmdb_genres"] == ["Drama"]
    assert r["keywords"] == ["dual identity", "nihilism"]
    assert r["spoken_languages"] == ["English"]
    assert r["production_countries"] == ["United States of America"]
    assert r["production_companies"] == ["Fox 2000 Pictures"]
    assert r["director"] == ["David Fincher"]
    assert set(r["writers"]) == {"Jim Uhls", "Chuck Palahniuk"}
    assert r["composer"] == "Dust Brothers"
    assert r["cinematographer"] == "Jeff Cronenweth"
    assert r["producers"] == ["Art Linson"]
    assert r["cast"][0] == {"name": "Edward Norton", "character": "The Narrator", "order": 0}
    assert len(r["cast"]) == 2


def test_parse_record_tolerates_missing_sections():
    r = parse_record({"id": 1}, "tt0000001")
    assert r["imdb_id"] == "tt0000001"
    assert r["tmdb_id"] == 1
    assert r["overview"] == ""
    assert r["collection_id"] is None
    assert r["tmdb_genres"] == []
    assert r["keywords"] == []
    assert r["director"] == []
    assert r["composer"] is None
    assert r["cast"] == []


def test_blurb_of_keeps_only_present_fields():
    assert blurb_of(parse_record(RAW, "tt0137523")) == {
        "overview": "A ticking-time-bomb insomniac...",
        "tagline": "Mischief. Mayhem. Soap.",
        "runtime": 139,
    }


def test_blurb_of_omits_empty_and_zero():
    r = parse_record({"id": 1, "overview": "", "tagline": "", "runtime": 0}, "tt0000001")
    assert blurb_of(r) == {}


def test_parse_record_dedupes_crew_credited_under_two_matching_jobs():
    raw = {
        "id": 1,
        "credits": {
            "crew": [
                {"name": "Charlie Kaufman", "job": "Screenplay", "department": "Writing"},
                {"name": "Charlie Kaufman", "job": "Story", "department": "Writing"},
                {"name": "Susan Orlean", "job": "Novel", "department": "Writing"},
            ],
        },
    }
    r = parse_record(raw, "tt0000004")
    assert r["writers"] == ["Charlie Kaufman", "Susan Orlean"]


def test_parse_record_cast_with_null_order_sorts_last():
    raw = {
        "id": 1,
        "credits": {
            "cast": [
                {"name": "No Order", "character": "X", "order": None},
                {"name": "Edward Norton", "character": "The Narrator", "order": 0},
            ],
        },
    }
    r = parse_record(raw, "tt0000003")
    assert [c["name"] for c in r["cast"]] == ["Edward Norton", "No Order"]
