"use client";

import React, { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    // Simulate API call
    await new Promise((r) => setTimeout(r, 1500));
    setSubmitted(true);
    setLoading(false);
  };

  if (submitted) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-brand-200 dark:bg-brand-500/20">
          <svg className="h-8 w-8 text-brand-600 dark:text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Check your email</h2>
        <p className="mt-2 text-sm text-slate-400">
          If an account with <span className="text-slate-900 dark:text-white font-medium">{email}</span> exists, we've sent a password reset link.
        </p>
        <p className="mt-4 text-xs text-slate-500">Didn't receive it? Check your spam folder or try again.</p>
        <div className="mt-8 space-y-3">
          <button onClick={() => setSubmitted(false)} className="w-full rounded-lg border border-slate-200 dark:border-slate-700 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:border-slate-600 transition-colors">
            Try a different email
          </button>
          <a href="/login" className="block rounded-lg bg-brand-600 py-2.5 text-center text-sm font-semibold text-slate-900 dark:text-white hover:bg-brand-700 transition-colors">
            Back to Sign In
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Reset your password</h2>
        <p className="mt-2 text-sm text-slate-400">
          Enter your email address and we'll send you a link to reset your password.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Email Address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@circuvent.com"
            required
            autoFocus
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 px-4 py-2 dark:bg-slate-800/50.5 text-sm text-slate-900 dark:text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <button type="submit" disabled={loading || !email} className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-slate-900 dark:text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
          {loading && <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
          {loading ? "Sending..." : "Send Reset Link"}
        </button>
      </form>

      <div className="mt-6 text-center">
        <a href="/login" className="text-sm text-brand-600 dark:text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 transition-colors">← Back to Sign In</a>
      </div>

      <div className="mt-4 text-center">
        <a href="/" className="text-xs text-slate-500 hover:text-slate-400">← Back to home</a>
      </div>
    </div>
  );
}
