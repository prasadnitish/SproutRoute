/**
 * Step 3 — Kids
 * Number of children, ages, optional weight + height.
 * Weight/height show a helper explaining why they're needed (car seat safety).
 * Routes to activities screen on submit.
 */
import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import WizardLayout from "../../src/components/WizardLayout";
import {
  getState,
  setState,
} from "../../src/utils/wizardStore";
import {
  Colors,
  FontFamily,
  FontSize,
  Spacing,
  BorderRadius,
  Shadows,
} from "../../src/constants/theme";

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

  const handleNext = useCallback(() => {
    // Persist kid data to store
    setState({
      numChildren,
      childAges,
      childWeights,
      childHeights,
    });

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/wizard/activities");
  }, [numChildren, childAges, childWeights, childHeights, router]);

  return (
    <WizardLayout
      step={4}
      totalSteps={4}
      title={numChildren === 0 ? "Adults only?" : "Who's coming?"}
      subtitle={numChildren === 0
        ? "No kids on this trip — we'll plan an adults-only itinerary."
        : "Tell us about your kids so we can personalize the plan."}
    >
      {/* Number of children */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Number of Children</Text>
        <Stepper
          value={numChildren}
          min={0}
          max={6}
          onChange={setNumChildren}
        />
        {numChildren === 0 && (
          <Text style={styles.weightHint}>
            Adults-only trip — no car seat guidance needed.
          </Text>
        )}
      </View>

      {/* Per-child info (hidden when 0 kids) */}
      {numChildren > 0 && Array.from({ length: numChildren }, (_, i) => (
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
            Used for car seat safety recommendations
          </Text>
        </View>
      ))}

      {/* Next button */}
      <TouchableOpacity
        style={styles.nextButton}
        onPress={handleNext}
        activeOpacity={0.8}
      >
        <Text style={styles.nextButtonText}>
          Pick Activities →
        </Text>
      </TouchableOpacity>
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
  nextButton: {
    backgroundColor: Colors.sproutDark,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing[5],
    alignItems: "center",
    marginBottom: Spacing[3],
    ...Shadows.md,
  },
  nextButtonText: {
    fontFamily: FontFamily.headingBold,
    fontSize: FontSize.lg,
    color: Colors.white,
    letterSpacing: 0.3,
  },
});
