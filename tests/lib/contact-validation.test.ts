describe("Contact form validation", () => {
  const validData = {
    name: "John Doe",
    email: "john@example.com",
    company: "Acme Corp",
    service: "ai-ml",
    budget: "5k-15k",
    message: "This is a test message that is long enough to pass validation.",
  };

  async function postContact(data: Record<string, string>) {
    const { POST } = await import("@/app/api/contact/route");

    const request = new Request("http://localhost:3000/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    return POST(request);
  }

  it("rejects missing name", async () => {
    const res = await postContact({ ...validData, name: "" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors.name).toBeDefined();
  });

  it("rejects invalid email", async () => {
    const res = await postContact({ ...validData, email: "not-an-email" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors.email).toBeDefined();
  });

  it("rejects short message", async () => {
    const res = await postContact({ ...validData, message: "Too short" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors.message).toBeDefined();
  });

  it("rejects missing email", async () => {
    const res = await postContact({ ...validData, email: "" });
    expect(res.status).toBe(400);
  });
});
