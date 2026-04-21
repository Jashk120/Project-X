# ProjectXSDK

React Native mobile client and SDK shell for the Project X infrastructure stack.

This app is not the product boundary by itself. It is the mobile client over:
- `project-x-server` for HTTP + Socket.IO coordination
- `project-x-program` for on-chain credential/proximity verification

The important distinction in this workspace is:
- backend + program = real system boundary
- `project-x` Next app = older demo/reference client
- `ProjectXSDK` = mobile SDK + demo shell for the newer QR + BLE flow

## Purpose

`ProjectXSDK` currently serves two roles:

1. A reusable mobile SDK layer under `src/projectx`
2. A thin React Native demo app in `App.tsx` that exercises that SDK

The long-term goal is for app code to use the SDK primitives instead of reimplementing:
- local identity creation/storage
- backend API calls
- session join/create logic
- socket room coordination
- BLE presence transport
- QR pairing
- signing backend-prepared Solana transactions

## Current Flow

Current intended flow:

1. Driver creates a session
2. Backend returns:
   - `sessionId`
   - `joinToken`
3. Driver app renders a QR containing the join payload
4. Rider scans the QR and joins the backend session with `join-by-token`
5. Driver requests a short-lived BLE presence challenge from backend
6. Driver advertises that challenge over BLE
7. Rider scans BLE service data, reads the challenge, signs the canonical payload, and calls `presence/confirm`
8. Backend stores BLE presence confirmation on the session
9. Existing WebAuthn + GPS + verify flow continues
10. Backend socket gate now requires BLE presence confirmation before `prepareVerify`

Important: GPS proximity is still active. BLE presence was added as an additional required gate, not a replacement yet.

## Config

SDK-owned config lives in:

- [src/projectx/config.ts](./src/projectx/config.ts)

That file exports:
- `PROJECT_X_SDK_CONFIG_PRESETS`
- `PROJECT_X_SDK_CONFIG`

This is the file to edit when switching between:
- Android emulator
- LAN IP
- ngrok

Current default is the ngrok host:

- `https://tilt-tiger-recliner.ngrok-free.dev`

Values in config:
- `apiUrl`
- `socketUrl`
- `platformApiKey`

`platformApiKey` is the demo/shared backend API key used for protected session routes such as `session/create` and `session/close`. It is not the Solana `PLATFORM_KEYPAIR`.

## File Map

### App shell

- [App.tsx](./App.tsx)
  - Demo UI
  - Driver QR generation
  - Rider QR scanner
  - Manual config fields still exposed in the UI for testing

### SDK core

- [src/projectx/sdk.ts](./src/projectx/sdk.ts)
  - Main orchestration layer
  - Session create/join
  - QR payload builder
  - Driver BLE presence broadcast trigger
  - Rider BLE presence confirmation flow
  - Socket room lifecycle

- [src/projectx/http.ts](./src/projectx/http.ts)
  - Typed backend HTTP client
  - Session routes
  - Presence routes
  - WebAuthn verify routes
  - Enroll prepare/submit routes

- [src/projectx/identity.ts](./src/projectx/identity.ts)
  - Secure local keypair storage via Keychain/Keystore
  - Transaction signing
  - Message signing for BLE presence confirmation

- [src/projectx/presence.ts](./src/projectx/presence.ts)
  - BLE transport only
  - Driver advertising primitive
  - Rider scan primitive
  - Does not own backend protocol logic

- [src/projectx/config.ts](./src/projectx/config.ts)
  - SDK-owned backend URL defaults

- [src/projectx/types.ts](./src/projectx/types.ts)
  - Shared SDK response/event/types

- [src/projectx/native/bleAdvertiser.ts](./src/projectx/native/bleAdvertiser.ts)
  - JS wrapper for the Android BLE advertiser native module

### Android native pieces

- [android/app/src/main/java/com/projectxsdk/BleAdvertiserModule.kt](./android/app/src/main/java/com/projectxsdk/BleAdvertiserModule.kt)
  - Thin Kotlin native module for BLE advertising

- [android/app/src/main/java/com/projectxsdk/BleAdvertiserPackage.kt](./android/app/src/main/java/com/projectxsdk/BleAdvertiserPackage.kt)
  - Manual package registration for the advertiser module

- [android/app/src/main/java/com/projectxsdk/MainApplication.kt](./android/app/src/main/java/com/projectxsdk/MainApplication.kt)
  - Registers the custom BLE advertiser package

## Backend Contract This SDK Uses

Main session endpoints:
- `POST /session/create`
- `POST /session/join`
- `POST /session/join-by-token`
- `GET /session/:sessionId`
- `POST /session/close`

BLE presence endpoints:
- `POST /session/presence/issue`
- `POST /session/presence/confirm`
- `GET /session/:sessionId/presence`

Socket events currently used:
- `party:connected`
- `presence:broadcasting`
- `driver:verifying`
- `verify:prepare`
- `verify:result`
- `session:error`

## Current Important Behavior

### Driver side

Driver flow currently owns:
- create session
- render QR join payload
- connect socket as `partyA`
- request BLE presence challenge
- advertise BLE challenge
- emit `presence:broadcasting`

### Rider side

Rider flow currently owns:
- scan QR join payload
- join session by `joinToken`
- connect socket as `partyB`
- listen for `presence:broadcasting`
- recover on late join by checking backend presence state
- scan BLE service data for challenge token
- sign canonical presence payload
- call `presence/confirm`

### Verification gating

Server now requires:
- both parties connected
- both WebAuthn signatures present
- BLE presence confirmed
- GPS proximity approved

before moving to `prepareVerify`

## Native / Runtime Notes

- After adding native Android code, a full native rebuild is required. Metro reload is not enough.
- iOS also needs native dependency installation/rebuild after native dependency changes.
- BLE advertising is currently implemented through the thin Android native module.
- BLE scan uses `react-native-ble-manager`.
- QR scanning uses `react-native-vision-camera`.

## Known Gaps / Caveats

- The React Native demo app still shows manual config inputs even though defaults now live in SDK config.
- The older `project-x` Next demo is now partially stale relative to the QR + BLE flow.
- BLE advertising support is Android-native in this repo; iOS equivalent is not implemented here yet.
- This has been typechecked and linted locally, but the BLE path still needs real-device validation.
- Backend still treats GPS as required alongside BLE presence.

## Running

From `ProjectXSDK`:

```sh
npm start
npm run android
```

For iOS after native dependency changes:

```sh
bundle install
bundle exec pod install
npm run ios
```

Useful checks:

```sh
npx tsc --noEmit
npm run lint
npm test -- --runInBand
```

## Practical Editing Rule

If you need to change where the mobile SDK points:
- edit [src/projectx/config.ts](./src/projectx/config.ts)

Do not treat `App.tsx` as the source of truth for backend URLs anymore. The SDK config file is the source of truth.
