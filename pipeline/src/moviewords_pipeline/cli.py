import argparse

STAGES = ["download", "curate", "index", "count", "enrich", "derive"]


def main(argv=None):
    parser = argparse.ArgumentParser(prog="moviewords-pipeline")
    sub = parser.add_subparsers(dest="stage", required=True)
    for stage in STAGES:
        p = sub.add_parser(stage)
        if stage == "derive":
            p.add_argument("--corpus", default="en", choices=["en", "all"])
    args = parser.parse_args(argv)
    # stage runners are registered as tasks land; import lazily
    from importlib import import_module
    mod = import_module(f"moviewords_pipeline.{_module_for(args.stage)}")
    if args.stage == "derive":
        mod.run(corpus=args.corpus)
    else:
        mod.run()


def _module_for(stage):
    return {"download": "download", "curate": "curate", "index": "corpus_index",
            "count": "counts", "enrich": "tmdb", "derive": "derive"}[stage]


if __name__ == "__main__":
    main()
