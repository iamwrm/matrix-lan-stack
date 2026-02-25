# Matrix LAN Stack

Self-hosted Matrix chat for internal networks.

## Stack

- **Conduwuit** — lightweight Matrix homeserver (~50MB RAM)
- **Element Web** — browser-based chat UI

## Quick Start

```bash
docker compose up -d
```

- Element Web: `http://localhost:8080`
- Matrix API: `http://localhost:6167`

## Configuration

Set `SERVER_NAME` env var before first run:

```bash
SERVER_NAME=chat.mynetwork.local docker compose up -d
```

Update `element-config.json` to match your server name and base URL.
