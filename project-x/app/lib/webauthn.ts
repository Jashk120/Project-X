'use client'

const API_BASE_URL =
  process.env.NEXT_PUBLIC_PROJECT_X_API_URL ?? '/api/v1'

type RegistrationOptionsJSON = {
  challenge: string
  rp: PublicKeyCredentialRpEntity
  user: PublicKeyCredentialUserEntityJSON
  pubKeyCredParams: PublicKeyCredentialParameters[]
  timeout?: number
  excludeCredentials?: PublicKeyCredentialDescriptorJSON[]
  authenticatorSelection?: AuthenticatorSelectionCriteria
  attestation?: AttestationConveyancePreference
}

type PublicKeyCredentialUserEntityJSON = Omit<PublicKeyCredentialUserEntity, 'id'> & {
  id: string
}

type PublicKeyCredentialDescriptorJSON = Omit<PublicKeyCredentialDescriptor, 'id'> & {
  id: string
}

type AuthenticatorAttestationResponseJSON = {
  clientDataJSON: string
  attestationObject: string
  transports?: AuthenticatorTransport[]
}

type RegistrationCredentialJSON = {
  id: string
  rawId: string
  response: AuthenticatorAttestationResponseJSON
  type: PublicKeyCredentialType
  clientExtensionResults: AuthenticationExtensionsClientOutputs
  authenticatorAttachment?: AuthenticatorAttachment | null
}

function base64UrlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = window.atob(base64 + padding)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return bytes.buffer
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })

  return window
    .btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function toPublicKeyCreationOptions(
  options: RegistrationOptionsJSON,
): PublicKeyCredentialCreationOptions {
  return {
    ...options,
    challenge: base64UrlToBuffer(options.challenge),
    user: {
      ...options.user,
      id: base64UrlToBuffer(options.user.id),
    },
    excludeCredentials: options.excludeCredentials?.map((credential) => ({
      ...credential,
      id: base64UrlToBuffer(credential.id),
    })),
  }
}

function serializeRegistrationCredential(
  credential: PublicKeyCredential,
): RegistrationCredentialJSON {
  const response = credential.response as AuthenticatorAttestationResponse

  return {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    response: {
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      attestationObject: bufferToBase64Url(response.attestationObject),
      transports: response.getTransports?.() as AuthenticatorTransport[] | undefined,
    },
    type: 'public-key',
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment:
      (credential.authenticatorAttachment as AuthenticatorAttachment | null | undefined) ??
      undefined,
  }
}

export async function registerDriverWithWebAuthn(subjectPubkey: string) {
  const beginResponse = await fetch(`${API_BASE_URL}/webauthn/register/begin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subjectPubkey }),
  })
  const beginData = await beginResponse.json()

  if (!beginResponse.ok) {
    throw new Error(beginData.error || 'Unable to start WebAuthn registration')
  }

  const credential = await navigator.credentials.create({
    publicKey: toPublicKeyCreationOptions(beginData as RegistrationOptionsJSON),
  })

  if (!credential) {
    throw new Error('WebAuthn registration was cancelled')
  }

  const completeResponse = await fetch(`${API_BASE_URL}/webauthn/register/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subjectPubkey,
      response: serializeRegistrationCredential(credential as PublicKeyCredential),
    }),
  })
  const completeData = await completeResponse.json()

  if (!completeResponse.ok) {
    throw new Error(completeData.error || 'Unable to complete WebAuthn registration')
  }

  return completeData as {
    credentialId: string
    credentialHash: string
  }
}

export { API_BASE_URL }
