/**
 * Results screen — full trip plan with three tabs: Itinerary, Packing, Safety.
 * Native pull-to-refresh regenerates the packing list.
 * Haptic feedback on packing item check-off.
 * Share button exports via native share sheet.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Share,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { getState, setState, resetWizard } from "../../src/utils/wizardStore";
import type {
  Activity,
  ItineraryDay,
  PackingCategory,
  PackingItem,
  SafetyResult,
} from "../../src/types/trip";
import {
  makeItemId,
  loadCheckedItems,
  saveCheckedItems,
  loadCustomItems,
  clearAllData,
} from "../../src/utils/checklist";
import {
  Colors,
  FontFamily,
  FontSize,
  Spacing,
  BorderRadius,
  Shadows,
} from "../../src/constants/theme";

// ── Tab types ────────────────────────────────────────────────────────────────

type Tab = "itinerary" | "packing" | "safety";

// ── Itinerary Tab ────────────────────────────────────────────────────────────

function WeatherSummary() {
  const { weather } = getState();
  if (!weather) return null;

  return (
    <View style={itinStyles.weatherCard}>
      <Text style={itinStyles.weatherSummary}>{weather.summary}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={itinStyles.forecastScroll}
      >
        {(weather.forecast || []).slice(0, 7).map((day, i) => (
          <View key={i} style={itinStyles.forecastDay}>
            <Text style={itinStyles.forecastName}>{day.name?.slice(0, 3)}</Text>
            <Text style={itinStyles.forecastTemp}>{day.high}°</Text>
            <Text style={itinStyles.forecastCondition} numberOfLines={2}>
              {day.condition}
            </Text>
            {day.precipitation > 40 ? (
              <Text style={itinStyles.forecastRain}>
                💧 {day.precipitation}%
              </Text>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function ActivityCard({
  activity,
  activityMap,
}: {
  activity: Activity;
  activityMap: Map<string, Activity>;
}) {
  return (
    <View style={itinStyles.activityCard}>
      <View style={itinStyles.activityHeader}>
        <Text style={itinStyles.activityName}>{activity.name}</Text>
        <View style={itinStyles.activityBadges}>
          {activity.kidFriendly ? (
            <View style={itinStyles.badge}>
              <Text style={itinStyles.badgeText}>👶 Kid-friendly</Text>
            </View>
          ) : null}
          {activity.weatherDependent ? (
            <View style={[itinStyles.badge, itinStyles.badgeWeather]}>
              <Text style={[itinStyles.badgeText, itinStyles.badgeTextWeather]}>
                ☀️ Weather-dependent
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <Text style={itinStyles.activityDescription}>{activity.description}</Text>
      <View style={itinStyles.activityMeta}>
        <Text style={itinStyles.activityMetaText}>⏱ {activity.duration}</Text>
        {activity.reason ? (
          <Text style={itinStyles.activityReason}>✓ {activity.reason}</Text>
        ) : null}
      </View>
    </View>
  );
}

function ItineraryDayCard({
  day,
  activityMap,
}: {
  day: ItineraryDay;
  activityMap: Map<string, Activity>;
}) {
  const [open, setOpen] = useState(true);

  return (
    <View style={itinStyles.dayCard}>
      <TouchableOpacity
        style={itinStyles.dayHeader}
        onPress={() => setOpen((o) => !o)}
        activeOpacity={0.7}
      >
        <Text style={itinStyles.dayTitle}>{day.day}</Text>
        <Text style={itinStyles.dayChevron}>{open ? "▲" : "▼"}</Text>
      </TouchableOpacity>

      {open ? (
        <View style={itinStyles.dayBody}>
          {/* Activities for this day */}
          {(day.activities || []).map((actId) => {
            const act = activityMap.get(actId);
            if (!act) return null;
            return (
              <View key={actId} style={itinStyles.dayActivity}>
                <Text style={itinStyles.dayActivityName}>• {act.name}</Text>
                <Text style={itinStyles.dayActivityMeta}>{act.duration}</Text>
              </View>
            );
          })}
          {day.meals ? (
            <View style={itinStyles.dayMeals}>
              <Text style={itinStyles.dayMealsLabel}>🍽 Meals</Text>
              <Text style={itinStyles.dayMealsText}>{day.meals}</Text>
            </View>
          ) : null}
          {day.notes ? (
            <View style={itinStyles.dayNotes}>
              <Text style={itinStyles.dayNotesText}>ℹ️ {day.notes}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const itinStyles = StyleSheet.create({
  weatherCard: {
    backgroundColor: Colors.skyLight,
    borderRadius: BorderRadius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[4],
  },
  weatherSummary: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.skyDark,
    lineHeight: 20,
    marginBottom: Spacing[3],
  },
  forecastScroll: { marginHorizontal: -Spacing[1] },
  forecastDay: {
    alignItems: "center",
    width: 64,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing[2],
    marginHorizontal: Spacing[1],
  },
  forecastName: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.xs,
    color: Colors.skyDark,
  },
  forecastTemp: {
    fontFamily: FontFamily.headingBold,
    fontSize: FontSize.lg,
    color: Colors.sproutDark,
    marginTop: 2,
  },
  forecastCondition: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    color: Colors.muted,
    textAlign: "center",
    marginTop: 2,
  },
  forecastRain: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    color: Colors.skyDark,
    marginTop: 2,
  },
  activityCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[3],
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  activityHeader: { marginBottom: Spacing[2] },
  activityName: {
    fontFamily: FontFamily.headingBold,
    fontSize: FontSize.base,
    color: Colors.sproutDark,
    marginBottom: Spacing[1],
  },
  activityBadges: { flexDirection: "row", gap: Spacing[2], flexWrap: "wrap" },
  badge: {
    backgroundColor: Colors.sproutLight,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing[2],
    paddingVertical: 3,
  },
  badgeWeather: { backgroundColor: Colors.sunLight },
  badgeText: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    color: Colors.sproutDark,
  },
  badgeTextWeather: { color: Colors.earth },
  activityDescription: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.slateText,
    lineHeight: 20,
    marginBottom: Spacing[2],
  },
  activityMeta: { flexDirection: "row", gap: Spacing[3], flexWrap: "wrap" },
  activityMetaText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Colors.muted,
  },
  activityReason: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Colors.sproutDark,
    flex: 1,
  },
  dayCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing[3],
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
    ...Shadows.sm,
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    backgroundColor: Colors.sproutLight,
  },
  dayTitle: {
    fontFamily: FontFamily.headingBold,
    fontSize: FontSize.base,
    color: Colors.sproutDark,
  },
  dayChevron: { fontSize: 12, color: Colors.sproutDark },
  dayBody: { padding: Spacing[4] },
  dayActivity: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing[2],
  },
  dayActivityName: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.text,
    flex: 1,
  },
  dayActivityMeta: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Colors.muted,
  },
  dayMeals: {
    marginTop: Spacing[2],
    paddingTop: Spacing[2],
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  dayMealsLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.xs,
    color: Colors.muted,
    marginBottom: 2,
  },
  dayMealsText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  dayNotes: { marginTop: Spacing[2] },
  dayNotesText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.muted,
    lineHeight: 18,
  },
});

// ── Packing Tab ──────────────────────────────────────────────────────────────

function PackingTab({
  checkedItems,
  onToggle,
}: {
  checkedItems: Set<string>;
  onToggle: (id: string) => void;
}) {
  const { packingList } = getState();
  if (!packingList?.categories?.length) {
    return (
      <View style={packingStyles.empty}>
        <Text style={packingStyles.emptyText}>No packing list available.</Text>
      </View>
    );
  }

  const totalItems = packingList.categories.reduce(
    (sum, c) => sum + (c.items?.length || 0),
    0,
  );
  const checkedCount = [...checkedItems].filter((id) =>
    packingList.categories.some(
      (c) =>
        c.items?.some(
          (item) => makeItemId(c.name, item.name, item.quantity) === id,
        ),
    ),
  ).length;

  return (
    <View>
      {/* Progress */}
      <View style={packingStyles.progressCard}>
        <View style={packingStyles.progressHeader}>
          <Text style={packingStyles.progressLabel}>Packed</Text>
          <Text style={packingStyles.progressCount}>
            {checkedCount} / {totalItems}
          </Text>
        </View>
        <View style={packingStyles.progressTrack}>
          <View
            style={[
              packingStyles.progressFill,
              {
                width: `${
                  totalItems > 0 ? (checkedCount / totalItems) * 100 : 0
                }%`,
              },
            ]}
          />
        </View>
      </View>

      {packingList.categories.map((category) => (
        <PackingCategoryCard
          key={category.name}
          category={category}
          checkedItems={checkedItems}
          onToggle={onToggle}
        />
      ))}
    </View>
  );
}

function PackingCategoryCard({
  category,
  checkedItems,
  onToggle,
}: {
  category: PackingCategory;
  checkedItems: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const allChecked = (category.items || []).every((item) =>
    checkedItems.has(makeItemId(category.name, item.name, item.quantity)),
  );

  return (
    <View
      style={[
        packingStyles.categoryCard,
        allChecked && packingStyles.categoryCardDone,
      ]}
    >
      <TouchableOpacity
        style={packingStyles.categoryHeader}
        onPress={() => setOpen((o) => !o)}
        activeOpacity={0.7}
      >
        <Text
          style={[
            packingStyles.categoryName,
            allChecked && packingStyles.categoryNameDone,
          ]}
        >
          {allChecked ? "✅ " : ""}
          {category.name}
        </Text>
        <View style={packingStyles.categoryMeta}>
          <Text style={packingStyles.categoryCount}>
            {
              (category.items || []).filter((item) =>
                checkedItems.has(
                  makeItemId(category.name, item.name, item.quantity),
                ),
              ).length
            }
            /{category.items?.length || 0}
          </Text>
          <Text style={packingStyles.categoryChevron}>{open ? "▲" : "▼"}</Text>
        </View>
      </TouchableOpacity>

      {open ? (
        <View>
          {(category.items || []).map((item) => {
            const id = makeItemId(category.name, item.name, item.quantity);
            const checked = checkedItems.has(id);
            return (
              <TouchableOpacity
                key={id}
                style={[
                  packingStyles.packingItem,
                  checked && packingStyles.packingItemChecked,
                ]}
                onPress={() => onToggle(id)}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    packingStyles.checkbox,
                    checked && packingStyles.checkboxChecked,
                  ]}
                >
                  {checked ? (
                    <Text style={packingStyles.checkmark}>✓</Text>
                  ) : null}
                </View>
                <View style={packingStyles.packingItemContent}>
                  <Text
                    style={[
                      packingStyles.packingItemName,
                      checked && packingStyles.packingItemNameChecked,
                    ]}
                  >
                    {item.name}
                    {item.quantity ? (
                      <Text style={packingStyles.packingItemQty}>
                        {" "}
                        × {item.quantity}
                      </Text>
                    ) : null}
                  </Text>
                  {item.reason && !checked ? (
                    <Text style={packingStyles.packingItemReason}>
                      {item.reason}
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const packingStyles = StyleSheet.create({
  empty: { padding: Spacing[6], alignItems: "center" },
  emptyText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.muted,
  },
  progressCard: {
    backgroundColor: Colors.sproutLight,
    borderRadius: BorderRadius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[4],
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing[2],
  },
  progressLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.sm,
    color: Colors.sproutDark,
  },
  progressCount: {
    fontFamily: FontFamily.headingBold,
    fontSize: FontSize.sm,
    color: Colors.sproutDark,
  },
  progressTrack: {
    height: 6,
    backgroundColor: Colors.sproutBase + "40",
    borderRadius: BorderRadius.full,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.sproutDark,
    borderRadius: BorderRadius.full,
  },
  categoryCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing[3],
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
    ...Shadows.sm,
  },
  categoryCardDone: { borderColor: Colors.sproutBase },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    backgroundColor: Colors.sproutLight,
  },
  categoryName: {
    fontFamily: FontFamily.headingBold,
    fontSize: FontSize.base,
    color: Colors.sproutDark,
    flex: 1,
  },
  categoryNameDone: { color: Colors.sproutDark },
  categoryMeta: { flexDirection: "row", alignItems: "center", gap: Spacing[2] },
  categoryCount: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Colors.muted,
  },
  categoryChevron: { fontSize: 11, color: Colors.sproutDark },
  packingItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing[3],
  },
  packingItemChecked: { opacity: 0.55 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.sproutBase,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: Colors.sproutDark,
    borderColor: Colors.sproutDark,
  },
  checkmark: {
    color: Colors.white,
    fontSize: 13,
    fontFamily: FontFamily.bodyBold,
    lineHeight: 15,
  },
  packingItemContent: { flex: 1 },
  packingItemName: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.text,
    lineHeight: 20,
  },
  packingItemNameChecked: {
    textDecorationLine: "line-through",
    color: Colors.muted,
  },
  packingItemQty: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Colors.muted,
  },
  packingItemReason: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Colors.muted,
    marginTop: 2,
    lineHeight: 16,
  },
});

// ── Safety Tab ───────────────────────────────────────────────────────────────

function SafetyTab() {
  const { safetyGuidance } = getState();

  if (!safetyGuidance) {
    return (
      <View style={safetyStyles.emptyCard}>
        <Text style={safetyStyles.emptyTitle}>
          Safety Information Unavailable
        </Text>
        <Text style={safetyStyles.emptyText}>
          We couldn't load car seat guidance for your destination. Please check{" "}
          <Text style={safetyStyles.link}>seatcheck.org</Text> for official
          guidelines.
        </Text>
      </View>
    );
  }

  return (
    <View>
      {/* Jurisdiction header */}
      <View style={safetyStyles.jurisdictionCard}>
        <Text style={safetyStyles.jurisdictionTitle}>
          🚗 Car Seat Laws —{" "}
          {safetyGuidance.jurisdictionName ||
            safetyGuidance.jurisdictionCode ||
            "Your Destination"}
        </Text>
        {safetyGuidance.sourceUrl ? (
          <Text style={safetyStyles.sourceUrl}>
            Source: {safetyGuidance.sourceUrl}
          </Text>
        ) : null}
        {safetyGuidance.lastUpdated ? (
          <Text style={safetyStyles.lastUpdated}>
            Last updated: {safetyGuidance.lastUpdated}
          </Text>
        ) : null}
      </View>

      {/* Per-child results */}
      {(safetyGuidance.results || []).map((result, i) => (
        <SafetyResultCard key={i} result={result} index={i} />
      ))}

      {/* Disclaimer */}
      <View style={safetyStyles.disclaimer}>
        <Text style={safetyStyles.disclaimerText}>
          ⚠️ This guidance is for informational purposes only. Always verify car
          seat laws with official sources before traveling. Visit{" "}
          <Text style={safetyStyles.link}>seatcheck.org</Text> for certified
          inspection locations.
        </Text>
      </View>
    </View>
  );
}

function SafetyResultCard({
  result,
  index,
}: {
  result: SafetyResult;
  index: number;
}) {
  const statusColor = result.status === "ok" ? Colors.sproutDark : Colors.earth;
  const statusBg =
    result.status === "ok" ? Colors.sproutLight : Colors.sunLight;

  return (
    <View style={safetyStyles.resultCard}>
      <View style={safetyStyles.resultHeader}>
        <Text style={safetyStyles.resultTitle}>Child {index + 1}</Text>
        <View style={[safetyStyles.statusBadge, { backgroundColor: statusBg }]}>
          <Text style={[safetyStyles.statusText, { color: statusColor }]}>
            {result.requiredRestraintLabel ||
              result.requiredRestraint ||
              "See guidelines"}
          </Text>
        </View>
      </View>

      {result.rationale ? (
        <Text style={safetyStyles.rationale}>{result.rationale}</Text>
      ) : null}

      {result.seatPosition ? (
        <View style={safetyStyles.detailRow}>
          <Text style={safetyStyles.detailLabel}>Seat Position:</Text>
          <Text style={safetyStyles.detailValue}>{result.seatPosition}</Text>
        </View>
      ) : null}
    </View>
  );
}

const safetyStyles = StyleSheet.create({
  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing[5],
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  emptyTitle: {
    fontFamily: FontFamily.headingBold,
    fontSize: FontSize.base,
    color: Colors.slateText,
    marginBottom: Spacing[2],
  },
  emptyText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.muted,
    lineHeight: 20,
  },
  link: { color: Colors.skyDark, textDecorationLine: "underline" },
  jurisdictionCard: {
    backgroundColor: Colors.sproutLight,
    borderRadius: BorderRadius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[4],
  },
  jurisdictionTitle: {
    fontFamily: FontFamily.headingBold,
    fontSize: FontSize.base,
    color: Colors.sproutDark,
    marginBottom: Spacing[1],
  },
  sourceUrl: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Colors.muted,
  },
  lastUpdated: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Colors.muted,
    marginTop: 2,
  },
  resultCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[3],
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing[2],
  },
  resultTitle: {
    fontFamily: FontFamily.headingBold,
    fontSize: FontSize.base,
    color: Colors.slateText,
  },
  statusBadge: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[1],
  },
  statusText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs },
  rationale: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.slateText,
    lineHeight: 20,
    marginBottom: Spacing[2],
  },
  detailRow: { flexDirection: "row", gap: Spacing[2] },
  detailLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.sm,
    color: Colors.muted,
  },
  detailValue: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.text,
    flex: 1,
  },
  disclaimer: {
    backgroundColor: Colors.sunLight,
    borderRadius: BorderRadius.md,
    padding: Spacing[4],
    marginTop: Spacing[2],
  },
  disclaimerText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Colors.earth,
    lineHeight: 18,
  },
});

// ── Main Results Screen ──────────────────────────────────────────────────────

export default function ResultsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("itinerary");
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [showStartOver, setShowStartOver] = useState(false);

  const { tripPlan, trip, weather, packingList } = getState();

  // Build activity lookup map
  const activityMap = new Map<string, Activity>();
  (tripPlan?.suggestedActivities || []).forEach((act) =>
    activityMap.set(act.id, act),
  );

  // Load persisted checked items on mount
  useEffect(() => {
    loadCheckedItems().then(setCheckedItems);
  }, []);

  const handleToggleItem = useCallback(async (id: string) => {
    Haptics.selectionAsync();
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      saveCheckedItems(next); // fire-and-forget
      return next;
    });
  }, []);

  // Pull-to-refresh — just refreshes data from store (trip is already loaded)
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    // Small delay for UX feedback
    await new Promise((r) => setTimeout(r, 800));
    setRefreshing(false);
  }, []);

  // Build share text
  const handleShare = useCallback(async () => {
    if (!trip || !tripPlan) return;
    const lines = [
      `🌱 SproutRoute Trip: ${trip.destination}`,
      `📅 ${trip.startDate} → ${trip.endDate}`,
      "",
      tripPlan.overview || "",
      "",
      "✅ Suggested Activities:",
      ...(tripPlan.suggestedActivities || [])
        .slice(0, 5)
        .map((a) => `• ${a.name} (${a.duration})`),
      "",
      "Generated with SproutRoute — AI trip planner for families",
    ];
    try {
      await Share.share({ message: lines.join("\n") });
    } catch {
      // User cancelled — no-op
    }
  }, [trip, tripPlan]);

  // Start over confirmation
  const handleStartOver = useCallback(() => {
    Alert.alert(
      "Start a New Trip?",
      "This will clear your current trip plan.",
      [
        { text: "Keep My Trip", style: "cancel" },
        {
          text: "Start Fresh",
          style: "destructive",
          onPress: async () => {
            await clearAllData();
            resetWizard();
            router.replace("/wizard/destination");
          },
        },
      ],
    );
  }, [router]);

  if (!trip || !tripPlan) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.sproutDark} />
        <Text style={styles.loadingText}>Loading your trip…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Hero header */}
      <View style={styles.hero}>
        <Text style={styles.heroDestination}>{trip.destination}</Text>
        <Text style={styles.heroDates}>
          {formatDisplayDate(trip.startDate)} →{" "}
          {formatDisplayDate(trip.endDate)}
        </Text>
        <View style={styles.heroActions}>
          <TouchableOpacity
            style={styles.heroActionBtn}
            onPress={handleShare}
            activeOpacity={0.7}
          >
            <Text style={styles.heroActionText}>↑ Share</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.heroActionBtnDestructive}
            onPress={handleStartOver}
            activeOpacity={0.7}
          >
            <Text style={styles.heroActionTextDestructive}>✕ New Trip</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {(["itinerary", "packing", "safety"] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => {
              Haptics.selectionAsync();
              setActiveTab(tab);
            }}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab && styles.tabTextActive,
              ]}
            >
              {tab === "itinerary"
                ? "🗓 Itinerary"
                : tab === "packing"
                  ? "🎒 Packing"
                  : "🚗 Safety"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.sproutDark}
            colors={[Colors.sproutDark]}
          />
        }
      >
        {activeTab === "itinerary" ? (
          <View>
            {/* Overview */}
            {tripPlan.overview ? (
              <View style={styles.overviewCard}>
                <Text style={styles.overviewText}>{tripPlan.overview}</Text>
              </View>
            ) : null}

            {/* Weather */}
            <WeatherSummary />

            {/* Activities */}
            <Text style={styles.sectionTitle}>Suggested Activities</Text>
            {(tripPlan.suggestedActivities || []).map((act) => (
              <ActivityCard
                key={act.id}
                activity={act}
                activityMap={activityMap}
              />
            ))}

            {/* Itinerary */}
            {(tripPlan.dailyItinerary || []).length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>Day-by-Day Itinerary</Text>
                {(tripPlan.dailyItinerary || []).map((day, i) => (
                  <ItineraryDayCard
                    key={i}
                    day={day}
                    activityMap={activityMap}
                  />
                ))}
              </>
            ) : null}

            {/* Tips */}
            {(tripPlan.tips || []).length > 0 ? (
              <View style={styles.tipsCard}>
                <Text style={styles.tipsTitle}>💡 Pro Tips</Text>
                {(tripPlan.tips || []).map((tip, i) => (
                  <Text key={i} style={styles.tipItem}>
                    • {tip}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        ) : activeTab === "packing" ? (
          <PackingTab checkedItems={checkedItems} onToggle={handleToggleItem} />
        ) : (
          <SafetyTab />
        )}
      </ScrollView>
    </View>
  );
}

function formatDisplayDate(ymd: string): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing[4],
  },
  loadingText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Colors.muted,
  },
  hero: {
    backgroundColor: Colors.sproutDark,
    paddingHorizontal: Spacing[6],
    paddingTop: Spacing[5],
    paddingBottom: Spacing[4],
  },
  heroDestination: {
    fontFamily: FontFamily.headingBold,
    fontSize: FontSize["2xl"],
    color: Colors.white,
    marginBottom: Spacing[1],
  },
  heroDates: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.sproutLight,
    marginBottom: Spacing[3],
  },
  heroActions: { flexDirection: "row", gap: Spacing[2] },
  heroActionBtn: {
    backgroundColor: Colors.white + "20",
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderWidth: 1,
    borderColor: Colors.white + "40",
  },
  heroActionBtnDestructive: {
    backgroundColor: Colors.white + "10",
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
  },
  heroActionText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.sm,
    color: Colors.white,
  },
  heroActionTextDestructive: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.sproutBase,
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing[3],
    alignItems: "center",
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: Colors.sproutDark,
  },
  tabText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.sm,
    color: Colors.muted,
  },
  tabTextActive: { color: Colors.sproutDark },
  scrollView: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[4],
    paddingBottom: Spacing[10],
  },
  overviewCard: {
    backgroundColor: Colors.sproutLight,
    borderRadius: BorderRadius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[4],
  },
  overviewText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.sproutDark,
    lineHeight: 22,
  },
  sectionTitle: {
    fontFamily: FontFamily.headingBold,
    fontSize: FontSize.lg,
    color: Colors.sproutDark,
    marginBottom: Spacing[3],
    marginTop: Spacing[2],
  },
  tipsCard: {
    backgroundColor: Colors.sunLight,
    borderRadius: BorderRadius.lg,
    padding: Spacing[4],
    marginTop: Spacing[2],
  },
  tipsTitle: {
    fontFamily: FontFamily.headingBold,
    fontSize: FontSize.base,
    color: Colors.earth,
    marginBottom: Spacing[3],
  },
  tipItem: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.slateText,
    lineHeight: 22,
    marginBottom: Spacing[1],
  },
});
