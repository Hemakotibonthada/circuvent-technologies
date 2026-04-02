"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { saveContactMessage } from "@/lib/cv365-firebase";
import {
  Send,
  Loader2,
  CheckCircle,
  AlertCircle,
  User,
  Mail,
  Building2,
  MessageSquare,
} from "lucide-react";

interface FormData {
  name: string;
  email: string;
  company: string;
  service: string;
  budget: string;
  message: string;
}

interface FormErrors {
  name?: string;
  email?: string;
  message?: string;
}

const serviceOptions = [
  { value: "ai-ml", label: "AI & ML Solutions" },
  { value: "iot", label: "IoT & Embedded Systems" },
  { value: "web", label: "Full-Stack Web Development" },
  { value: "mobile", label: "Mobile App Development" },
  { value: "enterprise", label: "Enterprise Platforms" },
  { value: "devops", label: "DevOps & Infrastructure" },
  { value: "other", label: "Other / Not Sure" },
];

const budgetOptions = [
  { value: "under-5k", label: "Under $5,000" },
  { value: "5k-15k", label: "$5,000 - $15,000" },
  { value: "15k-50k", label: "$15,000 - $50,000" },
  { value: "50k-plus", label: "$50,000+" },
  { value: "not-sure", label: "Not sure yet" },
];

export default function ContactForm() {
  const [formData, setFormData] = useState<FormData>({
    name: "",
    email: "",
    company: "",
    service: "",
    budget: "",
    message: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = "Name is required.";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address.";
    }

    if (!formData.message.trim()) {
      newErrors.message = "Please tell us about your project.";
    } else if (formData.message.trim().length < 20) {
      newErrors.message = "Please provide at least 20 characters.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (
    field: keyof FormData,
    value: string
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field as keyof FormErrors];
        return next;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setStatus("loading");

    try {
      // Save to CV-365 Firestore (work.circuvent.com/admin/messages)
      await saveContactMessage({
        name: formData.name.trim(),
        email: formData.email.trim(),
        subject: `${formData.service || "General"} inquiry from ${formData.name}${formData.company ? ` (${formData.company})` : ""}`,
        category: formData.service || "general",
        message: `${formData.message.trim()}${formData.company ? `\n\nCompany: ${formData.company}` : ""}${formData.budget ? `\nBudget: ${formData.budget}` : ""}`,
        source: "circuvent.com",
      });

      // Also send email notification
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        if (result.errors) {
          setErrors(result.errors);
        }
        setErrorMessage(
          result.message || `Request failed with status ${response.status}`
        );
        setStatus("error");
        return;
      }

      setStatus("success");

      // Reset form after success
      setTimeout(() => {
        setFormData({
          name: "",
          email: "",
          company: "",
          service: "",
          budget: "",
          message: "",
        });
        setStatus("idle");
      }, 5000);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Network error. Please check your connection."
      );
      setStatus("error");
    }
  };

  return (
    <div
      className="relative overflow-hidden rounded-3xl backdrop-blur-xl p-8 sm:p-10"
      style={{
        background: "var(--bg-glass)",
        border: "1px solid var(--border-primary)",
        boxShadow: "var(--shadow-lg)",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/3 via-transparent to-violet-500/3" />

      <div className="relative z-10">
        <AnimatePresence mode="wait">
          {status === "success" ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="text-center py-12"
            >
              <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-6" />
              <h3
                className="text-2xl font-bold mb-3"
                style={{ color: "var(--text-primary)" }}
              >
                Message Sent!
              </h3>
              <p
                className="text-sm max-w-md mx-auto"
                style={{ color: "var(--text-tertiary)" }}
              >
                Thank you for reaching out. We&apos;ll review your message and get back
                to you within 24-48 hours.
              </p>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onSubmit={handleSubmit}
              className="space-y-6"
            >
              {/* Name + Email row */}
              <div className="grid sm:grid-cols-2 gap-4">
                <Input
                  label="Full Name *"
                  placeholder="John Doe"
                  value={formData.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                  error={errors.name}
                  leftIcon={<User className="w-4 h-4" />}
                  aria-required="true"
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? "name-error" : undefined}
                />
                <Input
                  label="Email *"
                  type="email"
                  placeholder="john@company.com"
                  value={formData.email}
                  onChange={(e) => handleChange("email", e.target.value)}
                  error={errors.email}
                  leftIcon={<Mail className="w-4 h-4" />}
                  aria-required="true"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "email-error" : undefined}
                />
              </div>

              {/* Company + Service row */}
              <div className="grid sm:grid-cols-2 gap-4">
                <Input
                  label="Company"
                  placeholder="Your Company"
                  value={formData.company}
                  onChange={(e) => handleChange("company", e.target.value)}
                  leftIcon={<Building2 className="w-4 h-4" />}
                />
                <Select
                  label="Service Interested In"
                  value={formData.service}
                  onChange={(e) => handleChange("service", e.target.value)}
                  options={serviceOptions}
                  placeholder="Select a service"
                />
              </div>

              {/* Budget */}
              <Select
                label="Estimated Budget"
                value={formData.budget}
                onChange={(e) => handleChange("budget", e.target.value)}
                options={budgetOptions}
                placeholder="Select your budget range"
              />

              {/* Message */}
              <Textarea
                label="Tell Us About Your Project *"
                placeholder="Describe your project, goals, timeline, and any specific requirements. The more detail, the better we can help."
                value={formData.message}
                onChange={(e) => handleChange("message", e.target.value)}
                error={errors.message}
                charCount
                maxChars={2000}
                className="min-h-[160px]"
                aria-required="true"
                aria-invalid={!!errors.message}
                aria-describedby={errors.message ? "message-error" : undefined}
              />

              {/* Submit */}
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  We&apos;ll respond within 24-48 hours.
                </p>
                <Button
                  type="submit"
                  size="lg"
                  disabled={status === "loading"}
                  className="group"
                >
                  {status === "loading" ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Send Message
                    </>
                  )}
                </Button>
              </div>

              <div aria-live="polite" aria-atomic="true">
                {status === "error" && (
                  <div
                    role="alert"
                    className="flex items-center gap-2 p-3 rounded-xl text-sm"
                    style={{
                      background: "rgba(239, 68, 68, 0.1)",
                      border: "1px solid rgba(239, 68, 68, 0.2)",
                      color: "rgb(239, 68, 68)",
                    }}
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {errorMessage || "Something went wrong. Please try again."}
                  </div>
                )}
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
