/**
 * Step 1 — Destination
 * User types a destination query; we call resolveDestination() on the backend.
 * If suggestions come back, we show a picker list. Otherwise navigate to dates.
 */
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { useRouter } from "expo-router";
import WizardLayout from "../../src/components/WizardLayout";
import { resolveDestination } from "../../src/services/api";
import { getState, setState } from "../../src/utils/wizardStore";
import {
  Colors,
  FontFamily,
  FontSize,
  Spacing,
  BorderRadius,
  Shadows,
} from "../../src/constants/theme";

export default function DestinationScreen() {
  const router = useRouter();
  const [query, setQuery] = useState(getState().destinationQuery);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<
    Array<{ name: string; displayName: string }>
  >([]);

  const handleResolve = useCallback(async () => {
    const q = query.trim();
    if (!q) {
      setError("Please enter a destination.");
      return;
    }

    Keyboard.dismiss();
    setLoading(true);
    setError(null);
    setSuggestions([]);

    try {
      const result = await resolveDestination(q);

      setState({ destinationQuery: q });

      if (result.mode === "direct" && result.destination) {
        setState({ resolvedDestination: result.destination });
        router.push("/wizard/dates");
      } else if (result.mode === "suggestions" && result.suggestions?.length) {
        setSuggestions(
          result.suggestions.map((s) => ({
            name: s.name || s.displayName,
            displayName: s.displayName || s.name,
          })),
        );
      } else {
        setError(
          "Could not find that destination. Please try a different city or location.",
        );
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [query, router]);

  const handleSelectSuggestion = useCallback(
    (name: string) => {
      setState({ destinationQuery: name, resolvedDestination: name });
      router.push("/wizard/dates");
    },
    [router],
  );

  return (
    <WizardLayout
      step={1}
      totalSteps={3}
      title="Where are you headed?"
      subtitle="Enter a city, park, or destination for your family trip."
      canGoBack={false}
    >
      {/* Search Input */}
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, error ? styles.inputError : null]}
          value={query}
          onChangeText={(t) => {
            setQuery(t);
            setError(null);
            setSuggestions([]);
          }}
          placeholder="e.g. Orlando, FL or Yellowstone"
          placeholderTextColor={Colors.muted}
          returnKeyType="search"
          onSubmitEditing={handleResolve}
          autoCapitalize="words"
          autoCorrect={false}
          editable={!loading}
        />
      </View>

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
          <Text style={styles.loadingText}>Looking up destination…</Text>
        </View>
      ) : null}

      {/* Suggestions */}
      {suggestions.length > 0 ? (
        <View style={styles.suggestionsContainer}>
          <Text style={styles.suggestionsLabel}>Did you mean?</Text>
          {suggestions.map((s, i) => (
            <TouchableOpacity
              key={i}
              style={styles.suggestionItem}
              onPress={() => handleSelectSuggestion(s.name)}
              activeOpacity={0.7}
            >
              <Text style={styles.suggestionPin}>📍</Text>
              <Text style={styles.suggestionText}>{s.displayName}</Text>
              <Text style={styles.suggestionArrow}>→</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {/* Search button */}
      {suggestions.length === 0 ? (
        <TouchableOpacity
          style={[styles.searchButton, loading && styles.searchButtonDisabled]}
          onPress={handleResolve}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Text style={styles.searchButtonText}>
            {loading ? "Searching…" : "Find Destination →"}
          </Text>
        </TouchableOpacity>
      ) : null}

      {/* US notice */}
      <View style={styles.noticeRow}>
        <Text style={styles.noticeText}>
          🇺🇸 Currently supports US destinations only.
        </Text>
      </View>
    </WizardLayout>
  );
}

const styles = StyleSheet.create({
  inputRow: {
    marginBottom: Spacing[3],
  },
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
    ...Shadows.sm,
  },
  inputError: {
    borderColor: Colors.error,
  },
  errorBanner: {
    backgroundColor: "#FEE2E2",
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    marginBottom: Spacing[3],
  },
  errorText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: "#B91C1C",
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
  suggestionsContainer: {
    marginBottom: Spacing[4],
  },
  suggestionsLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: FontSize.sm,
    color: Colors.muted,
    marginBottom: Spacing[2],
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[4],
    marginBottom: Spacing[2],
    ...Shadows.sm,
  },
  suggestionPin: {
    fontSize: 16,
    marginRight: Spacing[3],
  },
  suggestionText: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Colors.text,
  },
  suggestionArrow: {
    fontSize: 16,
    color: Colors.sproutDark,
    fontFamily: FontFamily.body,
  },
  searchButton: {
    backgroundColor: Colors.sproutDark,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing[4],
    alignItems: "center",
    marginBottom: Spacing[4],
    ...Shadows.md,
  },
  searchButtonDisabled: {
    opacity: 0.6,
  },
  searchButtonText: {
    fontFamily: FontFamily.headingBold,
    fontSize: FontSize.base,
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  noticeRow: {
    marginTop: Spacing[2],
    alignItems: "center",
  },
  noticeText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Colors.muted,
    textAlign: "center",
  },
});
