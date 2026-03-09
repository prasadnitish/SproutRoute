(() => {
  const { useState } = React;
  const SITE = {
    name: "Nitish Prasad",
    headline: "I turn ambiguous 0\u21921 product bets into scaled systems with measurable business impact.",
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
      copy: "1,600+ users, 99% infra cost reduction, and a roadmap path into Salesforce \u2014 not another internal tool."
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
    { stat: "45\u21925 min", label: "Prep time saved per AM call" }
  ];
  const flagshipProjects = [
    {
      href: "project-amplify.html",
      title: "Amplify",
      badge: "Flagship",
      badgeClass: "accent",
      icon: "\u25C9",
      copy: "An AI seller intelligence platform serving 1,600+ account managers across NA and EU. I redefined the product scope, designed the operating model that cut infra costs 99%, and set the roadmap path toward Salesforce \u2014 not another disconnected internal tool.",
      metrics: ["1,600+ users", "99% cost cut", "<500ms latency"]
    },
    {
      href: "project-sproutroute.html",
      title: "SproutRoute",
      badge: "Live demo",
      badgeClass: "signal",
      icon: "\u25B3",
      copy: "Designed, built, and shipped solo in ten weeks \u2014 React, Node, Claude API, Railway. Full end-to-end ownership: product scope, architecture, UX, and deployment.",
      metrics: ["10 weeks", "167 tests", "Web + mobile"]
    },
    {
      href: "project-mathquest.html",
      title: "MathQuest Kids",
      badge: "Product craft",
      badgeClass: "success",
      icon: "\u25A1",
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
      copy: "10+ years at Amazon, working across executive stakeholders, scaled systems, and organizational complexity \u2014 from individual contributor to VP-facing program ownership."
    },
    {
      title: "AI PM with technical depth",
      copy: "Fluent in RAG, Bedrock, cost-latency tradeoffs, and the operating-model decisions that separate a good demo from a production system."
    },
    {
      title: "0\u21921 to scale",
      copy: "Comfortable moving from early framing into prototyping, system design, shipping, and the adoption problems that follow launch."
    }
  ];
  const experience = [
    {
      date: "May 2025 \u2013 Present",
      company: "Amazon",
      role: "Senior Product Manager, Fees",
      copy: "Built Amplify from a dashboard request into an AI seller intelligence platform. Chose a hybrid inference model that made the economics work, drove the product path toward Salesforce integration, and shaped the product around real account-manager workflows. Also own end-to-end strategy and design for US 3P seller incentive programs, managing a nine-figure annual budget and tying incentives to seller growth and P&L impact.",
      tags: ["AWS Bedrock", "RAG", "Hybrid inference", "Salesforce", "Multi-region"]
    },
    {
      date: "Jun 2022 \u2013 May 2025",
      company: "Amazon",
      role: "Senior Product and Customer Insights Manager, CXBT",
      copy: "Led strategic research across seller and vendor ecosystems. Findings shaped product roadmaps, information architecture, and senior leadership decisions.",
      tags: ["Research", "Roadmap shaping", "Executive reviews", "Cross-geo studies"]
    },
    {
      date: "Apr 2020 \u2013 Jun 2022",
      company: "Amazon",
      role: "Senior Program Manager, PSAS Ops",
      copy: "Led enterprise platform migration for 29 teams and 6,000+ users, built a PMO and analytics function from scratch, and delivered against VP-level goals for a 700-person organization.",
      tags: ["Platform migration", "Change management", "Analytics", "PMO"]
    },
    {
      date: "Oct 2017 \u2013 Apr 2020",
      company: "Amazon",
      role: "Senior Program Manager, Amazon Pay",
      copy: "Managed CX across 30+ products, drove $4.8M FCF impact through self-serve and contact-reduction work, and partnered closely with data engineering on automated reporting.",
      tags: ["Payments", "Customer experience", "Self-serve", "Data pipelines"]
    },
    {
      date: "Nov 2015 \u2013 Oct 2017",
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
      icon: "\u2726",
      badge: "Live demo",
      badgeClass: "signal",
      copy: "Evaluation infrastructure for teams that need model quality, drift, latency, and release criteria in one place, not scattered across ad hoc dashboards."
    },
    {
      href: "project-rag-pipeline.html",
      title: "RAG Pipeline with Guardrails",
      icon: "\u25C7",
      badge: "Repository",
      badgeClass: "accent",
      copy: "A grounded RAG system with prompt-injection, PII, toxicity, and policy gates built around release decisions, not just retrieval demos."
    },
    {
      href: "project-ai-safety.html",
      title: "AI Safety Audit Tool",
      icon: "\u25A3",
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
    return /* @__PURE__ */ React.createElement("header", { className: "topbar" }, /* @__PURE__ */ React.createElement("div", { className: "topbar-inner" }, /* @__PURE__ */ React.createElement("a", { className: "brand", href: "#hero", onClick: () => setMenuOpen(false) }, "Nitish Prasad"), /* @__PURE__ */ React.createElement("div", { className: "nav-shell" }, /* @__PURE__ */ React.createElement("nav", { className: "nav-list", "aria-label": "Primary" }, links.map((link) => /* @__PURE__ */ React.createElement("a", { key: link.href, href: link.href }, link.label))), /* @__PURE__ */ React.createElement("div", { className: "nav-actions" }, /* @__PURE__ */ React.createElement("a", { className: "nav-secondary", href: SITE.linkedin, target: "_blank", rel: "noreferrer" }, "LinkedIn"), /* @__PURE__ */ React.createElement("a", { className: "nav-resume", href: SITE.resume, target: "_blank", rel: "noreferrer" }, "Open Resume"), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "nav-menu-btn",
        "aria-label": "Toggle menu",
        "aria-expanded": menuOpen,
        onClick: () => setMenuOpen((open) => !open)
      },
      menuOpen ? "\u2715" : "\u2630"
    ))), /* @__PURE__ */ React.createElement("div", { className: `mobile-menu ${menuOpen ? "open" : ""}` }, links.map((link) => /* @__PURE__ */ React.createElement("a", { key: link.href, href: link.href, onClick: () => setMenuOpen(false) }, link.label)), /* @__PURE__ */ React.createElement("a", { href: SITE.resume, target: "_blank", rel: "noreferrer", onClick: () => setMenuOpen(false) }, "Open Resume"))));
  }
  function Hero() {
    return /* @__PURE__ */ React.createElement("section", { className: "hero", id: "hero" }, /* @__PURE__ */ React.createElement("div", { className: "hero-grid" }, /* @__PURE__ */ React.createElement("div", { className: "hero-copy" }, /* @__PURE__ */ React.createElement("div", { className: "eyebrow" }, "Principal-level product leader \xB7 0\u21921 and scale \xB7 Amazon"), /* @__PURE__ */ React.createElement("h1", null, SITE.headline), SITE.intro.map((paragraph) => /* @__PURE__ */ React.createElement("p", { key: paragraph }, paragraph)), /* @__PURE__ */ React.createElement("div", { className: "hero-actions" }, /* @__PURE__ */ React.createElement("a", { className: "button primary", href: "project-amplify.html" }, "View Amplify"), /* @__PURE__ */ React.createElement("a", { className: "button secondary", href: "#work" }, "View Case Studies"), /* @__PURE__ */ React.createElement("a", { className: "button secondary", href: SITE.resume, target: "_blank", rel: "noreferrer" }, "Open Resume"))), /* @__PURE__ */ React.createElement("aside", { className: "hero-aside" }, /* @__PURE__ */ React.createElement("div", { className: "aside-card" }, /* @__PURE__ */ React.createElement("span", { className: "pill accent" }, "Selected case studies"), /* @__PURE__ */ React.createElement("div", { className: "list-tight", style: { marginTop: "1rem" } }, heroReads.map((item, index) => /* @__PURE__ */ React.createElement("a", { key: item.href, className: "link-block", href: item.href }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("strong", null, index + 1, ". ", item.title), /* @__PURE__ */ React.createElement("span", null, item.copy)), /* @__PURE__ */ React.createElement("span", { className: "link-arrow" }, "\u2192"))))))));
  }
  function AmplifyOutcomes() {
    return /* @__PURE__ */ React.createElement("div", { className: "featured-outcome", "aria-label": "Amplify outcomes" }, /* @__PURE__ */ React.createElement("article", { className: "panel-card featured-outcome-intro" }, /* @__PURE__ */ React.createElement("div", { className: "eyebrow" }, "Amplify"), /* @__PURE__ */ React.createElement("h3", null, "Senior Product Manager \xB7 Amazon"), /* @__PURE__ */ React.createElement("p", null, "An AI seller intelligence platform serving 1,600+ account managers across North America and Europe. I redefined the product scope, designed the operating model, navigated multi-region constraints, and set the roadmap path toward Salesforce."), /* @__PURE__ */ React.createElement("div", { className: "metric-row" }, /* @__PURE__ */ React.createElement("span", { className: "mini-tag" }, "AWS Bedrock"), /* @__PURE__ */ React.createElement("span", { className: "mini-tag" }, "Hybrid inference"), /* @__PURE__ */ React.createElement("span", { className: "mini-tag" }, "RAG"), /* @__PURE__ */ React.createElement("span", { className: "mini-tag" }, "Salesforce path"))), /* @__PURE__ */ React.createElement("div", { className: "proof-grid amplify-proof-grid" }, proofs.map((proof) => /* @__PURE__ */ React.createElement("article", { className: "proof-card", key: proof.label }, /* @__PURE__ */ React.createElement("strong", null, proof.stat), /* @__PURE__ */ React.createElement("span", null, proof.label)))));
  }
  function FlagshipWork() {
    return /* @__PURE__ */ React.createElement("section", { className: "section", id: "work" }, /* @__PURE__ */ React.createElement("div", { className: "section-header" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "eyebrow" }, "Flagship Work"), /* @__PURE__ */ React.createElement("h2", { className: "section-title" }, "Three case studies that explain the scope I can own."))), /* @__PURE__ */ React.createElement(AmplifyOutcomes, null), /* @__PURE__ */ React.createElement("div", { className: "project-grid" }, flagshipProjects.map((project, index) => /* @__PURE__ */ React.createElement("a", { className: `project-card ${index === 0 ? "primary" : ""}`, href: project.href, key: project.title }, /* @__PURE__ */ React.createElement("div", { className: "project-meta" }, /* @__PURE__ */ React.createElement("div", { className: "project-icon" }, project.icon), /* @__PURE__ */ React.createElement("span", { className: `pill ${project.badgeClass}` }, project.badge)), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, project.title), /* @__PURE__ */ React.createElement("p", null, project.copy)), /* @__PURE__ */ React.createElement("div", { className: "metric-row" }, project.metrics.map((metric) => /* @__PURE__ */ React.createElement("span", { className: "mini-tag", key: metric }, metric))), /* @__PURE__ */ React.createElement("div", { className: "project-footer" }, /* @__PURE__ */ React.createElement("span", null, "Read case study"), /* @__PURE__ */ React.createElement("span", null, "\u2192"))))));
  }
  function Approach() {
    return /* @__PURE__ */ React.createElement("section", { className: "section" }, /* @__PURE__ */ React.createElement("div", { className: "split-section" }, /* @__PURE__ */ React.createElement("article", { className: "surface-card" }, /* @__PURE__ */ React.createElement("div", { className: "eyebrow", style: { color: "var(--ink-soft)" } }, "How I work"), /* @__PURE__ */ React.createElement("ul", { className: "bullet-list" }, workingStyle.map((line) => /* @__PURE__ */ React.createElement("li", { key: line }, line)))), /* @__PURE__ */ React.createElement("article", { className: "panel-card" }, /* @__PURE__ */ React.createElement("span", { className: "pill signal" }, "Credibility"), /* @__PURE__ */ React.createElement("div", { className: "divider" }), /* @__PURE__ */ React.createElement("div", { className: "timeline-list" }, credibility.map((item) => /* @__PURE__ */ React.createElement("div", { className: "timeline-card", key: item.title }, /* @__PURE__ */ React.createElement("strong", null, item.title), /* @__PURE__ */ React.createElement("p", null, item.copy)))))));
  }
  function ExperienceSection() {
    return /* @__PURE__ */ React.createElement("section", { className: "section", id: "experience" }, /* @__PURE__ */ React.createElement("div", { className: "section-header" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "eyebrow" }, "Experience"), /* @__PURE__ */ React.createElement("h2", { className: "section-title" }, "10 years at Amazon, across product, program, and operations."))), /* @__PURE__ */ React.createElement("div", { className: "timeline" }, experience.map((job) => /* @__PURE__ */ React.createElement("article", { className: "timeline-item", key: `${job.company}-${job.role}` }, /* @__PURE__ */ React.createElement("div", { className: "timeline-dot" }), /* @__PURE__ */ React.createElement("div", { className: "timeline-meta" }, /* @__PURE__ */ React.createElement("span", { className: "timeline-date" }, job.date), /* @__PURE__ */ React.createElement("span", { className: "timeline-company" }, job.company)), /* @__PURE__ */ React.createElement("div", { className: "timeline-role" }, job.role), /* @__PURE__ */ React.createElement("p", { className: "timeline-desc" }, job.copy), /* @__PURE__ */ React.createElement("div", { className: "timeline-tags" }, job.tags.map((tag) => /* @__PURE__ */ React.createElement("span", { className: "tag", key: tag }, tag)))))));
  }
  function Systems() {
    return /* @__PURE__ */ React.createElement("section", { className: "section", id: "systems" }, /* @__PURE__ */ React.createElement("div", { className: "section-header" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "eyebrow" }, "Supporting Systems"), /* @__PURE__ */ React.createElement("h2", { className: "section-title" }, "Live demos and systems for evaluation, safety, and release decisions."))), /* @__PURE__ */ React.createElement("p", { className: "section-kicker", style: { marginBottom: "1.5rem" } }, "I designed the architectures and built the working implementations myself to test how these systems would behave in real release workflows."), /* @__PURE__ */ React.createElement("div", { className: "project-grid" }, supportingProjects.map((project) => /* @__PURE__ */ React.createElement("a", { className: "project-card", href: project.href, key: project.title }, /* @__PURE__ */ React.createElement("div", { className: "project-meta" }, /* @__PURE__ */ React.createElement("div", { className: "project-icon" }, project.icon), /* @__PURE__ */ React.createElement("span", { className: `pill ${project.badgeClass}` }, project.badge)), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, project.title), /* @__PURE__ */ React.createElement("p", null, project.copy)), /* @__PURE__ */ React.createElement("div", { className: "project-footer" }, /* @__PURE__ */ React.createElement("span", null, "Open case study"), /* @__PURE__ */ React.createElement("span", null, "\u2192"))))));
  }
  function Contact() {
    return /* @__PURE__ */ React.createElement("section", { className: "section", id: "contact" }, /* @__PURE__ */ React.createElement("article", { className: "panel-card", style: { maxWidth: "680px" } }, /* @__PURE__ */ React.createElement("div", { className: "eyebrow" }, "Contact"), /* @__PURE__ */ React.createElement("h2", { className: "section-title", style: { fontSize: "clamp(1.8rem, 3vw, 2.8rem)" } }, "If the role needs someone who can shape the product and stay close to the system, I am happy to talk."), /* @__PURE__ */ React.createElement("p", { className: "inline-note" }, "Email is the fastest path. LinkedIn and GitHub are here if you want the broader context."), /* @__PURE__ */ React.createElement("p", { className: "inline-note" }, "Open to Principal/Staff PM and AI Product Lead roles (Seattle or remote), especially where marketplace economics, AI platforms, and 0\u21921 to scale execution intersect."), /* @__PURE__ */ React.createElement("div", { className: "contact-cta" }, /* @__PURE__ */ React.createElement("a", { className: "button primary", href: SITE.resume, target: "_blank", rel: "noreferrer" }, "Open Resume"), /* @__PURE__ */ React.createElement("a", { className: "contact-link", href: `mailto:${SITE.email}` }, "Email Nitish"), /* @__PURE__ */ React.createElement("a", { className: "contact-link", href: SITE.linkedin, target: "_blank", rel: "noreferrer" }, "LinkedIn"), /* @__PURE__ */ React.createElement("a", { className: "contact-link", href: SITE.github, target: "_blank", rel: "noreferrer" }, "GitHub"))));
  }
  function Footer() {
    return /* @__PURE__ */ React.createElement("footer", { className: "footer page-shell" }, "Product portfolio of live case studies, demos, and shipped systems. \xA9 ", (/* @__PURE__ */ new Date()).getFullYear(), " Nitish Prasad.");
  }
  function App() {
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Nav, null), /* @__PURE__ */ React.createElement("main", { className: "page-shell" }, /* @__PURE__ */ React.createElement(Hero, null), /* @__PURE__ */ React.createElement(FlagshipWork, null), /* @__PURE__ */ React.createElement(Approach, null), /* @__PURE__ */ React.createElement(ExperienceSection, null), /* @__PURE__ */ React.createElement(Systems, null), /* @__PURE__ */ React.createElement(Contact, null)), /* @__PURE__ */ React.createElement(Footer, null));
  }
  ReactDOM.createRoot(document.getElementById("root")).render(/* @__PURE__ */ React.createElement(App, null));
})();
