export function replayEvents(events, initialState) {
  return events.reduce((state, event) => {
    return { ...state, ...event };
  }, initialState);
}
