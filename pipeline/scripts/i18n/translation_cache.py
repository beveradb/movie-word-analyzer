"""GCS-backed translation cache. Caches by sha256(english_string)[:16] per locale.
Shared across repos via one bucket."""
import hashlib, json
try:
    from google.cloud import storage
    from google.api_core.exceptions import NotFound
except ImportError:
    storage = None
    NotFound = Exception


def string_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


class TranslationCache:
    def __init__(self, bucket_name="nomadkaraoke-translation-cache", enabled=True):
        self._bucket_name = bucket_name
        self._enabled = enabled and storage is not None
        self._data: dict[str, dict[str, str]] = {}   # locale -> {hash16: translation}
        self._stats: dict[str, dict[str, int]] = {}
        self._client = None

    def _get_client(self):
        if self._client is None:
            self._client = storage.Client()
        return self._client

    def download(self, locale: str) -> None:
        if not self._enabled: return
        try:
            blob = self._get_client().bucket(self._bucket_name).blob(f"cache/{locale}.json")
            self._data.setdefault(locale, {}).update(json.loads(blob.download_as_text()))
        except NotFound:
            pass
        except Exception as e:
            print(f"  Warning: Could not download cache for {locale}: {e}")

    def upload(self, locale: str) -> None:
        if not self._enabled or locale not in self._data: return
        try:
            blob = self._get_client().bucket(self._bucket_name).blob(f"cache/{locale}.json")
            blob.upload_from_string(
                json.dumps(self._data[locale], ensure_ascii=False, sort_keys=True),
                content_type="application/json")
        except Exception as e:
            print(f"  Warning: Could not upload cache for {locale}: {e}")

    def lookup(self, english_text: str, locale: str) -> str | None:
        h = string_hash(english_text)
        result = self._data.get(locale, {}).get(h)
        stats = self._stats.setdefault(locale, {"hits": 0, "misses": 0})
        stats["hits" if result is not None else "misses"] += 1
        return result

    def store(self, english_text: str, locale: str, translation: str) -> None:
        self._data.setdefault(locale, {})[string_hash(english_text)] = translation

    def stats(self, locale: str) -> dict[str, int]:
        return self._stats.get(locale, {"hits": 0, "misses": 0})
