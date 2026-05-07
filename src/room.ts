/**
 * PLATO Room Client
 * 
 * Joins a PLATO room, sends tiles, receives tiles.
 * Zero dependencies. Works in Node.js and browser.
 * 
 * Usage:
 *   const room = new PlatoRoom({ url: 'http://localhost:8847', room: 'fleet_communication' });
 *   await room.join();
 *   await room.submitTile({ type: 'trust', data: { from: 'a', to: 'b', value: 0.85 } });
 *   room.onTile(tile => console.log(tile));
 */

import type { TileSchema } from './tiles.js';

export interface PlatoRoomOptions {
  /** PLATO room server URL */
  url: string;
  /** Room name to join */
  room: string;
  /** Called for each incoming tile */
  onTile?: (tile: TileSchema) => void;
  /** Called on errors */
  onError?: (err: Error) => void;
  /** Called when connection established */
  onJoin?: () => void;
  /** Polling interval in ms (default 2000) */
  pollInterval?: number;
}

interface QueuedTile {
  tile: TileSchema;
  retries: number;
}

const DEFAULT_POLL_INTERVAL = 2000;
const MAX_RETRIES = 3;
const BACKOFF_MS = [500, 1000, 2000];
const MAX_QUEUE = 100;

export class PlatoRoom {
  private _url: string;
  private _room: string;
  private _onTile?: (tile: TileSchema) => void;
  private _onError?: (err: Error) => void;
  private _onJoin?: () => void;
  private pollInterval: number;
  
  private joined = false;
  private polling = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastTileId: string | null = null;
  private queue: QueuedTile[] = [];
  private retryCount = 0;

  constructor(options: PlatoRoomOptions) {
    this._url = options.url.replace(/\/$/, '');  // strip trailing slash
    this._room = options.room;
    this._onTile = options.onTile;
    this._onError = options.onError;
    this._onJoin = options.onJoin;
    this.pollInterval = options.pollInterval ?? DEFAULT_POLL_INTERVAL;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Join the room and start receiving tiles */
  async join(): Promise<void> {
    if (this.joined) return;
    
    try {
      // Check room status first
      const status = await this.getStatus();
      console.log(`[PLATO] Joined room "${this._room}" — ${status.tile_count} tiles, ${status.agents.join(', ') || 'no other agents'}`);
      
      this.joined = true;
      this._onJoin?.();
      
      // Start polling for new tiles
      this.startPolling();
      
      // Drain any queued tiles
      await this.drainQueue();
    } catch (err) {
      this._onError?.(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  /** Submit a tile to the room */
  async submitTile(tile: TileSchema): Promise<{ id: string }> {
    const enriched: TileSchema = {
      ...tile,
      timestamp: tile.timestamp ?? Date.now(),
      room: this._room,
    };

    try {
      const res = await this.httpFetch(`/room/${this._room}/tiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(enriched),
      });

      if (!res.ok) {
        throw new Error(`PLATO rejected tile: ${res.status} ${res.statusText}`);
      }

      const result = await res.json() as { id: string };
      
      // On successful submit, reset retry state
      this.retryCount = 0;
      
      return result;
    } catch (err) {
      // Queue for retry
      this.queueTile(enriched);
      throw err;
    }
  }

  /** Get recent tile history */
  async getHistory(limit = 50): Promise<TileSchema[]> {
    const res = await this.httpFetch(`/room/${this._room}/history?limit=${limit}`);
    if (!res.ok) throw new Error(`Failed to fetch history: ${res.status}`);
    return res.json() as Promise<TileSchema[]>;
  }

  /** Query tiles by type or other criteria */
  async query(filter: { type?: string; from_agent?: string; limit?: number }): Promise<TileSchema[]> {
    const history = await this.getHistory(filter.limit ?? 100);
    return history.filter(tile => {
      if (filter.type && tile.type !== filter.type) return false;
      if (filter.from_agent && tile.from_agent !== filter.from_agent) return false;
      return true;
    });
  }

  /** Leave the room gracefully */
  async leave(): Promise<void> {
    this.stopPolling();
    this.joined = false;
    console.log(`[PLATO] Left room "${this._room}"`);
  }

  /** Force reconnect after network failure */
  async reconnect(): Promise<void> {
    this.retryCount = 0;
    this.stopPolling();
    await this.join();
  }

  /** Register tile handler (alternative to constructor option) */
  onTile(handler: (tile: TileSchema) => void): void {
    this._onTile = handler;
  }

  // -------------------------------------------------------------------------
  // Private methods
  // -------------------------------------------------------------------------

  private async httpFetch(path: string, init?: RequestInit): Promise<Response> {
    const url = `${this._url}${path}`;
    return fetch(url, init);
  }

  private async getStatus(): Promise<{ agents: string[]; tile_count: number }> {
    const res = await this.httpFetch(`/room/${this._room}/status`);
    if (!res.ok) throw new Error(`Room status failed: ${res.status}`);
    return res.json();
  }

  private startPolling(): void {
    if (this.polling) return;
    this.polling = true;
    this.poll().catch(err => {
      console.error('[PLATO] Poll error:', err);
      this.handlePollError();
    });
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.polling = false;
  }

  private async poll(): Promise<void> {
    try {
      const url = this.lastTileId 
        ? `/room/${this._room}/tiles/stream?since=${this.lastTileId}`
        : `/room/${this._room}/tiles/stream`;
      
      const res = await this.httpFetch(url);
      
      if (res.status === 304) {
        // No new tiles, continue polling
        return;
      }

      if (!res.ok) {
        throw new Error(`Poll failed: ${res.status}`);
      }

      const tiles = await res.json() as TileSchema[];
      
      for (const tile of tiles) {
        this.lastTileId = tile.id ?? this.lastTileId;
        this._onTile?.(tile);
      }
    } catch (err) {
      this.handlePollError();
    }
  }

  private handlePollError(): void {
    if (this.retryCount >= MAX_RETRIES) {
      this.stopPolling();
      this._onError?.(new Error(`[PLATO] Connection lost after ${MAX_RETRIES} retries`));
      return;
    }

    const delay = BACKOFF_MS[this.retryCount] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
    this.retryCount++;
    
    console.warn(`[PLATO] Retry ${this.retryCount}/${MAX_RETRIES} in ${delay}ms`);
    
    setTimeout(() => {
      if (this.joined) {
        this.poll().catch(err => {
          console.error('[PLATO] Poll error after retry:', err);
          this.handlePollError();
        });
      }
    }, delay);
  }

  private queueTile(tile: TileSchema): void {
    if (this.queue.length >= MAX_QUEUE) {
      this.queue.shift();  // drop oldest
    }
    this.queue.push({ tile, retries: 0 });
  }

  private async drainQueue(): Promise<void> {
    if (this.queue.length === 0) return;
    
    console.log(`[PLATO] Draining ${this.queue.length} queued tiles`);
    
    while (this.queue.length > 0) {
      const item = this.queue[0];
      
      try {
        await this.submitTile(item.tile);
        this.queue.shift();  // remove from queue on success
      } catch {
        break;  // stop draining if submit fails
      }
    }
  }
}