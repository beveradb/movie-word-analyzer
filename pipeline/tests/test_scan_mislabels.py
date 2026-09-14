import duckdb

from scripts_path import add_scripts_to_path  # noqa: F401


def test_cosine_identical_and_disjoint():
    from scan_mislabels import cosine
    a = {"frodo": 10, "ring": 5}
    assert abs(cosine(a, a) - 1.0) < 1e-9
    assert cosine(a, {"horse": 3}) == 0.0
    assert cosine({}, a) == 0.0


def test_find_suspect_pairs_flags_shared_rare_words():
    from scan_mislabels import find_suspect_pairs
    con = duckdb.connect()
    con.sql("CREATE TABLE wc (imdb_id VARCHAR, word VARCHAR, count INT)")
    # tt1/tt2 share 10 rare words; tt3 is unrelated; 'the' is common to all
    rows = []
    for i, mid in enumerate(["tt1", "tt2", "tt3"]):
        rows.append((mid, "the", 1000))
        for j in range(10):
            word = f"rare{j}" if mid in ("tt1", "tt2") else f"other{j}"
            rows.append((mid, word, 50))
    con.executemany("INSERT INTO wc VALUES (?, ?, ?)", rows)
    pairs = find_suspect_pairs(con, min_shared=8)
    assert [(a, b) for a, b, _ in pairs] == [("tt1", "tt2")]


def test_pick_victim_prefers_low_directory_consensus():
    from scan_mislabels import pick_victim
    assert pick_victim(0.95, 0.10) == 1   # member B's dir disagrees with its chosen file
    assert pick_victim(0.10, 0.95) == 0
    assert pick_victim(0.95, 0.90) is None  # both self-consistent - manual review
    assert pick_victim(0.2, 0.3) is None    # both messy - manual review
