/**
 * Step 2 — Confirm Your Trip
 * Shows AI-resolved destination (or suggestion picker) + activity toggles.
 * User confirms destination and activities before picking dates.
 */
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import WizardLayout from "../../src/components/WizardLayout";
import { getState, setState } from "../../src/utils/wizardStore";
import {
  ALL_ACTIVITIES,
  CRUISE_ACTIVITIES,
  type ActivityOption,
} from "../../src/constants/activities";
import {
  Colors,
  FontFamily,
  FontSize,
  Spacing,
  BorderRadius,
  Shadows,
} from "../../src/constants/theme";

export default function ConfirmScreen() {
  const router = useRouter();
  const state = getState();

  const [selectedDestination, setSelectedDestination] = useState(
    state.resolvedDestination,
  );
  const [selectedActivities, setSelectedActivities] = useState<Set<string>>(
    () => new Set(state.aiSuggestedActivities || []),
  );

  const suggestions = state.aiSuggestions || [];
  const isPickMode = suggestions.length > 0 && !selectedDestination;

  const allOptions =
    state.tripType === "cruise"
      ? [...ALL_ACTIVITIES, ...CRUISE_ACTIVITIES]
      : ALL_ACTIVITIES;

  // Activities the AI suggested (shown first, pre-selected)
  const suggestedOptions = allOptions.filter((a) =>
    (state.aiSuggestedActivities || []).includes(a.id),
  );
  // Remaining activities (shown below, unselected)
  const otherOptions = allOptions.filter(
    (a) => !(state.aiSuggestedActivities || []).includes(a.id),
  );

  const handleSelectSuggestion = useCallback(
    (suggestion: {
      name: string;
      displayName?: string;
      tripType?: string;
      coords?: { lat: number; lon: number; countryCode?: string };
    }) => {
      setState({
        resolvedDestination: suggestion.name,
        tripType: suggestion.tripType || null,
        countryCode: suggestion.coords?.countryCode || null,
        lat: suggestion.coords?.lat ?? null,
        lon: suggestion.coords?.lon ?? null,
      });
      setSelectedDestination(suggestion.name);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [],
  );

  const toggleActivity = useCallback((id: string) => {
    Haptics.selectionAsync();
    setSelectedActivities((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setState({ likedActivities: [...selectedActivities] });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/wizard/dates");
  }, [selectedActivities, router]);

  return (
    <WizardLayout
      step={2}
      totalSteps={4}
      title="Your trip plan"
      subtitle={state.vibeDescription || "Here's what we found for you."}
    >
      {/* Destination */}
      {isPickMode ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Pick a destination:</Text>
          {suggestions.map((s, i) => (
            <TouchableOpacity
              key={i}
              style={[
                styles.suggestionCard,
                selectedDestination === s.name && styles.suggestionCardActive,
              ]}
              onPress={() => handleSelectSuggestion(s)}
              activeOpacity={0.7}
            >
              <Text style={styles.suggestionPin}>📍</Text>
              <View style={styles.suggestionContent}>
                <Text style={styles.suggestionName}>
                  {s.displayName || s.name}
                </Text>
                {s.why ? (
                  <Text style={styles.suggestionWhy}>{s.why}</Text>
                ) : null}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={styles.destinationCard}>
          <Text style={styles.destinationEmoji}>📍</Text>
          <View style={styles.destinationInfo}>
            <Text style={styles.destinationName}>{selectedDestination}</Text>
            {state.tripType ? (
              <View style={styles.tripTypeBadge}>
                <Text style={styles.tripTypeText}>{state.tripType}</Text>
              </View>
            ) : null}
          </View>
        </View>
      )}

      {/* Suggested activities */}
      {suggestedOptions.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Suggested activities:</Text>
          <View style={styles.activitiesGrid}>
            {suggestedOptions.map((act) => (
              <ActivityChip
                key={act.id}
                activity={act}
                selected={selectedActivities.has(act.id)}
                onPress={() => toggleActivity(act.id)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {/* More activities */}
      {otherOptions.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            {suggestedOptions.length > 0 ? "Add more:" : "Pick activities:"}
          </Text>
          <View style={styles.activitiesGrid}>
            {otherOptions.map((act) => (
              <ActivityChip
                key={act.id}
                activity={act}
                selected={selectedActivities.has(act.id)}
                onPress={() => toggleActivity(act.id)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {/* Confirm button */}
      <TouchableOpacity
        style={[styles.confirmBtn, !selectedDestination && { opacity: 0.5 }]}
        onPress={handleConfirm}
        disabled={!selectedDestination}
        activeOpacity={0.8}
      >
        <Text style={styles.confirmBtnText}>Pick Dates →</Text>
      </TouchableOpacity>
    </WizardLayout>
  );
}

function ActivityChip({
  activity,
  selected,
  onPress,
}: {
  activity: ActivityOption;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.activityChip, selected && styles.activityChipActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={styles.activityChipEmoji}>{activity.emoji}</Text>
      <Text
        style={[
          styles.activityChipText,
          selected && styles.activityChipTextActive,
        ]}
      >
        {activity.label}
      </Text>
      {selected ? <Text style={styles.activityChipCheck}>✓</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: Spacing[4] },
  sectionLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.xs,
    color: Colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: Spacing[2],
  },
  destinationCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.sproutLight,
    borderRadius: BorderRadius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[4],
    ...Shadows.sm,
  },
  destinationEmoji: { fontSize: 24, marginRight: Spacing[3] },
  destinationInfo: { flex: 1 },
  destinationName: {
    fontFamily: FontFamily.headingBold,
    fontSize: FontSize.lg,
    color: Colors.sproutDark,
  },
  tripTypeBadge: {
    alignSelf: "flex-start",
    backgroundColor: Colors.sproutDark,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing[2],
    paddingVertical: 2,
    marginTop: Spacing[1],
  },
  tripTypeText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.xs,
    color: Colors.white,
    textTransform: "capitalize",
  },
  suggestionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[2],
    ...Shadows.sm,
  },
  suggestionCardActive: {
    borderColor: Colors.sproutDark,
    backgroundColor: Colors.sproutLight,
  },
  suggestionPin: { fontSize: 16, marginRight: Spacing[3] },
  suggestionContent: { flex: 1 },
  suggestionName: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.base,
    color: Colors.text,
  },
  suggestionWhy: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Colors.muted,
    marginTop: 2,
    lineHeight: 16,
  },
  activitiesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing[2],
  },
  activityChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    gap: Spacing[1],
  },
  activityChipActive: {
    backgroundColor: Colors.sproutLight,
    borderColor: Colors.sproutDark,
  },
  activityChipEmoji: { fontSize: 16 },
  activityChipText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  activityChipTextActive: {
    fontFamily: FontFamily.bodySemiBold,
    color: Colors.sproutDark,
  },
  activityChipCheck: {
    fontFamily: FontFamily.bodyBold,
    fontSize: FontSize.xs,
    color: Colors.sproutDark,
  },
  confirmBtn: {
    backgroundColor: Colors.sproutDark,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing[4],
    alignItems: "center",
    marginTop: Spacing[2],
    ...Shadows.md,
  },
  confirmBtnText: {
    fontFamily: FontFamily.headingBold,
    fontSize: FontSize.base,
    color: Colors.white,
    letterSpacing: 0.3,
  },
});
