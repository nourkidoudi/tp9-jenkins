import { Router } from "express";
import { validate } from "../middlewares/validate.js";
import { contactSchema } from "../schemas/contact.js";

export function contactRouter({ contactRepository }) {
  const router = Router();

  router.post("/", validate(contactSchema), async (req, res, next) => {
    try {
      const saved = await contactRepository.create(req.body);
      res.status(201).json({ id: saved.id, status: "received" });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
