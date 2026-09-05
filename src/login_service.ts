import express, { type NextFunction, type Request, type Response } from "express";
import { ZodError } from "zod";
import { infrai, InfraiError } from "./infrai_sms.js";
import { ReleaseLogin, requestCodeBody, verifyCodeBody } from "./release_login.js";

export function createLoginService(workflow = new ReleaseLogin({
  otp: infrai.sms.otp,
  verify: infrai.sms.verify,
})) {
  const app = express();
  app.use(express.json({ limit: "8kb" }));

  app.post("/login/code", async (request, response, next) => {
    try {
      const input = requestCodeBody.parse(request.body);
      response.status(202).json(await workflow.requestCode(input));
    } catch (error) {
      next(error);
    }
  });

  app.post("/login/verify", async (request, response, next) => {
    try {
      const input = verifyCodeBody.parse(request.body);
      const result = await workflow.verifyAndAuthorize(input);
      response.status(result.release_operation === "authorized" ? 200 : 403).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof ZodError) {
      response.status(400).json({ error: "invalid request", issues: error.issues });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      response.status(status).json({ error: error.message, details: error.details });
      return;
    }
    console.error(error);
    response.status(500).json({ error: "internal service error" });
  });

  return app;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const port = Number(process.env.PORT ?? 8787);
  createLoginService().listen(port, "127.0.0.1", () => {
    console.log(`release login service listening on http://127.0.0.1:${port}`);
  });
}
