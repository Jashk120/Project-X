import { NativeModules, Platform } from 'react-native';

type BleAdvertiserModuleShape = {
  startAdvertising(serviceUuid: string, challenge: string): Promise<void>;
  stopAdvertising(): Promise<void>;
};

const moduleRef = NativeModules.BleAdvertiser as BleAdvertiserModuleShape | undefined;

export async function startBleAdvertising(serviceUuid: string, challenge: string) {
  if (Platform.OS !== 'android' || !moduleRef) {
    throw new Error('BLE advertising native module is only implemented on Android');
  }

  await moduleRef.startAdvertising(serviceUuid, challenge);
}

export async function stopBleAdvertising() {
  if (Platform.OS !== 'android' || !moduleRef) {
    return;
  }

  await moduleRef.stopAdvertising();
}
