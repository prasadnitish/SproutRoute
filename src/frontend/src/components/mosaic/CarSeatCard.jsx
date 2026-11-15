import { carSeatCard } from "../../utils/carSeatPresentation.js";

// Car seat guidance for the trip's children. It has its own card so it shows
// even when the travel tips above it could not be loaded.
export default function CarSeatCard({ carSeatData, destination, skipped = false }) {
  const card = carSeatCard(carSeatData, destination);
  if (!card && !skipped) return null;

  return (
    <section aria-labelledby="car-seat-title" className="bg-white border border-gray-200 rounded-2xl p-4">
      <h3 id="car-seat-title" className="text-[15px] font-semibold text-gray-900">
        {card?.title || "Car seats"}
      </h3>
      {!card ? (
        <p className="mt-1.5 text-[13px] text-gray-700 leading-snug">
          No car seat guidance, because the children&rsquo;s ages weren&rsquo;t given. Edit the trip and add them to see it.
        </p>
      ) : (
        <>
          {card.message && <p className="mt-1.5 text-[13px] text-gray-800 leading-snug">{card.message}</p>}
          {card.rows.length > 0 && (
            <dl className="mt-3 space-y-2">
              {card.rows.map((row, index) => (
                <div key={index}>
                  <dt className="text-[13px] font-semibold text-gray-900">{row.heading}</dt>
                  <dd className="text-[13px] text-gray-700 leading-snug">{row.detail}</dd>
                </div>
              ))}
            </dl>
          )}
          {card.note && <p className="mt-3 text-[12px] text-gray-600 leading-snug">{card.note}</p>}
          {card.sourceLine && <p className="mt-2 text-[12px] text-gray-500">{card.sourceLine}</p>}
          {card.sourceUrl && (
            <a
              href={card.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-[13px] font-semibold text-meadow-700 hover:text-meadow-800 underline underline-offset-2"
            >
              Official car seat source
            </a>
          )}
        </>
      )}
    </section>
  );
}
