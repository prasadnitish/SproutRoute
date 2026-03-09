const { useState } = React;

const SITE = {
  name: "Nitish Prasad",
  headline: "I turn ambiguous 0→1 product bets into scaled systems with measurable business impact.",
  intro: [
    "For every project here, I individually conceptualized the product, designed the system, and wrote the production code end to end.",
    "Most of my work sits where product strategy meets system design. I like the stage where the request is still fuzzy, the operating model is still unsettled, and the product needs someone to narrow the real problem.",
    "That has meant different things in different products: turning Amplify from a dashboard request into an AI seller intelligence platform, shipping SproutRoute end to end in ten weeks, and building MathQuest as a privacy-first offline iPad app for kids."
  ],
  email: "nitish.prasad@gmail.com",
  linkedin: "https://linkedin.com/in/nitishprasad",
  github: "https://github.com/prasadnitish",
  resume: "resume.html"
};

const heroReads = [
  {
    href: "project-amplify.html",
    title: "Amplify",
    copy: "1,600+ users, 99% infra cost reduction, and a roadmap path into Salesforce — not another internal tool."
  },
  {
    href: "project-sproutroute.html",
    title: "SproutRoute",
    copy: "Full-stack AI trip planner, shipped solo in ten weeks. React, Node, Claude API, Railway."
  },
  {
    href: "project-mathquest.html",
    title: "MathQuest Kids",
    copy: "Offline-first iPad math app for kids. SwiftUI, no accounts, no analytics, 535 content templates."
  }
];

const proofs = [
  { stat: "1,600+", label: "Amplify users across NA and EU" },
  { stat: "99%",    label: "Infrastructure cost reduction" },
  { stat: "<500ms", label: "P95 latency target achieved" },
  { stat: "45→5 min", label: "Prep time saved per AM call" }
];

const flagshipProjects = [
  {
    href: "project-amplify.html",
    title: "Amplify",
    badge: "Flagship",
    badgeClass: "accent",
    icon: "◉",
    copy: "An AI seller intelligence platform serving 1,600+ account managers across NA and EU. I redefined the product scope, designed the operating model that cut infra costs 99%, and set the roadmap path toward Salesforce — not another disconnected internal tool.",
    metrics: ["1,600+ users", "99% cost cut", "<500ms latency"]
  },
  {
    href: "project-sproutroute.html",
    title: "SproutRoute",
    badge: "Live demo",
    badgeClass: "signal",
    icon: "△",
    copy: "Designed, built, and shipped solo in ten weeks — React, Node, Claude API, Railway. Full end-to-end ownership: product scope, architecture, UX, and deployment.",
    metrics: ["10 weeks", "167 tests", "Web + mobile"]
  },
  {
    href: "project-mathquest.html",
    title: "MathQuest Kids",
    badge: "Product craft",
    badgeClass: "success",
    icon: "□",
    copy: "An offline-first iPad math app for kids. Privacy-safe by design: no accounts, no analytics, no data collection. 535 content templates in native SwiftUI.",
    metrics: ["Offline first", "535 templates", "Native SwiftUI"]
  }
];

const workingStyle = [
  "I start by reframing the problem. Most first requests aren't quite the right problem yet.",
  "I stay close to system design so I can challenge the operating model, not just the roadmap.",
  "I care about day-two reality: adoption, cost, latency, governance, and how the tool fits into an existing workflow.",
  "I am most useful when a team needs product judgment and technical fluency in the same room."
];

const credibility = [
  {
    title: "Amazon operator",
    copy: "10+ years at Amazon, working across executive stakeholders, scaled systems, and organizational complexity — from individual contributor to VP-facing program ownership."
  },
  {
    title: "AI PM with technical depth",
    copy: "Fluent in RAG, Bedrock, cost-latency tradeoffs, and the operating-model decisions that separate a good demo from a production system."
  },
  {
    title: "0→1 to scale",
    copy: "Comfortable moving from early framing into prototyping, system design, shipping, and the adoption problems that follow launch."
  }
];

const experience = [
  {
    date: "May 2025 – Present",
    company: "Amazon",
    role: "Senior Product Manager, Fees",
    copy: "Built Amplify from a dashboard request into an AI seller intelligence platform. Chose a hybrid inference model that made the economics work, drove the product path toward Salesforce integration, and shaped the product around real account-manager workflows. Also own end-to-end strategy and design for US 3P seller incentive programs, managing a nine-figure annual budget and tying incentives to seller growth and P&L impact.",
    tags: ["AWS Bedrock", "RAG", "Hybrid inference", "Salesforce", "Multi-region"]
  },
  {
    date: "Jun 2022 – May 2025",
    company: "Amazon",
    role: "Senior Product and Customer Insights Manager, CXBT",
    copy: "Led strategic research across seller and vendor ecosystems. Findings shaped product roadmaps, information architecture, and senior leadership decisions.",
    tags: ["Research", "Roadmap shaping", "Executive reviews", "Cross-geo studies"]
  },
  {
    date: "Apr 2020 – Jun 2022",
    company: "Amazon",
    role: "Senior Program Manager, PSAS Ops",
    copy: "Led enterprise platform migration for 29 teams and 6,000+ users, built a PMO and analytics function from scratch, and delivered against VP-level goals for a 700-person organization.",
    tags: ["Platform migration", "Change management", "Analytics", "PMO"]
  },
  {
    date: "Oct 2017 – Apr 2020",
    company: "Amazon",
    role: "Senior Program Manager, Amazon Pay",
    copy: "Managed CX across 30+ products, drove $4.8M FCF impact through self-serve and contact-reduction work, and partnered closely with data engineering on automated reporting.",
    tags: ["Payments", "Customer experience", "Self-serve", "Data pipelines"]
  },
  {
    date: "Nov 2015 – Oct 2017",
    company: "Amazon India",
    role: "Program Manager II, Sales Ops",
    copy: "Drove 200K+ leads, led a Salesforce CRM migration, and designed operational workflows and KPI reporting for the sales organization.",
    tags: ["Salesforce", "Ops", "Automation", "Dashboards"]
  }
];

const supportingProjects = [
  {
    href: "ai-eval-control-tower.html",
    title: "AI Eval Control Tower",
    icon: "✦",
    badge: "Live demo",
    badgeClass: "signal",
    copy: "Evaluation infrastructure for teams that need model quality, drift, latency, and release criteria in one place, not scattered across ad hoc dashboards."
  },
  {
    href: "project-rag-pipeline.html",
    title: "RAG Pipeline with Guardrails",
    icon: "◇",
    badge: "Repository",
    badgeClass: "accent",
    copy: "A grounded RAG system with prompt-injection, PII, toxicity, and policy gates built around release decisions, not just retrieval demos."
  },
  {
    href: "project-ai-safety.html",
    title: "AI Safety Audit Tool",
    icon: "▣",
    badge: "Live demo",
    badgeClass: "success",
    copy: "A governance and fairness tool for teams that want launch criteria, audit evidence, and scenario-based safety checks."
  }
];

function Nav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const links = [
    { href: "#work", label: "Flagship Work" },
    { href: "#experience", label: "Experience" },
    { href: "#systems", label: "Systems" },
    { href: "#contact", label: "Contact" }
  ];

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <a className="brand" href="#hero" onClick={() => setMenuOpen(false)}>
          Nitish Prasad
        </a>
        <div className="nav-shell">
          <nav className="nav-list" aria-label="Primary">
            {links.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
          </nav>
          <div className="nav-actions">
            <a className="nav-secondary" href={SITE.linkedin} target="_blank" rel="noreferrer">
              LinkedIn
            </a>
            <a className="nav-resume" href={SITE.resume} target="_blank" rel="noreferrer">
              Open Resume
            </a>
            <button
              type="button"
              className="nav-menu-btn"
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? "✕" : "☰"}
            </button>
          </div>
        </div>
        <div className={`mobile-menu ${menuOpen ? "open" : ""}`}>
          {links.map((link) => (
            <a key={link.href} href={link.href} onClick={() => setMenuOpen(false)}>
              {link.label}
            </a>
          ))}
          <a href={SITE.resume} target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>
            Open Resume
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="hero" id="hero">
      <div className="hero-grid">
        <div className="hero-copy">
          <div className="eyebrow">Principal-level product leader · 0→1 and scale · Amazon</div>
          <h1>{SITE.headline}</h1>
          {SITE.intro.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          <div className="hero-actions">
            <a className="button primary" href="project-amplify.html">
              View Amplify
            </a>
            <a className="button secondary" href="#work">
              View Case Studies
            </a>
            <a className="button secondary" href={SITE.resume} target="_blank" rel="noreferrer">
              Open Resume
            </a>
          </div>
        </div>

        <aside className="hero-aside">
          <div className="aside-card">
            <span className="pill accent">Selected case studies</span>
            <div className="list-tight" style={{ marginTop: "1rem" }}>
              {heroReads.map((item, index) => (
                <a key={item.href} className="link-block" href={item.href}>
                  <div>
                    <strong>
                      {index + 1}. {item.title}
                    </strong>
                    <span>{item.copy}</span>
                  </div>
                  <span className="link-arrow">→</span>
                </a>
              ))}
            </div>
          </div>

        </aside>
      </div>
    </section>
  );
}

function AmplifyOutcomes() {
  return (
    <div className="featured-outcome" aria-label="Amplify outcomes">
      <article className="panel-card featured-outcome-intro">
        <div className="eyebrow">Amplify</div>
        <h3>Senior Product Manager · Amazon</h3>
        <p>
          An AI seller intelligence platform serving 1,600+ account managers across North America and Europe.
          I redefined the product scope, designed the operating model, navigated multi-region constraints, and
          set the roadmap path toward Salesforce.
        </p>
        <div className="metric-row">
          <span className="mini-tag">AWS Bedrock</span>
          <span className="mini-tag">Hybrid inference</span>
          <span className="mini-tag">RAG</span>
          <span className="mini-tag">Salesforce path</span>
        </div>
      </article>

      <div className="proof-grid amplify-proof-grid">
        {proofs.map((proof) => (
          <article className="proof-card" key={proof.label}>
            <strong>{proof.stat}</strong>
            <span>{proof.label}</span>
          </article>
        ))}
      </div>
    </div>
  );
}

function FlagshipWork() {
  return (
    <section className="section" id="work">
      <div className="section-header">
        <div>
          <div className="eyebrow">Flagship Work</div>
          <h2 className="section-title">Three case studies that explain the scope I can own.</h2>
        </div>
      </div>
      <AmplifyOutcomes />
      <div className="project-grid">
        {flagshipProjects.map((project, index) => (
          <a className={`project-card ${index === 0 ? "primary" : ""}`} href={project.href} key={project.title}>
            <div className="project-meta">
              <div className="project-icon">{project.icon}</div>
              <span className={`pill ${project.badgeClass}`}>{project.badge}</span>
            </div>
            <div>
              <h3>{project.title}</h3>
              <p>{project.copy}</p>
            </div>
            <div className="metric-row">
              {project.metrics.map((metric) => (
                <span className="mini-tag" key={metric}>
                  {metric}
                </span>
              ))}
            </div>
            <div className="project-footer">
              <span>Read case study</span>
              <span>→</span>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

function Approach() {
  return (
    <section className="section">
      <div className="split-section">
        <article className="surface-card">
          <div className="eyebrow" style={{ color: "var(--ink-soft)" }}>How I work</div>
          <ul className="bullet-list">
            {workingStyle.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </article>

        <article className="panel-card">
          <span className="pill signal">Credibility</span>
          <div className="divider"></div>
          <div className="timeline-list">
            {credibility.map((item) => (
              <div className="timeline-card" key={item.title}>
                <strong>{item.title}</strong>
                <p>{item.copy}</p>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

function ExperienceSection() {
  return (
    <section className="section" id="experience">
      <div className="section-header">
        <div>
          <div className="eyebrow">Experience</div>
          <h2 className="section-title">10 years at Amazon, across product, program, and operations.</h2>
        </div>
      </div>

      <div className="timeline">
        {experience.map((job) => (
          <article className="timeline-item" key={`${job.company}-${job.role}`}>
            <div className="timeline-dot"></div>
            <div className="timeline-meta">
              <span className="timeline-date">{job.date}</span>
              <span className="timeline-company">{job.company}</span>
            </div>
            <div className="timeline-role">{job.role}</div>
            <p className="timeline-desc">{job.copy}</p>
            <div className="timeline-tags">
              {job.tags.map((tag) => (
                <span className="tag" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Systems() {
  return (
    <section className="section" id="systems">
      <div className="section-header">
        <div>
          <div className="eyebrow">Supporting Systems</div>
          <h2 className="section-title">Live demos and systems for evaluation, safety, and release decisions.</h2>
        </div>
      </div>
      <p className="section-kicker" style={{ marginBottom: "1.5rem" }}>I designed the architectures and built the working implementations myself to test how these systems would behave in real release workflows.</p>

      <div className="project-grid">
        {supportingProjects.map((project) => (
          <a className="project-card" href={project.href} key={project.title}>
            <div className="project-meta">
              <div className="project-icon">{project.icon}</div>
              <span className={`pill ${project.badgeClass}`}>{project.badge}</span>
            </div>
            <div>
              <h3>{project.title}</h3>
              <p>{project.copy}</p>
            </div>
            <div className="project-footer">
              <span>Open case study</span>
              <span>→</span>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

function Contact() {
  return (
    <section className="section" id="contact">
      <article className="panel-card" style={{ maxWidth: "680px" }}>
        <div className="eyebrow">Contact</div>
        <h2 className="section-title" style={{ fontSize: "clamp(1.8rem, 3vw, 2.8rem)" }}>
          If the role needs someone who can shape the product and stay close to the system, I am happy to talk.
        </h2>
        <p className="inline-note">
          Email is the fastest path. LinkedIn and GitHub are here if you want the broader context.
        </p>
        <p className="inline-note">
          Open to Principal/Staff PM and AI Product Lead roles (Seattle or remote), especially where marketplace economics, AI platforms, and 0→1 to scale execution intersect.
        </p>
        <div className="contact-cta">
          <a className="button primary" href={SITE.resume} target="_blank" rel="noreferrer">
            Open Resume
          </a>
          <a className="contact-link" href={`mailto:${SITE.email}`}>
            Email Nitish
          </a>
          <a className="contact-link" href={SITE.linkedin} target="_blank" rel="noreferrer">
            LinkedIn
          </a>
          <a className="contact-link" href={SITE.github} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      </article>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer page-shell">
      Product portfolio of live case studies, demos, and shipped systems. © {new Date().getFullYear()} Nitish Prasad.
    </footer>
  );
}

function App() {
  return (
    <>
      <Nav />
      <main className="page-shell">
        <Hero />
        <FlagshipWork />
        <Approach />
        <ExperienceSection />
        <Systems />
        <Contact />
      </main>
      <Footer />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
