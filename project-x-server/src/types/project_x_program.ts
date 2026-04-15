/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/project_x_program.json`.
 */
export type ProjectXProgram = {
  "address": "8uGQrehARt9knb4Fs7j15tTVifLwvM56Lre53kYNurTy",
  "metadata": {
    "name": "projectXProgram",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "attestProximity",
      "discriminator": [
        254,
        44,
        45,
        246,
        107,
        113,
        57,
        244
      ],
      "accounts": [
        {
          "name": "proximityAttestation",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  120,
                  105,
                  109,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "rider"
              },
              {
                "kind": "arg",
                "path": "attestationNonce"
              }
            ]
          }
        },
        {
          "name": "owner"
        },
        {
          "name": "rider"
        },
        {
          "name": "platform",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "sessionIdHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "attestationNonce",
          "type": "u64"
        },
        {
          "name": "expiresAt",
          "type": "i64"
        }
      ]
    },
    {
      "name": "close",
      "discriminator": [
        98,
        165,
        201,
        177,
        108,
        65,
        206,
        96
      ],
      "accounts": [
        {
          "name": "credential",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  114,
                  101,
                  100,
                  101,
                  110,
                  116,
                  105,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "owner"
        },
        {
          "name": "platform",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "enroll",
      "discriminator": [
        58,
        12,
        36,
        3,
        142,
        28,
        1,
        43
      ],
      "accounts": [
        {
          "name": "credential",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  114,
                  101,
                  100,
                  101,
                  110,
                  116,
                  105,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "owner"
        },
        {
          "name": "platform",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "credentialHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "revoke",
      "discriminator": [
        170,
        23,
        31,
        34,
        133,
        173,
        93,
        242
      ],
      "accounts": [
        {
          "name": "credential",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  114,
                  101,
                  100,
                  101,
                  110,
                  116,
                  105,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "owner"
        },
        {
          "name": "platform",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "verify",
      "discriminator": [
        133,
        161,
        141,
        48,
        120,
        198,
        88,
        150
      ],
      "accounts": [
        {
          "name": "proximityAttestation",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  120,
                  105,
                  109,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "rider"
              },
              {
                "kind": "arg",
                "path": "attestationNonce"
              }
            ]
          }
        },
        {
          "name": "credential",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  114,
                  101,
                  100,
                  101,
                  110,
                  116,
                  105,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "owner"
        },
        {
          "name": "rider"
        },
        {
          "name": "verifier",
          "writable": true,
          "signer": true
        }
      ],
      "args": [
        {
          "name": "sessionIdHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "attestationNonce",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "credential",
      "discriminator": [
        145,
        44,
        68,
        220,
        67,
        46,
        100,
        135
      ]
    },
    {
      "name": "proximityAttestation",
      "discriminator": [
        132,
        9,
        16,
        50,
        63,
        16,
        245,
        101
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "credentialInactive",
      "msg": "Credential is inactive"
    },
    {
      "code": 6001,
      "name": "proximityAttestationExpired",
      "msg": "Proximity attestation expired"
    },
    {
      "code": 6002,
      "name": "ownerMismatch",
      "msg": "Owner does not match credential"
    },
    {
      "code": 6003,
      "name": "unauthorizedPlatform",
      "msg": "Only the enrolling platform can revoke this credential"
    },
    {
      "code": 6004,
      "name": "riderMismatch",
      "msg": "Rider does not match proximity attestation"
    },
    {
      "code": 6005,
      "name": "invalidProximityAttestation",
      "msg": "Invalid proximity attestation"
    },
    {
      "code": 6006,
      "name": "sessionMismatch",
      "msg": "Session does not match proximity attestation"
    },
    {
      "code": 6007,
      "name": "invalidAttestationExpiry",
      "msg": "Proximity attestation expiry must be in the future"
    }
  ],
  "types": [
    {
      "name": "credential",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "platform",
            "type": "pubkey"
          },
          {
            "name": "credentialHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "enrolledAt",
            "type": "i64"
          },
          {
            "name": "isActive",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "proximityAttestation",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "rider",
            "type": "pubkey"
          },
          {
            "name": "platform",
            "type": "pubkey"
          },
          {
            "name": "sessionIdHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "issuedAt",
            "type": "i64"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          },
          {
            "name": "attestationNonce",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "seed",
      "type": "string",
      "value": "\"anchor\""
    }
  ]
};
