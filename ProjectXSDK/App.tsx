import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';

import {
  BlePresenceProvider,
  PROJECT_X_SDK_CONFIG,
  ProjectXSdk,
  ReactNativePasskeyProvider,
  type ProjectXJoinQrPayload,
  type ProjectXSessionResponse,
  type VerificationResult,
  type VerificationStatusUpdate,
} from './src/projectx';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AppContent isDarkMode={isDarkMode} />
    </SafeAreaProvider>
  );
}

function AppContent({ isDarkMode }: { isDarkMode: boolean }) {
  const sdkRef = useRef<ProjectXSdk | null>(null);
  const unsubscribeRef = useRef<Array<() => void>>([]);

  const [apiUrl, setApiUrl] = useState(PROJECT_X_SDK_CONFIG.apiUrl);
  const [socketUrl, setSocketUrl] = useState(PROJECT_X_SDK_CONFIG.socketUrl);
  const [platformApiKey, setPlatformApiKey] = useState(
    PROJECT_X_SDK_CONFIG.platformApiKey,
  );
  const [sessionId, setSessionId] = useState('active-trip');
  const [identity, setIdentity] = useState<string>('');
  const [status, setStatus] = useState<VerificationStatusUpdate>({
    state: 'idle',
  });
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [session, setSession] = useState<ProjectXSessionResponse | null>(null);
  const [joinQrPayload, setJoinQrPayload] = useState<ProjectXJoinQrPayload | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [manualJoinPayload, setManualJoinPayload] = useState('');
  const [error, setError] = useState<string>('');
  const [credentialStatus, setCredentialStatus] = useState<string>('');
  const passkeyProviderRef = useRef(new ReactNativePasskeyProvider());

  const backgroundColor = isDarkMode ? '#08111f' : '#f3efe6';
  const cardColor = isDarkMode ? '#111b2e' : '#fffef8';
  const textColor = isDarkMode ? '#f3f2eb' : '#18202b';
  const mutedColor = isDarkMode ? '#9ab1cc' : '#516173';
  const borderColor = isDarkMode ? '#223049' : '#d3d4cf';
  const accentColor = '#0d8a72';

  const { hasPermission, requestPermission } = useCameraPermission();
  const cameraDevice = useCameraDevice('back');

  useEffect(() => {
    return () => {
      teardownSdk();
    };
  }, []);

  function teardownSdk() {
    for (const unsubscribe of unsubscribeRef.current) {
      unsubscribe();
    }
    unsubscribeRef.current = [];
    sdkRef.current?.disconnect();
    sdkRef.current = null;
  }

  function attachSdk() {
    teardownSdk();

    const sdk = new ProjectXSdk({
      baseUrl: apiUrl,
      socketUrl,
      platformApiKey,
      presenceProvider: new BlePresenceProvider(),
      authProvider: passkeyProviderRef.current,
    });

    unsubscribeRef.current = [
      sdk.onStatus(update => {
        setStatus(update);
      }),
      sdk.onResult(nextResult => {
        setResult(nextResult);
      }),
      sdk.onError(payload => {
        setError(payload.message);
      }),
      sdk.onSession(nextSession => {
        setSession(nextSession);
      }),
    ];

    sdkRef.current = sdk;
    return sdk;
  }

  async function ensureIdentity() {
    try {
      const sdk = sdkRef.current ?? attachSdk();
      const nextIdentity = await sdk.getOrCreateIdentity();
      setIdentity(nextIdentity.pubkey);
      setError('');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to create identity');
    }
  }

  async function refreshStatus() {
    try {
      const sdk = sdkRef.current ?? attachSdk();
      const nextIdentity = await sdk.getOrCreateIdentity();
      setIdentity(nextIdentity.pubkey);
      const nextStatus = await sdk.getCredentialStatus();
      if (!nextStatus.enrolled) {
        setCredentialStatus('not enrolled');
      } else {
        setCredentialStatus(nextStatus.isActive ? 'active' : 'inactive');
      }
      setError('');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to load credential status');
    }
  }

  async function enrollIdentity() {
    try {
      const sdk = sdkRef.current ?? attachSdk();
      const nextIdentity = await sdk.getOrCreateIdentity();
      setIdentity(nextIdentity.pubkey);
      await sdk.enrollWithPasskey(passkeyProviderRef.current);
      await refreshStatus();
      setError('');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to enroll identity');
    }
  }

  async function prepareDriver() {
    try {
      const sdk = attachSdk();
      const nextIdentity = await sdk.getOrCreateIdentity();
      setIdentity(nextIdentity.pubkey);
      const nextSession = await sdk.prepareDriverSession(sessionId.trim() || undefined);
      setSessionId(nextSession.sessionId);
      setJoinQrPayload(sdk.buildJoinQrPayload(nextSession));
      await sdk.connectToSession(nextSession.sessionId, 'partyA');
      setError('');
      setResult(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to prepare driver session');
    }
  }

  async function prepareRider() {
    try {
      const sdk = attachSdk();
      const nextIdentity = await sdk.getOrCreateIdentity();
      setIdentity(nextIdentity.pubkey);
      await sdk.prepareRiderSession(sessionId);
      setJoinQrPayload(null);
      await sdk.connectToSession(sessionId, 'partyB');
      setError('');
      setResult(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to prepare rider session');
    }
  }

  async function joinRiderFromQrPayload(payloadText: string) {
    const parsed = JSON.parse(payloadText) as Partial<ProjectXJoinQrPayload>;
    if (parsed.kind !== 'projectx-join' || parsed.version !== 1 || !parsed.joinToken) {
      throw new Error('Scanned QR payload is not a valid Project X join code');
    }

    const sdk = attachSdk();
    const nextIdentity = await sdk.getOrCreateIdentity();
    setIdentity(nextIdentity.pubkey);
    const nextSession = await sdk.prepareRiderSessionByJoinToken(parsed.joinToken);
    setSessionId(nextSession.sessionId);
    setJoinQrPayload(null);
    setManualJoinPayload('');
    await sdk.connectToSession(nextSession.sessionId, 'partyB');
    setError('');
    setResult(null);
    setScannerOpen(false);
  }

  async function startDriverVerification() {
    try {
      if (!sdkRef.current) {
        throw new Error('Connect as the driver first');
      }

      await sdkRef.current.startDriverVerification();
      setError('');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to start verification');
    }
  }

  function disconnectSession() {
    teardownSdk();
    setStatus({ state: 'idle' });
    setJoinQrPayload(null);
  }

  async function openScanner() {
    if (Platform.OS === 'android') {
      setScannerOpen(true);
      setError('');
      return;
    }

    const granted = hasPermission || (await requestPermission());
    if (!granted) {
      throw new Error('Camera permission is required to scan the driver QR code');
    }

    setScannerOpen(true);
    setError('');
  }

  async function handleScannedJoinPayload(payloadText: string) {
    try {
      await joinRiderFromQrPayload(payloadText);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to join session from QR');
    }
  }

  function handleManualJoinPayloadSubmit() {
    if (!manualJoinPayload.trim()) {
      setError('Paste the driver join payload first');
      return;
    }

    setScanBusy(true);
    handleScannedJoinPayload(manualJoinPayload.trim()).finally(() => {
      setTimeout(() => {
        setScanBusy(false);
      }, 800);
    });
  }

  function handleEnsureIdentity() {
    ensureIdentity().catch(() => {});
  }

  function handleRefreshStatus() {
    refreshStatus().catch(() => {});
  }

  function handleEnrollIdentity() {
    enrollIdentity().catch(() => {});
  }

  function handlePrepareDriver() {
    prepareDriver().catch(() => {});
  }

  function handlePrepareRider() {
    prepareRider().catch(() => {});
  }

  function handleOpenScanner() {
    openScanner().catch(() => {});
  }

  function handleStartDriverVerification() {
    startDriverVerification().catch(() => {});
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.eyebrow, { color: accentColor }]}>Project X Mobile SDK</Text>
        <Text style={[styles.title, { color: textColor }]}>
          Session orchestration moved out of the demo app
        </Text>
        <Text style={[styles.lead, { color: mutedColor }]}>
          This screen is only a thin shell over the SDK. Identity storage, REST
          calls, socket joins, verify transaction signing, and BLE presence gating
          now live in reusable client code.
        </Text>

        <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Connection</Text>
          <LabeledInput
            label="API URL"
            value={apiUrl}
            onChangeText={setApiUrl}
            textColor={textColor}
            mutedColor={mutedColor}
            borderColor={borderColor}
          />
          <LabeledInput
            label="Socket URL"
            value={socketUrl}
            onChangeText={setSocketUrl}
            textColor={textColor}
            mutedColor={mutedColor}
            borderColor={borderColor}
          />
          <LabeledInput
            label="Platform API Key"
            value={platformApiKey}
            onChangeText={setPlatformApiKey}
            textColor={textColor}
            mutedColor={mutedColor}
            borderColor={borderColor}
          />
          <LabeledInput
            label="Session ID"
            value={sessionId}
            onChangeText={setSessionId}
            textColor={textColor}
            mutedColor={mutedColor}
            borderColor={borderColor}
          />
        </View>

        <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Identity</Text>
          <Text style={[styles.value, { color: textColor }]}>
            {identity || 'No local identity loaded yet'}
          </Text>
          {credentialStatus ? (
            <Text style={[styles.caption, { color: mutedColor }]}>
              Credential status: {credentialStatus}
            </Text>
          ) : null}

          <View style={styles.buttonRow}>
            <PrimaryButton title="Create / Load Identity" onPress={handleEnsureIdentity} />
            <SecondaryButton title="Check Status" onPress={handleRefreshStatus} />
            <SecondaryButton title="Enroll Native" onPress={handleEnrollIdentity} />
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Verification Flow</Text>
          <Text style={[styles.caption, { color: mutedColor }]}>
            Driver: create or reuse the backend session, then connect socket as
            `partyA`.
          </Text>
          <Text style={[styles.caption, { color: mutedColor }]}>
            Rider: join the same session, then connect socket as `partyB`.
          </Text>

          <View style={styles.buttonRow}>
            <PrimaryButton title="Prepare as Driver" onPress={handlePrepareDriver} />
            <PrimaryButton title="Prepare as Rider" onPress={handlePrepareRider} />
          </View>
          <View style={styles.buttonRow}>
            <SecondaryButton
              title={Platform.OS === 'android' ? 'Open Rider Join' : 'Scan Rider QR'}
              onPress={handleOpenScanner}
            />
            <SecondaryButton
              title="Start Driver Verify"
              onPress={handleStartDriverVerification}
            />
            <SecondaryButton title="Disconnect" onPress={disconnectSession} />
          </View>
        </View>

        {joinQrPayload ? (
          <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Driver Join QR</Text>
            <Text style={[styles.caption, { color: mutedColor }]}>
              Rider pairing should scan this payload. It carries the backend-issued
              join token, not just the raw session id.
            </Text>
            <View style={styles.qrWrap}>
              <QRCode
                value={JSON.stringify(joinQrPayload)}
                size={208}
                backgroundColor="#fffef8"
                color="#18202b"
              />
            </View>
            <Row
              label="Session ID"
              value={joinQrPayload.sessionId}
              textColor={textColor}
              mutedColor={mutedColor}
            />
            <Row
              label="Join token"
              value={joinQrPayload.joinToken}
              textColor={textColor}
              mutedColor={mutedColor}
            />
            <Row
              label="Join token expires"
              value={joinQrPayload.joinTokenExpiresAt ?? 'none'}
              textColor={textColor}
              mutedColor={mutedColor}
            />
            <Text style={[styles.payloadText, { color: mutedColor }]}>
              {JSON.stringify(joinQrPayload)}
            </Text>
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Runtime State</Text>
          <Row label="SDK state" value={status.state} textColor={textColor} mutedColor={mutedColor} />
          <Row label="Detail" value={status.detail ?? 'none'} textColor={textColor} mutedColor={mutedColor} />
          <Row
            label="Driver pubkey"
            value={session?.driverPubkey ?? 'none'}
            textColor={textColor}
            mutedColor={mutedColor}
          />
          <Row
            label="Rider pubkey"
            value={session?.riderPubkey ?? 'none'}
            textColor={textColor}
            mutedColor={mutedColor}
          />
          <Row
            label="Result"
            value={result ? `${result.verified ? 'verified' : 'failed'}${result.reason ? `: ${result.reason}` : ''}` : 'none'}
            textColor={textColor}
            mutedColor={mutedColor}
          />
          <Row label="Error" value={error || 'none'} textColor={textColor} mutedColor={mutedColor} />
        </View>

        <View style={[styles.notice, { borderColor, backgroundColor: cardColor }]}>
          <Text style={[styles.noticeTitle, { color: textColor }]}>Current gap</Text>
          <Text style={[styles.caption, { color: mutedColor }]}>
            The SDK now owns the client protocol boundary. Full end-to-end mobile
            verification still needs a native passkey provider and location provider
            to be plugged into `ProjectXSdk`, and true BLE co-presence needs peer
            advertising alongside the BLE scan gate.
          </Text>
        </View>
      </ScrollView>

      <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
        <SafeAreaView style={[styles.scannerRoot, { backgroundColor }]}>
          <View style={styles.scannerHeader}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Scan Driver Join QR</Text>
            <SecondaryButton title="Close" onPress={() => setScannerOpen(false)} />
          </View>
          <Text style={[styles.caption, { color: mutedColor }]}>
            Rider scans the driver QR, then joins the backend session using the
            backend-issued join token from that payload.
          </Text>
          <View style={[styles.scannerFrame, { borderColor }]}>
            {Platform.OS === 'android' ? (
              <View style={styles.scannerFallback}>
                <Text style={[styles.caption, { color: mutedColor }]}>
                  Android camera QR scanning is temporarily disabled in this build.
                  Copy the JSON payload shown under the driver QR card and paste it
                  below to join the session.
                </Text>
                <TextInput
                  value={manualJoinPayload}
                  onChangeText={setManualJoinPayload}
                  multiline
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[
                    styles.input,
                    styles.manualPayloadInput,
                    { color: textColor, borderColor },
                  ]}
                  placeholder='{"version":1,"kind":"projectx-join",...}'
                  placeholderTextColor={mutedColor}
                />
                <PrimaryButton
                  title={scanBusy ? 'Joining...' : 'Join From Payload'}
                  onPress={handleManualJoinPayloadSubmit}
                />
              </View>
            ) : cameraDevice ? (
              <Camera
                style={StyleSheet.absoluteFill}
                device={cameraDevice}
                isActive={scannerOpen}
              />
            ) : (
              <View style={styles.scannerFallback}>
                <Text style={[styles.caption, { color: mutedColor }]}>
                  Camera device not available
                </Text>
              </View>
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function LabeledInput({
  label,
  value,
  onChangeText,
  textColor,
  mutedColor,
  borderColor,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  textColor: string;
  mutedColor: string;
  borderColor: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: mutedColor }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
        style={[
          styles.input,
          {
            color: textColor,
            borderColor,
          },
        ]}
      />
    </View>
  );
}

function Row({
  label,
  value,
  textColor,
  mutedColor,
}: {
  label: string;
  value: string;
  textColor: string;
  mutedColor: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: mutedColor }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: textColor }]}>{value}</Text>
    </View>
  );
}

function PrimaryButton({
  title,
  onPress,
}: {
  title: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.button, styles.primaryButton]}>
      <Text style={styles.primaryButtonText}>{title}</Text>
    </Pressable>
  );
}

function SecondaryButton({
  title,
  onPress,
}: {
  title: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.button, styles.secondaryButton]}>
      <Text style={styles.secondaryButtonText}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700',
  },
  lead: {
    fontSize: 16,
    lineHeight: 23,
  },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  notice: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginBottom: 32,
    gap: 8,
  },
  scannerRoot: {
    flex: 1,
    padding: 20,
    gap: 16,
  },
  scannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  scannerFrame: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    overflow: 'hidden',
    minHeight: 420,
  },
  scannerFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 12,
  },
  noticeTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  manualPayloadInput: {
    width: '100%',
    minHeight: 140,
    textAlignVertical: 'top',
  },
  value: {
    fontSize: 15,
    lineHeight: 22,
  },
  caption: {
    fontSize: 13,
    lineHeight: 19,
  },
  row: {
    gap: 4,
  },
  qrWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  rowValue: {
    fontSize: 14,
    lineHeight: 21,
  },
  payloadText: {
    fontSize: 12,
    lineHeight: 18,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  button: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryButton: {
    backgroundColor: '#0d8a72',
  },
  primaryButtonText: {
    color: '#f7fff7',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#dbe6df',
  },
  secondaryButtonText: {
    color: '#173329',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default App;
