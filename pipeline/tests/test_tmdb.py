from moviewords_pipeline.tmdb import lookup


class FakeSession:
    def __init__(self, responses):
        self.responses = responses

    def get(self, url, **kw):
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
