import { ProjectXError } from './errors';
import type {
  ProjectXPresenceConfirmResponse,
  ProjectXPresenceIssueResponse,
  ProjectXPresenceStateResponse,
  ProjectXSessionResponse,
  ProjectXStatusResponse,
} from './types';

type RequestInitWithJson = RequestInit & {
  json?: unknown;
};

export type ProjectXApiClientOptions = {
  baseUrl: string;
  platformApiKey?: string;
};

type VerifyChallengeResponse = Record<string, unknown>;

type VerifyCompleteResponse = {
  verified: boolean;
};

type PrepareEnrollResponse = {
  prepareId: string;
  transaction: string;
  expiresAt: string;
};

type BeginRegistrationResponse = Record<string, unknown>;

type CompleteRegistrationResponse = {
  success: boolean;
  credentialId: string;
  credentialHash: string;
};

export class ProjectXApiClient {
  private readonly baseUrl: string;
  private readonly platformApiKey?: string;

  constructor(options: ProjectXApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.platformApiKey = options.platformApiKey;
  }

  private async request<T>(path: string, init?: RequestInitWithJson): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      body: init?.json === undefined ? init?.body : JSON.stringify(init.json),
    });

    const text = await response.text();
    let data = {} as T & { error?: string };
    if (text) {
      try {
        data = JSON.parse(text) as T & { error?: string };
      } catch {
        const snippet = text.length > 240 ? `${text.slice(0, 240)}...` : text;
        throw new ProjectXError(
          'api_invalid_json',
          `Non-JSON response from ${path}: ${snippet}`,
        );
      }
    }

    if (!response.ok) {
      throw new ProjectXError(
        'api_error',
        data && typeof data === 'object' && 'error' in data && data.error
          ? String(data.error)
          : `Request failed for ${path}`,
      );
    }

    return data;
  }

  getStatus(subjectPubkey: string) {
    return this.request<ProjectXStatusResponse>(
      `/status?subjectPubkey=${encodeURIComponent(subjectPubkey)}`,
    );
  }

  beginRegistration(subjectPubkey: string) {
    return this.request<BeginRegistrationResponse>('/webauthn/register/begin', {
      method: 'POST',
      json: {
        subjectPubkey,
      },
    });
  }

  completeRegistration(subjectPubkey: string, response: unknown) {
    return this.request<CompleteRegistrationResponse>('/webauthn/register/complete', {
      method: 'POST',
      json: {
        subjectPubkey,
        response,
      },
    });
  }

  getSession(sessionId: string) {
    return this.request<ProjectXSessionResponse>(
      `/session/${encodeURIComponent(sessionId)}`,
      { method: 'GET' },
    );
  }

  createSession(sessionId: string | undefined, driverPubkey: string) {
    if (!this.platformApiKey) {
      throw new ProjectXError(
        'platform_key_missing',
        'Platform API key is required to create sessions',
      );
    }

    return this.request<ProjectXSessionResponse>('/session/create', {
      method: 'POST',
      headers: {
        'X-Project-X-Platform-Key': this.platformApiKey,
      },
      json: {
        ...(sessionId ? { tripId: sessionId } : {}),
        driverPubkey,
      },
    });
  }

  joinSession(sessionId: string, riderPubkey: string) {
    return this.request<ProjectXSessionResponse>('/session/join', {
      method: 'POST',
      json: {
        sessionId,
        riderPubkey,
      },
    });
  }

  joinSessionByToken(joinToken: string, riderPubkey: string) {
    return this.request<ProjectXSessionResponse>('/session/join-by-token', {
      method: 'POST',
      json: {
        joinToken,
        riderPubkey,
      },
    });
  }

  closeSession(sessionId: string) {
    if (!this.platformApiKey) {
      throw new ProjectXError(
        'platform_key_missing',
        'Platform API key is required to close sessions',
      );
    }

    return this.request<ProjectXSessionResponse>('/session/close', {
      method: 'POST',
      headers: {
        'X-Project-X-Platform-Key': this.platformApiKey,
      },
      json: {
        sessionId,
      },
    });
  }

  issuePresenceChallenge(sessionId: string, requesterPubkey: string) {
    return this.request<ProjectXPresenceIssueResponse>('/session/presence/issue', {
      method: 'POST',
      json: {
        sessionId,
        requesterPubkey,
      },
    });
  }

  confirmPresenceChallenge(
    sessionId: string,
    responderPubkey: string,
    challenge: string,
    signature: string,
  ) {
    return this.request<ProjectXPresenceConfirmResponse>('/session/presence/confirm', {
      method: 'POST',
      json: {
        sessionId,
        responderPubkey,
        challenge,
        signature,
      },
    });
  }

  getPresenceState(sessionId: string) {
    return this.request<ProjectXPresenceStateResponse>(
      `/session/${encodeURIComponent(sessionId)}/presence`,
      { method: 'GET' },
    );
  }

  beginVerification(sessionId: string, subjectPubkey: string) {
    return this.request<VerifyChallengeResponse>('/webauthn/verify/begin', {
      method: 'POST',
      json: {
        sessionId,
        subjectPubkey,
      },
    });
  }

  completeVerification(
    sessionId: string,
    subjectPubkey: string,
    response: unknown,
  ) {
    return this.request<VerifyCompleteResponse>('/webauthn/verify/complete', {
      method: 'POST',
      json: {
        sessionId,
        subjectPubkey,
        response,
      },
    });
  }

  prepareEnroll(subjectPubkey: string, credentialHash: string) {
    return this.request<PrepareEnrollResponse>('/enroll/prepare', {
      method: 'POST',
      json: {
        subjectPubkey,
        credentialHash,
      },
    });
  }

  submitEnroll(prepareId: string, signedTransaction: string) {
    return this.request<{ signature: string; status: 'submitted' }>(
      '/enroll/submit',
      {
        method: 'POST',
        json: {
          prepareId,
          signedTransaction,
        },
      },
    );
  }
}
