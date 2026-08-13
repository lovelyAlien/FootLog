import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCheckIn, type CheckInDependencies } from './useCheckIn';

type CheckInScreenProps = {
  deps: CheckInDependencies;
  onViewToday: () => void;
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

export function CheckInScreen({ deps, onViewToday }: CheckInScreenProps) {
  const { state, findLocation, confirm, retrySave } = useCheckIn(deps);

  useEffect(() => {
    void findLocation();
  }, [findLocation]);

  if (state.status === 'locating' || state.status === 'idle') {
    return <ScreenContainer><Text style={styles.title}>현재 위치 확인 중</Text></ScreenContainer>;
  }

  if (state.status === 'permission-denied') {
    return (
      <ScreenContainer>
        <Text style={styles.title}>위치 권한이 필요해요</Text>
        <Text style={styles.body}>설정에서 위치 권한을 허용해 주세요.</Text>
      </ScreenContainer>
    );
  }

  if (state.status === 'error') {
    return (
      <ScreenContainer>
        <Text style={styles.title}>위치를 가져오지 못했어요</Text>
        <Text style={styles.body}>{state.message}</Text>
        <ActionButton label="다시 시도" onPress={() => { void findLocation(); }} />
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
        <ActionButton label="오늘의 발자국 보기" onPress={onViewToday} />
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
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  title: { fontSize: 28, fontWeight: '700', color: '#1b1b1b' },
  body: { fontSize: 16, lineHeight: 24, color: '#515151' },
  map: { height: 320, borderRadius: 20 },
  actions: { gap: 12 },
  button: { alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#2e6af0', paddingVertical: 16 },
  primaryButton: { backgroundColor: '#2e6af0' },
  buttonText: { color: '#2e6af0', fontSize: 16, fontWeight: '700' },
  primaryButtonText: { color: '#ffffff' },
});
