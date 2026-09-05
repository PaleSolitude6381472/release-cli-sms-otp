import { createHash } from "node:crypto";
import { z } from "zod";
import type { SmsOtpResult, SmsVerifyResult } from "./infrai_sms.js";

export const requestCodeBody = z.object({
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  build_id: z.string().min(1).max(120),
  commit_sha: z.string().regex(/^[0-9a-f]{7,40}$/i),
}).strict();

export const verifyCodeBody = z.object({
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  build_id: z.string().min(1).max(120),
  code: z.string().regex(/^\d{4,10}$/),
  release_ref: z.string().min(1).max(160),
}).strict();

type RequestCode = z.infer<typeof requestCodeBody>;
type VerifyCode = z.infer<typeof verifyCodeBody>;

export type SmsPort = {
  otp(to: string, idempotencyKey: string): Promise<SmsOtpResult>;
  verify(to: string, code: string, idempotencyKey: string): Promise<SmsVerifyResult>;
};

type PendingBuild = { phone: string; commitSha: string; requestedAt: string };

function stableKey(parts: string[]): string {
  return createHash("sha256").update(parts.join(":"), "utf8").digest("hex");
}

export class ReleaseLogin {
  private readonly pending = new Map<string, PendingBuild>();
  private readonly sms: SmsPort;
  private readonly now: () => Date;

  constructor(sms: SmsPort, now = () => new Date()) {
    this.sms = sms;
    this.now = now;
  }

  async requestCode(input: RequestCode) {
    await this.sms.otp(input.phone, stableKey(["build-login", input.build_id, input.commit_sha]));
    const requestedAt = this.now().toISOString();
    this.pending.set(input.build_id, {
      phone: input.phone,
      commitSha: input.commit_sha,
      requestedAt,
    });
    return {
      build_event: "login_code_sent" as const,
      build_id: input.build_id,
      requested_at: requestedAt,
      diagnostic: `OTP dispatched for build ${input.build_id}`,
    };
  }

  async verifyAndAuthorize(input: VerifyCode) {
    const build = this.pending.get(input.build_id);
    if (!build || build.phone !== input.phone) {
      return {
        release_operation: "blocked" as const,
        build_id: input.build_id,
        diagnostic: "No matching pending build login",
      };
    }

    const result = await this.sms.verify(
      input.phone,
      input.code,
      stableKey(["release-verify", input.build_id, input.release_ref, input.code]),
    );
    if (result.verified !== true) {
      return {
        release_operation: "blocked" as const,
        build_id: input.build_id,
        diagnostic: "Phone code was not verified",
      };
    }

    this.pending.delete(input.build_id);
    return {
      release_operation: "authorized" as const,
      build_id: input.build_id,
      commit_sha: build.commitSha,
      release_ref: input.release_ref,
      authorized_at: this.now().toISOString(),
      diagnostic: `Release ${input.release_ref} authorized`,
    };
  }
}
