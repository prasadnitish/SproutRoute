import { useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameDay,
  isSameMonth,
  isBefore,
  isAfter,
  differenceInDays,
} from "date-fns";

const DAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function CalendarMonth({
  month,
  startDate,
  endDate,
  today,
  onDateClick,
  selecting,
}) {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);

  const days = [];
  let d = calStart;
  while (d <= calEnd) {
    days.push(d);
    d = addDays(d, 1);
  }

  const isPast = (date) => isBefore(date, today) && !isSameDay(date, today);
  const isStart = (date) => startDate && isSameDay(date, startDate);
  const isEnd = (date) => endDate && isSameDay(date, endDate);
  const isInRange = (date) =>
    startDate && endDate && isAfter(date, startDate) && isBefore(date, endDate);
  const isToday = (date) => isSameDay(date, today);

  return (
    <div className="flex-1 min-w-[260px]">
      <p className="text-sm font-bold text-sprout-dark dark:text-dark-sprout text-center mb-3">
        {format(month, "MMMM yyyy")}
      </p>
      <div className="grid grid-cols-7 gap-0.5">
        {DAY_NAMES.map((name) => (
          <div
            key={name}
            className="text-[10px] font-bold text-muted dark:text-dark-muted text-center py-1"
          >
            {name}
          </div>
        ))}
        {days.map((day, i) => {
          const outOfMonth = !isSameMonth(day, month);
          const past = isPast(day);
          const start = isStart(day);
          const end = isEnd(day);
          const inRange = isInRange(day);
          const todayDot = isToday(day);
          const disabled = outOfMonth || past;

          return (
            <button
              key={i}
              disabled={disabled}
              onClick={() => !disabled && onDateClick(day)}
              className={`relative aspect-square flex items-center justify-center text-xs font-medium rounded-lg transition-all ${
                outOfMonth
                  ? "text-transparent pointer-events-none"
                  : past
                    ? "text-gray-300 dark:text-dark-border cursor-not-allowed"
                    : start || end
                      ? "bg-sprout-dark text-white font-bold shadow-sm"
                      : inRange
                        ? "bg-sprout-light/60 dark:bg-dark-border text-sprout-dark dark:text-dark-sprout"
                        : "text-slate-text dark:text-dark-text hover:bg-sprout-light/40 dark:hover:bg-dark-border"
              }`}
            >
              {format(day, "d")}
              {todayDot && !start && !end && (
                <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-sprout-base" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Quick-select presets
function getPresets(today) {
  const dayOfWeek = today.getDay();

  // This weekend (Sat-Sun)
  const daysToSat = (6 - dayOfWeek + 7) % 7 || 7;
  const thisSat = addDays(today, daysToSat);
  const thisSun = addDays(thisSat, 1);

  // Next weekend
  const nextSat = addDays(thisSat, 7);
  const nextSun = addDays(nextSat, 1);

  // Next week (Mon-Fri)
  const daysToMon = (1 - dayOfWeek + 7) % 7 || 7;
  const nextMon = addDays(today, daysToMon);
  const nextFri = addDays(nextMon, 4);

  return [
    { label: "This Weekend", start: thisSat, end: thisSun },
    { label: "Next Weekend", start: nextSat, end: nextSun },
    { label: "Next Week", start: nextMon, end: nextFri },
  ];
}

export default function DatesStep({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onNext,
  onBack,
}) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [viewMonth, setViewMonth] = useState(() => startOfMonth(today));
  const [selecting, setSelecting] = useState(startDate ? "end" : "start");

  const startObj = startDate ? new Date(startDate + "T12:00:00") : null;
  const endObj = endDate ? new Date(endDate + "T12:00:00") : null;

  const presets = useMemo(() => getPresets(today), [today]);

  const handleDateClick = useCallback(
    (date) => {
      const ymd = format(date, "yyyy-MM-dd");
      if (selecting === "start" || !startDate) {
        onStartDateChange(ymd);
        onEndDateChange("");
        setSelecting("end");
      } else {
        // If clicked date is before start, swap
        if (startObj && isBefore(date, startObj)) {
          onEndDateChange(startDate);
          onStartDateChange(ymd);
        } else {
          onEndDateChange(ymd);
        }
        setSelecting("start");
      }
    },
    [selecting, startDate, startObj, onStartDateChange, onEndDateChange],
  );

  const handlePreset = (start, end) => {
    onStartDateChange(format(start, "yyyy-MM-dd"));
    onEndDateChange(format(end, "yyyy-MM-dd"));
    setSelecting("start");
    setViewMonth(startOfMonth(start));
  };

  const duration =
    startObj && endObj
      ? differenceInDays(endObj, startObj) + 1
      : null;

  const nextMonth = addMonths(viewMonth, 1);

  return (
    <>
      <div>
        <h2 className="font-heading text-3xl md:text-4xl font-bold text-sprout-dark dark:text-dark-sprout">
          When are you going?
        </h2>
        <p className="text-muted dark:text-dark-muted mt-2">
          Tap a start date, then an end date. Max 14 days.
        </p>
      </div>

      {/* Quick presets */}
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => {
          const isActive =
            startDate === format(p.start, "yyyy-MM-dd") &&
            endDate === format(p.end, "yyyy-MM-dd");
          return (
            <motion.button
              key={p.label}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => handlePreset(p.start, p.end)}
              className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
                isActive
                  ? "bg-sprout-dark border-sprout-dark text-white"
                  : "bg-white dark:bg-dark-bg border-sprout-light dark:border-dark-border text-sprout-dark dark:text-dark-sprout hover:border-sprout-base dark:hover:border-dark-sprout"
              }`}
            >
              {p.label}
            </motion.button>
          );
        })}
      </div>

      {/* Calendar grid */}
      <div className="rounded-2xl border border-sprout-light dark:border-dark-border bg-white dark:bg-dark-bg p-4 md:p-6">
        {/* Nav arrows */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setViewMonth(subMonths(viewMonth, 1))}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:bg-sprout-light dark:hover:bg-dark-border transition-colors"
          >
            ‹
          </button>
          <span className="text-xs text-muted dark:text-dark-muted font-medium">
            {selecting === "start" ? "Select start date" : "Select end date"}
          </span>
          <button
            onClick={() => setViewMonth(addMonths(viewMonth, 1))}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:bg-sprout-light dark:hover:bg-dark-border transition-colors"
          >
            ›
          </button>
        </div>

        <div className="flex flex-col md:flex-row gap-6">
          <CalendarMonth
            month={viewMonth}
            startDate={startObj}
            endDate={endObj}
            today={today}
            onDateClick={handleDateClick}
            selecting={selecting}
          />
          <CalendarMonth
            month={nextMonth}
            startDate={startObj}
            endDate={endObj}
            today={today}
            onDateClick={handleDateClick}
            selecting={selecting}
          />
        </div>
      </div>

      {/* Duration badge */}
      {duration && duration > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-sprout-light/60 dark:bg-dark-border px-4 py-2.5 text-center"
        >
          <span className="text-sm font-semibold text-sprout-dark dark:text-dark-sprout">
            📅 {duration} day{duration !== 1 ? "s" : ""}{" "}
            <span className="text-muted dark:text-dark-muted font-normal">
              ({format(startObj, "MMM d")} → {format(endObj, "MMM d, yyyy")})
            </span>
          </span>
        </motion.div>
      )}

      <div className="flex items-center gap-4">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onNext}
          className="rounded-xl bg-sprout-dark text-white py-3 px-8 font-semibold text-sm hover:bg-sprout-base transition-colors shadow-soft"
        >
          Continue →
        </motion.button>
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
