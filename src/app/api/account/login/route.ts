import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { rateLimit, rateLimitIdentity } from "@/lib/rate-limit";
import { getAccount, revalidate, createAccount, setAccountPassword } from "@/lib/store";
import { verifyPassword, signToken, hasUsablePassword, hashPassword } from "@/lib/account";
import { verifyAgainstControlPlane } from "@/lib/sso";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const { ok, retryAfter } = rateLimit("account", ip);
    if (!ok) {
      return NextResponse.json(
        { success: false, message: "Too many attempts. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ success: false, message: "Email and password are required." }, { status: 400 });
    }

    // The IP limit does not protect one account from a distributed guessing
    // run, so cap attempts against the target address too.
    const perEmail = rateLimitIdentity("login", String(email), 8);
    if (!perEmail.ok) {
      return NextResponse.json(
        { success: false, message: "Too many attempts. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(perEmail.retryAfter) } }
      );
    }

    await revalidate(["accounts"]);
    const acc = getAccount(String(email));
    if (!acc || !verifyPassword(String(password), acc.salt, acc.hash)) {
      // Somebody who signed up in the smart-home app has no shop account, or
      // has one with no password on it. Turning them away from a storefront
      // they are entitled to use is the wrong answer, so check the credentials
      // they already have against the control plane and adopt them here once it
      // vouches for them. The password is only ever stored after that.
      const federated = await verifyAgainstControlPlane(String(email), String(password));
      if (federated) {
        const { salt, hash } = hashPassword(String(password));
        if (acc) {
          setAccountPassword(federated.email, hash, salt);
        } else {
          createAccount({
            email: federated.email,
            name: federated.name,
            hash,
            salt,
            createdAt: new Date().toISOString(),
          });
        }
        logger.info("account.adopted_from_control_plane", { email: federated.email });
        const fresh = getAccount(federated.email);
        if (fresh?.blocked) {
          return NextResponse.json(
            { success: false, message: "This account has been suspended. Please contact support." },
            { status: 403 }
          );
        }
        return NextResponse.json({
          success: true,
          token: signToken(federated.email),
          account: { email: federated.email, name: fresh?.name || federated.name },
        });
      }

      // An account with no password on file can never match, so it would sit
      // on "invalid email or password" forever while registration keeps
      // answering "already exists" — locked out with no way forward. Point at
      // the reset flow instead, which does set a password on an existing row.
      // Registration already discloses that the address exists, so this leaks
      // nothing new.
      if (acc && !hasUsablePassword(acc)) {
        logger.warn("account.no_usable_password", { email: String(email).toLowerCase() });
        return NextResponse.json(
          {
            success: false,
            message: "This account has no password set. Please use \u201CForgot your password?\u201D to create one.",
            needsPasswordReset: true,
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: false, message: "Invalid email or password." }, { status: 401 });
    }
    if (acc.blocked) {
      return NextResponse.json(
        { success: false, message: "This account has been suspended. Please contact support." },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      token: signToken(acc.email),
      account: { email: acc.email, name: acc.name },
    });
  } catch (err) {
    // This used to swallow the error entirely, so every failure looked
    // identical from the outside and left no trace to diagnose it from.
    logger.error("account.login_failed", {}, err);
    return NextResponse.json({ success: false, message: "Could not sign you in." }, { status: 500 });
  }
}
