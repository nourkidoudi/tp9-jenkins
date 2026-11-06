import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createMemoryContactRepository } from "../src/repositories/contactRepository.js";

const valid = { name: "Ada Lovelace", email: "ada@example.com", message: "Bonjour, ceci est un test." };

describe("POST /api/contact", () => {
  let repo;
  let app;
  beforeEach(() => {
    repo = createMemoryContactRepository();
    app = createApp({ contactRepository: repo });
  });

  it("accepte un message valide (201)", async () => {
    const res = await request(app).post("/api/contact").send(valid);
    expect(res.status).toBe(201);
    expect(repo.items).toHaveLength(1);
  });

  it("refuse un email invalide (400 VALIDATION_ERROR)", async () => {
    const res = await request(app).post("/api/contact").send({ ...valid, email: "pas-un-email" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
    expect(res.body.details[0].field).toBe("email");
    expect(repo.items).toHaveLength(0);
  });

  it("refuse un champ manquant", async () => {
    const { message, ...incomplete } = valid;
    const res = await request(app).post("/api/contact").send(incomplete);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
    expect(res.body.details.map((d) => d.field)).toContain("message");
  });

  it("refuse un champ supplémentaire (ex. isAdmin: true)", async () => {
    const res = await request(app).post("/api/contact").send({ ...valid, isAdmin: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
    expect(repo.items).toHaveLength(0);
  });

  it("refuse un type inattendu (message: 42, name: ['a'])", async () => {
    const res = await request(app).post("/api/contact").send({ ...valid, message: 42, name: ["a"] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
    const fields = res.body.details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(["message", "name"]));
  });

  it("refuse un JSON mal formé (400 INVALID_JSON)", async () => {
    const res = await request(app)
      .post("/api/contact")
      .set("Content-Type", "application/json")
      .send('{"name": "Ada",');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_JSON");
  });

  it("refuse un corps de plus de 10 ko (413)", async () => {
    const res = await request(app)
      .post("/api/contact")
      .send({ ...valid, message: "x".repeat(11 * 1024) });
    expect(res.status).toBe(413);
    expect(res.body.error).toBe("PAYLOAD_TOO_LARGE");
  });

  it("stocke tel quel un nom contenant une tentative d'injection SQL", async () => {
    const name = "Robert'); DROP TABLE contacts;--";
    const res = await request(app).post("/api/contact").send({ ...valid, name });
    expect(res.status).toBe(201);
    expect(repo.items[0].name).toBe(name);
  });

  it("ne renvoie jamais de stack trace en cas d'erreur 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = {
      create: async () => {
        throw new Error("secret db failure");
      },
    };
    const res = await request(createApp({ contactRepository: broken }))
      .post("/api/contact")
      .send(valid);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "INTERNAL_ERROR" });
    expect(JSON.stringify(res.body)).not.toMatch(/stack|secret db failure/);
    vi.restoreAllMocks();
  });

  it("ajoute les headers de sécurité Helmet (x-content-type-options, ...)", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeDefined();
    expect(res.headers["content-security-policy"]).toBeDefined();
  });

  it("ne renvoie pas le header x-powered-by", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("répond 429 après trop de requêtes sur /api/contact", async () => {
    const statuses = [];
    for (let i = 0; i < 7; i++) {
      const res = await request(app).post("/api/contact").send(valid);
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(statuses.slice(5)).toEqual([429, 429]);
  });

  it("répond 404 JSON sur une route inconnue", async () => {
    const res = await request(app).get("/nimporte-quoi");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "NOT_FOUND" });
  });
});
