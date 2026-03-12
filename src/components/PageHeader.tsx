"use client";

import ScrollReveal from "@/components/ScrollReveal";

interface PageHeaderProps {
  eyebrow: string;
  eyebrowColor?: string;
  title: string;
  titleHighlight: string;
  titleGradient?: string;
  description?: string;
  children?: React.ReactNode;
}

export default function PageHeader({
  eyebrow,
  eyebrowColor = "var(--accent-cyan)",
  title,
  titleHighlight,
  titleGradient = "from-cyan-500 via-violet-500 to-pink-500",
  description,
  children,
}: PageHeaderProps) {
  return (
    <section className="relative z-10 pt-32 pb-20">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <ScrollReveal>
          <div className="max-w-4xl">
            <span
              className="text-xs font-semibold uppercase tracking-[0.2em]"
              style={{ color: eyebrowColor }}
            >
              {eyebrow}
            </span>
            <h1
              className="text-5xl sm:text-6xl lg:text-7xl font-bold mt-3 mb-6 leading-[0.95]"
              style={{ color: "var(--text-primary)" }}
            >
              {title}{" "}
              <span
                className={`bg-gradient-to-r ${titleGradient} bg-clip-text text-transparent`}
              >
                {titleHighlight}
              </span>
            </h1>
            {description && (
              <p
                className="text-lg sm:text-xl leading-relaxed max-w-2xl"
                style={{ color: "var(--text-tertiary)" }}
              >
                {description}
              </p>
            )}
            {children}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
