import { Link, NavLink, Outlet } from "react-router-dom";

const navLinks = [
  { to: "/", label: "Plan a Trip" },
  { to: "/about", label: "About" },
  { to: "/support", label: "Support" },
];

export default function Layout() {
  return (
    <div className="min-h-screen bg-ink text-paper flex flex-col">
      {/* Navigation */}
      <nav className="border-b border-white/10 bg-ink/80 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            {/* Inline logo mark */}
            <svg
              width="32"
              height="32"
              viewBox="0 0 40 40"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="shrink-0"
            >
              <circle cx="20" cy="20" r="18" fill="#0ea5e9" fillOpacity="0.15" stroke="#0ea5e9" strokeWidth="1.5" />
              <path d="M20 8 L20 20 M14 14 L20 20 L26 14" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 24 Q16 30 20 28 Q24 26 28 32" stroke="#0ea5e9" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            </svg>
            <span className="text-lg font-semibold tracking-tight text-paper group-hover:text-primary-500 transition">
              SproutRoute
            </span>
          </Link>

          <div className="flex items-center gap-6">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === "/"}
                className={({ isActive }) =>
                  `text-xs uppercase tracking-[0.2em] transition ${
                    isActive
                      ? "text-primary-500"
                      : "text-muted hover:text-paper"
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>

      {/* Page content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-ink/50">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="grid gap-8 md:grid-cols-3">
            {/* Brand */}
            <div>
              <p className="text-sm font-semibold text-paper">SproutRoute</p>
              <p className="mt-2 text-xs text-muted leading-relaxed">
                Growing little explorers, one trip at a time.
              </p>
            </div>

            {/* Links */}
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted mb-3">
                Pages
              </p>
              <div className="flex flex-col gap-2">
                <Link
                  to="/"
                  className="text-sm text-paper/70 hover:text-primary-500 transition"
                >
                  Plan a Trip
                </Link>
                <Link
                  to="/about"
                  className="text-sm text-paper/70 hover:text-primary-500 transition"
                >
                  About
                </Link>
                <Link
                  to="/support"
                  className="text-sm text-paper/70 hover:text-primary-500 transition"
                >
                  Support
                </Link>
              </div>
            </div>

            {/* Legal */}
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted mb-3">
                Legal
              </p>
              <div className="flex flex-col gap-2">
                <Link
                  to="/privacy"
                  className="text-sm text-paper/70 hover:text-primary-500 transition"
                >
                  Privacy Policy
                </Link>
                <Link
                  to="/terms"
                  className="text-sm text-paper/70 hover:text-primary-500 transition"
                >
                  Terms of Service
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-white/10 pt-6 flex flex-wrap items-center justify-between gap-4 text-xs text-muted">
            <span>&copy; {new Date().getFullYear()} SproutRoute. All rights reserved.</span>
            <span>Built with React, Vite, Weather.gov, and Claude</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
