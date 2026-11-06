export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.length ? issue.path.join(".") : (issue.keys ?? []).join(","),
      message: issue.message,
    }));
    return res.status(400).json({ error: "VALIDATION_ERROR", details });
  }
  req.body = result.data;
  next();
};
