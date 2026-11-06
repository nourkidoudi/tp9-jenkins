import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { healthRouter } from "./routes/health.js";
import { contactRouter } from "./routes/contact.js";
import { errorHandler } from "./middlewares/errorHandler.js";

export function createApp({ contactRepository }) {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "10kb" }));

  const contactLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 5,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "TOO_MANY_REQUESTS" },
  });

  app.use("/api/health", healthRouter);
  app.use("/api/contact", contactLimiter, contactRouter({ contactRepository }));

  app.use((_req, res) => res.status(404).json({ error: "NOT_FOUND" }));
  app.use(errorHandler);
  return app;
}
