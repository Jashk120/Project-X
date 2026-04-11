import { FastifyReply, FastifyRequest } from "fastify";
import * as service from "./webauthn.service";

export async function beginRegistration(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { subjectPubkey } = req.body as { subjectPubkey: string };
    const result = await service.beginRegistration(subjectPubkey);
    return reply.code(200).send(result);
  } catch (err: any) {
    req.log.error({ err }, 'beginRegistration failed')
    return reply.code(400).send({ error: err.message, detail: err.toString() });
  }
}
export async function completeRegistration(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { subjectPubkey, response } = req.body as {
      subjectPubkey: string;
      response: Parameters<typeof service.completeRegistration>[1];
    };

    const result = await service.completeRegistration(subjectPubkey, response);
    return reply.code(200).send(result);
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
}

export async function verifyBeginHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { subjectPubkey } = req.body as { subjectPubkey: string };
    const result = await service.beginVerification(subjectPubkey);
    return reply.code(200).send(result);
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
}

export async function verifyCompleteHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { sessionId, subjectPubkey, response } = req.body as {
      sessionId: string;
      subjectPubkey: string;
      response?: any;
    };

    const result = await service.completeVerification(sessionId, subjectPubkey, response);
    return reply.code(200).send(result);
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
}
