import { useCallback, useEffect, useRef, useState } from 'react';
import { PanResponder, type PanResponderInstance, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../shared/theme';
import {
  clampEndHour,
  clampStartHour,
  hourFromOffset,
  offsetFromHour,
} from './activityWindowGeometry';
import { formatHour } from './formatHour';

type ActivityWindowSliderProps = {
  startHour: number;
  endHour: number;
  disabled: boolean;
  onChangeEnd: (window: { startHour: number; endHour: number }) => void;
};

type Handle = 'start' | 'end';
type DragState = { handle: Handle; hour: number };

const THUMB_SIZE = 26;

export function ActivityWindowSlider({ startHour, endHour, disabled, onChangeEnd }: ActivityWindowSliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [drag, setDrag] = useState<DragState | null>(null);

  const startHourRef = useRef(startHour);
  const endHourRef = useRef(endHour);
  const trackWidthRef = useRef(trackWidth);
  const disabledRef = useRef(disabled);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    startHourRef.current = startHour;
    endHourRef.current = endHour;
    trackWidthRef.current = trackWidth;
    disabledRef.current = disabled;
  });

  const emitChange = useCallback((handle: Handle, hour: number) => {
    onChangeEnd(
      handle === 'start'
        ? { startHour: hour, endHour: endHourRef.current }
        : { startHour: startHourRef.current, endHour: hour },
    );
  }, [onChangeEnd]);

  const clampForHandle = (handle: Handle, candidateHour: number): number => (
    handle === 'start'
      ? clampStartHour(candidateHour, endHourRef.current)
      : clampEndHour(candidateHour, startHourRef.current)
  );

  const createResponder = useCallback((handle: Handle): PanResponderInstance => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabledRef.current,
    onMoveShouldSetPanResponder: () => !disabledRef.current,
    onPanResponderGrant: () => {
      const hour = handle === 'start' ? startHourRef.current : endHourRef.current;
      dragRef.current = { handle, hour };
      setDrag({ handle, hour });
    },
    onPanResponderMove: (_event, gesture) => {
      const baseHour = handle === 'start' ? startHourRef.current : endHourRef.current;
      const baseOffset = offsetFromHour(baseHour, trackWidthRef.current);
      const candidateHour = hourFromOffset(baseOffset + gesture.dx, trackWidthRef.current);
      const clampedHour = clampForHandle(handle, candidateHour);
      dragRef.current = { handle, hour: clampedHour };
      setDrag({ handle, hour: clampedHour });
    },
    onPanResponderRelease: () => {
      if (dragRef.current) emitChange(dragRef.current.handle, dragRef.current.hour);
      dragRef.current = null;
      setDrag(null);
    },
    onPanResponderTerminate: () => {
      dragRef.current = null;
      setDrag(null);
    },
  }), [emitChange]);

  // createResponder only *creates* closures here; the refs it captures are read later,
  // inside PanResponder's gesture callbacks, never synchronously during this render.
  // eslint-disable-next-line react-hooks/refs -- lazy one-time init, no ref read happens now
  const [startResponder] = useState<PanResponderInstance>(() => createResponder('start'));
  // eslint-disable-next-line react-hooks/refs -- lazy one-time init, no ref read happens now
  const [endResponder] = useState<PanResponderInstance>(() => createResponder('end'));

  const liveStartHour = drag?.handle === 'start' ? drag.hour : startHour;
  const liveEndHour = drag?.handle === 'end' ? drag.hour : endHour;

  const onAccessibilityAdjust = (handle: Handle, actionName: string) => {
    if (disabled) return;
    if (actionName !== 'increment' && actionName !== 'decrement') return;
    const currentHour = handle === 'start' ? startHour : endHour;
    const delta = actionName === 'increment' ? 1 : -1;
    emitChange(handle, clampForHandle(handle, currentHour + delta));
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>활동 시간대</Text>
      <View
        style={styles.track}
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      >
        <View
          style={[
            styles.fill,
            {
              left: offsetFromHour(liveStartHour, trackWidth),
              width: Math.max(0, offsetFromHour(liveEndHour, trackWidth) - offsetFromHour(liveStartHour, trackWidth)),
            },
          ]}
        />
        <View
          {...startResponder.panHandlers}
          accessibilityRole="adjustable"
          accessibilityLabel="시작 시간"
          accessibilityValue={{ text: formatHour(liveStartHour) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) => onAccessibilityAdjust('start', event.nativeEvent.actionName)}
          style={[styles.thumb, { left: offsetFromHour(liveStartHour, trackWidth) - THUMB_SIZE / 2 }]}
        />
        <View
          {...endResponder.panHandlers}
          accessibilityRole="adjustable"
          accessibilityLabel="종료 시간"
          accessibilityValue={{ text: formatHour(liveEndHour) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) => onAccessibilityAdjust('end', event.nativeEvent.actionName)}
          style={[styles.thumb, { left: offsetFromHour(liveEndHour, trackWidth) - THUMB_SIZE / 2 }]}
        />
      </View>
      <Text style={styles.rangeLabel}>{formatHour(liveStartHour)} – {formatHour(liveEndHour)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  label: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  track: { height: 34, borderRadius: 8, backgroundColor: colors.border, justifyContent: 'center' },
  fill: { position: 'absolute', top: 0, bottom: 0, borderRadius: 8, backgroundColor: colors.primary, opacity: 0.85 },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE + 8,
    borderRadius: 9,
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  rangeLabel: { fontSize: 15, color: colors.textSecondary },
});
