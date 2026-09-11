from moviewords_pipeline.download import fetch


def test_fetch_skips_existing_file(tmp_path, monkeypatch):
    dest = tmp_path / "f.bin"
    dest.write_bytes(b"cached")

    def boom(*a, **k):
        raise AssertionError("network touched despite cache")

    monkeypatch.setattr("requests.get", boom)
    assert fetch("https://example.com/f.bin", dest) == dest
    assert dest.read_bytes() == b"cached"


def test_fetch_streams_then_renames(tmp_path, monkeypatch):
    class FakeResp:
        def raise_for_status(self): pass
        def iter_content(self, chunk_size): return iter([b"ab", b"cd"])
        def __enter__(self): return self
        def __exit__(self, *a): pass

    monkeypatch.setattr("requests.get", lambda *a, **k: FakeResp())
    dest = tmp_path / "f.bin"
    fetch("https://example.com/f.bin", dest)
    assert dest.read_bytes() == b"abcd"
    assert not dest.with_suffix(".part").exists()
