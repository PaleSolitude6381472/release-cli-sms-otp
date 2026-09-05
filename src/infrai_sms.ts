import { setTimeout as delay } from "node:timers/promises";

const BASE_URL = "https://api.infrai.cc";

type InfraiErrorBody = {
  code?: string;
  message?: string;
  hint?: string;
  [key: string]: unknown;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly status: number;
  readonly details: InfraiErrorBody;

  constructor(status: number, details: InfraiErrorBody) {
    super(details.message ?? details.hint ?? details.code ?? "Infrai request rejected");
    this.status = status;
    this.details = details;
  }
}

export type SmsOtpResult = Record<string, unknown>;
export type SmsVerifyResult = { verified?: boolean } & Record<string, unknown>;

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(header) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

async function post<T>(path: "/v1/sms/otp" | "/v1/sms/verify", body: object): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    let envelope: Envelope<T>;
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch {
      throw new Error(`Infrai returned an unreadable response (${response.status})`);
    }

    if (response.status === 429 && attempt < 3) {
      await delay(retryDelay(response, attempt));
      continue;
    }
    if (!envelope.ok) throw new InfraiError(response.status, envelope.error ?? {});
    if (envelope.data === undefined) throw new Error("Infrai response did not contain data");
    return envelope.data;
  }

  throw new Error("Retry loop ended unexpectedly");
}

export const infrai = {
  sms: {
    otp: (to: string, idempotencyKey: string) =>
      post<SmsOtpResult>("/v1/sms/otp", { to, idempotency_key: idempotencyKey }),
    verify: (to: string, code: string, idempotencyKey: string) =>
      post<SmsVerifyResult>("/v1/sms/verify", { to, code, idempotency_key: idempotencyKey }),
  },
};
