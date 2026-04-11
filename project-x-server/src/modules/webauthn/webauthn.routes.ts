import { FastifyInstance } from "fastify";
import * as controller from "./webauthn.controller";

export async function webauthnRoutes(app: FastifyInstance) {
  app.post(
    "/webauthn/register/begin",
    {
      schema: {
        body: {
          type: "object",
          required: ["subjectPubkey"],
          properties: {
            subjectPubkey: { type: "string" },
          },
        },
      },
    },
    controller.beginRegistration,
  );

  app.post(
    "/webauthn/register/complete",
    {
      schema: {
        body: {
          type: "object",
          required: ["subjectPubkey", "response"],
          properties: {
            subjectPubkey: { type: "string" },
            response: { type: "object" },
          },
        },
      },
    },
    controller.completeRegistration,
  );

  app.post(
    "/webauthn/verify/begin",
    {
      schema: {
        body: {
          type: "object",
          required: ["sessionId", "subjectPubkey"],
          properties: {
            sessionId: { type: "string" },
            subjectPubkey: { type: "string" },
            response: {},
          },
        },
      },
    },
    controller.verifyBeginHandler,
  );

  app.post(
    "/webauthn/verify/complete",
    {
      schema: {
        body: {
          type: "object",
          required: ["subjectPubkey"],
          properties: {
            subjectPubkey: { type: "string" },
            response: {},
          },
        },
      },
    },
    controller.verifyCompleteHandler,
  );
}
