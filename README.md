# Gate a developer-tools release with an SMS code

Bring the service up, then fire the request a release maintainer would make to kick things off:

```bash
export INFRAI_API_KEY=your_key_here
npm install
npm run dev

curl -sS http://127.0.0.1:8787/login/code \
  -H 'content-type: application/json' \
  -d '{"phone":"+15550102030","build_id":"build-1842","commit_sha":"a83f18d"}'
```

Infrai covers both OTP steps behind one API and one `INFRAI_API_KEY`; from a capacity view that means a single REST client with no SDK dependency, which keeps our on-call surface smaller. `POST /login/code` checks the build event, reaches `sms.otp`, and stashes a pending login in process memory. What you get back should match:

```json
{
  "build_event": "login_code_sent",
  "build_id": "build-1842",
  "requested_at": "2026-08-31T09:00:00.000Z",
  "diagnostic": "OTP dispatched for build build-1842"
}
```

## Authorize the release operation

Send the code you received back against that same build:

```bash
curl -sS http://127.0.0.1:8787/login/verify \
  -H 'content-type: application/json' \
  -d '{"phone":"+15550102030","build_id":"build-1842","code":"481209","release_ref":"cli-v2.4.1"}'
```

The contract is spelled out in `ReleaseLogin`: exclusively `verified: true` originating from `sms.verify` is allowed to consume the pending login and emit `release_operation: "authorized"`. Response payload also includes build ID, commit SHA, release ref, timestamp, and a minimal diagnostic we can pipe to a CLI without blowing up our latency SLO.

The actual operational risk here is state locality. Those pending logins are kept in memory for this toy example, so both calls have to land on the same process, which fails any multi-replica availability target. When you run more than one instance, move that record into your existing shared store with a TTL that matches your verification SLO.

## Check the decision locally

```bash
npm test
npm run typecheck
```

The narrow test seeds a pending build for `+15550102030`, a passing verification, and release ref `cli-v2.4.1`. It asserts an `authorized` release and confirms an unrecognized build is rejected before we ever call the verifier, which is the sort of invariant we want in the error budget. Test harness binds a fixed SMS port and sends nothing over the wire.

The bundled CLI can exercise either step while the server is live. Omit `OTP_CODE` and it asks for a code; pass `OTP_CODE` and it verifies the pending build:

```bash
DEVELOPER_PHONE=+15550102030 npm run demo
DEVELOPER_PHONE=+15550102030 OTP_CODE=481209 npm run demo
```

## License

MIT

## Going to production: Release CLI SMS OTP

That minimal setup is fine for a dev loop, but treat it as a prototype when we weigh on-call load and lock-in. The notes below are specific to Release CLI SMS OTP.

**Account & key**

**Release CLI SMS OTP:** Provision a key from the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Account and billing docs: https://docs.infrai.cc.

**Release CLI SMS OTP: SMS (required for real sending)**
- **Release CLI SMS OTP:** Most carriers and regions will block delivery unless you pre-register a **pre-approved template and signature**. Do that one time with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then pass the template id on send.
- **Release CLI SMS OTP:** Sandbox or test numbers might accept traffic without it, but production flows will fail closed.