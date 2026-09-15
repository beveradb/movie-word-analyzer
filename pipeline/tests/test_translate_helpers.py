import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "scripts" / "i18n"))
import translate as tr

def test_compute_changed_keys():
    cur = {"a": "x", "b": "new"}
    snap = {"a": "x"}
    assert tr.compute_changed_keys(cur, snap) == {"b"}

def test_merge_deep_splices():
    base = {"a": {"x": "1", "y": "2"}}
    overlay = {"a": {"y": "TWO"}}
    assert tr.merge_deep(base, overlay) == {"a": {"x": "1", "y": "TWO"}}

def test_load_targets_reads_locales_json():
    targets = tr.load_targets()
    assert "en" not in targets
    assert targets["de"] == "German"
    assert len(targets) == 32

def test_glossary_all_marker_expands():
    g = {"terms": {"IMDb": {"_all": None}}}
    lines = tr.build_glossary_instructions(g, "es")
    assert 'IMDb' in lines and 'DO NOT translate' in lines


# --- should_write_snapshot: only refresh the shared snapshot on a
# fully-successful, full-coverage run (Finding 1) ---------------------------

def test_should_write_snapshot_full_coverage_success():
    assert tr.should_write_snapshot(0, False, ["es", "de"], {"es", "de"}) is True

def test_should_write_snapshot_subset_run_is_false():
    # Only "es" ran, but the full target set also includes "de" — a subset
    # run must NOT advance the shared snapshot, or "de" silently stops
    # receiving delta translations for keys edited during this run.
    assert tr.should_write_snapshot(0, False, ["es"], {"es", "de"}) is False

def test_should_write_snapshot_any_failed_is_false():
    assert tr.should_write_snapshot(1, False, ["es", "de"], {"es", "de"}) is False

def test_should_write_snapshot_dry_run_is_false():
    assert tr.should_write_snapshot(0, True, ["es", "de"], {"es", "de"}) is False


# --- resolve_mode: existing-missing must never fall into the delta-subset
# path, even when a snapshot exists (Finding 2) ------------------------------

def test_resolve_mode_full_flag_forces_full():
    assert tr.resolve_mode(True, True, True) == "full"

def test_resolve_mode_neither_snapshot_nor_existing_is_full():
    assert tr.resolve_mode(False, False, False) == "full"

def test_resolve_mode_existing_missing_with_snapshot_is_full_not_delta():
    # This is the regression: locale file missing but .en-snapshot.json
    # exists should force a full retranslation, never the delta-subset path
    # (which would write only the changed keys, producing a near-empty file).
    assert tr.resolve_mode(False, True, False) == "full"

def test_resolve_mode_both_exist_is_delta():
    assert tr.resolve_mode(False, True, True) == "delta"

def test_resolve_mode_existing_exists_no_snapshot_is_missing():
    assert tr.resolve_mode(False, False, True) == "missing"
