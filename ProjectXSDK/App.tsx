import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
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

type Screen = 'home' | 'identity' | 'driver' | 'rider' | 'runtime';

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
  const [screen, setScreen] = useState<Screen>('home');
  const [sessionId, setSessionId] = useState('');
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
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [driverBusy, setDriverBusy] = useState(false);
  const [riderBusy, setRiderBusy] = useState(false);
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

  useEffect(() => {
    if (!error) {
      return;
    }

    Alert.alert('Project X Error', error);
  }, [error]);

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
      setEnrollBusy(true);
      const sdk = sdkRef.current ?? attachSdk();
      const nextIdentity = await sdk.getOrCreateIdentity();
      setIdentity(nextIdentity.pubkey);
      await sdk.enrollWithPasskey(passkeyProviderRef.current);
      await refreshStatus();
      setError('');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to enroll identity');
    } finally {
      setEnrollBusy(false);
    }
  }

  async function prepareDriver() {
    try {
      setDriverBusy(true);
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
    } finally {
      setDriverBusy(false);
    }
  }

  async function prepareRider() {
    try {
      setRiderBusy(true);
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
    } finally {
      setRiderBusy(false);
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
    setScreen('rider');
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
    setSession(null);
    setResult(null);
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

  function renderHomeScreen() {
    return (
      <>
        <Text style={[styles.eyebrow, { color: accentColor }]}>Project X Mobile SDK</Text>
        <Text style={[styles.title, { color: textColor }]}>
          Mobile flow, split into real screens
        </Text>
        <Text style={[styles.lead, { color: mutedColor }]}>
          This build now uses screen-level navigation inside the app shell instead of one
          long control panel. Identity, driver, rider, and runtime views are separated.
        </Text>

        <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Quick Actions</Text>
          <View style={styles.buttonRow}>
            <PrimaryButton title="Identity" onPress={() => setScreen('identity')} />
            <PrimaryButton title="Driver" onPress={() => setScreen('driver')} />
            <PrimaryButton title="Rider" onPress={() => setScreen('rider')} />
            <SecondaryButton title="Runtime" onPress={() => setScreen('runtime')} />
          </View>
          <Row
            label="Identity"
            value={identity || 'not loaded'}
            textColor={textColor}
            mutedColor={mutedColor}
          />
          <Row
            label="Credential"
            value={credentialStatus || 'unknown'}
            textColor={textColor}
            mutedColor={mutedColor}
          />
          <Row
            label="Session"
            value={sessionId || 'auto-generate on driver start'}
            textColor={textColor}
            mutedColor={mutedColor}
          />
          <Row
            label="SDK state"
            value={status.state}
            textColor={textColor}
            mutedColor={mutedColor}
          />
        </View>

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
            label="Session ID Override"
            value={sessionId}
            onChangeText={setSessionId}
            textColor={textColor}
            mutedColor={mutedColor}
            borderColor={borderColor}
          />
        </View>
      </>
    );
  }

  function renderIdentityScreen() {
    return (
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
          <SecondaryButton
            title={enrollBusy ? 'Enrolling...' : 'Enroll Native'}
            onPress={handleEnrollIdentity}
          />
        </View>
        {status.state !== 'idle' ? (
          <Text style={[styles.caption, { color: mutedColor }]}>
            Enrollment state: {status.state}
            {status.detail ? ` - ${status.detail}` : ''}
          </Text>
        ) : null}
        {error ? (
          <Text style={[styles.errorText, { color: '#b42318' }]}>{error}</Text>
        ) : null}
      </View>
    );
  }

  function renderDriverScreen() {
    const riderJoined = Boolean(session?.riderPubkey);
    const driverReady =
      Boolean(joinQrPayload) &&
      (status.state === 'waiting_for_peer' ||
        status.state === 'peer_connected' ||
        status.state === 'authenticating' ||
        status.state === 'sharing_location' ||
        status.state === 'waiting_for_prepare' ||
        status.state === 'signing_verify' ||
        status.state === 'verified');
    const canStartVerify = riderJoined && status.state === 'peer_connected';

    return (
      <>
        <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Driver Flow</Text>
          <Text style={[styles.caption, { color: mutedColor }]}>
            Start here. This creates a fresh driver session, connects as `partyA`, and
            shows the join QR for the rider.
          </Text>

          <View style={styles.buttonRow}>
            <PrimaryButton
              title={driverBusy ? 'Starting Driver...' : driverReady ? 'Reset Driver Session' : 'Start Driver Session'}
              onPress={handlePrepareDriver}
            />
            <SecondaryButton
              title="Verify"
              onPress={handleStartDriverVerification}
              disabled={!canStartVerify}
            />
            <SecondaryButton title="Disconnect" onPress={disconnectSession} />
          </View>
          <Row
            label="Session"
            value={session?.sessionId ?? sessionId ?? 'not created'}
            textColor={textColor}
            mutedColor={mutedColor}
          />
          <Row
            label="Driver status"
            value={
              !driverReady
                ? 'create session first'
                : riderJoined
                  ? 'rider joined'
                  : 'waiting for rider'
            }
            textColor={textColor}
            mutedColor={mutedColor}
          />
          <Text style={[styles.caption, { color: mutedColor }]}>
            {canStartVerify
              ? 'Rider is connected. You can start biometric verification now.'
              : driverReady
                ? 'Share the QR below. Verify unlocks after the rider joins.'
                : 'Tap Start Driver Session to create a backend session and show the QR.'}
          </Text>
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
        ) : (
          <View style={[styles.notice, { borderColor, backgroundColor: cardColor }]}>
            <Text style={[styles.noticeTitle, { color: textColor }]}>No Join QR Yet</Text>
            <Text style={[styles.caption, { color: mutedColor }]}>
              Prepare a driver session first. The join QR appears here after the backend
              issues a join token.
            </Text>
          </View>
        )}
      </>
    );
  }

  function renderRiderScreen() {
    return (
      <>
        <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Rider Flow</Text>
          <Text style={[styles.caption, { color: mutedColor }]}>
            Join as `partyB` from the driver’s QR payload. Direct session-id join is only
            here as a fallback for testing.
          </Text>
          <View style={styles.buttonRow}>
            <PrimaryButton
              title={Platform.OS === 'android' ? 'Open Join From QR' : 'Scan Driver QR'}
              onPress={handleOpenScanner}
            />
            <SecondaryButton
              title={riderBusy ? 'Joining...' : 'Join By Session ID'}
              onPress={handlePrepareRider}
            />
            <SecondaryButton title="Disconnect" onPress={disconnectSession} />
          </View>
          <Text style={[styles.caption, { color: mutedColor }]}>
            Preferred flow: open the QR join sheet and paste or scan the driver payload.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Rider Session</Text>
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
            label="Session ID"
            value={session?.sessionId ?? sessionId}
            textColor={textColor}
            mutedColor={mutedColor}
          />
        </View>
      </>
    );
  }

  function renderRuntimeScreen() {
    return (
      <>
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
      </>
    );
  }

  function renderScreenContent() {
    switch (screen) {
      case 'identity':
        return renderIdentityScreen();
      case 'driver':
        return renderDriverScreen();
      case 'rider':
        return renderRiderScreen();
      case 'runtime':
        return renderRuntimeScreen();
      case 'home':
      default:
        return renderHomeScreen();
    }
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.navRow}>
          <NavChip title="Home" active={screen === 'home'} onPress={() => setScreen('home')} />
          <NavChip
            title="Identity"
            active={screen === 'identity'}
            onPress={() => setScreen('identity')}
          />
          <NavChip title="Driver" active={screen === 'driver'} onPress={() => setScreen('driver')} />
          <NavChip title="Rider" active={screen === 'rider'} onPress={() => setScreen('rider')} />
          <NavChip
            title="Runtime"
            active={screen === 'runtime'}
            onPress={() => setScreen('runtime')}
          />
        </View>

        {renderScreenContent()}
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
  disabled,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={[
        styles.button,
        styles.primaryButton,
        disabled ? styles.buttonDisabled : null,
      ]}
    >
      <Text style={styles.primaryButtonText}>{title}</Text>
    </Pressable>
  );
}

function SecondaryButton({
  title,
  onPress,
  disabled,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={[
        styles.button,
        styles.secondaryButton,
        disabled ? styles.buttonDisabled : null,
      ]}
    >
      <Text style={styles.secondaryButtonText}>{title}</Text>
    </Pressable>
  );
}

function NavChip({
  title,
  active,
  onPress,
}: {
  title: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.navChip,
        active ? styles.navChipActive : styles.navChipInactive,
      ]}
    >
      <Text style={active ? styles.navChipTextActive : styles.navChipTextInactive}>
        {title}
      </Text>
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
  navRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
  errorText: {
    fontSize: 13,
    lineHeight: 19,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  navChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  navChipActive: {
    backgroundColor: '#0d8a72',
  },
  navChipInactive: {
    backgroundColor: '#dbe6df',
  },
  navChipTextActive: {
    color: '#f7fff7',
    fontSize: 13,
    fontWeight: '700',
  },
  navChipTextInactive: {
    color: '#173329',
    fontSize: 13,
    fontWeight: '700',
  },
  button: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  buttonDisabled: {
    opacity: 0.45,
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
