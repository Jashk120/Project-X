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

  app.post("/verify", {
    schema: {
      body: {
        type: "object",
        required: ["subjectPubkey"],
        properties: {
          subjectPubkey: { type: "string" },
          riderPubkey: { type: "string" }, // optional, for caller's records
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