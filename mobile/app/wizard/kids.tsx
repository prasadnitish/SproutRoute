/**
 * Step 3 — Kids
 * Number of children, ages, optional weight + height.
 * Weight/height show a helper explaining why they're needed (car seat safety).
 * Triggers the full AI pipeline on submit.
 */
import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import WizardLayout from "../../src/components/WizardLayout";
import {
  getState,
  setState,
  buildChildrenPayload,
} from "../../src/utils/wizardStore";
import {
  generateTripPlan,
  generatePackingList,
  getCarSeatGuidance,
} from "../../src/services/api";
import { saveTripData } from "../../src/utils/checklist";
import {
  Colors,
  FontFamily,
  FontSize,
  Spacing,
  BorderRadius,
  Shadows,
} from "../../src/constants/theme";

// ── Activity Options ─────────────────────────────────────────────────────────

const ACTIVITY_OPTIONS = [
  { id: "beach", label: "🏖 Beach" },
  { id: "hiking", label: "🥾 Hiking" },
  { id: "museums", label: "🏛 Museums" },
  { id: "theme parks", label: "🎢 Theme Parks" },
  { id: "camping", label: "⛺️ Camping" },
  { id: "city exploration", label: "🏙 City" },
  { id: "water parks", label: "💦 Water Parks" },
  { id: "wildlife", label: "🦁 Wildlife" },
  { id: "shopping", label: "🛍 Shopping" },
  { id: "sports", label: "⚽️ Sports" },
  { id: "dining", label: "🍽 Dining" },
  { id: "road trip", label: "🚗 Road Trip" },
];

// ── Stepper ──────────────────────────────────────────────────────────────────

function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={stepperStyles.row}>
      <TouchableOpacity
        style={[stepperStyles.btn, value <= min && stepperStyles.btnDisabled]}
        onPress={() => {
          if (value > min) {
            Haptics.selectionAsync();
            onChange(value - 1);
          }
        }}
        disabled={value <= min}
        hitSlop={8}
      >
        <Text style={stepperStyles.btnText}>−</Text>
      </TouchableOpacity>
      <Text style={stepperStyles.value}>{value}</Text>
      <TouchableOpacity
        style={[stepperStyles.btn, value >= max && stepperStyles.btnDisabled]}
        onPress={() => {
          if (value < max) {
            Haptics.selectionAsync();
            onChange(value + 1);
          }
        }}
        disabled={value >= max}
        hitSlop={8}
      >
        <Text style={stepperStyles.btnText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const stepperStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: Spacing[4] },
  btn: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.sproutLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: Colors.sproutBase,
  },
  btnDisabled: { opacity: 0.35 },
  btnText: {
    fontSize: 20,
    color: Colors.sproutDark,
    fontFamily: FontFamily.headingBold,
    lineHeight: 22,
  },
  value: {
    fontFamily: FontFamily.headingBold,
    fontSize: FontSize.xl,
    color: Colors.sproutDark,
    minWidth: 28,
    textAlign: "center",
  },
});

// ── Main Component ────────────────────────────────────────────────────────────

export default function KidsScreen() {
  const router = useRouter();
  const initial = getState();

  const [numChildren, setNumChildren] = useState(initial.numChildren);
  const [childAges, setChildAges] = useState<number[]>(
    initial.childAges.length >= initial.numChildren
      ? [...initial.childAges]
      : [
          ...initial.childAges,
          ...Array(initial.numChildren - initial.childAges.length).fill(2),
        ],
  );
  const [childWeights, setChildWeights] = useState<string[]>(
    initial.childWeights.map(String),
  );
  const [childHeights, setChildHeights] = useState<string[]>(
    initial.childHeights.map(String),
  );
  const [selectedActivities, setSelectedActivities] = useState<string[]>([
    "hiking",
    "city exploration",
  ]);
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sync arrays when numChildren changes
  useEffect(() => {
    setChildAges((prev) => {
      const arr = [...prev];
      while (arr.length < numChildren) arr.push(2);
      return arr.slice(0, numChildren);
    });
    setChildWeights((prev) => {
      const arr = [...prev];
      while (arr.length < numChildren) arr.push("");
      return arr.slice(0, numChildren);
    });
    setChildHeights((prev) => {
      const arr = [...prev];
      while (arr.length < numChildren) arr.push("");
      return arr.slice(0, numChildren);
    });
  }, [numChildren]);

  const toggleActivity = useCallback((id: string) => {
    Haptics.selectionAsync();
    setSelectedActivities((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    );
  }, []);

  const handleBuildPlan = useCallback(async () => {
    if (selectedActivities.length === 0) {
      setError("Please select at least one activity.");
      return;
    }

    // Persist to store
    setState({
      numChildren,
      childAges,
      childWeights,
      childHeights,
    });

    const children = buildChildrenPayload();
    const { resolvedDestination, startDate, endDate } = getState();

    const tripData = {
      destination: resolvedDestination,
      startDate,
      endDate,
      activities: selectedActivities,
      children,
    };

    setLoading(true);
    setError(null);

    try {
      // Phase 1: Trip plan + weather
      setLoadingPhase("🌍 Planning your itinerary…");
      setState({ loadingPhase: "planning" });
      const planResult = await generateTripPlan(tripData, {
        onRetry: () => setLoadingPhase("🔄 Retrying…"),
      });

      // Phase 2: Packing list
      setLoadingPhase("🎒 Building packing list…");
      setState({ loadingPhase: "packing" });
      const packingResult = await generatePackingList(
        {
          ...tripData,
          approvedActivities: planResult.tripPlan?.suggestedActivities || [],
        },
        {
          onRetry: () => setLoadingPhase("🔄 Retrying…"),
        },
      );

      // Phase 3: Car seat safety (best-effort)
      setLoadingPhase("🚗 Checking car seat safety…");
      let safetyGuidance = null;
      try {
        safetyGuidance = await getCarSeatGuidance({
          destination: resolvedDestination,
          tripDate: startDate,
          children,
        });
      } catch {
        // Safety is non-blocking — proceed without it
      }

      // Save everything to store + AsyncStorage
      setState({
        trip: planResult.trip,
        weather: planResult.weather,
        tripPlan: planResult.tripPlan,
        packingList: packingResult.packingList,
        safetyGuidance,
        loadingPhase: null,
        error: null,
      });

      await saveTripData({
        trip: planResult.trip,
        weather: planResult.weather,
        tripPlan: planResult.tripPlan,
        packingList: packingResult.packingList,
        safetyGuidance,
        lastModified: new Date().toISOString(),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push("/results");
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.";
      setState({ loadingPhase: null, error: msg });
      setError(msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
      setLoadingPhase(null);
    }
  }, [
    numChildren,
    childAges,
    childWeights,
    childHeights,
    selectedActivities,
    router,
  ]);

  return (
    <WizardLayout
      step={3}
      totalSteps={3}
      title="Who's coming?"
      subtitle="Tell us about your kids so we can personalize the plan."
    >
      {/* Number of children */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Number of Children</Text>
        <Stepper
          value={numChildren}
          min={1}
          max={6}
          onChange={setNumChildren}
        />
      </View>

      {/* Per-child info */}
      {Array.from({ length: numChildren }, (_, i) => (
        <View key={i} style={styles.childCard}>
          <Text style={styles.childCardTitle}>Child {i + 1}</Text>

          <View style={styles.childRow}>
            <Text style={styles.childFieldLabel}>Age (years)</Text>
            <Stepper
              value={childAges[i] ?? 2}
              min={0}
              max={17}
              onChange={(v) => {
                const a = [...childAges];
                a[i] = v;
                setChildAges(a);
              }}
            />
          </View>

          <View style={styles.childOptionalRow}>
            <View style={styles.childOptionalField}>
              <Text style={styles.childFieldLabel}>
                Weight (lbs) <Text style={styles.optional}>optional</Text>
              </Text>
              <TextInput
                style={styles.childInput}
                value={childWeights[i] ?? ""}
                onChangeText={(t) => {
                  const w = [...childWeights];
                  w[i] = t;
                  setChildWeights(w);
                }}
                placeholder="e.g. 35"
                placeholderTextColor={Colors.muted}
                keyboardType="numeric"
                returnKeyType="done"
              />
            </View>
            <View style={styles.childOptionalField}>
              <Text style={styles.childFieldLabel}>
                Height (in) <Text style={styles.optional}>optional</Text>
              </Text>
              <TextInput
                style={styles.childInput}
                value={childHeights[i] ?? ""}
                onChangeText={(t) => {
                  const h = [...childHeights];
                  h[i] = t;
                  setChildHeights(h);
                }}
                placeholder="e.g. 42"
                placeholderTextColor={Colors.muted}
                keyboardType="numeric"
                returnKeyType="done"
              />
            </View>
          </View>
          <Text style={styles.weightHint}>
            🚗 Used for car seat safety recommendations
          </Text>
        </View>
      ))}

      {/* Activities */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Planned Activities</Text>
        <Text style={styles.sectionSubtitle}>
          Select all that apply — we'll tailor your plan around these.
        </Text>
        <View style={styles.activitiesGrid}>
          {ACTIVITY_OPTIONS.map((act) => {
            const active = selectedActivities.includes(act.id);
            return (
              <TouchableOpacity
                key={act.id}
                style={[
                  styles.activityChip,
                  active && styles.activityChipActive,
                ]}
                onPress={() => toggleActivity(act.id)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.activityChipText,
                    active && styles.activityChipTextActive,
                  ]}
                >
                  {act.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Error */}
      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Loading phase indicator */}
      {loading && loadingPhase ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator size="small" color={Colors.sproutDark} />
          <Text style={styles.loadingPhaseText}>{loadingPhase}</Text>
        </View>
      ) : null}

      {/* Submit */}
      <TouchableOpacity
        style={[styles.buildButton, loading && styles.buildButtonDisabled]}
        onPress={handleBuildPlan}
        disabled={loading}
        activeOpacity={0.8}
      >
        <Text style={styles.buildButtonText}>
          {loading ? "Building your plan…" : "🌱 Build My Trip Plan"}
        </Text>
      </TouchableOpacity>

      <Text style={styles.buildHint}>
        This takes 20-30 seconds — we're generating your AI-powered itinerary,
        packing list, and safety guidance.
      </Text>
    </WizardLayout>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: Spacing[6],
  },
  sectionTitle: {
    fontFamily: FontFamily.headingBold,
    fontSize: FontSize.lg,
    color: Colors.sproutDark,
    marginBottom: Spacing[3],
  },
  sectionSubtitle: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.muted,
    marginBottom: Spacing[3],
    lineHeight: 20,
  },
  childCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[3],
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  childCardTitle: {
    fontFamily: FontFamily.headingBold,
    fontSize: FontSize.base,
    color: Colors.sproutDark,
    marginBottom: Spacing[3],
  },
  childRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing[3],
  },
  childFieldLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: FontSize.sm,
    color: Colors.slateText,
  },
  optional: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Colors.muted,
  },
  childOptionalRow: {
    flexDirection: "row",
    gap: Spacing[3],
    marginBottom: Spacing[2],
  },
  childOptionalField: {
    flex: 1,
  },
  childInput: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    fontSize: FontSize.sm,
    fontFamily: FontFamily.body,
    color: Colors.text,
    marginTop: Spacing[1],
  },
  weightHint: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Colors.muted,
    lineHeight: 16,
  },
  activitiesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing[2],
  },
  activityChip: {
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: Colors.sproutBase,
    backgroundColor: Colors.surface,
  },
  activityChipActive: {
    backgroundColor: Colors.sproutDark,
    borderColor: Colors.sproutDark,
  },
  activityChipText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.sm,
    color: Colors.sproutDark,
  },
  activityChipTextActive: {
    color: Colors.white,
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
    lineHeight: 20,
  },
  loadingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing[3],
    backgroundColor: Colors.sproutLight,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    marginBottom: Spacing[3],
  },
  loadingPhaseText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.sm,
    color: Colors.sproutDark,
    flex: 1,
  },
  buildButton: {
    backgroundColor: Colors.sproutDark,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing[5],
    alignItems: "center",
    marginBottom: Spacing[3],
    ...Shadows.md,
  },
  buildButtonDisabled: {
    opacity: 0.6,
  },
  buildButtonText: {
    fontFamily: FontFamily.headingBold,
    fontSize: FontSize.lg,
    color: Colors.white,
    letterSpacing: 0.3,
  },
  buildHint: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Colors.muted,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: Spacing[4],
    marginBottom: Spacing[4],
  },
});
