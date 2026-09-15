import sys, pathlib, json
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "scripts" / "i18n"))
import importlib.util
spec = importlib.util.spec_from_file_location(
    "validate_translations",
    pathlib.Path(__file__).parent.parent / "scripts" / "i18n" / "validate-translations.py",
)
vt = importlib.util.module_from_spec(spec); spec.loader.exec_module(vt)

def test_flatten_and_placeholders():
    assert vt.flatten_keys({"a": {"b": "x"}}) == {"a.b": "x"}
    assert vt.extract_placeholders("Hi {name} {count}") == {"name", "count"}

def test_validate_detects_missing_key_and_placeholder(tmp_path):
    en_flat = vt.flatten_keys({"a": "Hi {name}", "b": "Bye"})
    loc = tmp_path / "es.json"
    loc.write_text(json.dumps({"a": "Hola"}), encoding="utf-8")  # missing b, dropped {name}
    issues = vt.validate_locale(en_flat, loc)
    joined = " ".join(issues)
    assert "Missing key: b" in joined
    assert "name" in joined  # missing placeholder reported
