/**
 * @cocapn/plato-client — PLATO room protocol client
 * Zero dependencies. Node.js + browser.
 */

export { PlatoRoom } from './room.js';
export type { PlatoRoomOptions } from './room.js';

export {
  type TileSchema,
  type TrustTile,
  type EmergenceTile,
  type ZhcTile,
  type CaptainDecisionTile,
  type InquiryTile,
  type CaptainDecisionValue,
  isTrustTile,
  isEmergenceTile,
  isZhcTile,
  isCaptainDecisionTile,
  isInquiryTile,
  makeTrustTile,
  makeEmergenceTile,
} from './tiles.js';