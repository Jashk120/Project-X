export type PartyRole = 'partyA' | 'partyB';

export type ProjectXSessionResponse = {
  sessionId: string;
  driverPubkey: string;
  riderPubkey: string | null;
  joinToken?: string | null;
  joinTokenExpiresAt?: string | null;
  expiresAt: string;
  presence?: {
    challenge?: string | null;
    challengeExpiresAt?: string | null;
    challengeUsedAt?: string | null;
    confirmedAt?: string | null;
    confirmedByPubkey?: string | null;
  };
};

export type ProjectXStatusResponse = {
  enrolled?: boolean;
  isActive?: boolean;
};

export type ProjectXPresenceIssueResponse = {
  sessionId: string;
  challenge: string;
  expiresAt: string;
  signingPayload: string;
};

export type ProjectXPresenceConfirmResponse = {
  sessionId: string;
  confirmed: boolean;
  confirmedAt: string;
  confirmedByPubkey: string;
};

export type ProjectXPresenceStateResponse = {
  sessionId: string;
  challengeActive: boolean;
  challengeExpiresAt: string | null;
  confirmed: boolean;
  confirmedAt: string | null;
  confirmedByPubkey: string | null;
};

export type ProjectXJoinQrPayload = {
  version: 1;
  kind: 'projectx-join';
  sessionId: string;
  joinToken: string;
  joinTokenExpiresAt: string | null;
};

export type ProjectXCoordinate = {
  lat: number;
  lng: number;
  accuracy?: number;
};

export type VerificationState =
  | 'idle'
  | 'creating_session'
  | 'joining_session'
  | 'connecting_socket'
  | 'waiting_for_peer'
  | 'peer_connected'
  | 'checking_presence'
  | 'authenticating'
  | 'sharing_location'
  | 'waiting_for_prepare'
  | 'signing_verify'
  | 'verified'
  | 'failed'
  | 'disconnected';

export type VerificationStatusUpdate = {
  state: VerificationState;
  detail?: string;
};

export type VerificationResult = {
  verified: boolean;
  reason?: string;
};

export type VerifyPreparePayload = {
  prepareId: string;
  transaction: string;
  expiresAt: string;
  partyAPubkey: string;
  partyBPubkey: string;
};

export type BlePresenceReceipt = {
  transport: 'ble' | 'none';
  observedAt: string;
  peerHint?: string;
};

export type BleAdvertisedChallenge = {
  sessionId: string;
  challenge: string;
  expiresAt: string;
};

export type BleScannedChallenge = BlePresenceReceipt & {
  challenge: string;
};

export type ProjectXIdentity = {
  pubkey: string;
  secretKeyBase64: string;
};

export type StoredIdentity = {
  pubkey: string;
  secretKeyBase64: string;
};

export type VerificationSocketEvents = {
  'party:connected': undefined;
  'presence:broadcasting': {
    sessionId: string;
    driverPubkey: string;
    expiresAt: string;
    timestamp: number;
  };
  'driver:verifying': {
    pubkey: string;
    role: PartyRole;
    timestamp: number;
  };
  'verify:prepare': VerifyPreparePayload;
  'verify:result': VerificationResult & {
    driverPubkey: string;
    timestamp: number;
  };
  'session:error': {
    error: string;
  };
};
