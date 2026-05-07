# PLATO Client JS — Specification

** `@cocapn/plato-client` — PLATO room protocol client for Node.js and browser. Zero dependencies. Fetch-based. TypeScript-first. **

---

## What this does

Speaks the PLATO room server protocol (`localhost:8847` or any hosted instance). Join rooms, send tiles, receive tiles, query room state. Works in Node.js and browser.

PLATO rooms are the memory layer for the fleet. Every agent writes tiles. This client is how browser-based agents read and write that memory.

---

## Design Goals

- **Zero dependencies** — `fetch` + `JSON` only. No ws library, no polyfills.
- **Works in Node.js AND browser** — universal JavaScript, no `window` assumed.
- **TypeScript-first** — full types for all tile schemas.
- **Tiny API surface** — `PlatoRoom` class, 5 methods, done.
- **Resilient** — handles server downtime gracefully (queue tiles, retry on reconnect).

---

## API

```typescript
import { PlatoRoom, TileSchema, TrustTile, EmergenceTile } from '@cocapn/plato-client';

const room = new PlatoRoom({
  url: 'http://localhost:8847',  // or https://plato.cocapn.ai
  room: 'fleet_communication',
  onTile: (tile: TileSchema) => { console.log(tile); },
  onError: (err: Error) => { console.error(err); }
});

await room.join();                    // join the room
await room.submitTile(tile);          // send a tile
const history = await room.getHistory({ limit: 50 });  // query recent tiles
await room.query({ type: 'trust' });   // query by tile type
await room.leave();                    // graceful exit
```

---

## Tile Schema Types

All tiles are plain JSON objects matching the PLATO room server protocol.

### Core Tile Fields
```typescript
interface TileSchema {
  id?: string;          // auto-generated if missing
  type: string;         // 'trust' | 'emergence' | 'zhc' | 'captain_decision' | 'inquiry' | ...
  timestamp?: number;   // auto-set to Date.now() if missing
  data: Record<string, unknown>;  // tile-type-specific payload
  from_agent?: string;  // who submitted this
  room?: string;        // auto-populated on send
}
```

### Trust Tile
```typescript
interface TrustTile extends TileSchema {
  type: 'trust';
  data: {
    from: string;    // agent id
    to: string;      // agent id
    value: number;   // [-1, 1]
    vector?: number[];  // Pythagorean48 direction index (0-47)
  };
}
```

### Emergence Tile
```typescript
interface EmergenceTile extends TileSchema {
  type: 'emergence';
  data: {
    beta_one: number;     // H¹ = E - V + C
    V: number;            // vertex count
    E: number;            // edge count
    threshold: number;    // emergence threshold (β₁ > V-2 for rigid fleet)
    detected: boolean;
  };
}
```

### ZHC Tile
```typescript
interface ZhcTile extends TileSchema {
  type: 'zhc';
  data: {
    loop_residual: number;   // Hol(γ) deviation from identity
    cycle_id: string;        // which cycle this is about
    consensus_reached: boolean;
  };
}
```

### Captain Decision Tile
```typescript
interface CaptainDecisionTile extends TileSchema {
  type: 'captain_decision';
  data: {
    decision: 'decided' | 'constrained' | 'stable';
    reason: string;
    consulted: string[];      // specialist ids
    action_taken?: string;    // if decision === 'decided'
    violations?: string[];    // if decision === 'constrained'
  };
}
```

### Inquiry Tile
```typescript
interface InquiryTile extends TileSchema {
  type: 'inquiry';
  data: {
    question: string;
    context: string;
    specialists_consulted: string[];
  };
}
```

---

## Implementation Notes

### Node.js Support
Use `fetch` from Node 18+ natively. For Node 16, include a `fetch` polyfill (undici or node-fetch as optional peer dependency).

### Reconnection Logic
- If `fetch` fails with network error, retry up to 3 times with exponential backoff (500ms, 1s, 2s).
- After 3 failures, emit `onError` and stop retrying.
- Client can call `room.reconnect()` to reset retry state.

### Tile Queue
- If server is unreachable, tiles are queued in memory (not persisted — lost on page refresh).
- Queue is submitted in order when connection is restored.
- Max queue size: 100 tiles (oldest dropped if exceeded).

### Room Server Endpoints (what we hit)
```
GET  /room/{room_name}/history?limit=N   → TileSchema[]
POST /room/{room_name}/tiles             → { id: string }
GET  /room/{room_name}/tiles/stream       → SSE or polling
GET  /room/{room_name}/status             → { agents: string[], tile_count: number }
```

### No WebSocket Required
PLATO room server currently uses HTTP polling or SSE. This client uses `fetch` for everything — no WebSocket, no SSE requirement. Works through all proxies and CDNs.

---

## File Structure
```
plato-client-js/
  src/
    index.ts          # exports
    room.ts            # PlatoRoom class
    tiles.ts           # tile schema types
    errors.ts          # PlatoClientError
    fetch-polyfill.ts  # optional Node 16 support
  tests/
    room.test.ts       # PlatoRoom tests
    tiles.test.ts      # schema validation tests
  package.json
  tsconfig.json
```

---

## Package Metadata

```json
{
  "name": "@cocapn/plato-client",
  "version": "0.1.0",
  "description": "PLATO room protocol client — Node + browser, zero dependencies",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" }
  },
  "keywords": ["plato", "agent", "fleet", "cocapn"]
}
```

---

## Tests

- `room.join()` — joins room, receives confirmation
- `room.submitTile()` — sends tile, gets back id
- `room.getHistory()` — fetches recent tiles
- `room.query({ type })` — filters by type
- `reconnection on network failure` — retries, then errors
- `tile queue when offline` — queues, submits on reconnect

---

## Dependencies

**None.** Just TypeScript and the browser/Node.js `fetch` API.