import { FastifyInstance } from "fastify";
import * as controller from "./solana.controller";

export async function solanaRoutes(app: FastifyInstance) {
  app.post("/enroll", {
    schema: {
      body: {
        type: "object",
        required: ["subjectPubkey"],
        properties: {
          subjectPubkey: { type: "string" },
        },
      },
    },
  }, controller.enroll);

  app.post("/enroll/prepare", {
    schema: {
      body: {
        type: "object",
        required: ["subjectPubkey", "credentialHash"],
        properties: {
          subjectPubkey: { type: "string" },
          credentialHash: { type: "string" },
        },
      },
    },
  }, controller.prepareEnroll);

  app.post("/enroll/submit", {
    schema: {
      body: {
        type: "object",
        required: ["prepareId", "signedTransaction"],
        properties: {
          prepareId: { type: "string" },
          signedTransaction: { type: "string" },
        },
      },
    },
  }, controller.submitEnroll);

  app.post("/verify", {
    schema: {
      body: {
        type: "object",
        required: ["subjectPubkey"],
        properties: {
          subjectPubkey: { type: "string" },
          riderPubkey: { type: "string" }, // optional, for caller's records
          sessionId: { type: "string" },
        },
      },
    },
  }, controller.verify);

  app.post("/revoke", {
    schema: {
      body: {
        type: "object",
        required: ["subjectPubkey"],
        properties: {
          subjectPubkey: { type: "string" },
        },
      },
    },
  }, controller.revoke);

  app.get("/status", {
    schema: {
      querystring: {
        type: "object",
        required: ["subjectPubkey"],
        properties: {
          subjectPubkey: { type: "string" },
        },
      },
    },
  }, controller.status);
  app.post("/close", {
  schema: {
    body: {
      type: "object",
      required: ["subjectPubkey"],
      properties: {
        subjectPubkey: { type: "string" },
      },
    },
  },
}, controller.close);
}
