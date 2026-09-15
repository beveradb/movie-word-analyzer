from scripts_path import add_scripts_to_path  # noqa: F401


def test_option_codes_reads_manifest_order():
    from bake_all_languages import option_codes
    manifest = [{"code": "fr", "films": 3696}, {"code": "zh", "films": 1743}]
    assert option_codes(manifest) == ["fr", "zh"]
