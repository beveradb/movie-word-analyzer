import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "scripts" / "i18n"))
from translation_cache import TranslationCache, string_hash

def test_hash_stable_and_16_chars():
    assert string_hash("Hello") == string_hash("Hello")
    assert len(string_hash("Hello")) == 16

def test_store_then_lookup_hits(monkeypatch):
    c = TranslationCache(enabled=False)  # in-memory only
    assert c.lookup("Hello", "es") is None
    c.store("Hello", "es", "Hola")
    assert c.lookup("Hello", "es") == "Hola"
    s = c.stats("es")
    assert s["hits"] == 1 and s["misses"] == 1

def test_locale_isolated():
    c = TranslationCache(enabled=False)
    c.store("Hello", "es", "Hola")
    assert c.lookup("Hello", "de") is None
