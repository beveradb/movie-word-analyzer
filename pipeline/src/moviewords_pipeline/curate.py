import duckdb

from . import config


def build_curated(basics_path, ratings_path, min_votes):
    con = duckdb.connect()
    return con.sql(f"""
        SELECT b.tconst AS imdb_id,
               b.primaryTitle AS title,
               CAST(b.startYear AS INT) AS year,
               TRY_CAST(b.runtimeMinutes AS INT) AS runtime_minutes,
               string_split(b.genres, ',') AS genres,
               CAST(r.averageRating AS DOUBLE) AS rating,
               CAST(r.numVotes AS INT) AS votes
        FROM read_csv('{basics_path}', delim='\t', header=true,
                      quote='', nullstr='\\N', all_varchar=true) b
        JOIN read_csv('{ratings_path}', delim='\t', header=true,
                      quote='', nullstr='\\N', all_varchar=true) r
          ON b.tconst = r.tconst
        WHERE b.titleType = 'movie'
          AND CAST(r.numVotes AS INT) >= {int(min_votes)}
          AND b.startYear IS NOT NULL
    """)


def run():
    config.WORK_DIR.mkdir(parents=True, exist_ok=True)
    rel = build_curated(config.RAW_DIR / "title.basics.tsv.gz",
                        config.RAW_DIR / "title.ratings.tsv.gz",
                        config.MIN_VOTES)
    rel.write_parquet(str(config.WORK_DIR / "curated.parquet"))
