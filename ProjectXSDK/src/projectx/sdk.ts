import { io, type Socket } from 'socket.io-client';

import { TypedEmitter } from './emitter';
import { ProjectXError, toErrorMessage } from './errors';
import { ProjectXApiClient, type ProjectXApiClientOptions } from './http';
import { ProjectXIdentityManager } from './identity';
import {
  NoopPresenceProvider,
  type PresenceProvider,
} from './presence';
import type { ProjectXPasskeyProvider } from './passkey';
import type {
  BleScannedChallenge,
  ProjectXJoinQrPayload,
  PartyRole,
  ProjectXIdentity,
  ProjectXPresenceIssueResponse,
  ProjectXSessionResponse,
  ProjectXStatusResponse,
  VerificationResult,
  VerificationStatusUpdate,
} from './types';

export interface ProjectXAuthProvider {
  completeVerification(challenge: Record<string, unknown>): Promise<unknown>;
}

export interface ProjectXLocationProvider {
  getCurrentCoordinates(): Promise<{
    lat: number;
    lng: number;
    accuracy?: number;
  }>;
}

type ProjectXSdkOptions = ProjectXApiClientOptions & {
  socketUrl: string;
  identityManager?: ProjectXIdentityManager;
  presenceProvider?: PresenceProvider;
  authProvider?: ProjectXAuthProvider;
  locationProvider?: ProjectXLocationProvider;
};

type ProjectXEvents = {
  status: VerificationStatusUpdate;
  result: VerificationResult;
  error: { message: string };
  session: ProjectXSessionResponse;
};

const PRESENCE_SIGNING_DOMAIN = 'projectx-presence:v1';

function buildPresenceSigningPayload(
  sessionId: string,
  challenge: string,
  expiresAt: string,
) {
  return `${PRESENCE_SIGNING_DOMAIN}|${sessionId}|${challenge}|${expiresAt}|role=partyB`;
}

export class ProjectXSdk {
  readonly api: ProjectXApiClient;
  readonly identity: ProjectXIdentityManager;

  private readonly socketUrl: string;
  private readonly emitter = new TypedEmitter<ProjectXEvents>();
  private readonly presenceProvider: PresenceProvider;
  private readonly authProvider?: ProjectXAuthProvider;
  private readonly locationProvider?: ProjectXLocationProvider;
  private socket: Socket | null = null;
  private role: PartyRole | null = null;
  private sessionId: string | null = null;
  private presenceConfirmInFlight = false;

  constructor(options: ProjectXSdkOptions) {
    this.api = new ProjectXApiClient(options);
    this.identity = options.identityManager ?? new ProjectXIdentityManager();
    this.socketUrl = options.socketUrl;
    this.presenceProvider = options.presenceProvider ?? new NoopPresenceProvider();
    this.authProvider = options.authProvider;
    this.locationProvider = options.locationProvider;
  }

  onStatus(listener: (update: VerificationStatusUpdate) => void) {
    return this.emitter.on('status', listener);
  }

  onResult(listener: (result: VerificationResult) => void) {
    return this.emitter.on('result', listener);
  }

  onError(listener: (payload: { message: string }) => void) {
    return this.emitter.on('error', listener);
  }

  onSession(listener: (session: ProjectXSessionResponse) => void) {
    return this.emitter.on('session', listener);
  }

  private emitStatus(state: VerificationStatusUpdate['state'], detail?: string) {
    this.emitter.emit('status', { state, detail });
  }

  private emitError(error: unknown, fallback: string) {
    this.emitter.emit('error', { message: toErrorMessage(error, fallback) });
  }

  async getOrCreateIdentity(): Promise<ProjectXIdentity> {
    return this.identity.getOrCreateIdentity();
  }

  async getCredentialStatus(): Promise<ProjectXStatusResponse> {
    const identity = await this.getOrCreateIdentity();
    return this.api.getStatus(identity.pubkey);
  }

  async enrollWithPasskey(passkeyProvider: ProjectXPasskeyProvider) {
    try {
      const identity = await this.getOrCreateIdentity();
      this.emitStatus('creating_session', 'Preparing native passkey enrollment');

      let registrationOptions: Record<string, unknown>;
      try {
        registrationOptions = await this.api.beginRegistration(identity.pubkey);
      } catch (error) {
        throw new ProjectXError(
          'registration_begin_failed',
          toErrorMessage(error, 'Unable to start passkey registration'),
        );
      }

      let registrationResponse: unknown;
      try {
        registrationResponse = await passkeyProvider.completeRegistration(
          registrationOptions,
        );
      } catch (error) {
        throw new ProjectXError(
          'registration_native_failed',
          toErrorMessage(error, 'Native passkey registration failed'),
        );
      }

      let completedRegistration: { credentialHash: string };
      try {
        completedRegistration = await this.api.completeRegistration(
          identity.pubkey,
          registrationResponse,
        );
      } catch (error) {
        throw new ProjectXError(
          'registration_complete_failed',
          toErrorMessage(error, 'Server rejected passkey registration'),
        );
      }

      let preparedEnroll: { prepareId: string; transaction: string };
      try {
        preparedEnroll = await this.api.prepareEnroll(
          identity.pubkey,
          completedRegistration.credentialHash,
        );
      } catch (error) {
        throw new ProjectXError(
          'enroll_prepare_failed',
          toErrorMessage(error, 'Unable to prepare enrollment transaction'),
        );
      }

      let signedTransaction: string;
      try {
        signedTransaction = await this.identity.signSerializedTransaction(
          preparedEnroll.transaction,
        );
      } catch (error) {
        throw new ProjectXError(
          'enroll_sign_failed',
          toErrorMessage(error, 'Unable to sign enrollment transaction'),
        );
      }

      try {
        return await this.api.submitEnroll(preparedEnroll.prepareId, signedTransaction);
      } catch (error) {
        throw new ProjectXError(
          'enroll_submit_failed',
          toErrorMessage(error, 'Unable to submit enrollment transaction'),
        );
      }
    } catch (error) {
      this.emitStatus('failed', toErrorMessage(error, 'Native enrollment failed'));
      this.emitError(error, 'Native enrollment failed');
      throw error;
    }
  }

  async prepareDriverSession(sessionId?: string) {
    const identity = await this.getOrCreateIdentity();
    this.emitStatus('creating_session');
    const session = await this.api.createSession(sessionId, identity.pubkey);
    this.emitter.emit('session', session);
    return session;
  }

  async prepareRiderSession(sessionId: string) {
    const identity = await this.getOrCreateIdentity();
    this.emitStatus('joining_session');
    const session = await this.api.joinSession(sessionId, identity.pubkey);
    this.emitter.emit('session', session);
    return session;
  }

  async prepareRiderSessionByJoinToken(joinToken: string) {
    const identity = await this.getOrCreateIdentity();
    this.emitStatus('joining_session');
    const session = await this.api.joinSessionByToken(joinToken, identity.pubkey);
    this.emitter.emit('session', session);
    return session;
  }

  buildJoinQrPayload(session: ProjectXSessionResponse): ProjectXJoinQrPayload {
    if (!session.joinToken) {
      throw new ProjectXError(
        'join_token_missing',
        'Session does not include a join token for QR pairing',
      );
    }

    return {
      version: 1,
      kind: 'projectx-join',
      sessionId: session.sessionId,
      joinToken: session.joinToken,
      joinTokenExpiresAt: session.joinTokenExpiresAt ?? null,
    };
  }

  async startDriverPresenceBroadcast(): Promise<ProjectXPresenceIssueResponse> {
    if (this.role !== 'partyA' || !this.sessionId) {
      throw new ProjectXError(
        'driver_not_connected',
        'Driver session is not connected',
      );
    }

    const identity = await this.getOrCreateIdentity();
    const issued = await this.api.issuePresenceChallenge(this.sessionId, identity.pubkey);
    await this.presenceProvider.startAdvertisingChallenge({
      sessionId: this.sessionId,
      challenge: issued.challenge,
      expiresAt: issued.expiresAt,
    });
    this.socket?.emit('presence:broadcasting', {
      sessionId: this.sessionId,
      pubkey: identity.pubkey,
      expiresAt: issued.expiresAt,
    });
    return issued;
  }

  async stopDriverPresenceBroadcast() {
    await this.presenceProvider.stopAdvertisingChallenge();
  }

  async scanRiderPresenceChallenge(): Promise<BleScannedChallenge> {
    if (this.role !== 'partyB' || !this.sessionId) {
      throw new ProjectXError(
        'rider_not_connected',
        'Rider session is not connected',
      );
    }

    return this.presenceProvider.scanForChallenge({
      sessionId: this.sessionId,
    });
  }

  async confirmRiderPresence() {
    if (this.role !== 'partyB' || !this.sessionId) {
      throw new ProjectXError(
        'rider_not_connected',
        'Rider session is not connected',
      );
    }

    const identity = await this.getOrCreateIdentity();
    this.emitStatus('checking_presence');
    const scanned = await this.scanRiderPresenceChallenge();
    const presenceState = await this.api.getPresenceState(this.sessionId);

    if (!presenceState.challengeActive || !presenceState.challengeExpiresAt) {
      throw new ProjectXError(
        'presence_challenge_missing',
        'No active BLE presence challenge is available for this session',
      );
    }

    const signingPayload = buildPresenceSigningPayload(
      this.sessionId,
      scanned.challenge,
      presenceState.challengeExpiresAt,
    );
    const signature = await this.identity.signMessage(signingPayload);

    return this.api.confirmPresenceChallenge(
      this.sessionId,
      identity.pubkey,
      scanned.challenge,
      signature,
    );
  }

  private async recoverOrConfirmRiderPresence() {
    if (this.role !== 'partyB' || !this.sessionId || this.presenceConfirmInFlight) {
      return;
    }

    this.presenceConfirmInFlight = true;
    try {
      const presenceState = await this.api.getPresenceState(this.sessionId);
      if (!presenceState.challengeActive || presenceState.confirmed) {
        return;
      }

      await this.confirmRiderPresence();
    } catch (error) {
      this.emitError(error, 'Unable to confirm rider BLE presence');
    } finally {
      this.presenceConfirmInFlight = false;
    }
  }

  async connectToSession(sessionId: string, role: PartyRole) {
    const identity = await this.getOrCreateIdentity();
    this.role = role;
    this.sessionId = sessionId;
    this.emitStatus('connecting_socket');

    this.socket?.disconnect();
    this.socket = io(this.socketUrl, {
      path: '/socket.io',
      transports: ['websocket'],
    });

    this.socket.on('connect', () => {
      this.socket?.emit('join', {
        sessionId,
        pubkey: identity.pubkey,
        role,
      });
      this.emitStatus('waiting_for_peer');
    });

    this.socket.on('party:connected', () => {
      this.emitStatus('peer_connected');
      if (role === 'partyB') {
        this.recoverOrConfirmRiderPresence().catch(() => {});
      }
    });

    this.socket.on('presence:broadcasting', () => {
      if (role !== 'partyB') {
        return;
      }

      this.recoverOrConfirmRiderPresence().catch(() => {});
    });

    this.socket.on('driver:verifying', ({ role: senderRole }) => {
      if (role !== 'partyB' || senderRole !== 'partyA') {
        return;
      }

      this.completePartyVerification().catch(() => {});
    });

    this.socket.on('verify:prepare', async payload => {
      if (payload.partyAPubkey !== identity.pubkey && payload.partyBPubkey !== identity.pubkey) {
        return;
      }

      try {
        this.emitStatus('signing_verify');
        const signedTransaction = await this.identity.signSerializedTransaction(
          payload.transaction,
        );
        this.socket?.emit('verify:signed', {
          prepareId: payload.prepareId,
          pubkey: identity.pubkey,
          signedTransaction,
        });
      } catch (error) {
        this.emitStatus('failed', toErrorMessage(error, 'Unable to sign verify transaction'));
        this.emitError(error, 'Unable to sign verify transaction');
      }
    });

    this.socket.on('verify:result', result => {
      this.emitStatus(result.verified ? 'verified' : 'failed', result.reason);
      this.emitter.emit('result', result);
    });

    this.socket.on('session:error', payload => {
      this.emitStatus('failed', payload.error);
      this.emitError(new ProjectXError('session_error', payload.error), payload.error);
    });

    this.socket.on('disconnect', () => {
      this.emitStatus('disconnected');
    });
  }

  async startDriverVerification() {
    if (this.role !== 'partyA' || !this.sessionId) {
      throw new ProjectXError(
        'driver_not_connected',
        'Driver session is not connected',
      );
    }

    await this.completePartyVerification();
  }

  private async completePartyVerification() {
    if (!this.sessionId || !this.role) {
      throw new ProjectXError(
        'session_missing',
        'Session is not connected',
      );
    }

    if (!this.authProvider) {
      throw new ProjectXError(
        'auth_provider_missing',
        'A native verification provider is required for WebAuthn/passkey verification',
      );
    }

    if (!this.locationProvider) {
      throw new ProjectXError(
        'location_provider_missing',
        'A location provider is required to complete verification',
      );
    }

    const identity = await this.getOrCreateIdentity();

    try {
      this.emitStatus('authenticating');
      const challenge = await this.api.beginVerification(
        this.sessionId,
        identity.pubkey,
      );
      const authResponse = await this.authProvider.completeVerification(challenge);
      await this.api.completeVerification(
        this.sessionId,
        identity.pubkey,
        authResponse,
      );

      this.emitStatus('sharing_location');
      const coords = await this.locationProvider.getCurrentCoordinates();

      this.emitStatus('waiting_for_prepare');
      this.socket?.emit('driver:thumb', {
        sessionId: this.sessionId,
        pubkey: identity.pubkey,
        role: this.role,
        coords,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.emitStatus('failed', toErrorMessage(error, 'Verification failed'));
      this.emitError(error, 'Verification failed');
      throw error;
    }
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.role = null;
    this.sessionId = null;
  }
}
