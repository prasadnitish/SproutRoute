/**
 * Step 4 — Activity Picker (Tinder-style swipe cards)
 *
 * Swipe right = Like (add to trip)
 * Swipe left  = Skip
 * Threshold: 100px horizontal drag confirms the swipe.
 *
 * After all cards are evaluated -> show summary -> "Build My Trip" triggers API.
 * The full bundle (itinerary + packing + safety) is fetched here.
 */
import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import {
  GestureDetector,
  Gesture,
} from "react-native-gesture-handler";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getState,
  setState,
  buildChildrenPayload,
} from "../../src/utils/wizardStore";
import {
  bundleTripPlan,
  getCarSeatGuidance,
  getTravelAdvisory,
  getNeighborhoodSafety,
} from "../../src/services/api";
import { saveTripData } from "../../src/utils/checklist";
import {
  Colors,
  FontFamily,
  FontSize,
  Spacing,
  BorderRadius,
  Shadow,
  Shadows,
} from "../../src/constants/theme";

// ── Activity card definitions ─────────────────────────────────────────────────

interface ActivityOption {
  id: string;
  emoji: string;
  label: string;
  description: string;
  ageMin?: number;
}

const ALL_ACTIVITIES: ActivityOption[] = [
  { id: "beach", emoji: "🏖", label: "Beach", description: "Sand, waves & sun — perfect for splashing around", ageMin: 0 },
  { id: "hiking", emoji: "🥾", label: "Hiking", description: "Scenic trails through nature and forests", ageMin: 3 },
  { id: "museums", emoji: "🏛", label: "Museums", description: "Explore science, history, art & culture", ageMin: 4 },
  { id: "theme parks", emoji: "🎢", label: "Theme Parks", description: "Rides, characters & magical experiences", ageMin: 2 },
  { id: "camping", emoji: "⛺️", label: "Camping", description: "Starry nights, campfires & the great outdoors", ageMin: 0 },
  { id: "city exploration", emoji: "🏙", label: "City", description: "Neighborhoods, street food & local vibes", ageMin: 0 },
  { id: "water parks", emoji: "💦", label: "Water Parks", description: "Slides, splash pads & wave pools", ageMin: 2 },
  { id: "wildlife", emoji: "🦁", label: "Wildlife", description: "Zoos, safaris & animal encounters", ageMin: 0 },
  { id: "shopping", emoji: "🛍", label: "Shopping", description: "Markets, malls & local boutiques", ageMin: 0 },
  { id: "sports", emoji: "⚽️", label: "Sports", description: "Games, courts & active play", ageMin: 3 },
  { id: "dining", emoji: "🍽", label: "Dining", description: "Local restaurants & foodie adventures", ageMin: 0 },
  { id: "road trip", emoji: "🚗", label: "Road Trip", description: "Scenic drives & roadside discoveries", ageMin: 0 },
  { id: "cruise", emoji: "🚢", label: "Cruise", description: "Sea days, port stops & onboard fun", ageMin: 0 },
  { id: "skiing", emoji: "⛷", label: "Skiing", description: "Snow slopes, ski school & mountain lodges", ageMin: 4 },
];

const CRUISE_ACTIVITIES: ActivityOption[] = [
  { id: "shore excursion", emoji: "🗺", label: "Shore Excursions", description: "Explore ports with guided tours & adventures", ageMin: 0 },
  { id: "sea day", emoji: "🌊", label: "Sea Day Relaxation", description: "Pool, spa & onboard entertainment", ageMin: 0 },
  { id: "onboard entertainment", emoji: "🎭", label: "Onboard Shows", description: "Broadway-style shows, live music & games", ageMin: 0 },
  { id: "port shopping", emoji: "🧸", label: "Port Shopping", description: "Local markets & unique souvenirs", ageMin: 0 },
  { id: "snorkeling", emoji: "🤿", label: "Snorkeling", description: "Crystal-clear water & tropical fish", ageMin: 5 },
];

const SWIPE_THRESHOLD = 100;
const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_WIDTH = SCREEN_WIDTH - Spacing[6] * 2;

// ── Swipeable card ─────────────────────────────────────────────────────────────

function SwipeCard({
  activity,
  onSwipeLeft,
  onSwipeRight,
  isTop,
  stackOffset,
}: {
  activity: ActivityOption;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  isTop: boolean;
  stackOffset: number;
}) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const isGestureActive = useSharedValue(false);

  const gesture = Gesture.Pan()
    .enabled(isTop)
    .onBegin(() => {
      isGestureActive.value = true;
    })
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY * 0.2;
    })
    .onEnd((e) => {
      isGestureActive.value = false;
      if (e.translationX > SWIPE_THRESHOLD) {
        translateX.value = withTiming(SCREEN_WIDTH * 1.5, { duration: 280 }, () => {
          runOnJS(onSwipeRight)();
        });
      } else if (e.translationX < -SWIPE_THRESHOLD) {
        translateX.value = withTiming(-SCREEN_WIDTH * 1.5, { duration: 280 }, () => {
          runOnJS(onSwipeLeft)();
        });
      } else {
        translateX.value = withSpring(0, { damping: 15, stiffness: 200 });
        translateY.value = withSpring(0, { damping: 15, stiffness: 200 });
      }
    });

  const cardStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      translateX.value,
      [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
      [-15, 0, 15],
      Extrapolation.CLAMP,
    );
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: isTop ? translateY.value : stackOffset * 6 },
        { rotate: `${rotate}deg` },
        { scale: isTop ? 1 : 0.95 - stackOffset * 0.02 },
      ],
      zIndex: isTop ? 10 : 10 - stackOffset,
    };
  });

  const likeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [20, SWIPE_THRESHOLD], [0, 1], Extrapolation.CLAMP),
  }));

  const nopeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-20, -SWIPE_THRESHOLD], [0, 1], Extrapolation.CLAMP),
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.card, cardStyle]}>
        <Animated.View style={[styles.swipeBadge, styles.likeBadge, likeStyle]}>
          <Text style={[styles.swipeBadgeText, { color: "#2E7D32" }]}>LIKE</Text>
        </Animated.View>
        <Animated.View style={[styles.swipeBadge, styles.nopeBadge, nopeStyle]}>
          <Text style={[styles.swipeBadgeText, { color: "#C62828" }]}>SKIP</Text>
        </Animated.View>

        <Text style={styles.cardEmoji}>{activity.emoji}</Text>
        <Text style={styles.cardLabel}>{activity.label}</Text>
        <Text style={styles.cardDescription}>
          {activity.description}
        </Text>
        {activity.ageMin !== undefined && activity.ageMin > 0 ? (
          <Text style={styles.cardAgeHint}>
            Best for ages {activity.ageMin}+
          </Text>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

// ── Loading overlay ────────────────────────────────────────────────────────────

const LOADING_PHASES = [
  "📍 Locking in your destination…",
  "☀️ Checking the weather…",
  "✨ Crafting your itinerary…",
  "🎒 Building your packing list…",
  "🛡 Running safety checks…",
];

function LoadingOverlay({ phase, onCancel }: { phase: string; onCancel: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.loadingOverlay, { paddingTop: insets.top + Spacing[8] }]}>
      <Text style={styles.loadingEmoji}>🌱</Text>
      <Text style={styles.loadingTitle}>
        Building Your Trip
      </Text>
      <ActivityIndicator size="large" color={Colors.sproutDark} style={{ marginVertical: Spacing[6] }} />
      <Text style={styles.loadingPhase}>{phase}</Text>
      <TouchableOpacity
        onPress={onCancel}
        style={styles.cancelBtn}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Cancel trip building"
      >
        <Text style={styles.cancelBtnText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

export default function ActivitiesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const abortRef = useRef<AbortController | null>(null);

  const wizState = getState();
  const isCruise = wizState.tripType === "cruise";

  const deck = isCruise
    ? [...CRUISE_ACTIVITIES, ...ALL_ACTIVITIES.filter((a) => ["dining", "shopping", "city exploration"].includes(a.id))]
    : ALL_ACTIVITIES;

  const [cardIndex, setCardIndex] = useState(0);
  const [liked, setLiked] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingPhaseIdx, setLoadingPhaseIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => {
      setLoadingPhaseIdx((i) => Math.min(i + 1, LOADING_PHASES.length - 1));
    }, 4000);
    return () => clearInterval(id);
  }, [loading]);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const handleSwipeRight = useCallback(() => {
    const activity = deck[cardIndex];
    if (activity) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setLiked((prev) => [...prev, activity.id]);
    }
    const next = cardIndex + 1;
    if (next >= deck.length) setDone(true);
    else setCardIndex(next);
  }, [cardIndex, deck]);

  const handleSwipeLeft = useCallback(() => {
    Haptics.selectionAsync();
    const next = cardIndex + 1;
    if (next >= deck.length) setDone(true);
    else setCardIndex(next);
  }, [cardIndex, deck]);

  const handleLikeButton = useCallback(() => handleSwipeRight(), [handleSwipeRight]);
  const handleSkipButton = useCallback(() => handleSwipeLeft(), [handleSwipeLeft]);

  const handleBuildTrip = useCallback(async () => {
    const activities = liked.length > 0 ? liked : ["city exploration", "dining"];

    Keyboard.dismiss();
    setState({ loadingPhase: "planning" });

    const { resolvedDestination, startDate, endDate } = getState();
    const children = buildChildrenPayload();

    const { tripType } = getState();
    const tripData = {
      destination: resolvedDestination,
      startDate,
      endDate,
      activities,
      children,
      ...(tripType ? { tripType } : {}),
    };

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setLoadingPhaseIdx(0);
    setError(null);

    try {
      const bundleResult = await bundleTripPlan(tripData, {
        onRetry: () => {},
        signal: controller.signal,
      });

      setLoadingPhaseIdx(3);
      const countryCode = bundleResult.trip?.countryCode || null;

      const [safetyGuidance, travelAdvisory, neighborhoodSafety] = await Promise.all([
        getCarSeatGuidance(
          { destination: resolvedDestination, tripDate: startDate, children, countryCode: countryCode || undefined },
          { signal: controller.signal },
        ).catch(() => null),
        countryCode && countryCode !== "US"
          ? getTravelAdvisory(countryCode, { signal: controller.signal })
              .then((r) => r?.advisory ?? null)
              .catch(() => null)
          : Promise.resolve(null),
        bundleResult.trip?.lat != null && bundleResult.trip?.lon != null
          ? getNeighborhoodSafety(bundleResult.trip.lat, bundleResult.trip.lon, { signal: controller.signal })
              .then((r) => r?.safety ?? null)
              .catch(() => null)
          : Promise.resolve(null),
      ]);

      setLoadingPhaseIdx(4);

      setState({
        trip: bundleResult.trip,
        weather: bundleResult.weather,
        tripPlan: bundleResult.tripPlan,
        packingList: bundleResult.packingList,
        safetyGuidance,
        travelAdvisory,
        neighborhoodSafety,
        loadingPhase: null,
        error: null,
      });

      await saveTripData({
        trip: bundleResult.trip,
        weather: bundleResult.weather,
        tripPlan: bundleResult.tripPlan,
        packingList: bundleResult.packingList,
        safetyGuidance,
        travelAdvisory,
        neighborhoodSafety,
        lastModified: new Date().toISOString(),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push("/results");
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setState({ loadingPhase: null, error: msg });
      setError(msg);
      setLoading(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      abortRef.current = null;
    }
  }, [liked, router]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setLoading(false);
    setLoadingPhaseIdx(0);
    setState({ loadingPhase: null });
  }, []);

  if (loading) {
    return (
      <LoadingOverlay
        phase={LOADING_PHASES[loadingPhaseIdx]}
        onCancel={handleCancel}
      />
    );
  }

  // ── Done — show summary + build button ───────────────────────────────────────
  if (done) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + Spacing[6] }]}>
        <Text style={styles.doneTitle}>
          Your trip style
        </Text>
        <Text style={styles.doneSubtitle}>
          {liked.length === 0
            ? "We'll suggest a balanced mix of activities."
            : `You're into ${liked.length} thing${liked.length > 1 ? "s" : ""}:`}
        </Text>

        {liked.length > 0 ? (
          <View style={styles.likedGrid}>
            {liked.map((id) => {
              const act = deck.find((a) => a.id === id);
              return act ? (
                <View key={id} style={styles.likedChip}>
                  <Text style={styles.likedChipText}>{act.emoji} {act.label}</Text>
                </View>
              ) : null;
            })}
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.buildButton}
          onPress={handleBuildTrip}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Build my trip plan"
        >
          <Text style={styles.buildButtonText}>
            🌱 Build My Trip Plan
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.restartRow}
          onPress={() => { setCardIndex(0); setLiked([]); setDone(false); }}
          accessibilityRole="button"
        >
          <Text style={styles.restartText}>
            Start over
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Card swipe view ───────────────────────────────────────────────────────────
  const remaining = deck.length - cardIndex;
  const progress = cardIndex / deck.length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing[3] }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={styles.backBtn}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Step 4 of 4</Text>
          <Text style={styles.headerSub}>
            {remaining} card{remaining !== 1 ? "s" : ""} left · {liked.length} liked
          </Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      {/* Title */}
      <View style={styles.titleArea}>
        <Text style={styles.title}>What sounds fun?</Text>
        <Text style={styles.subtitle}>
          Swipe right to like, left to skip
        </Text>
      </View>

      {/* Card stack — show current + 2 behind */}
      <View style={styles.cardStack}>
        {[2, 1, 0].map((offset) => {
          const idx = cardIndex + offset;
          if (idx >= deck.length) return null;
          return (
            <SwipeCard
              key={deck[idx].id}
              activity={deck[idx]}
              isTop={offset === 0}
              stackOffset={offset}
              onSwipeLeft={handleSwipeLeft}
              onSwipeRight={handleSwipeRight}
            />
          );
        })}
      </View>

      {/* Like / Skip buttons */}
      <View style={[styles.actionRow, { paddingBottom: insets.bottom + Spacing[6] }]}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.skipBtn]}
          onPress={handleSkipButton}
          accessibilityRole="button"
          accessibilityLabel="Skip this activity"
        >
          <Text style={[styles.actionBtnText, { color: Colors.error }]}>✗</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.likeBtn]}
          onPress={handleLikeButton}
          accessibilityRole="button"
          accessibilityLabel="Like this activity"
        >
          <Text style={[styles.actionBtnText, { color: "#FFFFFF" }]}>✓</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing[4],
    paddingBottom: Spacing[2],
  },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.slateText,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  headerSub: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Colors.muted,
    marginTop: 2,
  },
  backBtn: {
    fontSize: 22,
    fontFamily: FontFamily.body,
    color: Colors.sproutDark,
    width: 32,
  },
  progressTrack: {
    height: 3,
    marginHorizontal: Spacing[4],
    borderRadius: BorderRadius.full,
    overflow: "hidden",
    backgroundColor: Colors.sproutLight,
  },
  progressFill: {
    height: "100%",
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.sproutDark,
  },
  titleArea: {
    paddingHorizontal: Spacing[6],
    paddingTop: Spacing[4],
    paddingBottom: Spacing[2],
  },
  title: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize["2xl"],
    color: Colors.sproutDark,
    lineHeight: 32,
  },
  subtitle: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.muted,
    marginTop: Spacing[1],
  },
  cardStack: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    position: "absolute",
    width: CARD_WIDTH,
    borderRadius: BorderRadius["2xl"] ?? BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: Spacing[8],
    alignItems: "center",
    minHeight: 260,
    justifyContent: "center",
    ...Shadow.soft,
  },
  swipeBadge: {
    position: "absolute",
    top: Spacing[4],
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
    borderRadius: BorderRadius.md,
    borderWidth: 2,
  },
  likeBadge: {
    right: Spacing[4],
    borderColor: "#2E7D32",
    backgroundColor: "rgba(46,125,50,0.1)",
  },
  nopeBadge: {
    left: Spacing[4],
    borderColor: "#C62828",
    backgroundColor: "rgba(198,40,40,0.1)",
  },
  swipeBadgeText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: FontSize.sm,
    letterSpacing: 1,
  },
  cardEmoji: {
    fontSize: 56,
    marginBottom: Spacing[4],
  },
  cardLabel: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize["2xl"],
    color: Colors.text,
    marginBottom: Spacing[2],
    textAlign: "center",
  },
  cardDescription: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Colors.muted,
    textAlign: "center",
    lineHeight: 22,
  },
  cardAgeHint: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: FontSize.xs,
    color: Colors.sproutDark,
    marginTop: Spacing[3],
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing[8],
    paddingHorizontal: Spacing[6],
  },
  actionBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    ...Shadow.soft,
  },
  skipBtn: {
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: Colors.error,
  },
  likeBtn: {
    backgroundColor: Colors.sproutDark,
  },
  actionBtnText: {
    fontSize: 26,
    lineHeight: 30,
    fontFamily: FontFamily.bodyBold,
  },
  // Done screen
  doneTitle: {
    fontFamily: FontFamily.heading,
    fontSize: 28,
    color: Colors.sproutDark,
    textAlign: "center",
    marginTop: Spacing[4],
  },
  doneSubtitle: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Colors.muted,
    textAlign: "center",
    marginTop: Spacing[2],
    marginBottom: Spacing[6],
    paddingHorizontal: Spacing[6],
  },
  likedGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing[2],
    justifyContent: "center",
    paddingHorizontal: Spacing[6],
    marginBottom: Spacing[8],
  },
  likedChip: {
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    backgroundColor: Colors.sproutLight,
    borderColor: Colors.sproutBase,
  },
  likedChipText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.sm,
  },
  buildButton: {
    marginHorizontal: Spacing[6],
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing[4],
    alignItems: "center",
    marginBottom: Spacing[4],
    backgroundColor: Colors.sproutDark,
    ...Shadows.md,
  },
  buildButtonText: {
    fontFamily: FontFamily.headingBold,
    fontSize: FontSize.lg,
    color: Colors.white,
    letterSpacing: 0.3,
  },
  restartRow: {
    alignItems: "center",
    paddingVertical: Spacing[3],
  },
  restartText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.muted,
  },
  errorBanner: {
    marginHorizontal: Spacing[6],
    borderRadius: BorderRadius.md,
    padding: Spacing[3],
    marginBottom: Spacing[4],
    backgroundColor: Colors.errorLight,
  },
  errorText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.error,
  },
  // Loading overlay
  loadingOverlay: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: Spacing[6],
    backgroundColor: Colors.background,
  },
  loadingEmoji: {
    fontSize: 56,
    marginBottom: Spacing[4],
  },
  loadingTitle: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize["2xl"],
    color: Colors.sproutDark,
    marginBottom: Spacing[2],
  },
  loadingPhase: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Colors.slateText,
    textAlign: "center",
    lineHeight: 22,
  },
  cancelBtn: {
    marginTop: Spacing[8],
    borderWidth: 1.5,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing[6],
    paddingVertical: Spacing[3],
    borderColor: Colors.error,
  },
  cancelBtnText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.sm,
    color: Colors.error,
  },
});
