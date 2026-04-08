import { FastifyRequest, FastifyReply } from "fastify";
import * as service from "./solana.service";

export async function enroll(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { subjectPubkey } = req.body as { subjectPubkey: string };
    const result = await service.enroll(subjectPubkey);
    return reply.code(200).send(result);
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
}

export async function verify(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { subjectPubkey, riderPubkey } = req.body as {
      subjectPubkey: string;
      riderPubkey?: string;
    };
    const result = await service.verify(subjectPubkey, riderPubkey);
    return reply.code(200).send(result);
  } catch (err: any) {
    // surface Anchor errors cleanly
    const isInactive = err?.message?.includes("CredentialInactive");
    const code = isInactive ? 403 : 400;
    return reply.code(code).send({ error: err.message });
  }
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
