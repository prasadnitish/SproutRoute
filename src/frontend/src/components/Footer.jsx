export default function Footer() {
  return (
    <footer className="mt-12 pb-6 text-center text-xs text-muted dark:text-dark-muted">
      <span className="font-heading font-semibold text-sprout-dark dark:text-dark-sprout">SproutRoute</span>
      {" · "}
      <a
        href="mailto:feedback@sproutroute.com"
        className="hover:text-sprout-dark dark:hover:text-dark-sprout transition-colors"
      >
        Send feedback
      </a>
    </footer>
  );
}
