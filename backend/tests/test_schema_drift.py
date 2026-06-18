"""
Detects drift between Pydantic models and the live Postgres schema.

Fields in the model but missing from the DB table → test fails.
Fields in the DB but absent from the model → warning (intentional extras are fine).

Skipped automatically if DATABASE_URL is not reachable.
"""
import os
import sys
import warnings

import pytest

sys.path.insert(0, ".")

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://polydelve:polydelve@localhost:5432/polydelve_dev"
)

# (model_class, table_name, computed_fields_to_exclude)
# computed_fields_to_exclude: fields on the model that have no DB column
# (derived at query time, not stored)
MAPPINGS: list[tuple[type, str, set[str]]] = []


def _build_mappings() -> list[tuple[type, str, set[str]]]:
    from models.models import (
        Bet,
        Company,
        ContractDetail,
        EpssHistoryRow,
        MalAdvisoryRow,
        Market,
        PackageRow,
        User,
    )

    return [
        (User, "users", set()),
        (PackageRow, "packages", set()),
        (EpssHistoryRow, "epss_history", set()),
        (MalAdvisoryRow, "mal_advisories", set()),
        (Bet, "bets", set()),
        (Market, "markets", set()),
        (Company, "companies", set()),
        # ContractDetail: computed fields + fields intentionally absent from API response
        # user_id: auth context provides it, not returned to client
        # package_ecosystem: stored as `ecosystem` in API (ContractBase convention)
        (
            ContractDetail,
            "contracts",
            {"current_sell_value", "multiplier", "description", "ecosystem"},
        ),
    ]


def _pg_columns(table: str) -> set[str]:
    import psycopg2

    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = %s
                """,
                (table,),
            )
            return {row[0] for row in cur.fetchall()}
    finally:
        conn.close()


def _reachable() -> bool:
    try:
        import psycopg2

        conn = psycopg2.connect(DATABASE_URL, connect_timeout=2)
        conn.close()
        return True
    except Exception:
        return False


requires_postgres = pytest.mark.skipif(
    not _reachable(), reason="Postgres not reachable — skipping schema drift check"
)


@requires_postgres
@pytest.mark.parametrize("model,table,excluded", _build_mappings())
def test_no_model_fields_missing_from_db(
    model: type, table: str, excluded: set[str]
) -> None:
    db_cols = _pg_columns(table)

    if not db_cols:
        pytest.skip(f"Table '{table}' not found in DB — run migrations first")

    model_fields = set(model.model_fields.keys()) - excluded
    missing_from_db = model_fields - db_cols
    extra_in_db = db_cols - model_fields

    if extra_in_db:
        warnings.warn(
            f"{model.__name__} / {table}: DB has columns not in model: {sorted(extra_in_db)}",
            stacklevel=2,
        )

    assert not missing_from_db, (
        f"{model.__name__} / {table}: model fields missing from DB: {sorted(missing_from_db)}"
    )
