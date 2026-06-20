import type { Metadata } from "next"
import Link from "next/link"
import {
  ActivityIcon,
  ArrowRightIcon,
  CheckIcon,
  CpuIcon,
  FileSearchIcon,
  GaugeIcon,
  LockIcon,
  NewspaperIcon,
  ScaleIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UserCheckIcon,
} from "lucide-react"

import { LandingNav } from "@/components/landing/landing-nav"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Bandarmology — Dynamic Risk Profiling",
  description:
    "A real-time risk intelligence engine that fuses public signals with internal KYC/AML data to surface early, explainable, human-reviewed risk alerts.",
}

const FEATURES = [
  {
    icon: NewspaperIcon,
    title: "Real-time public intelligence",
    body: "Continuously ingests news, sanctions lists, registries and adverse media, normalising every source into one auditable signal.",
  },
  {
    icon: GaugeIcon,
    title: "Cost-staged pipeline",
    body: "A free rule-based filter triages volume before any model runs, so expensive reasoning is spent only on signals that matter.",
  },
  {
    icon: UserCheckIcon,
    title: "KYC drift detection",
    body: "Catches slow, structural change — ownership, jurisdiction, business model — that quietly invalidates onboarding assumptions.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Grounded, every time",
    body: "Each flag carries a confidence score, a human-readable rationale, and citations tied back to a real ingested signal.",
  },
]

const PIPELINE = [
  {
    step: "Stage 1",
    label: "Cheap filter",
    cost: "≈ free",
    body: "Keyword and lexical scoring against an 11-category risk taxonomy. No model calls — pure triage that discards noise before it costs anything.",
  },
  {
    step: "Stage 2",
    label: "LLM classify",
    cost: "Low",
    body: "A fast, inexpensive model classifies surviving signals into structured, validated flags — one signal per call, every token logged.",
  },
  {
    step: "Stage 3",
    label: "Deep analysis",
    cost: "Rare",
    body: "A stronger model is reserved for escalated cases only, diffing extracted signals against the internal KYC baseline to confirm drift.",
  },
]

const DETECTION = [
  { signal: "Sudden spike in negative news", flag: "High Reputational Risk" },
  { signal: "Legal entity name change", flag: "Entity Identity Change — Re-KYC" },
  { signal: "Public pivot (SaaS → crypto)", flag: "Material Business Model Change" },
  { signal: "New beneficial owners appear", flag: "Ownership Change — KYC Drift" },
  { signal: "Jurisdiction or legal-form move", flag: "Structural Risk Change" },
  { signal: "Dormant entity, sudden volume", flag: "Dormancy Break" },
]

const GUARDRAILS = [
  {
    icon: LockIcon,
    title: "Data separation",
    body: "Public and internal data planes never share a store. Any join is an explicit, logged, auditable step.",
  },
  {
    icon: UserCheckIcon,
    title: "Human in the loop",
    body: "Every alert starts as proposed. No model output ever auto-executes an action — a person confirms or escalates.",
  },
  {
    icon: FileSearchIcon,
    title: "Full audit trail",
    body: "Every model call is logged with token counts and cost, feeding a transparent cost-per-1,000-alerts metric.",
  },
]

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </span>
  )
}

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <LandingNav />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border/60">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,var(--color-primary)/8%,transparent_70%)]"
          />
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-20 lg:grid-cols-2 lg:px-6 lg:py-28">
            <div className="flex flex-col items-start gap-6">
              <Badge variant="outline" className="gap-1.5 py-1 text-muted-foreground">
                <SparklesIcon className="size-3.5" />
                Dynamic Risk Profiling System
              </Badge>
              <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                See risk before it reaches your book.
              </h1>
              <p className="max-w-xl text-lg text-muted-foreground text-pretty">
                Bandarmology fuses real-time public intelligence with internal
                KYC and AML data to surface early, explainable risk alerts — and
                to catch the slow KYC drift that traditional reviews miss.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/"
                  className={cn(buttonVariants({ size: "lg" }), "gap-2")}
                >
                  Open dashboard
                  <ArrowRightIcon className="size-4" />
                </Link>
                <a
                  href="#pipeline"
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
                >
                  See how it works
                </a>
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <CheckIcon className="size-4 text-foreground" />
                  Citations on every flag
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckIcon className="size-4 text-foreground" />
                  Human-in-the-loop
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckIcon className="size-4 text-foreground" />
                  Cost-aware by design
                </span>
              </div>
            </div>

            <div className="relative">
              <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <img
                  src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=80"
                  alt="Risk analytics dashboard"
                  className="aspect-[4/3] w-full object-cover"
                />
              </div>
              <div className="absolute -bottom-5 -left-5 hidden rounded-xl border border-border bg-card/95 px-4 py-3 shadow-sm backdrop-blur sm:block">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <ActivityIcon className="size-4.5" />
                  </span>
                  <div>
                    <div className="text-sm font-medium">Live signals</div>
                    <div className="text-xs text-muted-foreground">
                      News · Sanctions · Registries
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Stats strip */}
        <section className="border-b border-border/60 bg-muted/30">
          <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-6 px-4 py-10 lg:grid-cols-4 lg:px-6">
            {[
              { value: "5+", label: "Public sources fused" },
              { value: "3-stage", label: "Cost-staged pipeline" },
              { value: "11", label: "Risk categories" },
              { value: "100%", label: "Flags cited & scored" },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col gap-1">
                <span className="text-3xl font-semibold tracking-tight tabular-nums">
                  {stat.value}
                </span>
                <span className="text-sm text-muted-foreground">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section id="platform" className="scroll-mt-20">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 lg:px-6 lg:py-24">
            <div className="flex max-w-2xl flex-col gap-4">
              <SectionLabel>The platform</SectionLabel>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Built for proactive risk monitoring
              </h2>
              <p className="text-lg text-muted-foreground text-pretty">
                A real-time intelligence engine designed around the things a
                regulated bank actually needs: accuracy, explainability, and
                deliberate spend at every stage.
              </p>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-2">
              {FEATURES.map((feature) => (
                <Card key={feature.title} className="border-border/70">
                  <CardHeader>
                    <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <feature.icon className="size-5" />
                    </span>
                    <CardTitle className="pt-2 text-lg">
                      {feature.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-muted-foreground">
                    {feature.body}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Pipeline */}
        <section
          id="pipeline"
          className="scroll-mt-20 border-y border-border/60 bg-muted/30"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-20 lg:px-6 lg:py-24">
            <div className="flex max-w-2xl flex-col gap-4">
              <SectionLabel>How it works</SectionLabel>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Spend the most where it matters least
              </h2>
              <p className="text-lg text-muted-foreground text-pretty">
                Volume is cut down for free before a model is ever called.
                Reasoning escalates by cost, so the expensive analysis runs only
                on the cases that earn it.
              </p>
            </div>

            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {PIPELINE.map((stage, i) => (
                <Card key={stage.step} className="relative border-border/70">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm text-muted-foreground">
                        {stage.step}
                      </span>
                      <Badge variant="secondary" className="font-normal">
                        {stage.cost}
                      </Badge>
                    </div>
                    <CardTitle className="flex items-center gap-2 pt-2 text-lg">
                      {i === 0 && <GaugeIcon className="size-5 text-primary" />}
                      {i === 1 && <CpuIcon className="size-5 text-primary" />}
                      {i === 2 && <FileSearchIcon className="size-5 text-primary" />}
                      {stage.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-muted-foreground">
                    {stage.body}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Detection */}
        <section id="detection" className="scroll-mt-20">
          <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-20 lg:grid-cols-2 lg:items-center lg:px-6 lg:py-24">
            <div className="order-2 lg:order-1">
              <div className="overflow-hidden rounded-2xl border border-border shadow-sm">
                <img
                  src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1200&q=80"
                  alt="Analyst reviewing risk signals"
                  className="aspect-[4/3] w-full object-cover"
                />
              </div>
            </div>

            <div className="order-1 flex flex-col gap-6 lg:order-2">
              <div className="flex flex-col gap-4">
                <SectionLabel>What it detects</SectionLabel>
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  From a headline to a recommended action
                </h2>
                <p className="text-lg text-muted-foreground text-pretty">
                  Each public signal is mapped to an explainable flag and a
                  recommended next step — ready for an analyst to review.
                </p>
              </div>

              <ul className="flex flex-col divide-y divide-border/70 rounded-xl border border-border/70">
                {DETECTION.map((item) => (
                  <li
                    key={item.flag}
                    className="flex items-center justify-between gap-4 px-4 py-3"
                  >
                    <span className="text-sm text-muted-foreground">
                      {item.signal}
                    </span>
                    <Badge variant="outline" className="shrink-0 font-normal">
                      {item.flag}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Compliance */}
        <section
          id="compliance"
          className="scroll-mt-20 border-t border-border/60 bg-muted/30"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-20 lg:px-6 lg:py-24">
            <div className="flex max-w-2xl flex-col gap-4">
              <SectionLabel>Compliance &amp; safety</SectionLabel>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Guardrails are not an afterthought
              </h2>
              <p className="text-lg text-muted-foreground text-pretty">
                Governance is built into the architecture, not bolted on — so
                the system stays explainable, controlled, and compliant.
              </p>
            </div>

            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {GUARDRAILS.map((g) => (
                <div
                  key={g.title}
                  className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-6"
                >
                  <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <g.icon className="size-5" />
                  </span>
                  <h3 className="text-lg font-medium">{g.title}</h3>
                  <p className="text-muted-foreground">{g.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-border/60">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 lg:px-6 lg:py-24">
            <div className="relative overflow-hidden rounded-3xl border border-border bg-primary px-6 py-16 text-center text-primary-foreground sm:px-12">
              <div className="mx-auto flex max-w-2xl flex-col items-center gap-6">
                <ScaleIcon className="size-8 opacity-90" />
                <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                  Turn public noise into early, defensible decisions
                </h2>
                <p className="text-lg text-primary-foreground/80 text-pretty">
                  Explore the risk dashboard and see how Bandarmology surfaces,
                  scores, and explains the signals that matter.
                </p>
                <Link
                  href="/"
                  className={cn(
                    buttonVariants({ variant: "secondary", size: "lg" }),
                    "gap-2"
                  )}
                >
                  Open dashboard
                  <ArrowRightIcon className="size-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row lg:px-6">
          <div className="flex items-center gap-2">
            <img src="/bandar2.svg" alt="Bandarmology" className="size-5" />
            <span className="text-sm font-medium">Bandarmology</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Dynamic Risk Profiling System · Built for AMINA Bank
          </p>
        </div>
      </footer>
    </div>
  )
}
