import { checkInReducer, initialCheckInState } from '../src/features/check-in/checkInReducer';

const fix = {
  latitude: 37.5445,
  longitude: 127.056,
  accuracyM: 42,
  capturedAt: '2026-08-06T00:00:00.000Z',
};

describe('checkInReducer', () => {
  it('does not become confirmable before a location fix exists', () => {
    expect(checkInReducer(initialCheckInState, { type: 'SEARCH_STARTED' })).toEqual({ status: 'locating' });
  });

  it('requires explicit confirmation after finding a location', () => {
    const ready = checkInReducer({ status: 'locating' }, { type: 'LOCATION_FOUND', fix });
    expect(ready).toEqual({ status: 'ready', fix });
  });

  it('shows the persisted check-in only after save succeeds', () => {
    const saving = checkInReducer({ status: 'ready', fix }, { type: 'CONFIRM_PRESSED' });
    expect(saving).toEqual({ status: 'saving', fix });
  });
});
