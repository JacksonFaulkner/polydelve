import duckdb

# Switch to "md:action_odds" for MotherDuck
DB_PATH = "action_odds.duckdb"


def get_conn() -> duckdb.DuckDBPyConnection:
    return duckdb.connect(DB_PATH)


def init_db() -> None:
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS companies (
                id      VARCHAR PRIMARY KEY,
                title   VARCHAR NOT NULL,
                logo    VARCHAR,
                grade   VARCHAR NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS markets (
                id          VARCHAR PRIMARY KEY,
                company_id  VARCHAR NOT NULL REFERENCES companies(id),
                title       VARCHAR NOT NULL,
                description VARCHAR NOT NULL,
                grade       VARCHAR NOT NULL,
                price       INTEGER NOT NULL,
                payout      INTEGER NOT NULL,
                end_date    TIMESTAMP NOT NULL,
                status      VARCHAR NOT NULL DEFAULT 'open'
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id         VARCHAR PRIMARY KEY,
                username   VARCHAR NOT NULL,
                schmeckles INTEGER NOT NULL DEFAULT 1000
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS bets (
                id         VARCHAR PRIMARY KEY,
                user_id    VARCHAR NOT NULL REFERENCES users(id),
                market_id  VARCHAR NOT NULL REFERENCES markets(id),
                placed_at  TIMESTAMP NOT NULL
            )
        """)


COMPANIES = [
    # Grade A — massive security orgs, slow to adopt unvetted deps
    {"id": "google", "title": "Google", "logo": "google.svg", "grade": "A"},
    {"id": "microsoft", "title": "Microsoft", "logo": "microsoft.svg", "grade": "A"},
    # Grade B — strong security, but broader open-source surface
    {"id": "stripe", "title": "Stripe", "logo": "stripe.svg", "grade": "B"},
    {"id": "cloudflare", "title": "Cloudflare", "logo": "cloudflare.svg", "grade": "B"},
    {"id": "github", "title": "GitHub", "logo": "github.svg", "grade": "B"},
    # Grade C — medium exposure, real third-party integration risk
    {"id": "shopify", "title": "Shopify", "logo": "shopify.svg", "grade": "C"},
    {"id": "twilio", "title": "Twilio", "logo": "twilio.svg", "grade": "C"},
    {"id": "okta", "title": "Okta", "logo": "okta.svg", "grade": "C"},
    # Grade D — high npm/pip dependency count, fast-moving teams
    {"id": "draftkings", "title": "DraftKings", "logo": "draftkings.svg", "grade": "D"},
    {"id": "robinhood", "title": "Robinhood", "logo": "robinhood.svg", "grade": "D"},
    {"id": "coinbase", "title": "Coinbase", "logo": "coinbase.svg", "grade": "D"},
    # Grade F — open source everything, huge transitive dep surface
    {"id": "vercel", "title": "Vercel", "logo": "vercel.svg", "grade": "F"},
    {
        "id": "huggingface",
        "title": "Hugging Face",
        "logo": "huggingface.svg",
        "grade": "F",
    },
    {"id": "replit", "title": "Replit", "logo": "replit.svg", "grade": "F"},
]


def seed_companies() -> None:
    with get_conn() as conn:
        existing = {r[0] for r in conn.execute("SELECT id FROM companies").fetchall()}
        to_insert = [c for c in COMPANIES if c["id"] not in existing]
        if to_insert:
            conn.executemany(
                "INSERT INTO companies (id, title, logo, grade) VALUES (?, ?, ?, ?)",
                [(c["id"], c["title"], c["logo"], c["grade"]) for c in to_insert],
            )
            print(f"Seeded {len(to_insert)} companies.")
        else:
            print("Companies already seeded.")


if __name__ == "__main__":
    init_db()
    seed_companies()
