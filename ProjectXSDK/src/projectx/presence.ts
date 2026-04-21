import {
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { Buffer } from 'buffer';
import BleManager, {
  type CustomAdvertisingData,
  type Peripheral,
} from 'react-native-ble-manager';

import { ProjectXError } from './errors';
import { startBleAdvertising, stopBleAdvertising } from './native/bleAdvertiser';
import type { BleAdvertisedChallenge, BleScannedChallenge } from './types';

type PresenceScanOptions = {
  serviceUUIDs: string[];
  exactAdvertisingName?: string[];
  seconds?: number;
};

function normalizeServiceUuid(value: string) {
  const normalized = value.toLowerCase();
  return normalized.length === 4
    ? `0000${normalized}-0000-1000-8000-00805f9b34fb`
    : normalized;
}

function decodeAdvertisingBytes(value?: CustomAdvertisingData) {
  if (!value) {
    return null;
  }

  if (Array.isArray(value.bytes) && value.bytes.length > 0) {
    return Uint8Array.from(value.bytes);
  }

  if (value.data) {
    return Uint8Array.from(Buffer.from(value.data, 'base64'));
  }

  return null;
}

function decodeChallengeFromPeripheral(
  peripheral: Peripheral,
  serviceUuid: string,
) {
  const serviceData = peripheral.advertising?.serviceData;
  if (!serviceData) {
    return null;
  }

  const candidate =
    serviceData[normalizeServiceUuid(serviceUuid)] ??
    serviceData[serviceUuid.toLowerCase()] ??
    serviceData[serviceUuid];
  const bytes = decodeAdvertisingBytes(candidate);
  if (!bytes || bytes.length === 0) {
    return null;
  }

  return Buffer.from(bytes).toString('utf8').replace(/\0+$/g, '');
}

export interface PresenceProvider {
  startAdvertisingChallenge(input: BleAdvertisedChallenge): Promise<void>;
  stopAdvertisingChallenge(): Promise<void>;
  scanForChallenge(input: {
    sessionId: string;
    timeoutMs?: number;
  }): Promise<BleScannedChallenge>;
}

export class NoopPresenceProvider implements PresenceProvider {
  async startAdvertisingChallenge(): Promise<void> {}

  async stopAdvertisingChallenge(): Promise<void> {}

  async scanForChallenge(): Promise<BleScannedChallenge> {
    throw new ProjectXError(
      'ble_transport_unavailable',
      'BLE challenge scanning is not configured for this SDK instance',
    );
  }
}

export class BlePresenceProvider implements PresenceProvider {
  private readonly options: PresenceScanOptions;
  private started = false;

  constructor(options?: Partial<PresenceScanOptions>) {
    this.options = {
      serviceUUIDs: ['18f0'],
      seconds: 4,
      ...options,
    };
  }

  private async ensurePermissions() {
    if (Platform.OS !== 'android') {
      return;
    }

    if (Platform.Version >= 31) {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);
      return;
    }

    await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
  }

  private async ensureStarted() {
    if (this.started) {
      return;
    }

    await this.ensurePermissions();
    await BleManager.start({ showAlert: false });
    this.started = true;
  }

  async startAdvertisingChallenge(input: BleAdvertisedChallenge): Promise<void> {
    await startBleAdvertising(this.options.serviceUUIDs[0], input.challenge);
  }

  async stopAdvertisingChallenge(): Promise<void> {
    await stopBleAdvertising();
  }

  async scanForChallenge({
    sessionId: _sessionId,
    timeoutMs,
  }: {
    sessionId: string;
    timeoutMs?: number;
  }): Promise<BleScannedChallenge> {
    await this.ensureStarted();

    return new Promise((resolve, reject) => {
      const scanTimeoutMs = timeoutMs ?? (this.options.seconds ?? 4) * 1000 + 500;
      let settled = false;

      const cleanup = () => {
        discoverSubscription.remove();
        scanStopSubscription.remove();
      };

      const finish = (handler: () => void) => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        handler();
      };

      const discoverSubscription = BleManager.onDiscoverPeripheral(
        (peripheral: Peripheral) => {
          const challenge = decodeChallengeFromPeripheral(
            peripheral,
            this.options.serviceUUIDs[0],
          );
          if (!challenge) {
            return;
          }

          finish(() =>
            resolve({
              transport: 'ble',
              observedAt: new Date().toISOString(),
              challenge,
              peerHint: peripheral.id,
            }),
          );
        },
      );

      const scanStopSubscription = BleManager.onStopScan(
        () => {
          finish(() =>
            reject(
              new ProjectXError(
                'ble_presence_not_detected',
                'No nearby BLE peer advertising this session was detected',
              ),
            ),
          );
        },
      );

      BleManager.scan({
        serviceUUIDs: this.options.serviceUUIDs,
        seconds: this.options.seconds ?? 4,
        allowDuplicates: false,
        exactAdvertisingName: this.options.exactAdvertisingName,
      })
        .catch((error: unknown) => {
          finish(() =>
            reject(
              new ProjectXError(
                'ble_scan_failed',
                error instanceof Error ? error.message : 'BLE scan failed',
              ),
            ),
          );
        });

      setTimeout(() => {
        finish(() =>
          reject(
            new ProjectXError(
              'ble_presence_timeout',
              'BLE presence check timed out',
            ),
          ),
        );
      }, scanTimeoutMs);
    });
  }
}
