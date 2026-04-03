import nodemailer from "nodemailer";

function getAppBaseUrl() {
  return (
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

function getTransport() {
  const host = process.env.AUTH_SMTP_HOST;
  const port = Number(process.env.AUTH_SMTP_PORT ?? 587);
  const user = process.env.AUTH_SMTP_USER;
  const pass = process.env.AUTH_SMTP_PASS;

  if (!host || !Number.isFinite(port)) {
    throw new Error("SMTP is not configured. Missing AUTH_SMTP_HOST or AUTH_SMTP_PORT.");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });
}

async function sendAuthEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const from = process.env.AUTH_EMAIL_FROM;

  if (!from) {
    throw new Error("SMTP sender is not configured. Missing AUTH_EMAIL_FROM.");
  }

  const transport = getTransport();

  await transport.sendMail({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });
}

export async function sendEmailVerificationEmail(params: {
  email: string;
  token: string;
}) {
  const verifyUrl = `${getAppBaseUrl()}/api/auth/email/verify?token=${encodeURIComponent(params.token)}`;

  await sendAuthEmail({
    to: params.email,
    subject: "Bekräfta din e-post för Auktio",
    text: `Bekräfta din e-post genom att öppna länken: ${verifyUrl}`,
    html: `<p>Bekräfta din e-post för Auktio.</p><p><a href="${verifyUrl}">Bekräfta e-post</a></p>`,
  });
}

export async function sendPasswordResetEmail(params: {
  email: string;
  token: string;
}) {
  const resetUrl = `${getAppBaseUrl()}/auth/reset-password?token=${encodeURIComponent(params.token)}`;

  await sendAuthEmail({
    to: params.email,
    subject: "Återställ ditt lösenord för Auktio",
    text: `Återställ ditt lösenord genom att öppna länken: ${resetUrl}`,
    html: `<p>Återställ ditt lösenord för Auktio.</p><p><a href="${resetUrl}">Välj nytt lösenord</a></p>`,
  });
}