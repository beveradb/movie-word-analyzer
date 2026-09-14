from moviewords_pipeline import config
from moviewords_pipeline.cli import main


def test_config_paths_rooted_at_repo_data():
    assert config.RAW_DIR.name == "raw"
    assert config.WORK_DIR.name == "work"
    assert config.OUT_DIR.name == "out"
    assert config.RAW_DIR.parent == config.WORK_DIR.parent


def test_cli_lists_stages(capsys):
    try:
        main(["--help"])
    except SystemExit:
        pass
    out = capsys.readouterr().out
    for stage in ["download", "curate", "index", "count", "enrich", "derive"]:
        assert stage in out


def test_derive_accepts_corpus_flag(monkeypatch):
    calls = []
    import moviewords_pipeline.derive as derive_mod
    monkeypatch.setattr(derive_mod, "run",
                        lambda corpus="en": calls.append(corpus))
    main(["derive", "--corpus", "all"])
    main(["derive"])
    assert calls == ["all", "en"]
