import { FastifyRequest, FastifyReply } from "fastify";
import * as service from "./solana.service";

export async function enroll(req: FastifyRequest, reply: FastifyReply) {
  return reply.code(400).send({
    error: "direct enroll is no longer supported; use /enroll/prepare and /enroll/submit",
  });
}

export async function prepareEnroll(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { subjectPubkey, credentialHash } = req.body as {
      subjectPubkey: string;
      credentialHash: string;
    };
    const result = await service.prepareEnroll(subjectPubkey, credentialHash);
    return reply.code(200).send(result);
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
}

export async function submitEnroll(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { prepareId, signedTransaction } = req.body as {
      prepareId: string;
      signedTransaction: string;
    };
    const result = await service.submitEnroll(prepareId, signedTransaction);
    return reply.code(200).send(result);
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
}

export async function verify(req: FastifyRequest, reply: FastifyReply) {
  return reply.code(400).send({
    error: "direct verify is no longer supported; use the socket verification flow",
  });
}

export async function revoke(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { subjectPubkey } = req.body as { subjectPubkey: string };
    const result = await service.revoke(subjectPubkey);
    return reply.code(200).send(result);
  } catch (err: any) {
    const isUnauthorized = err?.message?.includes("UnauthorizedPlatform");
    const code = isUnauthorized ? 403 : 400;
    return reply.code(code).send({ error: err.message });
  }
}

export async function status(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { subjectPubkey } = req.query as { subjectPubkey: string };
    const result = await service.status(subjectPubkey);
    return reply.code(200).send(result);
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
}
export async function close(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { subjectPubkey } = req.body as { subjectPubkey: string };
    const result = await service.close(subjectPubkey);
    return reply.code(200).send(result);
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
}
