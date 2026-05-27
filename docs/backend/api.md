# API Routes

Base URL: `http://localhost:8000`

## News

### `GET /news`
Returns recent security news articles ordered by date.

| Param | Default | Description |
|-------|---------|-------------|
| `limit` | `20` | Max articles to return |

```json
[
  {
    "id": "uuid",
    "title": "Critical vuln in popular npm package",
    "summary": "...",
    "url": "https://...",
    "source": "The Hacker News",
    "published_at": "2026-05-26T10:00:00",
    "tags": ["Cybersecurity", "Open Source"],
    "company_id": "uuid"
  }
]
```

## Markets

### `GET /markets`
Returns all markets with company info.

| Param | Default | Description |
|-------|---------|-------------|
| `status` | `open` | Filter by status: `open` \| `closed` \| `resolved` |

### `GET /markets/{market_id}`
Single market by ID.

### `POST /markets`
Create a new prediction market.

```json
{
  "company_id": "uuid",
  "title": "Will lodash have a CVE in Q3 2026?",
  "description": "Resolves YES if OSV records a new CVE...",
  "duration_days": 30,
  "price": 100
}
```

## Companies

### `GET /companies`
All companies with grade and logo.

## Bets

### `POST /bets`
Place a bet on an open market.

```json
{
  "user_id": "uuid",
  "market_id": "uuid"
}
```

Deducts `price` Schmeckles from user balance.

## Users

### `GET /users/{user_id}`
Get user balance and info.

### `POST /users`
Create a new user (starts with 1000 Schmeckles).
