import request from "supertest";
import { describe, expect, it } from "vitest";

import app from "../src/app.js";

describe("app", () => {
  it("responds with a 404 json error for unknown routes", () =>
    request(app)
      .get("/what-is-this-even")
      .set("Accept", "application/json")
      .expect("Content-Type", /json/)
      .expect(404)
      .expect((res) => {
        expect(res.body.code).toBe("NOT_FOUND");
      }));

  it("responds with the Aegis banner at the root", () =>
    request(app)
      .get("/")
      .set("Accept", "application/json")
      .expect("Content-Type", /json/)
      .expect(200)
      .expect((res) => {
        expect(res.body.message).toMatch(/Aegis/);
      }));
});
