/**
 * Action identifiers shared by browser flows and server-side intent builders.
 * Keep this module free of Node-only imports so it can be bundled for clients.
 */
export const ACTION_CODES = {
  LAB_ADD: 1,
  LAB_ADD_AND_LIST: 2,
  LAB_SET_URI: 3,
  LAB_UPDATE: 4,
  LAB_DELETE: 5,
  LAB_LIST: 6,
  LAB_UNLIST: 7,
  REQUEST_BOOKING: 8,
  CANCEL_REQUEST_BOOKING: 9,
  CANCEL_BOOKING: 10,
  DIRECT_BOOKING: 11,
};

export default ACTION_CODES;
