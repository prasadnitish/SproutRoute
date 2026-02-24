import { Link } from "react-router-dom";

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-xs uppercase tracking-[0.3em] text-muted">About</p>
      <h1 className="mt-2 text-3xl md:text-4xl font-semibold text-paper">
        Growing little explorers, one trip at a time
      </h1>
      <p className="mt-4 text-muted leading-relaxed">
        SproutRoute is an AI-powered trip planning tool built specifically for
        parents traveling with kids. We know how stressful it can be to pack for
        a family trip — weather to check, ages to account for, activities to
        plan, and that nagging feeling you forgot something important.
      </p>

      <div className="mt-12 space-y-10">
        {/* How it works */}
        <section>
          <h2 className="text-xl font-semibold text-paper">How it works</h2>
          <div className="mt-4 grid gap-6 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Tell us your trip",
                desc: "Enter your destination, travel dates, and the ages of your kids.",
              },
              {
                step: "02",
                title: "We plan it out",
                desc: "Our AI checks the weather, suggests kid-friendly activities, and builds a day-by-day itinerary.",
              },
              {
                step: "03",
                title: "Pack with confidence",
                desc: "Get a smart packing checklist tailored to your trip — weather-appropriate, age-specific, nothing forgotten.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="rounded-2xl border border-white/10 bg-white/5 p-5"
              >
                <p className="text-2xl font-semibold text-primary-500">
                  {item.step}
                </p>
                <p className="mt-2 font-semibold text-paper">{item.title}</p>
                <p className="mt-1 text-sm text-muted">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* What powers it */}
        <section>
          <h2 className="text-xl font-semibold text-paper">What powers SproutRoute</h2>
          <div className="mt-4 space-y-3 text-sm text-muted leading-relaxed">
            <p>
              <strong className="text-paper">Weather data</strong> comes from
              the National Weather Service (weather.gov) — the same forecasts
              used by meteorologists, completely free and accurate for US
              destinations.
            </p>
            <p>
              <strong className="text-paper">AI planning</strong> is powered by
              Anthropic's Claude, which generates personalized itineraries and
              packing lists based on your specific trip details.
            </p>
            <p>
              <strong className="text-paper">Location search</strong> uses
              OpenStreetMap for geocoding, supporting natural queries like
              "2 hours from Seattle" or "beach towns near LA."
            </p>
          </div>
        </section>

        {/* Who built it */}
        <section>
          <h2 className="text-xl font-semibold text-paper">Who built this</h2>
          <p className="mt-2 text-sm text-muted leading-relaxed">
            SproutRoute is built by Nitish Prasad — a parent and software
            engineer who got tired of Googling "what to pack for a toddler trip
            to the mountains" every single time. This tool started as a personal
            side project and grew into something we hope other families find
            useful too.
          </p>
        </section>

        {/* CTA */}
        <div className="rounded-2xl border border-primary-500/30 bg-primary-500/5 p-6 text-center">
          <p className="text-lg font-semibold text-paper">
            Ready to plan your next family adventure?
          </p>
          <Link
            to="/"
            className="mt-4 inline-block rounded-full bg-primary-500 px-6 py-3 text-sm font-semibold text-ink transition hover:bg-primary-600"
          >
            Start Planning
          </Link>
        </div>
      </div>
    </div>
  );
}
