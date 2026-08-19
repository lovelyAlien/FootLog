import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../shared/theme';
import { useCheckIn, type CheckInDependencies } from './useCheckIn';

type CheckInScreenProps = {
  deps: CheckInDependencies;
  onViewToday: () => void;
  onCancel?: () => void;
};

function ActionButton({ label, onPress, primary = false }: {
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.button, primary && styles.primaryButton]}
    >
      <Text style={[styles.buttonText, primary && styles.primaryButtonText]}>{label}</Text>
    </Pressable>
  );
}

function CancelButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="취소" onPress={onPress} style={styles.cancelButton}>
      <Text style={styles.cancelButtonText}>취소</Text>
    </Pressable>
  );
}

export function CheckInScreen({ deps, onViewToday, onCancel }: CheckInScreenProps) {
  const { state, findLocation, confirm, retrySave } = useCheckIn(deps);

  useEffect(() => {
    void findLocation();
  }, [findLocation]);

  if (state.status === 'locating' || state.status === 'idle') {
    return (
      <ScreenContainer>
        <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
        <Text style={styles.title}>현재 위치 확인 중</Text>
      </ScreenContainer>
    );
  }

  if (state.status === 'permission-denied') {
    return (
      <ScreenContainer>
        <Text style={styles.title}>위치 권한이 필요해요</Text>
        <Text style={styles.body}>설정에서 위치 권한을 허용해 주세요.</Text>
        {onCancel && <CancelButton onPress={onCancel} />}
      </ScreenContainer>
    );
  }

  if (state.status === 'error') {
    return (
      <ScreenContainer>
        <Text style={styles.title}>위치를 가져오지 못했어요</Text>
        <Text style={styles.body}>{state.message}</Text>
        <ActionButton label="다시 시도" onPress={() => { void findLocation(); }} primary />
        {onCancel && <CancelButton onPress={onCancel} />}
      </ScreenContainer>
    );
  }

  if (state.status === 'save-error') {
    return (
      <ScreenContainer>
        <Text style={styles.title}>체크인을 저장하지 못했어요</Text>
        <Text style={styles.body}>{state.message}</Text>
        <ActionButton label="이 위치에 다시 체크인" onPress={() => { void retrySave(); }} primary />
      </ScreenContainer>
    );
  }

  if (state.status === 'complete') {
    return (
      <ScreenContainer>
        <Text style={styles.title}>완료</Text>
        <Text style={styles.body}>이 위치에 체크인했어요.</Text>
        <ActionButton label="오늘의 발자국 보기" onPress={onViewToday} primary />
      </ScreenContainer>
    );
  }

  const { fix } = state;
  const coordinate = { latitude: fix.latitude, longitude: fix.longitude };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{state.status === 'saving' ? '체크인 저장 중' : '현재 위치'}</Text>
        <MapView
          style={styles.map}
          initialRegion={{ ...coordinate, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
        >
          <Marker coordinate={coordinate} draggable={false} />
          <Circle center={coordinate} radius={fix.accuracyM} />
        </MapView>
        <Text style={styles.body}>정확도 약 {Math.round(fix.accuracyM)}m</Text>
        {state.status === 'ready' && (
          <View style={styles.actions}>
            <ActionButton label="다시 찾기" onPress={() => { void findLocation(); }} />
            <ActionButton label="이 위치에 체크인" primary onPress={() => { void confirm(); }} />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

function ScreenContainer({ children }: { children: React.ReactNode }) {
  return <SafeAreaView style={styles.container}><View style={styles.content}>{children}</View></SafeAreaView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  title: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  body: { fontSize: 16, lineHeight: 24, color: colors.textSecondary },
  map: { height: 320, borderRadius: 20 },
  spinner: { alignSelf: 'center' },
  actions: { gap: 12 },
  button: { alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.borderMuted, paddingVertical: 16 },
  primaryButton: { backgroundColor: colors.primary, borderColor: colors.primary },
  buttonText: { color: colors.buttonSecondaryText, fontSize: 16, fontWeight: '700' },
  primaryButtonText: { color: colors.onPrimary },
  cancelButton: { alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  cancelButtonText: { color: colors.buttonTertiaryText, fontSize: 16, fontWeight: '600' },
});
