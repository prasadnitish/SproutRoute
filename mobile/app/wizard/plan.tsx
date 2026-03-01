/**
 * Step 1 — Plan Your Trip (combined destination + activity input)
 * User describes their dream trip in natural language.
 * AI resolves destination, trip type, and suggests activities.
 */
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import WizardLayout from "../../src/components/WizardLayout";
import { resolveDestination } from "../../src/services/api";
import { setState } from "../../src/utils/wizardStore";
import {
  Colors,
  FontFamily,
  FontSize,
  Spacing,
  BorderRadius,
  Shadows,
} from "../../src/constants/theme";

const EXAMPLE_PROMPTS = [
  "Relaxing beach vacation in California",
  "National parks on the east coast",
  "Family cruise from Miami",
  "Skiing trip in Colorado",
  "City exploration in London",
  "Theme parks in Orlando",
];

export default function PlanScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    const q = query.trim();
    if (!q) {
      setError("Tell us about your dream trip!");
      return;
    }

    Keyboard.dismiss();
    setLoading(true);
    setError(null);

    try {
      const result = await resolveDestination(q);
      setState({ destinationQuery: q });

      if (result.mode === "direct" && result.destination) {
        setState({
          resolvedDestination: result.destination,
          tripType: result.tripType || null,
          countryCode: result.coords?.countryCode || null,
          lat: result.coords?.lat ?? null,
          lon: result.coords?.lon ?? null,
          aiSuggestedActivities: result.suggestedActivities || [],
          vibeDescription: result.vibeDescription || null,
          aiSuggestions: [],
        });
        router.push("/wizard/confirm");
      } else if (result.mode === "suggestions" && result.suggestions?.length) {
        setState({
          aiSuggestions: result.suggestions,
          resolvedDestination: "",
          aiSuggestedActivities: [],
          vibeDescription: null,
        });
        router.push("/wizard/confirm");
      } else {
        setError(
          "Could not understand that trip. Try something like 'beach trip in Florida'.",
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong.",
      );
    } finally {
      setLoading(false);
    }
  }, [query, router]);

  return (
    <WizardLayout
      step={1}
      totalSteps={4}
      title="Plan your trip"
      subtitle="Describe your dream family vacation in one sentence."
      canGoBack={false}
    >
      <TextInput
        style={[styles.input, error ? styles.inputError : null]}
        value={query}
        onChangeText={(t) => {
          setQuery(t);
          setError(null);
        }}
        placeholder='e.g. "Relaxing beach vacation in California"'
        placeholderTextColor={Colors.muted}
        multiline
        numberOfLines={3}
        textAlignVertical="top"
        editable={!loading}
        autoCapitalize="sentences"
        autoCorrect
      />

      {/* Example chips */}
      <Text style={styles.examplesLabel}>Try these:</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.examplesScroll}
      >
        {EXAMPLE_PROMPTS.map((ex) => (
          <TouchableOpacity
            key={ex}
            style={styles.exampleChip}
            onPress={() => {
              setQuery(ex);
              setError(null);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.exampleChipText}>{ex}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Error */}
      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Loading */}
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={Colors.sproutDark} />
          <Text style={styles.loadingText}>Understanding your trip…</Text>
        </View>
      ) : null}

      {/* Submit */}
      <TouchableOpacity
        style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={loading}
        activeOpacity={0.8}
      >
        <Text style={styles.submitBtnText}>
          {loading ? "Thinking…" : "Let's Go →"}
        </Text>
      </TouchableOpacity>

      <View style={styles.noticeRow}>
        <Text style={styles.noticeText}>
          Works worldwide · No account required
        </Text>
      </View>
    </WizardLayout>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[4],
    fontSize: FontSize.base,
    fontFamily: FontFamily.body,
    color: Colors.text,
    minHeight: 80,
    marginBottom: Spacing[3],
    ...Shadows.sm,
  },
  inputError: { borderColor: Colors.error },
  examplesLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.xs,
    color: Colors.muted,
    marginBottom: Spacing[2],
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  examplesScroll: {
    paddingBottom: Spacing[3],
    gap: Spacing[2],
  },
  exampleChip: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    marginRight: Spacing[2],
  },
  exampleChipText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
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
    lineHeight: 20,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing[2],
    marginBottom: Spacing[3],
  },
  loadingText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.muted,
  },
  submitBtn: {
    backgroundColor: Colors.sproutDark,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing[4],
    alignItems: "center",
    marginBottom: Spacing[4],
    ...Shadows.md,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: {
    fontFamily: FontFamily.headingBold,
    fontSize: FontSize.base,
    color: Colors.white,
    letterSpacing: 0.3,
  },
  noticeRow: { alignItems: "center", marginTop: Spacing[2] },
  noticeText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Colors.muted,
    textAlign: "center",
  },
});
