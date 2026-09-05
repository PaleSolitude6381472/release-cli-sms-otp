import assert from "node:assert/strict";
import test from "node:test";
import { ReleaseLogin, type SmsPort } from "./release_login.js";

test("a release is authorized only after the pending build phone is verified", async () => {
  const calls: string[] = [];
  const sms: SmsPort = {
    async otp() {
      calls.push("otp");
      return {};
    },
    async verify() {
      calls.push("verify");
      return { verified: true };
    },
  };
  const workflow = new ReleaseLogin(sms, () => new Date("2026-08-31T09:00:00.000Z"));

  await workflow.requestCode({
    phone: "+15550102030",
    build_id: "build-1842",
    commit_sha: "a83f18d",
  });
  const result = await workflow.verifyAndAuthorize({
    phone: "+15550102030",
    build_id: "build-1842",
    code: "481209",
    release_ref: "cli-v2.4.1",
  });

  assert.deepEqual(calls, ["otp", "verify"]);
  assert.equal(result.release_operation, "authorized");
  assert.equal(result.build_id, "build-1842");
});

test("a build without a matching code request is blocked before verification", async () => {
  let verifyCalls = 0;
  const sms: SmsPort = {
    async otp() {
      return {};
    },
    async verify() {
      verifyCalls += 1;
      return { verified: true };
    },
  };
  const workflow = new ReleaseLogin(sms);

  const result = await workflow.verifyAndAuthorize({
    phone: "+15550102030",
    build_id: "missing-build",
    code: "481209",
    release_ref: "cli-v2.4.1",
  });

  assert.equal(result.release_operation, "blocked");
  assert.equal(verifyCalls, 0);
});
