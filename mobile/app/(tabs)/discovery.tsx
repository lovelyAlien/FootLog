import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DiscoveryRoute() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>발견</Text>
        <Text style={styles.body}>주변 발자국을 발견하는 기능은 다음 업데이트에서 제공할 예정이에요.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 32, fontWeight: '700', color: '#1b1b1b' },
  body: { fontSize: 16, lineHeight: 24, color: '#515151' },
});
