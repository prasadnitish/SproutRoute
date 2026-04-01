import { useState, useEffect } from "react";

const TRAVEL_TIPS = [
  "Pack a portable phone charger \u2014 you'll need it for photos and navigation",
  "Download offline maps before your trip for areas with spotty signal",
  "Roll clothes instead of folding to save 30% more suitcase space",
  "Book activities for mornings \u2014 kids have the most energy before lunch",
  "Bring a small first-aid kit with kids' pain reliever and band-aids",
  "Screenshot your hotel confirmation \u2014 Wi-Fi isn't guaranteed at check-in",
  "Pack snacks for the plane \u2014 hangry toddlers don't negotiate",
  "Arrive at popular attractions 15 min before opening for shortest lines",
  "Use packing cubes to keep outfits organized by day",
  "Check if your destination has a city pass \u2014 can save hundreds on attractions",
  "Keep a change of clothes in your carry-on in case luggage is delayed",
  "Book restaurants for 5pm \u2014 no wait, kid-friendly hours, and early bedtime",
  "Bring a lightweight stroller even for older kids \u2014 walking adds up fast",
  "Check the weather 3 days before and adjust your packing list",
  "Take a photo of your parking spot \u2014 every. single. time.",
];

const DESTINATION_FACTS = {
  "san diego": [
    "San Diego has 266 sunny days per year \u2014 the most of any major US city",
    "The San Diego Zoo was one of the first to use open-air cageless exhibits",
    "Fish tacos were popularized in the US right here in San Diego",
  ],
  "orlando": [
    "Orlando has more theme parks than any other city in the world",
    "Walt Disney World is roughly the same size as San Francisco",
    "Orlando gets about 75 million visitors per year \u2014 more than NYC",
  ],
  "new york": [
    "Central Park is bigger than the country of Monaco",
    "The NYC subway runs 24/7 \u2014 one of the few in the world that does",
    "Times Square was originally called Longacre Square until 1904",
  ],
  "hawaii": [
    "Hawaii is the only US state that grows coffee commercially",
    "The Big Island grows by about 42 acres per year from volcanic activity",
    "Hawaiian pizza was actually invented in Canada, not Hawaii",
  ],
  "tokyo": [
    "Tokyo has more Michelin-starred restaurants than any other city",
    "Trains in Tokyo are so punctual that delays of 1 minute get apologies",
    "Vending machines in Tokyo sell everything from eggs to fresh flowers",
  ],
  "london": [
    "Over 300 languages are spoken in London \u2014 more than any other city",
    "The London Underground is the oldest metro system in the world (1863)",
    "Big Ben is actually the name of the bell, not the clock tower",
  ],
  "bali": [
    "Bali has over 20,000 temples \u2014 at least one in every village",
    "The Balinese calendar has 210 days, not 365",
    "Bali's rice paddies use a 1,000-year-old irrigation system called Subak",
  ],
};

function getFactsForDestination(destination) {
  if (!destination) return [];
  const lower = destination.toLowerCase();
  for (const [key, facts] of Object.entries(DESTINATION_FACTS)) {
    if (lower.includes(key)) return facts;
  }
  return [];
}

export default function LoadingEngagement({ destination, duration, childCount }) {
  const [tipIndex, setTipIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [factIndex, setFactIndex] = useState(0);

  // Rotate tips every 8 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setTipIndex(prev => (prev + 1) % TRAVEL_TIPS.length);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  // Track elapsed time
  useEffect(() => {
    const interval = setInterval(() => setElapsed(prev => prev + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Rotate facts every 10 seconds
  const facts = getFactsForDestination(destination);
  useEffect(() => {
    if (facts.length === 0) return;
    const interval = setInterval(() => {
      setFactIndex(prev => (prev + 1) % facts.length);
    }, 10000);
    return () => clearInterval(interval);
  }, [facts.length]);

  const progressPhase = elapsed < 5 ? "Exploring the destination..."
    : elapsed < 15 ? "Checking weather patterns..."
    : elapsed < 30 ? "Finding family-friendly activities..."
    : elapsed < 45 ? "Picking the best restaurants..."
    : elapsed < 60 ? "Building your daily schedule..."
    : "Polishing the final details...";

  const progressPct = Math.min(95, (elapsed / 70) * 100);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs uppercase tracking-wide font-semibold text-meadow-600">
          {"\u{1F4C5}"} Building Your Itinerary
        </p>
        <span className="text-xs text-gray-400">{elapsed}s</span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-gray-100 rounded-full mb-1 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-meadow-400 to-meadow-600 rounded-full transition-all duration-1000 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <p className="text-xs text-gray-500 mb-5">{progressPhase}</p>

      {/* Destination fact */}
      {facts.length > 0 && (
        <div className="bg-meadow-50 border border-meadow-200 rounded-xl p-4 mb-4 transition-all duration-500">
          <p className="text-xs font-semibold text-meadow-700 mb-1">
            {"\u{1F30D}"} Did you know?
          </p>
          <p className="text-sm text-gray-700">{facts[factIndex]}</p>
        </div>
      )}

      {/* Trip summary while loading */}
      <div className="flex flex-wrap gap-2 mb-4">
        {destination && (
          <span className="bg-gray-100 rounded-full px-3 py-1 text-xs font-medium text-gray-600">
            {"\u{1F4CD}"} {destination}
          </span>
        )}
        {duration && (
          <span className="bg-gray-100 rounded-full px-3 py-1 text-xs font-medium text-gray-600">
            {"\u{1F4C6}"} {duration} day{duration !== 1 ? "s" : ""}
          </span>
        )}
        {childCount > 0 && (
          <span className="bg-gray-100 rounded-full px-3 py-1 text-xs font-medium text-gray-600">
            {"\u{1F476}"} {childCount} kid{childCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Rotating travel tip */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs font-semibold text-amber-600 mb-1">
          {"\u{1F4A1}"} Travel tip
        </p>
        <p className="text-sm text-gray-600 transition-all duration-500">
          {TRAVEL_TIPS[tipIndex]}
        </p>
      </div>

      {/* Skeleton preview */}
      <div className="mt-4 space-y-2 animate-pulse">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex gap-3 items-center">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex-shrink-0" />
            <div className="flex-1">
              <div className="h-3 bg-gray-100 rounded w-3/4 mb-1" />
              <div className="h-2 bg-gray-50 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
