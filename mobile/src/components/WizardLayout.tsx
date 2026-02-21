/**
 * Shared layout for wizard steps — progress bar, back button, title, content area.
 */
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Colors,
  FontFamily,
  FontSize,
  Spacing,
  BorderRadius,
} from "../constants/theme";

interface WizardLayoutProps {
  step: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  canGoBack?: boolean;
}

export default function WizardLayout({
  step,
  totalSteps,
  title,
  subtitle,
  children,
  canGoBack = true,
}: WizardLayoutProps) {
  const router = useRouter();
  const progress = step / totalSteps;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        {/* Header */}
        <View style={styles.header}>
          {canGoBack && (
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
              hitSlop={12}
            >
              <Text style={styles.backArrow}>←</Text>
            </TouchableOpacity>
          )}
          <View style={styles.headerCenter}>
            <Text style={styles.stepText}>
              Step {step} of {totalSteps}
            </Text>
          </View>
          <View style={styles.backButton} />
        </View>

        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <View
            style={[styles.progressFill, { width: `${progress * 100}%` }]}
          />
        </View>

        {/* Title */}
        <View style={styles.titleArea}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>

        {/* Content */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[3],
    paddingBottom: Spacing[2],
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  backArrow: {
    fontSize: 22,
    color: Colors.sproutDark,
    fontFamily: FontFamily.body,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  stepText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  progressTrack: {
    height: 3,
    backgroundColor: Colors.sproutLight,
    marginHorizontal: Spacing[4],
    borderRadius: BorderRadius.full,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.sproutDark,
    borderRadius: BorderRadius.full,
  },
  titleArea: {
    paddingHorizontal: Spacing[6],
    paddingTop: Spacing[6],
    paddingBottom: Spacing[4],
  },
  title: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize["2xl"],
    color: Colors.sproutDark,
    lineHeight: 32,
  },
  subtitle: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Colors.muted,
    marginTop: Spacing[2],
    lineHeight: 22,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing[6],
    paddingBottom: Spacing[8],
  },
});
