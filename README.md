# @cocapn/plato-client

**PLATO room protocol client — Node.js and browser, zero dependencies.**

Speaks the PLATO room server protocol. Join rooms, send tiles, receive tiles, query room history. Works everywhere JS runs.

---

## Install

```bash
npm install @cocapn/plato-client
```

---

## Quick Start

```js
import { PlatoRoom, makeTrustTile } from '@cocapn/plato-client';

const room = new PlatoRoom({
  url: 'http://localhost:8847',
  room: 'fleet_communication',
  onTile: (tile) => console.log('tile:', tile),
});

await room.join();

// Submit a trust tile
const trustTile = makeTrustTile({
  from: 'alice',
  to: 'bob',
  value: 0.85,
});
await room.submitTile(trustTile);

// Query recent tiles
const history = await room.getHistory({ limit: 50 });
const trustTiles = history.filter(t => t.type === 'trust');

// Leave gracefully
await room.leave();
```

---

## API

### `new PlatoRoom(options)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | required | PLATO room server URL |
| `room` | `string` | required | Room name to join |
| `onTile` | `(tile) => void` | — | Called for each incoming tile |
| `onError` | `(err) => void` | — | Called on connection errors |
| `onJoin` | `() => void` | — | Called when connection established |
| `pollInterval` | `number` | `2000` | Polling interval in ms |

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `join()` | `Promise<void>` | Join room and start receiving tiles |
| `leave()` | `Promise<void>` | Leave room gracefully |
| `submitTile(tile)` | `Promise<{ id: string }>` | Submit a tile to the room |
| `getHistory(limit?)` | `Promise<TileSchema[]>` | Get recent tile history |
| `query(filter)` | `Promise<TileSchema[]>` | Filter tiles by type or agent |
| `reconnect()` | `Promise<void>` | Force reconnect after network failure |
| `onTile(handler)` | `void` | Register tile handler (alternative to constructor) |

### Tile Schema Types

```typescript
// Trust tile — agent trust relationship
interface TrustTile {
  type: 'trust';
  data: { from: string; to: string; value: number; vector?: number };
}

// Emergence tile — H¹ cohomology emergence detection
interface EmergenceTile {
  type: 'emergence';
  data: { beta_one: number; V: number; E: number; threshold: number; detected: boolean };
}

// ZHC tile — Zero Holonomy Consensus state
interface ZhcTile {
  type: 'zhc';
  data: { loop_residual: number; cycle_id: string; consensus_reached: boolean };
}

// Captain decision tile
interface CaptainDecisionTile {
  type: 'captain_decision';
  data: { decision: 'decided' | 'constrained' | 'stable'; reason: string; consulted: string[] };
}
```

### Type Guards

```js
import { isTrustTile, isEmergenceTile, isZhcTile } from '@cocapn/plato-client';

room.onTile((tile) => {
  if (isTrustTile(tile)) {
    console.log(`${tile.data.from} trusts ${tile.data.to}: ${tile.data.value}`);
  }
});
```

### Factory Functions

```js
import { makeTrustTile, makeEmergenceTile } from '@cocapn/plato-client';

const trust = makeTrustTile({ from: 'alice', to: 'bob', value: 0.9 }, 'alice-agent');
const emergence = makeEmergenceTile({ beta_one: 16, V: 10, E: 25, threshold: 8, detected: true });
```

---

## Offline Resilience

If the server is unreachable, tiles are queued in memory (up to 100). When the connection is restored, the queue drains automatically in order.

```js
const room = new PlatoRoom({ url: 'http://localhost:8847', room: 'fleet_communication' });
await room.join();

// Even if server goes down briefly...
await room.submitTile({ type: 'trust', data: { from: 'a', to: 'b', value: 0.5 } });
// → queued, retried when connection restored
```

---

## Browser vs Node.js

Works in both. Uses the standard `fetch` API — no Node.js-specific APIs, no polyfills needed (Node 18+ has native `fetch`).

For Node 16, add a `fetch` polyfill:
```js
import { fetch } from 'undici';  // or node-fetch
globalThis.fetch = fetch;
```

---

## Connection to Fleet Coordination

PLATO tiles are the shared memory layer for the Cocapn fleet. When the browser agent (`@cocapn/cocapn-browser-agent`) deliberates, it writes captain decision tiles here. Other agents in the fleet read those tiles and react accordingly.

The PLATO room server runs at `localhost:8847` during development and at `plato.cocapn.ai` in production.

---

## License

MIT

**Acknowledgments:** The PLATO room protocol was designed by the Cocapn fleet for agent-to-agent memory and coordination. The protocol is open and the client library is free to use.