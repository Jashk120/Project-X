import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

import { Buffer } from 'buffer';

const globalObject = globalThis as typeof globalThis & {
  Buffer?: typeof Buffer;
};

if (!globalObject.Buffer) {
  globalObject.Buffer = Buffer;
}
