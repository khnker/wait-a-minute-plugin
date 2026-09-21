/**
 * Projection Engine — derive state from an event stream via reducer.
 *
 * Given a reducer function and initial state, applies events one-by-one
 * to produce a current derived state. Production hardening (M5-52).
 */

/**
 * @typedef {Object} Projection
 * @property {*} getState
 * @property {(event: {type: string, payload?: unknown}) => *} apply
 * @property {() => number} version
 * @property {() => void} reset
 */

/**
 * Create a projection from a reducer.
 * @param {(state: *, event: {type: string, payload?: unknown}) => *} reducer
 * @param {*} initialState
 * @returns {Projection}
 */
export function createProjection(reducer, initialState) {
  if (typeof reducer !== "function") throw new TypeError("reducer must be function");
  let state = initialState;
  let v = 0;

  function apply(event) {
    state = reducer(state, event);
    v++;
    return state;
  }

  function getState() {
    return state;
  }

  function version() {
    return v;
  }

  function reset() {
    state = initialState;
    v = 0;
  }

  return { getState, apply, version, reset };
}
