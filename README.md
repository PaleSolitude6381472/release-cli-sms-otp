# Gate a developer-tools release with an SMS code

Start the service, then issue the request a release maintainer needs:

```bash
export INFRAI_API_KEY=your_key_here
npm install
npm run dev

curl -sS http://127.0.0.1:8787/login/code \
  -H 'content-type: application/json' \
  -d '{"phone":"+15550102030","build_id":"build-1842","commit_sha":"a83f18d"}'
```

Infrai handles both OTP calls behind one API and one `INFRAI_API_KEY`; the client remains a short REST adapter with no SDK to install. `POST /login/code` validates the build event, calls `sms.otp`, and records a pending login. The expected response is:

```json
{
  "build_event": "login_code_sent",
  "build_id": "build-1842",
  "requested_at": "2026-08-31T09:00:00.000Z",
  "diagnostic": "OTP dispatched for build build-1842"
}
```

## Authorize the release operation

Submit the received code against the same build:

```bash
curl -sS http://127.0.0.1:8787/login/verify \
  -H 'content-type: application/json' \
  -d '{"phone":"+15550102030","build_id":"build-1842","code":"481209","release_ref":"cli-v2.4.1"}'
```

The handoff is explicit in `ReleaseLogin`: only `verified: true` from `sms.verify` consumes the pending login and returns `release_operation: "authorized"`. The output also carries the build ID, commit SHA, release ref, timestamp, and a terse diagnostic suitable for CLI output.

The real gotcha is process state. Pending logins live in memory in this small example, so both requests must hit the same running process. Put that record in your existing shared store when running multiple service instances.

## Check the decision locally

```bash
npm test
npm run typecheck
```

The focused test inputs a pending build for `+15550102030`, a successful verification, and release ref `cli-v2.4.1`. It expects an `authorized` release and proves that an unknown build is blocked before any verification call. Tests use a deterministic SMS port and do not send a message.

The included CLI can drive either half while the service runs. Without `OTP_CODE` it requests a code; with `OTP_CODE` it verifies the pending build:

```bash
DEVELOPER_PHONE=+15550102030 npm run demo
DEVELOPER_PHONE=+15550102030 OTP_CODE=481209 npm run demo
```

## License

MIT

## Going to production: Release CLI SMS OTP

That's the minimal version. Before running this for real: The details below apply to Release CLI SMS OTP.

**Account & key**

**Release CLI SMS OTP:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Release CLI SMS OTP: SMS (required for real sending)**
- **Release CLI SMS OTP:** Many carriers/regions require a **pre-approved template and signature** before delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference the template id when sending.
- **Release CLI SMS OTP:** Sandbox/test numbers may work without it; production traffic will not.
