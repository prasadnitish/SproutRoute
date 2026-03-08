const { useState } = React;

const SITE = {
  name: "Nitish Prasad",
  headline: "I turn ambiguous 0→1 product bets into scaled systems with measurable business impact.",
  intro: [
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
    copy: "Principal-level product judgment, AI platform thinking, and measurable business impact."
  },
  {
    href: "project-sproutroute.html",
    title: "SproutRoute",
    copy: "0→1 execution range, shipping speed, and end-to-end product building."
  },
  {
    href: "project-mathquest.html",
    title: "MathQuest Kids",
    copy: "Product craft, constrained UX decisions, and thoughtful platform boundaries."
  }
];

const proofs = [
  {
    stat: "1,600+",
    label: "Amplify users across NA and EU",
    copy: "Took the product from a narrow dashboard ask to a production AI platform used at operating scale."
  },
  {
    stat: "99%",
    label: "Infrastructure cost reduction",
    copy: "Made a system-level operating model decision that cut annual AI infra from roughly $60K to $500."
  },
  {
    stat: "<500ms",
    label: "P95 latency target achieved",
    copy: "Balanced speed, cost, and quality instead of optimizing for a flashy demo path."
  },
  {
    stat: "45→5 min",
    label: "Prep time saved per AM call",
    copy: "Turned AI capability into a workflow outcome that mattered to adoption and the business."
  }
];

const flagshipProjects = [
  {
    href: "project-amplify.html",
    title: "Amplify",
    badge: "Flagship",
    badgeClass: "accent",
    icon: "◉",
    copy: "Started as a dashboard request. I pushed it into an AI seller intelligence platform, chose the operating model that made the economics work, and built toward Salesforce integration instead of another disconnected tool.",
    metrics: ["1,600+ users", "99% cost cut", "<500ms latency"],
    footer: "Role, outcomes, and ownership first"
  },
  {
    href: "project-sproutroute.html",
    title: "SproutRoute",
    badge: "Live demo",
    badgeClass: "signal",
    icon: "△",
    copy: "A full-stack AI trip planner I shipped end to end in ten weeks. It shows how I find the product wedge, make the right tradeoffs, and get the product shipped.",
    metrics: ["10 weeks", "167 tests", "Web + mobile"],
    footer: "Shipping range and speed"
  },
  {
    href: "project-mathquest.html",
    title: "MathQuest Kids",
    badge: "Product craft",
    badgeClass: "success",
    icon: "□",
    copy: "An offline-first iPad math app for kids. It shows how I handle learning UX, privacy, determinism, and first-version focus without overbuilding.",
    metrics: ["Offline first", "535 templates", "Native SwiftUI"],
    footer: "UX and product judgment"
  }
];

const workingStyle = [
  "I usually start by reframing the problem until the wedge is clear enough to build against.",
  "I stay close enough to the system design to challenge the operating model, not just the roadmap.",
  "I care about day-two product reality: adoption, cost, latency, governance, and how the tool fits into an existing workflow.",
  "I am most useful when a team needs product judgment and technical fluency in the same room."
];

const credibility = [
  {
    title: "Amazon operator",
    copy: "10+ years in a high-bar environment working across executive stakeholders, scaled systems, and operational complexity."
  },
  {
    title: "AI PM with technical depth",
    copy: "RAG, Bedrock, cost-latency tradeoffs, API direction, multi-region constraints, and release-quality thinking."
  },
  {
    title: "0→1 to scale leader",
    copy: "Comfortable moving from product framing into prototyping, system design, shipping, and the realities that arrive after adoption starts to matter."
  }
];

const experience = [
  {
    date: "May 2025 – Present",
    company: "Amazon",
    role: "Senior Product Manager, Fees",
    copy: "Built Amplify from a dashboard request into an AI seller intelligence platform. Chose a hybrid inference model that made the economics work, drove the product path toward Salesforce integration, and shaped the product around real account-manager workflows.",
    tags: ["AWS Bedrock", "RAG", "Hybrid inference", "Salesforce", "Multi-region"]
  },
  {
    date: "Jun 2022 – May 2025",
    company: "Amazon",
    role: "Senior Product and Customer Insights Manager, CXBT",
    copy: "Led strategic research across seller and vendor ecosystems. The work shaped roadmap and information-architecture decisions and fed directly into senior-leadership reviews.",
    tags: ["Research", "Roadmap shaping", "Executive reviews", "Cross-geo studies"]
  },
  {
    date: "Apr 2020 – Jun 2022",
    company: "Amazon",
    role: "Senior Program Manager, PSAS Ops",
    copy: "Led enterprise platform migration for 29 teams and 6,000+ users, built a PMO and analytics function from scratch, and owned VP-level goals for a 700-person organization.",
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
    copy: "Evaluation infrastructure for teams that need model quality, drift, latency, and release criteria in one place."
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
          Nitish<span className="brand-mark">.</span>
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
          AI seller intelligence platform built for 1,600+ account managers across North America and Europe.
          The work covered product framing, operating-model design, multi-region constraints, and a credible path
          into Salesforce workflows.
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
            <p>{proof.copy}</p>
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
          <h2 className="section-title">Flagship case studies.</h2>
        </div>
        <div className="section-note">Three case studies that explain the scope I can own.</div>
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
              <span>{project.footer}</span>
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
          <h3>The pattern in the work is pretty consistent.</h3>
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
          <h2 className="section-title">The operating profile behind the projects.</h2>
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
          <h2 className="section-title">Supporting systems for evaluation, safety, and launch quality.</h2>
        </div>
        <div className="section-note">Live demos and technical systems for evaluation, safety, and release decisions.</div>
      </div>

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
      <div className="split-section">
        <article className="panel-card">
          <div className="eyebrow">Contact</div>
          <h2 className="section-title" style={{ fontSize: "clamp(1.8rem, 3vw, 2.8rem)" }}>
            If the role needs someone who can shape the product and stay close to the system, I am happy to talk.
          </h2>
          <p className="inline-note">
            Email is the fastest path. LinkedIn and GitHub are here if you want the broader context.
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

        <article className="surface-card">
          <h3>Project coverage</h3>
          <ul className="bullet-list">
            <li>Amplify covers platform strategy, operating-model choices, and business impact at scale.</li>
            <li>SproutRoute covers 0→1 execution, shipping discipline, and end-to-end product ownership.</li>
            <li>MathQuest covers product craft, boundaries, and first-version restraint.</li>
            <li>The evaluation and safety tools cover launch quality, governance, and release thinking.</li>
          </ul>
        </article>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer page-shell">
      Product portfolio for live case studies, demos, and shipped systems. © {new Date().getFullYear()} Nitish Prasad.
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
