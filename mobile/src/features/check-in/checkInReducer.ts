import type { CheckIn, LocationFix } from './domain';

export type CheckInState =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'ready'; fix: LocationFix }
  | { status: 'saving'; fix: LocationFix }
  | { status: 'save-error'; fix: LocationFix; message: string }
  | { status: 'complete'; checkIn: CheckIn }
  | { status: 'permission-denied' }
  | { status: 'error'; message: string };

export type CheckInAction =
  | { type: 'SEARCH_STARTED' }
  | { type: 'LOCATION_FOUND'; fix: LocationFix }
  | { type: 'LOCATION_FAILED'; message: string }
  | { type: 'PERMISSION_DENIED' }
  | { type: 'CONFIRM_PRESSED' }
  | { type: 'SAVE_FAILED'; message: string }
  | { type: 'SAVE_RETRY_PRESSED' }
  | { type: 'SAVE_SUCCEEDED'; checkIn: CheckIn };

export const initialCheckInState: CheckInState = { status: 'idle' };

export function checkInReducer(state: CheckInState, action: CheckInAction): CheckInState {
  switch (action.type) {
    case 'SEARCH_STARTED': return { status: 'locating' };
    case 'LOCATION_FOUND': return { status: 'ready', fix: action.fix };
    case 'LOCATION_FAILED': return { status: 'error', message: action.message };
    case 'PERMISSION_DENIED': return { status: 'permission-denied' };
    case 'CONFIRM_PRESSED':
      return state.status === 'ready' ? { status: 'saving', fix: state.fix } : state;
    case 'SAVE_FAILED':
      return state.status === 'saving' ? { status: 'save-error', fix: state.fix, message: action.message } : state;
    case 'SAVE_RETRY_PRESSED':
      return state.status === 'save-error' ? { status: 'saving', fix: state.fix } : state;
    case 'SAVE_SUCCEEDED': return { status: 'complete', checkIn: action.checkIn };
  }
}
