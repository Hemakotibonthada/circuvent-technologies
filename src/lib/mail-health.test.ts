/**
 * @jest-environment node
 */

/**
 * Whether this deployment can deliver mail, and — when it cannot — saying why
 * in terms somebody can act on.
 *
 * This is not hypothetical. The deployment was found in exactly the broken
 * state these tests describe: SMTP pointed at a relay that rejected the
 * credential with `535 Authentication Failed`, and Resend falling back to its
 * sandbox sender, which refuses every recipient except the API key owner. Every
 * incident notification was therefore going nowhere, and the only evidence was
 * a log line on a server nobody reads during an outage.
 *
 * The distinction the tests care about is diagnosis: a wrong password and an
 * unreachable host are fixed by different people, and "mail failed" tells
 * neither of them anything.
 */

const verifyMock = jest.fn();
const closeMock = jest.fn();

jest.mock("nodemailer", () => ({
  __esModule: true,
  default: {
    createTransport: jest.fn(() => ({ verify: verifyMock, close: closeMock })),
  },
}));

import nodemailer from "nodemailer";
import { checkMailHealth } from "./mail-health";

const ENV = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  verifyMock.mockResolvedValue(true);
  for (const k of ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM", "RESEND_API_KEY", "RESEND_FROM"]) {
    delete process.env[k];
  }
});

afterAll(() => {
  process.env = ENV;
});

function configureSmtp(host = "mx.circuvent.com") {
  process.env.SMTP_HOST = host;
  process.env.SMTP_PORT = "587";
  process.env.SMTP_SECURE = "false";
  process.env.SMTP_USER = "no-reply@circuvent.com";
  process.env.SMTP_PASS = "a-password";
}

/** Nodemailer reports failures by `code`, in a field nothing surfaces. */
const smtpError = (code: string, responseCode?: number) =>
  Object.assign(new Error(`simulated ${code}`), { code, responseCode });

describe("when everything works", () => {
  it("reports ok and names the host mail is going through", async () => {
    configureSmtp();
    const h = await checkMailHealth();

    expect(h.verdict).toBe("ok");
    expect(h.summary).toContain("mx.circuvent.com");
    expect(h.smtp.ok).toBe(true);
  });

  it("proves the credential rather than trusting that the variables are set", async () => {
    /* A check that only looked at whether SMTP_PASS existed would have passed
       on the configuration that was rejecting every message with a 535. */
    configureSmtp();
    await checkMailHealth();
    expect(verifyMock).toHaveBeenCalled();
  });

  it("closes the connection it opened", async () => {
    configureSmtp();
    await checkMailHealth();
    expect(closeMock).toHaveBeenCalled();
  });
});

describe("naming the fault", () => {
  it("calls a rejected credential a credential problem", async () => {
    configureSmtp();
    verifyMock.mockRejectedValue(smtpError("EAUTH", 535));

    const h = await checkMailHealth();

    expect(h.smtp.ok).toBe(false);
    expect(h.smtp.problem).toMatch(/rejected the credentials/i);
    expect(h.smtp.advice).toMatch(/SMTP_USER and SMTP_PASS/);
  });

  it("recognises a 535 even when the code is missing", async () => {
    configureSmtp();
    verifyMock.mockRejectedValue(Object.assign(new Error("535 Authentication Failed"), { responseCode: 535 }));

    expect((await checkMailHealth()).smtp.problem).toMatch(/rejected the credentials/i);
  });

  it("calls an unreachable host a reachability problem, and names the right one", async () => {
    configureSmtp("smtp.example.invalid");
    verifyMock.mockRejectedValue(smtpError("ETIMEDOUT"));

    const h = await checkMailHealth();

    expect(h.smtp.problem).toMatch(/could not be reached/i);
    expect(h.smtp.advice).toContain("mx.circuvent.com");
  });

  it("distinguishes a hostname that does not resolve", async () => {
    configureSmtp("nope.circuvent.com");
    verifyMock.mockRejectedValue(smtpError("ENOTFOUND"));

    expect((await checkMailHealth()).smtp.problem).toMatch(/does not resolve/i);
  });
});

describe("the webmail host trap", () => {
  it("names the mistake instead of waiting for a timeout", async () => {
    /*
     * mail.circuvent.com is the webmail application; the mail server is
     * mx.circuvent.com. Dialling the wrong one hangs until the socket gives
     * up, and "timed out" is a much worse answer than naming the mistake — the
     * two hostnames differ by three characters.
     */
    configureSmtp("mail.circuvent.com");

    const h = await checkMailHealth();

    expect(h.smtp.suspectHost).toBe(true);
    expect(h.smtp.ok).toBe(false);
    expect(h.smtp.problem).toMatch(/webmail application/i);
    expect(h.smtp.advice).toContain("mx.circuvent.com");
    /* Reported without dialling at all. */
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it("does not flag the real mail server", async () => {
    configureSmtp("mx.circuvent.com");
    expect((await checkMailHealth()).smtp.suspectHost).toBe(false);
  });
});

describe("the transport it no longer has", () => {
  /*
   * These used to assert that a broken SMTP config degraded gracefully onto
   * Resend. It never did: the fallback sent from `onboarding@resend.dev`, which
   * only delivers to the API key owner, and it bypassed the mail server so its
   * sends were invisible to our outbound counts. The fallback has been removed,
   * and what matters now is that a broken SMTP config is reported as broken
   * rather than quietly excused by a second transport.
   */
  it("calls broken SMTP broken, with no fallback to hide behind", async () => {
    configureSmtp();
    verifyMock.mockRejectedValue(smtpError("EAUTH", 535));
    process.env.RESEND_API_KEY = "re_test";

    const h = await checkMailHealth();

    expect(h.verdict).toBe("broken");
    expect(h.summary).toMatch(/not being delivered/i);
  });

  it("is not rescued by a Resend key, however well configured it looks", async () => {
    configureSmtp();
    verifyMock.mockRejectedValue(smtpError("EAUTH", 535));
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM = "no-reply@circuvent.com";

    const h = await checkMailHealth();

    expect(h.verdict).toBe("broken");
    expect(h.summary).not.toMatch(/resend/i);
  });

  it("does not report on Resend at all", async () => {
    configureSmtp();
    process.env.RESEND_API_KEY = "re_test";

    expect(await checkMailHealth()).not.toHaveProperty("resend");
  });
});

describe("when nothing is configured", () => {
  it("says so rather than reporting a connection failure", async () => {
    const h = await checkMailHealth();

    expect(h.smtp.configured).toBe(false);
    expect(h.smtp.problem).toMatch(/not configured/i);
    expect(h.verdict).toBe("broken");
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it("never reports the password, in a payload that reaches a browser", async () => {
    configureSmtp();
    process.env.RESEND_API_KEY = "re_secret_value";

    const serialised = JSON.stringify(await checkMailHealth());

    expect(serialised).not.toContain("a-password");
    expect(serialised).not.toContain("re_secret_value");
  });
});
