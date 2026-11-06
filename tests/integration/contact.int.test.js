import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import pg from "pg";
import { createApp } from "../../src/app.js";
import { createPgContactRepository } from "../../src/repositories/contactRepository.js";

// Prérequis : docker compose up -d --wait && npm run migrate (variables PG* exportées).
describe("Intégration API ↔ PostgreSQL", () => {
  let pool;
  let app;

  beforeAll(() => {
    pool = new pg.Pool();
    app = createApp({ contactRepository: createPgContactRepository(pool) });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("enregistre un contact dans PostgreSQL", async () => {
    const email = `it-${Date.now()}@example.com`;
    const res = await request(app)
      .post("/api/contact")
      .send({ name: "Ada Lovelace", email, message: "Message d'intégration réel" });
    expect(res.status).toBe(201);

    const { rows } = await pool.query("SELECT name, email FROM contacts WHERE id = $1", [res.body.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ name: "Ada Lovelace", email });
  });

  it("résiste à une tentative d'injection SQL", async () => {
    const name = "Robert'); DROP TABLE contacts;--";
    const res = await request(app)
      .post("/api/contact")
      .send({ name, email: "bobby@example.com", message: "Little Bobby Tables" });
    expect(res.status).toBe(201);

    const table = await pool.query("SELECT to_regclass('public.contacts') AS t");
    expect(table.rows[0].t).not.toBeNull();

    const { rows } = await pool.query("SELECT name FROM contacts WHERE id = $1", [res.body.id]);
    expect(rows[0].name).toBe(name);
  });
});
