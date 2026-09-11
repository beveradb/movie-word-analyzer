import json

import pyarrow as pa
import pyarrow.parquet as pq

from moviewords_pipeline import config, tmdb
from moviewords_pipeline.tmdb import lookup


class FakeSession:
    def __init__(self, responses):
        self.responses = responses
        self.urls_requested = []
        self.headers = {}

    def get(self, url, **kw):
        self.urls_requested.append(url)

        class R:
            def __init__(self, payload): self.payload = payload
            def raise_for_status(self): pass
            def json(self): return self.payload
        for frag, payload in self.responses.items():
            if frag in url:
                return R(payload)
        raise AssertionError(f"unexpected url {url}")


def test_lookup_happy_path():
    session = FakeSession({
        "/find/tt0110912": {"movie_results": [{"id": 680}]},
        "/movie/680": {"production_countries": [{"iso_3166_1": "US"}],
                        "original_language": "en"},
    })
    assert lookup("tt0110912", session) == {
        "imdb_id": "tt0110912", "countries": ["US"], "original_language": "en"}


def test_lookup_no_match_returns_none():
    session = FakeSession({"/find/tt0000000": {"movie_results": []}})
    assert lookup("tt0000000", session) is None


def test_lookup_malformed_movie_result_missing_id_returns_none():
    # A movie_results entry with no "id" key is malformed; treat as no-match
    # rather than raising KeyError and killing the whole run.
    session = FakeSession({"/find/tt0000001": {"movie_results": [{}]}})
    assert lookup("tt0000001", session) is None


def test_lookup_skips_country_entries_missing_iso_code():
    session = FakeSession({
        "/find/tt0000002": {"movie_results": [{"id": 42}]},
        "/movie/42": {"production_countries": [{"iso_3166_1": "US"}, {"name": "Nowhere"}],
                       "original_language": "en"},
    })
    assert lookup("tt0000002", session) == {
        "imdb_id": "tt0000002", "countries": ["US"], "original_language": "en"}


def test_run_skips_cached_ids_fetches_new_and_caches_null_for_no_match(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "WORK_DIR", tmp_path)
    monkeypatch.setenv("TMDB_API_TOKEN", "fake-token")

    table = pa.table({"imdb_id": pa.array(["tt_cached", "tt_new"], type=pa.string())})
    pq.write_table(table, str(tmp_path / "corpus_index.parquet"))

    cache_dir = tmp_path / "tmdb"
    cache_dir.mkdir(parents=True, exist_ok=True)
    (cache_dir / "tt_cached.json").write_text(json.dumps({
        "imdb_id": "tt_cached", "countries": ["GB"], "original_language": "en"}))

    fake_session = FakeSession({
        "/find/tt_new": {"movie_results": []},
    })

    monkeypatch.setattr("requests.Session", lambda: fake_session)

    tmdb.run()

    # pre-cached id was never re-fetched
    assert not any("tt_cached" in url for url in fake_session.urls_requested)

    # new id was fetched and a null record cached for the no-match
    new_dest = cache_dir / "tt_new.json"
    assert new_dest.exists()
    assert json.loads(new_dest.read_text()) is None

    # pre-cached record is untouched
    assert json.loads((cache_dir / "tt_cached.json").read_text()) == {
        "imdb_id": "tt_cached", "countries": ["GB"], "original_language": "en"}


def test_run_skips_non_dict_payload_and_continues_processing_other_ids(tmp_path, monkeypatch):
    # A malformed (non-dict) TMDB JSON payload for one movie must not crash the
    # whole run; that id is skipped (no cache written) and other ids still process.
    monkeypatch.setattr(config, "WORK_DIR", tmp_path)
    monkeypatch.setenv("TMDB_API_TOKEN", "fake-token")

    table = pa.table({"imdb_id": pa.array(["tt_bad", "tt_good"], type=pa.string())})
    pq.write_table(table, str(tmp_path / "corpus_index.parquet"))

    cache_dir = tmp_path / "tmdb"

    class BadPayloadSession(FakeSession):
        def get(self, url, **kw):
            if "/find/tt_bad" in url:
                self.urls_requested.append(url)

                class R:
                    def raise_for_status(self): pass
                    def json(self): return ["not", "a", "dict"]
                return R()
            return super().get(url, **kw)

    fake_session = BadPayloadSession({
        "/find/tt_good": {"movie_results": []},
    })

    monkeypatch.setattr("requests.Session", lambda: fake_session)

    tmdb.run()

    assert not (cache_dir / "tt_bad.json").exists()
    assert (cache_dir / "tt_good.json").exists()
    assert json.loads((cache_dir / "tt_good.json").read_text()) is None


def test_make_session_v3_key_fallback(monkeypatch):
    from moviewords_pipeline.tmdb import make_session
    monkeypatch.delenv("TMDB_API_TOKEN", raising=False)
    monkeypatch.setenv("TMDB_API_KEY", "v3key")
    s = make_session()
    assert s.params == {"api_key": "v3key"}
    assert "Authorization" not in s.headers


def test_make_session_bearer_preferred(monkeypatch):
    from moviewords_pipeline.tmdb import make_session
    monkeypatch.setenv("TMDB_API_TOKEN", "v4token")
    monkeypatch.setenv("TMDB_API_KEY", "v3key")
    s = make_session()
    assert s.headers["Authorization"] == "Bearer v4token"
