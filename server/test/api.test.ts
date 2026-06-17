import request from "supertest";
import { describe, expect, it } from "vitest";

import app from "../src/app.js";

describe("gET /api/v1", () => {
  it("responds with a json message", () =>
    request(app)
      .get("/api/v1")
      .set("Accept", "application/json")
      .expect("Content-Type", /json/)
      .expect(200)
      .expect((res) => {
        expect(res.body.message).toMatch(/Aegis API/);
      }));
});

describe("gET /api/v1/health", () => {
  it("reports service status", () =>
    request(app)
      .get("/api/v1/health")
      .set("Accept", "application/json")
      .expect("Content-Type", /json/)
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe("ok");
      }));
});
