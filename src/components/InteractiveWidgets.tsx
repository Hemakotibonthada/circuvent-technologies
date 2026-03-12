"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ============================================================================
// ANIMATED STEP WIZARD
// ============================================================================

interface WizardStep {
  id: string;
  title: string;
  description: string;
  icon: string;
  content: React.ReactNode;
  validation?: () => boolean;
}

interface StepWizardProps {
  steps: WizardStep[];
  className?: string;
  onComplete?: () => void;
  showProgress?: boolean;
}

export function AnimatedStepWizard({
  steps,
  className = "",
  onComplete,
  showProgress = true,
}: StepWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [direction, setDirection] = useState(0);

  const goTo = (index: number) => {
    if (index < 0 || index >= steps.length) return;
    setDirection(index > currentStep ? 1 : -1);
    setCurrentStep(index);
  };

  const next = () => {
    const step = steps[currentStep];
    if (step.validation && !step.validation()) return;
    setCompletedSteps((prev) => new Set([...prev, currentStep]));
    if (currentStep < steps.length - 1) {
      goTo(currentStep + 1);
    } else {
      onComplete?.();
    }
  };

  const prev = () => {
    if (currentStep > 0) goTo(currentStep - 1);
  };

  const progress = ((currentStep + 1) / steps.length) * 100;

  const variants = {
    enter: (dir: number) => ({ x: dir > 0 ? 200 : -200, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir < 0 ? 200 : -200, opacity: 0 }),
  };

  return (
    <div className={`rounded-2xl overflow-hidden ${className}`} style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
      {/* Progress bar */}
      {showProgress && (
        <div className="h-1 w-full" style={{ background: "var(--border-primary)" }}>
          <motion.div
            className="h-full bg-gradient-to-r from-cyan-500 to-violet-500"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      )}

      {/* Step indicators */}
      <div className="flex items-center justify-center py-6 px-4">
        {steps.map((step, i) => (
          <div key={step.id} className="flex items-center">
            <motion.button
              onClick={() => i <= currentStep && goTo(i)}
              className="relative flex flex-col items-center"
              whileHover={{ scale: 1.05 }}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${
                  completedSteps.has(i) ? "ring-2 ring-emerald-400 ring-offset-2" :
                  i === currentStep ? "ring-2 ring-cyan-400 ring-offset-2" : ""
                }`}
                style={{
                  background: completedSteps.has(i) ? "rgba(16,185,129,0.15)" :
                    i === currentStep ? "var(--accent-cyan-muted)" : "var(--bg-surface)",
                  border: `2px solid ${completedSteps.has(i) ? "#10b981" :
                    i === currentStep ? "var(--accent-cyan)" : "var(--border-primary)"}`,
                }}
              >
                {completedSteps.has(i) ? "✓" : step.icon}
              </div>
              <span className="text-[9px] mt-1.5 font-medium whitespace-nowrap" style={{
                color: i === currentStep ? "var(--accent-cyan)" :
                  completedSteps.has(i) ? "#10b981" : "var(--text-muted)",
              }}>
                {step.title}
              </span>
            </motion.button>
            {i < steps.length - 1 && (
              <div className="w-12 sm:w-20 h-0.5 mx-2" style={{
                background: completedSteps.has(i) ? "#10b981" : "var(--border-primary)",
              }} />
            )}
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="px-6 pb-6">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentStep}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <div className="mb-4">
              <h3 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                {steps[currentStep].title}
              </h3>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                {steps[currentStep].description}
              </p>
            </div>
            {steps[currentStep].content}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6 pt-4" style={{ borderTop: "1px solid var(--border-primary)" }}>
          <motion.button
            onClick={prev}
            disabled={currentStep === 0}
            className="px-4 py-2 rounded-xl text-xs font-medium disabled:opacity-30"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}
            whileTap={{ scale: 0.95 }}
          >
            ← Back
          </motion.button>
          <span className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
            {currentStep + 1} / {steps.length}
          </span>
          <motion.button
            onClick={next}
            className="px-4 py-2 rounded-xl text-xs font-medium text-white"
            style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.95 }}
          >
            {currentStep === steps.length - 1 ? "Complete ✓" : "Next →"}
          </motion.button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// INTERACTIVE CALCULATOR
// ============================================================================

interface ROICalculatorProps {
  className?: string;
}

export function ROICalculator({ className = "" }: ROICalculatorProps) {
  const [projectType, setProjectType] = useState<"web" | "mobile" | "ai" | "iot" | "enterprise">("web");
  const [teamSize, setTeamSize] = useState(3);
  const [duration, setDuration] = useState(3);
  const [complexity, setComplexity] = useState<"simple" | "moderate" | "complex">("moderate");
  const [features, setFeatures] = useState<Set<string>>(new Set(["auth", "api"]));

  const baseRates: Record<string, number> = {
    web: 5000, mobile: 7000, ai: 10000, iot: 8000, enterprise: 12000,
  };

  const complexityMultipliers = { simple: 0.7, moderate: 1.0, complex: 1.5 };
  const featureCosts: Record<string, number> = {
    auth: 2000, api: 1500, realtime: 3000, ai: 5000, payments: 2500,
    analytics: 2000, admin: 3000, mobile: 4000, iot: 3500, cicd: 1500,
  };

  const estimate = useMemo(() => {
    const base = baseRates[projectType] * duration;
    const complexityFactor = complexityMultipliers[complexity];
    const teamFactor = 1 + (teamSize - 1) * 0.3;
    const featureCost = Array.from(features).reduce((sum, f) => sum + (featureCosts[f] || 0), 0);
    const total = Math.round((base * complexityFactor * teamFactor + featureCost) / 100) * 100;
    const timeToMarket = Math.round(duration * complexityMultipliers[complexity] * 4.3);
    const roi = Math.round(total * 3.2);

    return { total, timeToMarket, roi, monthly: Math.round(total / duration) };
  }, [projectType, teamSize, duration, complexity, features]);

  const toggleFeature = (feature: string) => {
    setFeatures((prev) => {
      const next = new Set(prev);
      if (next.has(feature)) next.delete(feature);
      else next.add(feature);
      return next;
    });
  };

  const projectTypes = [
    { id: "web", label: "Web App", icon: "🌐" },
    { id: "mobile", label: "Mobile", icon: "📱" },
    { id: "ai", label: "AI/ML", icon: "🧠" },
    { id: "iot", label: "IoT", icon: "🔌" },
    { id: "enterprise", label: "Enterprise", icon: "🏢" },
  ];

  const featureList = [
    { id: "auth", label: "Authentication", icon: "🔐" },
    { id: "api", label: "REST API", icon: "⚡" },
    { id: "realtime", label: "Real-Time", icon: "🔌" },
    { id: "ai", label: "AI Integration", icon: "🧠" },
    { id: "payments", label: "Payments", icon: "💳" },
    { id: "analytics", label: "Analytics", icon: "📊" },
    { id: "admin", label: "Admin Panel", icon: "⚙️" },
    { id: "mobile", label: "Mobile App", icon: "📱" },
    { id: "iot", label: "IoT Devices", icon: "🔧" },
    { id: "cicd", label: "CI/CD", icon: "🚀" },
  ];

  return (
    <div className={`rounded-2xl overflow-hidden ${className}`} style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
      <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid var(--border-primary)" }}>
        <span className="text-sm">💰</span>
        <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Project Estimator</h3>
      </div>

      <div className="p-5 space-y-5">
        {/* Project type */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider mb-2 block" style={{ color: "var(--text-muted)" }}>Project Type</label>
          <div className="flex gap-2">
            {projectTypes.map((type) => (
              <motion.button
                key={type.id}
                onClick={() => setProjectType(type.id as typeof projectType)}
                className="flex-1 flex flex-col items-center gap-1 py-2 rounded-xl text-[10px] font-medium"
                style={{
                  background: projectType === type.id ? "var(--accent-cyan-muted)" : "var(--bg-surface)",
                  color: projectType === type.id ? "var(--accent-cyan)" : "var(--text-muted)",
                  border: `1px solid ${projectType === type.id ? "var(--accent-cyan)" : "var(--border-primary)"}`,
                }}
                whileTap={{ scale: 0.95 }}
              >
                <span className="text-lg">{type.icon}</span>
                {type.label}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Duration & Team */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-medium flex justify-between" style={{ color: "var(--text-muted)" }}>
              <span>Duration</span><span className="font-mono">{duration} months</span>
            </label>
            <input type="range" min="1" max="12" value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full accent-cyan-500" />
          </div>
          <div>
            <label className="text-[10px] font-medium flex justify-between" style={{ color: "var(--text-muted)" }}>
              <span>Team Size</span><span className="font-mono">{teamSize}</span>
            </label>
            <input type="range" min="1" max="8" value={teamSize} onChange={(e) => setTeamSize(Number(e.target.value))} className="w-full accent-cyan-500" />
          </div>
        </div>

        {/* Complexity */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider mb-2 block" style={{ color: "var(--text-muted)" }}>Complexity</label>
          <div className="flex gap-2">
            {(["simple", "moderate", "complex"] as const).map((c) => (
              <motion.button
                key={c}
                onClick={() => setComplexity(c)}
                className="flex-1 py-1.5 rounded-lg text-[10px] font-medium capitalize"
                style={{
                  background: complexity === c ? "var(--accent-violet-muted)" : "var(--bg-surface)",
                  color: complexity === c ? "var(--accent-violet)" : "var(--text-muted)",
                  border: `1px solid ${complexity === c ? "var(--accent-violet)" : "var(--border-primary)"}`,
                }}
                whileTap={{ scale: 0.95 }}
              >
                {c}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Features */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider mb-2 block" style={{ color: "var(--text-muted)" }}>Features</label>
          <div className="grid grid-cols-2 gap-1.5">
            {featureList.map((feature) => (
              <motion.button
                key={feature.id}
                onClick={() => toggleFeature(feature.id)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium text-left"
                style={{
                  background: features.has(feature.id) ? "var(--accent-cyan-muted)" : "var(--bg-surface)",
                  color: features.has(feature.id) ? "var(--accent-cyan)" : "var(--text-muted)",
                  border: `1px solid ${features.has(feature.id) ? "var(--accent-cyan)" : "var(--border-primary)"}`,
                }}
                whileTap={{ scale: 0.95 }}
              >
                <span>{feature.icon}</span>
                {feature.label}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="grid grid-cols-2 gap-3 pt-2" style={{ borderTop: "1px solid var(--border-primary)" }}>
          <div className="p-3 rounded-xl text-center" style={{ background: "var(--bg-surface)" }}>
            <div className="text-2xl font-bold bg-gradient-to-r from-cyan-500 to-violet-500 bg-clip-text text-transparent">
              ${estimate.total.toLocaleString()}
            </div>
            <div className="text-[9px]" style={{ color: "var(--text-muted)" }}>Estimated Cost</div>
          </div>
          <div className="p-3 rounded-xl text-center" style={{ background: "var(--bg-surface)" }}>
            <div className="text-2xl font-bold text-emerald-500">
              {estimate.timeToMarket} weeks
            </div>
            <div className="text-[9px]" style={{ color: "var(--text-muted)" }}>Time to Market</div>
          </div>
          <div className="p-3 rounded-xl text-center" style={{ background: "var(--bg-surface)" }}>
            <div className="text-2xl font-bold text-amber-500">
              ${estimate.monthly.toLocaleString()}
            </div>
            <div className="text-[9px]" style={{ color: "var(--text-muted)" }}>Monthly Cost</div>
          </div>
          <div className="p-3 rounded-xl text-center" style={{ background: "var(--bg-surface)" }}>
            <div className="text-2xl font-bold text-violet-500">
              ${estimate.roi.toLocaleString()}
            </div>
            <div className="text-[9px]" style={{ color: "var(--text-muted)" }}>Projected ROI (3yr)</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// INTERACTIVE SKILL ASSESSMENT QUIZ
// ============================================================================

interface QuizQuestion {
  id: string;
  question: string;
  options: Array<{ id: string; text: string; correct: boolean }>;
  explanation: string;
  category: string;
  difficulty: "easy" | "medium" | "hard";
}

interface TechQuizProps {
  questions: QuizQuestion[];
  className?: string;
  title?: string;
}

export function TechQuiz({
  questions,
  className = "",
  title = "Tech Knowledge Quiz",
}: TechQuizProps) {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [score, setScore] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [answers, setAnswers] = useState<Array<{ questionId: string; answerId: string; correct: boolean }>>([]);

  const question = questions[currentQuestion];
  const progress = ((currentQuestion) / questions.length) * 100;

  const handleAnswer = (answerId: string) => {
    if (selectedAnswer) return;
    setSelectedAnswer(answerId);

    const isCorrect = question.options.find((o) => o.id === answerId)?.correct || false;
    if (isCorrect) setScore((prev) => prev + 1);

    setAnswers((prev) => [...prev, { questionId: question.id, answerId, correct: isCorrect }]);
    setShowExplanation(true);
  };

  const nextQuestion = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion((prev) => prev + 1);
      setSelectedAnswer(null);
      setShowExplanation(false);
    } else {
      setIsComplete(true);
    }
  };

  const restart = () => {
    setCurrentQuestion(0);
    setSelectedAnswer(null);
    setShowExplanation(false);
    setScore(0);
    setIsComplete(false);
    setAnswers([]);
  };

  const difficultyColors = {
    easy: { bg: "rgba(16,185,129,0.1)", text: "#10b981" },
    medium: { bg: "rgba(245,158,11,0.1)", text: "#f59e0b" },
    hard: { bg: "rgba(239,68,68,0.1)", text: "#ef4444" },
  };

  return (
    <div className={`rounded-2xl overflow-hidden ${className}`} style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
      {/* Progress */}
      <div className="h-1 w-full" style={{ background: "var(--border-primary)" }}>
        <motion.div
          className="h-full bg-gradient-to-r from-cyan-500 to-violet-500"
          animate={{ width: `${progress}%` }}
        />
      </div>

      <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border-primary)" }}>
        <div className="flex items-center gap-2">
          <span className="text-sm">🧩</span>
          <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{title}</h3>
        </div>
        <div className="flex items-center gap-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
          <span>Score: <strong className="text-emerald-500">{score}</strong>/{questions.length}</span>
          <span>Q{currentQuestion + 1}/{questions.length}</span>
        </div>
      </div>

      <div className="p-5">
        {isComplete ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-8"
          >
            <div className="text-5xl mb-4">{score >= questions.length * 0.8 ? "🏆" : score >= questions.length * 0.5 ? "🎯" : "📚"}</div>
            <h3 className="text-2xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
              {score}/{questions.length} Correct!
            </h3>
            <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
              {score >= questions.length * 0.8 ? "Excellent! You're a tech master!" :
               score >= questions.length * 0.5 ? "Good job! Keep learning!" :
               "Keep practicing — you'll get there!"}
            </p>
            <div className="flex justify-center gap-3">
              <motion.button
                onClick={restart}
                className="px-4 py-2 rounded-xl text-xs font-medium"
                style={{ background: "var(--accent-cyan-muted)", color: "var(--accent-cyan)", border: "1px solid var(--accent-cyan)" }}
                whileTap={{ scale: 0.95 }}
              >
                ↻ Try Again
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={currentQuestion}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              {/* Question */}
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[9px] px-1.5 py-0.5 rounded capitalize font-medium" style={{
                    ...difficultyColors[question.difficulty],
                    background: difficultyColors[question.difficulty].bg,
                    color: difficultyColors[question.difficulty].text,
                  }}>
                    {question.difficulty}
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "var(--accent-cyan-muted)", color: "var(--accent-cyan)" }}>
                    {question.category}
                  </span>
                </div>
                <h4 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
                  {question.question}
                </h4>
              </div>

              {/* Options */}
              <div className="space-y-2 mb-4">
                {question.options.map((option) => {
                  const isSelected = selectedAnswer === option.id;
                  const isCorrect = option.correct;
                  const showResult = showExplanation;

                  return (
                    <motion.button
                      key={option.id}
                      onClick={() => handleAnswer(option.id)}
                      disabled={showExplanation}
                      className="w-full text-left p-3 rounded-xl text-sm transition-all"
                      style={{
                        background: showResult
                          ? isCorrect ? "rgba(16,185,129,0.1)" : isSelected ? "rgba(239,68,68,0.1)" : "var(--bg-surface)"
                          : isSelected ? "var(--accent-cyan-muted)" : "var(--bg-surface)",
                        border: `1px solid ${showResult
                          ? isCorrect ? "#10b981" : isSelected ? "#ef4444" : "var(--border-primary)"
                          : isSelected ? "var(--accent-cyan)" : "var(--border-primary)"}`,
                        color: "var(--text-primary)",
                      }}
                      whileHover={!showExplanation ? { scale: 1.01 } : {}}
                      whileTap={!showExplanation ? { scale: 0.99 } : {}}
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{
                          background: showResult && isCorrect ? "#10b981" : showResult && isSelected ? "#ef4444" : "var(--bg-surface-hover)",
                          color: showResult && (isCorrect || isSelected) ? "white" : "var(--text-muted)",
                        }}>
                          {showResult && isCorrect ? "✓" : showResult && isSelected ? "✕" : option.id.toUpperCase()}
                        </span>
                        {option.text}
                      </span>
                    </motion.button>
                  );
                })}
              </div>

              {/* Explanation */}
              <AnimatePresence>
                {showExplanation && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="rounded-xl p-3 mb-4"
                    style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)" }}
                  >
                    <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      💡 {question.explanation}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Next button */}
              {showExplanation && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={nextQuestion}
                  className="w-full py-2.5 rounded-xl text-sm font-medium text-white"
                  style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  {currentQuestion < questions.length - 1 ? "Next Question →" : "See Results"}
                </motion.button>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// INTERACTIVE LIVE EDITOR (Simplified)
// ============================================================================

interface LiveEditorProps {
  initialCode?: string;
  language?: string;
  className?: string;
  title?: string;
}

export function LiveEditor({
  initialCode = '<div style="padding: 20px; background: linear-gradient(135deg, #06b6d4, #8b5cf6); border-radius: 16px; color: white; font-family: system-ui;">\n  <h1>Hello, World!</h1>\n  <p>Edit this code in real-time.</p>\n</div>',
  language = "html",
  className = "",
  title = "Live Editor",
}: LiveEditorProps) {
  const [code, setCode] = useState(initialCode);
  const [activeTab, setActiveTab] = useState<"code" | "preview">("code");
  const [fontSize, setFontSize] = useState(13);
  const [wordWrap, setWordWrap] = useState(true);

  const previewHtml = useMemo(() => {
    if (language === "html") return code;
    return `<pre style="color: #a6adc8; font-family: monospace; font-size: 13px; margin: 0; padding: 16px;">${code.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`;
  }, [code, language]);

  return (
    <div className={`rounded-2xl overflow-hidden ${className}`} style={{
      background: "#1e1e2e",
      border: "1px solid rgba(255,255,255,0.06)",
    }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5" style={{
        background: "rgba(0,0,0,0.3)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
          </div>
          <span className="text-xs font-mono text-[#6c7086]">{title}</span>
        </div>
        <div className="flex gap-1">
          {(["code", "preview"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 rounded-md text-[10px] font-medium capitalize ${
                activeTab === tab ? "bg-white/10 text-white/80" : "text-white/30 hover:text-white/50"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ minHeight: 300 }}>
        {activeTab === "code" ? (
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full h-full p-4 resize-none font-mono bg-transparent text-[#a6adc8] outline-none"
            style={{
              fontSize: `${fontSize}px`,
              lineHeight: 1.7,
              minHeight: 300,
              whiteSpace: wordWrap ? "pre-wrap" : "pre",
            }}
            spellCheck={false}
          />
        ) : (
          <div className="p-4" style={{ minHeight: 300, background: "#fff" }}>
            <iframe
              srcDoc={`<!DOCTYPE html><html><head><style>body{margin:0;padding:0;font-family:system-ui;}</style></head><body>${previewHtml}</body></html>`}
              className="w-full border-0"
              style={{ minHeight: 280 }}
              sandbox="allow-scripts"
              title="Preview"
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-1.5 text-[9px]" style={{
        background: "rgba(0,0,0,0.2)",
        borderTop: "1px solid rgba(255,255,255,0.04)",
        color: "#6c7086",
      }}>
        <div className="flex items-center gap-3">
          <span>{language}</span>
          <span>{code.split("\n").length} lines</span>
          <span>{code.length} chars</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWordWrap(!wordWrap)}
            className={`px-1.5 py-0.5 rounded ${wordWrap ? "bg-white/10" : ""}`}
          >
            Wrap
          </button>
          <button onClick={() => setFontSize((s) => Math.min(s + 1, 20))} className="px-1 hover:bg-white/10 rounded">A+</button>
          <button onClick={() => setFontSize((s) => Math.max(s - 1, 10))} className="px-1 hover:bg-white/10 rounded">A-</button>
        </div>
      </div>
    </div>
  );
}

export default AnimatedStepWizard;
