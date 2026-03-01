/**
 * Activity Detail Screen — shows full activity info with photos.
 * Navigated to from the swipable activity cards on the results screen.
 */
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getState } from "../../src/utils/wizardStore";
import { searchPhotos, type UnsplashPhoto } from "../../src/services/photos";
import { ALL_ACTIVITIES } from "../../src/constants/activities";
import {
  Colors,
  FontFamily,
  FontSize,
  Spacing,
  BorderRadius,
  Shadows,
} from "../../src/constants/theme";
import type { Activity } from "../../src/types/trip";

const SCREEN_WIDTH = Dimensions.get("window").width;
const PHOTO_HEIGHT = 260;

export default function ActivityDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activityId } = useLocalSearchParams<{ activityId: string }>();

  const { tripPlan, trip } = getState();
  const activity = tripPlan?.suggestedActivities?.find(
    (a) => a.id === activityId,
  );

  // Find matching emoji from activity constants
  const activityOption = ALL_ACTIVITIES.find((a) => a.id === activityId);
  const emoji = activityOption?.emoji || "📍";

  const [photos, setPhotos] = useState<UnsplashPhoto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);

  useEffect(() => {
    if (activity && trip) {
      const query = `${activity.name} ${trip.destination} travel`;
      searchPhotos(query, 4).then((results) => {
        setPhotos(results);
        setLoadingPhotos(false);
      });
    } else {
      setLoadingPhotos(false);
    }
  }, [activity, trip]);

  if (!activity) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + Spacing[4] }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.notFound}>Activity not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Photo gallery */}
      <View style={styles.photoArea}>
        {loadingPhotos ? (
          <View
            style={[
              styles.photoPlaceholder,
              { paddingTop: insets.top + Spacing[4] },
            ]}
          >
            <ActivityIndicator size="large" color={Colors.white} />
          </View>
        ) : photos.length > 0 ? (
          <FlatList
            data={photos}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(p) => p.id}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(
                e.nativeEvent.contentOffset.x / SCREEN_WIDTH,
              );
              setActivePhotoIndex(idx);
            }}
            renderItem={({ item }) => (
              <Image
                source={{ uri: item.urls.regular }}
                style={styles.photo}
                resizeMode="cover"
              />
            )}
          />
        ) : (
          <View
            style={[
              styles.photoPlaceholder,
              { paddingTop: insets.top + Spacing[4] },
            ]}
          >
            <Text style={styles.placeholderEmoji}>{emoji}</Text>
          </View>
        )}

        {/* Photo dots */}
        {photos.length > 1 ? (
          <View style={styles.photoDots}>
            {photos.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.photoDot,
                  i === activePhotoIndex && styles.photoDotActive,
                ]}
              />
            ))}
          </View>
        ) : null}

        {/* Back button overlay */}
        <TouchableOpacity
          style={[styles.backButton, { top: insets.top + Spacing[2] }]}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
      </View>

      {/* Detail content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.activityName}>{activity.name}</Text>

        {/* Badges */}
        <View style={styles.badges}>
          {activity.kidFriendly ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>👶 Kid-friendly</Text>
            </View>
          ) : null}
          {activity.weatherDependent ? (
            <View style={[styles.badge, styles.badgeWeather]}>
              <Text style={[styles.badgeText, styles.badgeTextWeather]}>
                ☀️ Weather-dependent
              </Text>
            </View>
          ) : null}
          <View style={styles.badge}>
            <Text style={styles.badgeText}>⏱ {activity.duration}</Text>
          </View>
        </View>

        {/* Description */}
        <Text style={styles.description}>{activity.description}</Text>

        {/* Why suggested */}
        {activity.reason ? (
          <View style={styles.reasonCard}>
            <Text style={styles.reasonLabel}>Why we suggested this</Text>
            <Text style={styles.reasonText}>✓ {activity.reason}</Text>
          </View>
        ) : null}

        {/* Best days */}
        {activity.bestDays && activity.bestDays.length > 0 ? (
          <View style={styles.bestDaysCard}>
            <Text style={styles.bestDaysLabel}>Best days for this activity</Text>
            <Text style={styles.bestDaysText}>
              {activity.bestDays.join(", ")}
            </Text>
          </View>
        ) : null}

        {/* Unsplash attribution */}
        {photos.length > 0 ? (
          <Text style={styles.attribution}>Photos by Unsplash</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  backRow: { paddingHorizontal: Spacing[5], marginBottom: Spacing[4] },
  backText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.base,
    color: Colors.sproutDark,
  },
  notFound: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Colors.muted,
    textAlign: "center",
    marginTop: Spacing[8],
  },
  photoArea: { position: "relative" },
  photoPlaceholder: {
    width: SCREEN_WIDTH,
    height: PHOTO_HEIGHT,
    backgroundColor: Colors.sproutDark,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderEmoji: { fontSize: 64 },
  photo: { width: SCREEN_WIDTH, height: PHOTO_HEIGHT },
  photoDots: {
    position: "absolute",
    bottom: Spacing[3],
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing[1],
  },
  photoDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  photoDotActive: { backgroundColor: Colors.white, width: 18, borderRadius: 4 },
  backButton: {
    position: "absolute",
    left: Spacing[4],
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
  },
  backButtonText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.sm,
    color: Colors.white,
  },
  content: { flex: 1 },
  contentInner: {
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[5],
    paddingBottom: Spacing[10],
  },
  activityName: {
    fontFamily: FontFamily.headingBold,
    fontSize: FontSize["2xl"],
    color: Colors.sproutDark,
    marginBottom: Spacing[3],
  },
  badges: {
    flexDirection: "row",
    gap: Spacing[2],
    flexWrap: "wrap",
    marginBottom: Spacing[4],
  },
  badge: {
    backgroundColor: Colors.sproutLight,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[1],
  },
  badgeWeather: { backgroundColor: Colors.sunLight },
  badgeText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.xs,
    color: Colors.sproutDark,
  },
  badgeTextWeather: { color: Colors.earth },
  description: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Colors.slateText,
    lineHeight: 24,
    marginBottom: Spacing[4],
  },
  reasonCard: {
    backgroundColor: Colors.sproutLight,
    borderRadius: BorderRadius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[4],
  },
  reasonLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.xs,
    color: Colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: Spacing[2],
  },
  reasonText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.sproutDark,
    lineHeight: 20,
  },
  bestDaysCard: {
    backgroundColor: Colors.sunLight,
    borderRadius: BorderRadius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[4],
  },
  bestDaysLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.xs,
    color: Colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: Spacing[2],
  },
  bestDaysText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.earth,
  },
  attribution: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Colors.muted,
    textAlign: "center",
    marginTop: Spacing[4],
  },
});
