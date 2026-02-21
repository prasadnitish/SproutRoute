/**
 * Home screen — loads any saved trip or starts the wizard.
 */
import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { loadSavedTrip } from "../src/utils/checklist";
import { setState } from "../src/utils/wizardStore";
import type { SavedTrip } from "../src/types/trip";
import {
  Colors,
  FontFamily,
  FontSize,
  Spacing,
  BorderRadius,
  Shadow,
} from "../src/constants/theme";

export default function HomeScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [hasSavedTrip, setHasSavedTrip] = useState(false);
  const [savedTrip, setSavedTrip] = useState<SavedTrip | null>(null);

  useEffect(() => {
    loadSavedTrip().then((saved) => {
      if (saved) {
        setSavedTrip(saved as SavedTrip);
        setHasSavedTrip(true);
      }
      setChecking(false);
    });
  }, []);

  const handleContinueTrip = () => {
    if (savedTrip) {
      // Restore the saved trip data to the wizard store
      setState({
        trip: savedTrip.trip,
        weather: savedTrip.weather,
        tripPlan: savedTrip.tripPlan,
        packingList: savedTrip.packingList,
        safetyGuidance: savedTrip.safetyGuidance,
        resolvedDestination: savedTrip.trip?.destination || "",
        startDate: savedTrip.trip?.startDate || "",
        endDate: savedTrip.trip?.endDate || "",
      });
    }
    router.push("/results");
  };

  if (checking) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.sproutDark} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Logo area */}
      <View style={styles.logoArea}>
        <Text style={styles.logoEmoji}>🌱</Text>
        <Text style={styles.logoName}>SproutRoute</Text>
        <Text style={styles.logoTagline}>AI trip planning for families</Text>
      </View>

      {/* Feature highlights */}
      <View style={styles.features}>
        {[
          { icon: "🗺️", text: "AI-powered itineraries" },
          { icon: "🎒", text: "Weather-smart packing lists" },
          { icon: "🛡", text: "Car seat safety guidance" },
        ].map(({ icon, text }) => (
          <View key={text} style={styles.featureRow}>
            <Text style={styles.featureIcon}>{icon}</Text>
            <Text style={styles.featureText}>{text}</Text>
          </View>
        ))}
      </View>

      {/* CTAs */}
      <View style={styles.ctaArea}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push("/wizard/destination")}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>Plan a trip 🚀</Text>
        </TouchableOpacity>

        {hasSavedTrip && (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleContinueTrip}
            activeOpacity={0.85}
          >
            <Text style={styles.secondaryButtonText}>Continue last trip →</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.legalNote}>
          Currently supports US destinations · No account required
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.sproutLight,
    justifyContent: "space-between",
    paddingHorizontal: Spacing[6],
    paddingBottom: Spacing[8],
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.sproutLight,
  },
  logoArea: {
    alignItems: "center",
    paddingTop: Spacing[12],
  },
  logoEmoji: {
    fontSize: 64,
    marginBottom: Spacing[2],
  },
  logoName: {
    fontFamily: FontFamily.heading,
    fontSize: 36,
    color: Colors.sproutDark,
    letterSpacing: -0.5,
  },
  logoTagline: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Colors.muted,
    marginTop: Spacing[1],
  },
  features: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing[6],
    gap: Spacing[4],
    ...Shadow.card,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing[3],
  },
  featureIcon: {
    fontSize: 22,
    width: 32,
    textAlign: "center",
  },
  featureText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.base,
    color: Colors.slateText,
  },
  ctaArea: {
    gap: Spacing[3],
    alignItems: "center",
  },
  primaryButton: {
    backgroundColor: Colors.sproutDark,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing[4],
    paddingHorizontal: Spacing[8],
    width: "100%",
    alignItems: "center",
    ...Shadow.soft,
  },
  primaryButtonText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: FontSize.lg,
    color: Colors.white,
    letterSpacing: 0.2,
  },
  secondaryButton: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[6],
    borderWidth: 1.5,
    borderColor: Colors.sproutBase,
    width: "100%",
    alignItems: "center",
  },
  secondaryButtonText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.base,
    color: Colors.sproutDark,
  },
  legalNote: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Colors.muted,
    textAlign: "center",
  },
});
