/**
 * Step 2 — Dates
 * User picks start and end dates for the trip.
 * Uses plain TextInput with YYYY-MM-DD format (no native date picker dependency).
 * Quick-select presets: This Weekend, Next Weekend, Next Week.
 */
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import WizardLayout from "../../src/components/WizardLayout";
import { getState, setState } from "../../src/utils/wizardStore";
import {
  Colors,
  FontFamily,
  FontSize,
  Spacing,
  BorderRadius,
  Shadows,
} from "../../src/constants/theme";

// ── Date helpers ────────────────────────────────────────────────────────────

function toYMD(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatDisplay(ymd: string): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isValidDate(ymd: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const d = new Date(ymd);
  return !isNaN(d.getTime());
}

function nextDayOfWeek(day: number, fromDate = new Date()): Date {
  const d = new Date(fromDate);
  const diff = (day - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d;
}

function getPresets(): Array<{ label: string; start: string; end: string }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // This weekend: Fri → Sun (or if already Fri/Sat/Sun, current weekend)
  const thisSat = nextDayOfWeek(6, today);
  const thisSun = new Date(thisSat);
  thisSun.setDate(thisSat.getDate() + 1);

  // Next weekend
  const nextSat = new Date(thisSat);
  nextSat.setDate(thisSat.getDate() + 7);
  const nextSun = new Date(nextSat);
  nextSun.setDate(nextSat.getDate() + 1);

  // Next week (Mon → Fri)
  const nextMon = nextDayOfWeek(1, today);
  const nextFri = new Date(nextMon);
  nextFri.setDate(nextMon.getDate() + 4);

  return [
    { label: "This Weekend", start: toYMD(thisSat), end: toYMD(thisSun) },
    { label: "Next Weekend", start: toYMD(nextSat), end: toYMD(nextSun) },
    { label: "Next Week", start: toYMD(nextMon), end: toYMD(nextFri) },
  ];
}

// ── Component ────────────────────────────────────────────────────────────────

export default function DatesScreen() {
  const router = useRouter();
  const initial = getState();
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [error, setError] = useState<string | null>(null);

  const presets = getPresets();

  const applyPreset = useCallback((start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
    setError(null);
  }, []);

  const handleNext = useCallback(() => {
    if (!isValidDate(startDate)) {
      setError("Please enter a valid start date (YYYY-MM-DD).");
      return;
    }
    if (!isValidDate(endDate)) {
      setError("Please enter a valid end date (YYYY-MM-DD).");
      return;
    }
    if (endDate < startDate) {
      setError("End date must be on or after the start date.");
      return;
    }
    setState({ startDate, endDate });
    router.push("/wizard/kids");
  }, [startDate, endDate, router]);

  return (
    <WizardLayout
      step={2}
      totalSteps={3}
      title="When are you going?"
      subtitle="Pick your travel dates — we'll tailor the plan to the weather."
    >
      {/* Quick presets */}
      <Text style={styles.sectionLabel}>Quick Select</Text>
      <View style={styles.presetsRow}>
        {presets.map((p) => (
          <TouchableOpacity
            key={p.label}
            style={[
              styles.presetChip,
              startDate === p.start &&
                endDate === p.end &&
                styles.presetChipActive,
            ]}
            onPress={() => applyPreset(p.start, p.end)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.presetChipText,
                startDate === p.start &&
                  endDate === p.end &&
                  styles.presetChipTextActive,
              ]}
            >
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Date inputs */}
      <View style={styles.dateRow}>
        <View style={styles.dateField}>
          <Text style={styles.fieldLabel}>Start Date</Text>
          <TextInput
            style={styles.dateInput}
            value={startDate}
            onChangeText={(t) => {
              setStartDate(t);
              setError(null);
            }}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={Colors.muted}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
          />
          {isValidDate(startDate) ? (
            <Text style={styles.dateDisplayText}>
              {formatDisplay(startDate)}
            </Text>
          ) : null}
        </View>

        <View style={styles.dateSeparator}>
          <Text style={styles.dateSeparatorText}>→</Text>
        </View>

        <View style={styles.dateField}>
          <Text style={styles.fieldLabel}>End Date</Text>
          <TextInput
            style={styles.dateInput}
            value={endDate}
            onChangeText={(t) => {
              setEndDate(t);
              setError(null);
            }}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={Colors.muted}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
          />
          {isValidDate(endDate) ? (
            <Text style={styles.dateDisplayText}>{formatDisplay(endDate)}</Text>
          ) : null}
        </View>
      </View>

      {/* Trip duration badge */}
      {isValidDate(startDate) &&
      isValidDate(endDate) &&
      endDate >= startDate ? (
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>
            📅{" "}
            {Math.ceil(
              (new Date(endDate).getTime() - new Date(startDate).getTime()) /
                86400000,
            ) + 1}{" "}
            day
            {Math.ceil(
              (new Date(endDate).getTime() - new Date(startDate).getTime()) /
                86400000,
            ) +
              1 !==
            1
              ? "s"
              : ""}
          </Text>
        </View>
      ) : null}

      {/* Error */}
      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Next button */}
      <TouchableOpacity
        style={styles.nextButton}
        onPress={handleNext}
        activeOpacity={0.8}
      >
        <Text style={styles.nextButtonText}>Who's Coming? →</Text>
      </TouchableOpacity>
    </WizardLayout>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: FontSize.xs,
    color: Colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: Spacing[2],
  },
  presetsRow: {
    flexDirection: "row",
    gap: Spacing[2],
    marginBottom: Spacing[5],
    flexWrap: "wrap",
  },
  presetChip: {
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: Colors.sproutBase,
    backgroundColor: Colors.surface,
  },
  presetChipActive: {
    backgroundColor: Colors.sproutDark,
    borderColor: Colors.sproutDark,
  },
  presetChipText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.sm,
    color: Colors.sproutDark,
  },
  presetChipTextActive: {
    color: Colors.white,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing[2],
    marginBottom: Spacing[4],
  },
  dateField: {
    flex: 1,
  },
  fieldLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: FontSize.xs,
    color: Colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: Spacing[1],
  },
  dateInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[3],
    fontSize: FontSize.sm,
    fontFamily: FontFamily.body,
    color: Colors.text,
    ...Shadows.sm,
  },
  dateDisplayText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Colors.sproutDark,
    marginTop: Spacing[1],
    paddingLeft: 2,
  },
  dateSeparator: {
    paddingTop: 28,
    alignItems: "center",
    width: 24,
  },
  dateSeparatorText: {
    fontSize: 18,
    color: Colors.muted,
    fontFamily: FontFamily.body,
  },
  durationBadge: {
    backgroundColor: Colors.sproutLight,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    alignItems: "center",
    marginBottom: Spacing[4],
  },
  durationText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.sm,
    color: Colors.sproutDark,
  },
  errorBanner: {
    backgroundColor: Colors.errorLight,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    marginBottom: Spacing[3],
  },
  errorText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.error,
  },
  nextButton: {
    backgroundColor: Colors.sproutDark,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing[4],
    alignItems: "center",
    marginTop: Spacing[2],
    ...Shadows.md,
  },
  nextButtonText: {
    fontFamily: FontFamily.headingBold,
    fontSize: FontSize.base,
    color: Colors.white,
    letterSpacing: 0.3,
  },
});
