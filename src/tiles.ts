/**
 * PLATO Tile Schema Types
 * All tile types matching the PLATO room server protocol.
 * Zero dependencies — plain JSON-compatible objects.
 */

export interface TileSchema {
  /** Auto-generated server-side if missing */
  id?: string;
  /** Tile type — determines data schema */
  type: string;
  /** Unix timestamp, auto-set if missing */
  timestamp?: number;
  /** Tile-type-specific payload */
  data: Record<string, unknown>;
  /** Agent that submitted this tile */
  from_agent?: string;
  /** Auto-populated on send */
  room?: string;
}

// ---------------------------------------------------------------------------
// Trust Tile — agent trust relationships
// ---------------------------------------------------------------------------

export interface TrustTile extends TileSchema {
  type: 'trust';
  data: {
    /** Source agent id */
    from: string;
    /** Target agent id */
    to: string;
    /** Trust value in [-1, 1] */
    value: number;
    /** Pythagorean48 direction index (0-47), optional */
    vector?: number;
  };
}

// ---------------------------------------------------------------------------
// Emergence Tile — H¹ cohomology emergence detection
// ---------------------------------------------------------------------------

export interface EmergenceTile extends TileSchema {
  type: 'emergence';
  data: {
    /** H¹ first Betti number = E - V + C */
    beta_one: number;
    /** Vertex count in fleet graph */
    V: number;
    /** Edge count in fleet graph */
    E: number;
    /** Emergence threshold (β₁ > V-2 for rigid fleet) */
    threshold: number;
    /** True if emergence detected */
    detected: boolean;
  };
}

// ---------------------------------------------------------------------------
// ZHC Tile — Zero Holonomy Consensus state
// ---------------------------------------------------------------------------

export interface ZhcTile extends TileSchema {
  type: 'zhc';
  data: {
    /** Hol(γ) loop residual — deviation from identity */
    loop_residual: number;
    /** Which cycle this tile is about */
    cycle_id: string;
    /** True if geometric consensus reached */
    consensus_reached: boolean;
  };
}

// ---------------------------------------------------------------------------
// Captain Decision Tile — captain deliberation output
// ---------------------------------------------------------------------------

export type CaptainDecisionValue = 'decided' | 'constrained' | 'stable';

export interface CaptainDecisionTile extends TileSchema {
  type: 'captain_decision';
  data: {
    decision: CaptainDecisionValue;
    reason: string;
    /** Specialist ids consulted during inquiry */
    consulted: string[];
    /** Action taken (only when decision === 'decided') */
    action_taken?: string;
    /** Hard constraint violations (only when decision === 'constrained') */
    violations?: string[];
  };
}

// ---------------------------------------------------------------------------
// Inquiry Tile — captain's wide inquiry questions
// ---------------------------------------------------------------------------

export interface InquiryTile extends TileSchema {
  type: 'inquiry';
  data: {
    question: string;
    context: string;
    specialists_consulted: string[];
  };
}

// ---------------------------------------------------------------------------
// Tile type guard helpers
// ---------------------------------------------------------------------------

export function isTrustTile(tile: TileSchema): tile is TrustTile {
  return tile.type === 'trust';
}

export function isEmergenceTile(tile: TileSchema): tile is EmergenceTile {
  return tile.type === 'emergence';
}

export function isZhcTile(tile: TileSchema): tile is ZhcTile {
  return tile.type === 'zhc';
}

export function isCaptainDecisionTile(tile: TileSchema): tile is CaptainDecisionTile {
  return tile.type === 'captain_decision';
}

export function isInquiryTile(tile: TileSchema): tile is InquiryTile {
  return tile.type === 'inquiry';
}

/** Create a trust tile with auto-timestamp */
export function makeTrustTile(data: TrustTile['data'], from_agent?: string): TrustTile {
  return {
    type: 'trust',
    timestamp: Date.now(),
    from_agent,
    data,
  };
}

/** Create an emergence tile with auto-timestamp */
export function makeEmergenceTile(data: EmergenceTile['data'], from_agent?: string): EmergenceTile {
  return {
    type: 'emergence',
    timestamp: Date.now(),
    from_agent,
    data,
  };
}