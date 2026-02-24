export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-xs uppercase tracking-[0.3em] text-muted">Legal</p>
      <h1 className="mt-2 text-3xl md:text-4xl font-semibold text-paper">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-muted">
        Last updated: February 24, 2026
      </p>

      <div className="mt-10 space-y-8 text-sm text-muted leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-paper mb-2">Overview</h2>
          <p>
            SproutRoute ("we", "us", "our") operates the website
            www.sproutroute.app. This page informs you of our policies regarding
            the collection, use, and disclosure of personal information when you
            use our service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-paper mb-2">
            Information We Collect
          </h2>
          <p className="mb-3">
            We collect minimal information necessary to provide our trip
            planning service:
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong className="text-paper">Trip details</strong> —
              Destinations, travel dates, number and ages of children. This
              information is used solely to generate your trip plan and packing
              list.
            </li>
            <li>
              <strong className="text-paper">Feedback submissions</strong> — If
              you choose to submit feedback, we collect your message and
              optionally your email address for follow-up.
            </li>
            <li>
              <strong className="text-paper">Usage data</strong> — We may
              collect standard server logs including IP addresses and request
              timestamps for security and rate-limiting purposes.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-paper mb-2">
            How We Use Your Information
          </h2>
          <ul className="list-disc list-inside space-y-1">
            <li>To generate personalized trip itineraries and packing lists</li>
            <li>To fetch weather forecasts for your travel destination</li>
            <li>To respond to your feedback or support requests</li>
            <li>To prevent abuse and maintain service availability</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-paper mb-2">
            Data Storage & Retention
          </h2>
          <p>
            Trip data is stored locally in your browser (localStorage) and is
            never uploaded to our servers for persistent storage. When you use
            the "Start Over" function, all locally stored trip data is deleted.
            Server-side, trip data is processed in real time and is not retained
            after your request is fulfilled.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-paper mb-2">
            Third-Party Services
          </h2>
          <p className="mb-3">
            We use the following third-party services to power SproutRoute:
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong className="text-paper">Weather.gov</strong> (National
              Weather Service) — for weather forecast data. Subject to the{" "}
              <a
                href="https://www.weather.gov/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-500 hover:underline"
              >
                NWS privacy policy
              </a>
              .
            </li>
            <li>
              <strong className="text-paper">OpenStreetMap / Nominatim</strong>{" "}
              — for location geocoding. Subject to the{" "}
              <a
                href="https://osmfoundation.org/wiki/Privacy_Policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-500 hover:underline"
              >
                OSM Foundation privacy policy
              </a>
              .
            </li>
            <li>
              <strong className="text-paper">Anthropic (Claude AI)</strong> —
              for generating itineraries and packing lists. Your trip details
              are sent to Claude's API for processing. Subject to{" "}
              <a
                href="https://www.anthropic.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-500 hover:underline"
              >
                Anthropic's privacy policy
              </a>
              .
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-paper mb-2">
            Children's Privacy
          </h2>
          <p>
            SproutRoute is designed for use by parents and guardians to plan
            family trips. We do not knowingly collect personally identifiable
            information from children. The "ages of children" data collected is
            used solely to tailor trip recommendations and packing suggestions,
            and is not linked to any child's identity.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-paper mb-2">Cookies</h2>
          <p>
            SproutRoute does not use cookies or third-party tracking scripts. We
            use browser localStorage to save your trip data for convenience, and
            this data never leaves your device.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-paper mb-2">
            Changes to This Policy
          </h2>
          <p>
            We may update this Privacy Policy from time to time. Changes will be
            posted on this page with an updated "Last updated" date. Your
            continued use of the service after changes constitutes acceptance of
            the updated policy.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-paper mb-2">Contact Us</h2>
          <p>
            If you have questions about this Privacy Policy, please reach out
            through our{" "}
            <a
              href="/support"
              className="text-primary-500 hover:underline"
            >
              Support page
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
