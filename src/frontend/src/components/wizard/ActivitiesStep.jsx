import { useState, useCallback, useMemo } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";

const ACTIVITIES = [
  { id: "parks", label: "Parks", icon: "🌳", desc: "Nature walks, playgrounds, and green spaces" },
  { id: "beach", label: "Beach", icon: "🏖", desc: "Sandy shores, tide pools, and beach play" },
  { id: "museums", label: "Museums", icon: "🏛", desc: "Interactive exhibits and learning adventures" },
  { id: "hiking", label: "Hiking", icon: "🥾", desc: "Family-friendly trails and scenic views" },
  { id: "theme_parks", label: "Theme Parks", icon: "🎢", desc: "Rides, shows, and magical experiences" },
  { id: "water_parks", label: "Water Parks", icon: "💦", desc: "Slides, splash pads, and lazy rivers" },
  { id: "dining", label: "Dining", icon: "🍽", desc: "Kid-friendly restaurants and local cuisine" },
  { id: "shopping", label: "Shopping", icon: "🛍", desc: "Markets, shops, and souvenir hunting" },
  { id: "city", label: "City Walk", icon: "🏙", desc: "Urban exploration and sightseeing" },
  { id: "wildlife", label: "Wildlife", icon: "🦁", desc: "Zoos, aquariums, and animal encounters" },
  { id: "camping", label: "Camping", icon: "⛺", desc: "Outdoor overnights and campfire fun" },
  { id: "sports", label: "Sports", icon: "⚽", desc: "Games, sports events, and active fun" },
  { id: "road_trip", label: "Road Trip", icon: "🚗", desc: "Scenic drives and roadside attractions" },
];

const CRUISE_ACTIVITIES = [
  { id: "pool_deck", label: "Pool Deck", icon: "🏊", desc: "Pools, hot tubs, and sun lounging" },
  { id: "shore_excursion", label: "Shore Excursion", icon: "🏝", desc: "Port-of-call adventures" },
  { id: "kids_club", label: "Kids Club", icon: "🎨", desc: "Supervised play and activities" },
  { id: "live_shows", label: "Live Shows", icon: "🎭", desc: "Theater, comedy, and performances" },
  { id: "formal_night", label: "Formal Night", icon: "🥂", desc: "Dress up for a special dinner" },
];

function SwipeCard({ activity, onSwipe, isTop, stackIndex }) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-15, 15]);
  const likeOpacity = useTransform(x, [0, 100], [0, 1]);
  const skipOpacity = useTransform(x, [-100, 0], [1, 0]);

  const handleDragEnd = (_, info) => {
    if (Math.abs(info.offset.x) > 100) {
      const direction = info.offset.x > 0 ? "right" : "left";
      animate(x, direction === "right" ? 300 : -300, {
        duration: 0.3,
        onComplete: () => onSwipe(direction === "right"),
      });
    } else {
      animate(x, 0, { type: "spring", stiffness: 500, damping: 30 });
    }
  };

  if (!isTop) {
    return (
      <motion.div
        className="absolute inset-0 rounded-2xl border border-sprout-light dark:border-dark-border bg-white dark:bg-dark-card p-6 flex flex-col items-center justify-center"
        style={{
          scale: 1 - stackIndex * 0.04,
          y: stackIndex * 8,
          zIndex: 10 - stackIndex,
        }}
      >
        <span className="text-5xl mb-3">{activity.icon}</span>
        <h3 className="font-heading text-lg font-bold text-slate-text dark:text-dark-text">
          {activity.label}
        </h3>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="absolute inset-0 rounded-2xl border border-sprout-light dark:border-dark-border bg-white dark:bg-dark-card p-6 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing shadow-card"
      style={{ x, rotate, zIndex: 20 }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.8}
      onDragEnd={handleDragEnd}
    >
      {/* Like badge */}
      <motion.div
        className="absolute top-4 right-4 px-3 py-1 rounded-lg border-2 border-green-500 text-green-500 font-bold text-sm rotate-12"
        style={{ opacity: likeOpacity }}
      >
        LIKE
      </motion.div>

      {/* Skip badge */}
      <motion.div
        className="absolute top-4 left-4 px-3 py-1 rounded-lg border-2 border-red-500 text-red-500 font-bold text-sm -rotate-12"
        style={{ opacity: skipOpacity }}
      >
        SKIP
      </motion.div>

      <span className="text-6xl mb-4">{activity.icon}</span>
      <h3 className="font-heading text-xl font-bold text-slate-text dark:text-dark-text">
        {activity.label}
      </h3>
      <p className="text-sm text-muted dark:text-dark-muted mt-1 text-center max-w-[200px]">
        {activity.desc}
      </p>
    </motion.div>
  );
}

export default function ActivitiesStep({
  tripType,
  suggestedActivities,
  onComplete,
  onBack,
  numChildren,
}) {
  const allActivities = useMemo(() => {
    const base = [...ACTIVITIES];
    if (tripType === "cruise") {
      base.push(...CRUISE_ACTIVITIES);
    }
    return base;
  }, [tripType]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [liked, setLiked] = useState(() => {
    // Pre-select suggested activities
    if (suggestedActivities && suggestedActivities.length > 0) {
      return new Set(suggestedActivities.map((a) => a.id || a));
    }
    return new Set();
  });
  const [done, setDone] = useState(false);

  const handleSwipe = useCallback(
    (isLike) => {
      if (isLike) {
        setLiked((prev) => new Set([...prev, allActivities[currentIndex].id]));
      }
      const nextIndex = currentIndex + 1;
      if (nextIndex >= allActivities.length) {
        setDone(true);
      } else {
        setCurrentIndex(nextIndex);
      }
    },
    [currentIndex, allActivities],
  );

  const handleSkipButton = () => handleSwipe(false);
  const handleLikeButton = () => handleSwipe(true);

  const toggleLiked = (id) => {
    setLiked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Summary screen
  if (done) {
    const likedList = allActivities.filter((a) => liked.has(a.id));
    return (
      <>
        <div>
          <h2 className="font-heading text-3xl md:text-4xl font-bold text-sprout-dark dark:text-dark-sprout">
            Your picks
          </h2>
          <p className="text-muted dark:text-dark-muted mt-2">
            {likedList.length > 0
              ? `${likedList.length} activities selected. Tap to remove, or build your trip!`
              : "No activities selected — tap some to add, or build with defaults."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {allActivities.map((a) => {
            const isLiked = liked.has(a.id);
            return (
              <motion.button
                key={a.id}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => toggleLiked(a.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold border transition-colors ${
                  isLiked
                    ? "bg-sprout-dark/10 dark:bg-dark-border border-sprout-dark dark:border-dark-sprout text-sprout-dark dark:text-dark-sprout"
                    : "bg-transparent border-gray-200 dark:border-dark-border text-muted dark:text-dark-muted"
                }`}
              >
                <span>{a.icon}</span>
                {a.label}
              </motion.button>
            );
          })}
        </div>
        <div className="flex items-center gap-4">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onComplete([...liked])}
            className="rounded-xl bg-sprout-dark text-white py-3 px-8 font-semibold text-sm hover:bg-sprout-base transition-colors shadow-soft"
          >
            🌱 Build My Trip Plan
          </motion.button>
          <button
            onClick={() => {
              setDone(false);
              setCurrentIndex(0);
            }}
            className="text-sm text-muted hover:text-slate-text dark:hover:text-dark-text transition-colors"
          >
            Swipe again
          </button>
        </div>
      </>
    );
  }

  // Card stack
  const remaining = allActivities.slice(currentIndex);
  const visible = remaining.slice(0, 3);

  return (
    <>
      <div>
        <h2 className="font-heading text-3xl md:text-4xl font-bold text-sprout-dark dark:text-dark-sprout">
          {numChildren > 0 ? "What does the family enjoy?" : "What are you into?"}
        </h2>
        <p className="text-muted dark:text-dark-muted mt-2">
          Swipe right to like, left to skip. {remaining.length} card{remaining.length !== 1 ? "s" : ""} left.
        </p>
      </div>

      {/* Card stack */}
      <div className="relative w-full max-w-[300px] mx-auto aspect-[3/4]">
        {visible.map((activity, i) => (
          <SwipeCard
            key={activity.id}
            activity={activity}
            onSwipe={handleSwipe}
            isTop={i === 0}
            stackIndex={i}
          />
        ))}
      </div>

      {/* Like / Skip buttons */}
      <div className="flex items-center justify-center gap-6">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={handleSkipButton}
          className="w-14 h-14 rounded-full border-2 border-red-300 dark:border-red-800 text-red-500 flex items-center justify-center text-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          aria-label="Skip"
        >
          ✕
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={handleLikeButton}
          className="w-14 h-14 rounded-full border-2 border-green-300 dark:border-green-800 text-green-500 flex items-center justify-center text-xl hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
          aria-label="Like"
        >
          ♥
        </motion.button>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-[300px] mx-auto">
        <div className="h-1.5 rounded-full bg-gray-200 dark:bg-dark-border overflow-hidden">
          <motion.div
            className="h-full bg-sprout-dark dark:bg-dark-sprout rounded-full"
            animate={{ width: `${(currentIndex / allActivities.length) * 100}%` }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
        </div>
        <p className="text-xs text-muted dark:text-dark-muted text-center mt-1.5">
          {currentIndex}/{allActivities.length}
        </p>
      </div>

      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => {
            setDone(true);
          }}
          className="text-sm font-semibold text-sprout-dark dark:text-dark-sprout hover:text-sprout-base transition-colors"
        >
          Skip to summary →
        </button>
        <button
          onClick={onBack}
          className="text-sm text-muted hover:text-slate-text dark:hover:text-dark-text transition-colors"
        >
          ← Back
        </button>
      </div>
    </>
  );
}
