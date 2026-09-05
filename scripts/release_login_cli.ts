const base = process.env.LOGIN_SERVICE_URL ?? "http://127.0.0.1:8787";
const phone = process.env.DEVELOPER_PHONE;
const code = process.env.OTP_CODE;

export {};

if (!phone) throw new Error("DEVELOPER_PHONE is required");

async function post(path: string, body: object) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  console.log(JSON.stringify(result, null, 2));
  if (!response.ok) process.exitCode = 1;
}

if (code) {
  await post("/login/verify", {
    phone,
    build_id: "local-cli-build",
    code,
    release_ref: "devtools-preview",
  });
} else {
  await post("/login/code", {
    phone,
    build_id: "local-cli-build",
    commit_sha: "a83f18d",
  });
}
