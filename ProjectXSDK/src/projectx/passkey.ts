import {
  Passkey,
  type PasskeyCreateRequest,
  type PasskeyCreateResult,
  type PasskeyGetRequest,
  type PasskeyGetResult,
} from 'react-native-passkey';

type RegistrationResponseJson = {
  id: string;
  rawId: string;
  response: {
    clientDataJSON: string;
    attestationObject: string;
    transports?: string[];
  };
  type: 'public-key';
  clientExtensionResults: Record<string, unknown>;
  authenticatorAttachment?: string;
};

type AuthenticationResponseJson = {
  id: string;
  rawId: string;
  response: {
    authenticatorData: string;
    clientDataJSON: string;
    signature: string;
    userHandle?: string;
  };
  type: 'public-key';
  clientExtensionResults: Record<string, unknown>;
  authenticatorAttachment?: string;
};

export interface ProjectXPasskeyProvider {
  completeRegistration(
    options: Record<string, unknown>,
  ): Promise<RegistrationResponseJson>;
  completeVerification(
    options: Record<string, unknown>,
  ): Promise<AuthenticationResponseJson>;
}

function normalizeRegistrationResult(
  result: PasskeyCreateResult,
): RegistrationResponseJson {
  return {
    id: result.id,
    rawId: result.rawId,
    response: {
      clientDataJSON: result.response.clientDataJSON,
      attestationObject: result.response.attestationObject,
      transports: result.response.transports,
    },
    type: 'public-key',
    clientExtensionResults: result.clientExtensionResults ?? {},
    authenticatorAttachment: result.authenticatorAttachment ?? undefined,
  };
}

function normalizeVerificationResult(
  result: PasskeyGetResult,
): AuthenticationResponseJson {
  return {
    id: result.id,
    rawId: result.rawId ?? result.id,
    response: {
      authenticatorData: result.response.authenticatorData,
      clientDataJSON: result.response.clientDataJSON,
      signature: result.response.signature,
      userHandle: result.response.userHandle,
    },
    type: 'public-key',
    clientExtensionResults: result.clientExtensionResults ?? {},
    authenticatorAttachment: result.authenticatorAttachment ?? undefined,
  };
}

export class ReactNativePasskeyProvider implements ProjectXPasskeyProvider {
  async completeRegistration(options: Record<string, unknown>) {
    const result = await Passkey.create(options as unknown as PasskeyCreateRequest);
    return normalizeRegistrationResult(result);
  }

  async completeVerification(options: Record<string, unknown>) {
    const result = await Passkey.get(options as unknown as PasskeyGetRequest);
    return normalizeVerificationResult(result);
  }
}
