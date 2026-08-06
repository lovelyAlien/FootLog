import { useCallback, useRef, useState } from 'react';

import { checkInReducer, initialCheckInState, type CheckInAction, type CheckInState } from './checkInReducer';
import { createCheckIn } from './createCheckIn';
import type { CheckInRepository, LocationFix, LocationGateway } from './domain';

export type CheckInDependencies = {
  locationGateway: LocationGateway;
  repository: CheckInRepository;
  uuid: () => string;
  now: () => string;
};

export type UseCheckInResult = {
  state: CheckInState;
  findLocation(): Promise<void>;
  confirm(): Promise<void>;
  retrySave(): Promise<void>;
};

export function useCheckIn(deps: CheckInDependencies): UseCheckInResult {
  const [state, setState] = useState<CheckInState>(initialCheckInState);
  const stateRef = useRef<CheckInState>(initialCheckInState);

  const dispatch = useCallback((action: CheckInAction) => {
    stateRef.current = checkInReducer(stateRef.current, action);
    setState(stateRef.current);
  }, []);

  const findLocation = useCallback(async () => {
    dispatch({ type: 'SEARCH_STARTED' });

    try {
      const permission = await deps.locationGateway.requestForegroundPermission();
      if (permission === 'denied') {
        dispatch({ type: 'PERMISSION_DENIED' });
        return;
      }

      const fix = await deps.locationGateway.getCurrentFix();
      dispatch({ type: 'LOCATION_FOUND', fix });
    } catch (error) {
      dispatch({
        type: 'LOCATION_FAILED',
        message: error instanceof Error ? error.message : '위치를 가져오지 못했습니다.',
      });
    }
  }, [deps.locationGateway, dispatch]);

  const saveFix = useCallback(async (fix: LocationFix) => {
    try {
      const checkIn = await createCheckIn(fix, deps);
      dispatch({ type: 'SAVE_SUCCEEDED', checkIn });
    } catch (error) {
      dispatch({
        type: 'SAVE_FAILED',
        message: error instanceof Error ? error.message : '체크인을 저장하지 못했습니다.',
      });
    }
  }, [deps, dispatch]);

  const confirm = useCallback(async () => {
    const currentState = stateRef.current;
    if (currentState.status !== 'ready') return;

    dispatch({ type: 'CONFIRM_PRESSED' });
    await saveFix(currentState.fix);
  }, [dispatch, saveFix]);

  const retrySave = useCallback(async () => {
    const currentState = stateRef.current;
    if (currentState.status !== 'save-error') return;

    dispatch({ type: 'SAVE_RETRY_PRESSED' });
    await saveFix(currentState.fix);
  }, [dispatch, saveFix]);

  return { state, findLocation, confirm, retrySave };
}
