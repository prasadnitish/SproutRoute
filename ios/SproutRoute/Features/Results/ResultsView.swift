import SwiftUI

struct ResultsView: View {
    let result: TripStreamResult
    let nativeWeather: NativeWeatherSnapshot?
    let weatherNotice: String?
    var selectedSection: AppTab = .itinerary

    @State private var selectedActivity: ScheduledActivity?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            hero
            sectionContent
        }
        .sheet(item: $selectedActivity) { activity in
            ActivityDetailSheet(activity: activity, destination: result.trip?.destination ?? "")
        }
    }

    @ViewBuilder
    private var sectionContent: some View {
        switch selectedSection {
        case .weather:
            if let weather = result.weather {
                WeatherDetailView(weather: weather, nativeWeather: nativeWeather, notice: weatherNotice)
            } else {
                PendingSection(title: "Weather", systemImage: "cloud.sun", message: "Forecast is still loading.")
            }
        case .itinerary:
            if let plan = result.tripPlan {
                ItinerarySection(plan: plan, destination: result.trip?.destination ?? "") { activity in
                    selectedActivity = activity
                }
            } else {
                PendingSection(title: "Itinerary", systemImage: "list.bullet.rectangle", message: "The itinerary is still being generated.")
            }
        case .packing:
            if let packing = result.packingList {
                PackingSection(packing: packing, tripId: result.requestId ?? result.trip?.id ?? "current-trip")
            } else {
                PendingSection(title: "Packing", systemImage: "backpack", message: "Packing guidance will appear after the first itinerary is ready.")
            }
        case .safety:
            SafetySection(travelSafety: result.travelSafety, carSeat: result.carSeatGuidance, petSafety: result.petSafety)
        }
    }

    private var hero: some View {
        NativeCard {
            VStack(alignment: .leading, spacing: 8) {
                Text(result.trip?.destination ?? "Trip plan")
                    .font(.title2.bold())
                    .foregroundStyle(SproutTheme.primaryText)
                Text(result.tripPlan?.overview ?? "SproutRoute is preparing itinerary, packing, and safety guidance.")
                    .font(.subheadline)
                    .foregroundStyle(SproutTheme.secondaryText)
                HStack {
                    Label(result.trip?.startDate ?? "Start", systemImage: "calendar")
                    Text("to")
                    Text(result.trip?.endDate ?? "End")
                }
                .font(.caption)
                .foregroundStyle(SproutTheme.tertiaryText)
            }
        }
    }
}

struct PendingSection: View {
    let title: String
    let systemImage: String
    let message: String

    var body: some View {
        NativeCard {
            VStack(alignment: .leading, spacing: 10) {
                Label(title, systemImage: systemImage)
                    .font(.headline)
                    .foregroundStyle(SproutTheme.primaryText)
                Text(message)
                    .foregroundStyle(SproutTheme.secondaryText)
            }
        }
    }
}

struct WeatherDetailView: View {
    let weather: WeatherForecast
    let nativeWeather: NativeWeatherSnapshot?
    let notice: String?

    var body: some View {
        NativeCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Label("Weather", systemImage: "cloud.sun")
                        .font(.headline)
                        .foregroundStyle(SproutTheme.primaryText)
                    Spacer()
                    if nativeWeather != nil {
                        Text("Apple Weather")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(SproutTheme.accent)
                    }
                }
                if let notice {
                    Label(notice, systemImage: "exclamationmark.triangle")
                        .font(.caption)
                        .foregroundStyle(SproutTheme.warning)
                }
                Text(nativeWeather?.summary ?? weather.summary ?? "Forecast available")
                    .font(.subheadline)
                    .foregroundStyle(SproutTheme.secondaryText)

                VStack(spacing: 10) {
                    if let nativeWeather, !nativeWeather.days.isEmpty {
                        ForEach(nativeWeather.days) { day in
                            NativeWeatherDayRow(day: day)
                        }
                    } else {
                        ForEach(weather.forecast.prefix(10)) { day in
                            BackendWeatherDayRow(day: day)
                        }
                    }
                }

                if let url = nativeWeather?.attributionURL {
                    Link("Apple Weather attribution", destination: url)
                        .font(.caption)
                }
            }
        }
    }
}

struct NativeWeatherDayRow: View {
    let day: NativeWeatherDay

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(day.date.formatted(.dateTime.weekday(.wide).month(.abbreviated).day()))
                    .font(.subheadline.bold())
                    .foregroundStyle(SproutTheme.primaryText)
                Text(day.condition)
                    .font(.caption)
                    .foregroundStyle(SproutTheme.secondaryText)
            }
            Spacer()
            WeatherMetric(title: "High", value: temp(day.highF))
            WeatherMetric(title: "Low", value: temp(day.lowF))
            WeatherMetric(title: "Rain", value: chance(day.precipitationChance))
        }
        .padding(12)
        .background(SproutTheme.elevatedSurface, in: RoundedRectangle(cornerRadius: SproutTheme.compactRadius, style: .continuous))
    }

    private func temp(_ value: Double?) -> String {
        WeatherValueFormatter.temperature(value)
    }

    private func chance(_ value: Double?) -> String {
        WeatherValueFormatter.percent(value, sourceUsesFraction: true)
    }
}

struct BackendWeatherDayRow: View {
    let day: WeatherPeriod

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(day.name ?? day.date ?? "Day")
                    .font(.subheadline.bold())
                    .foregroundStyle(SproutTheme.primaryText)
                Text(day.condition ?? "Forecast")
                    .font(.caption)
                    .foregroundStyle(SproutTheme.secondaryText)
            }
            Spacer()
            WeatherMetric(title: "High", value: temp(day.high))
            WeatherMetric(title: "Low", value: temp(day.low))
            WeatherMetric(title: "Rain", value: chance(day.precipitation))
        }
        .padding(12)
        .background(SproutTheme.elevatedSurface, in: RoundedRectangle(cornerRadius: SproutTheme.compactRadius, style: .continuous))
    }

    private func temp(_ value: Double?) -> String {
        WeatherValueFormatter.temperature(value)
    }

    private func chance(_ value: Double?) -> String {
        WeatherValueFormatter.percent(value, sourceUsesFraction: false)
    }
}

struct WeatherMetric: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .trailing, spacing: 2) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(SproutTheme.tertiaryText)
            Text(value)
                .font(.subheadline.bold())
                .foregroundStyle(SproutTheme.primaryText)
        }
        .frame(minWidth: 42, alignment: .trailing)
    }
}

struct ItinerarySection: View {
    let plan: TripPlanResult
    let destination: String
    let onActivityTap: (ScheduledActivity) -> Void
    @State private var selectedDayID: String?

    var body: some View {
        let days = ItineraryPresentation.days(for: plan, destination: destination)
        let resolvedDayID = ItineraryDaySelection.resolvedSelection(selectedDayID, in: days)
        let selectedDay = days.first { $0.id == resolvedDayID }

        NativeCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .firstTextBaseline) {
                    Label("Itinerary", systemImage: "list.bullet.rectangle")
                        .font(.headline)
                        .foregroundStyle(SproutTheme.primaryText)
                    Spacer()
                    Text("\(days.count) day\(days.count == 1 ? "" : "s")")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(SproutTheme.tertiaryText)
                }

                ItineraryDayPicker(days: days, selectedDayID: resolvedDayID) { dayID in
                    selectedDayID = dayID
                }

                if let selectedDay {
                    ItineraryDayDetail(
                        day: selectedDay,
                        destination: destination,
                        onActivityTap: onActivityTap
                    )
                } else {
                    Text("The itinerary is still being organized.")
                        .font(.subheadline)
                        .foregroundStyle(SproutTheme.secondaryText)
                }
            }
        }
        .onAppear {
            selectedDayID = ItineraryDaySelection.resolvedSelection(selectedDayID, in: days)
        }
        .onChange(of: days.map(\.id)) { _, _ in
            selectedDayID = ItineraryDaySelection.resolvedSelection(selectedDayID, in: days)
        }
    }
}

struct ItineraryDayPicker: View {
    let days: [ScheduledItineraryDay]
    let selectedDayID: String?
    let onSelect: (String) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Array(days.enumerated()), id: \.element.id) { index, day in
                    Button {
                        onSelect(day.id)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Day \(index + 1)")
                                .font(.caption.weight(.semibold))
                            Text(day.date ?? "Open")
                                .font(.caption2)
                                .lineLimit(1)
                                .minimumScaleFactor(0.78)
                            Text("\(day.scheduled.count) stops")
                                .font(.caption2.weight(.medium))
                        }
                        .foregroundStyle(selectedDayID == day.id ? SproutTheme.primaryText : SproutTheme.secondaryText)
                        .frame(width: 112, alignment: .leading)
                        .padding(.vertical, 10)
                        .padding(.horizontal, 12)
                        .background(
                            selectedDayID == day.id ? SproutTheme.accentSoft : SproutTheme.elevatedSurface,
                            in: RoundedRectangle(cornerRadius: SproutTheme.compactRadius, style: .continuous)
                        )
                        .overlay {
                            RoundedRectangle(cornerRadius: SproutTheme.compactRadius, style: .continuous)
                                .stroke(selectedDayID == day.id ? SproutTheme.accent.opacity(0.45) : SproutTheme.primaryText.opacity(0.07))
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Day \(index + 1)")
                    .accessibilityValue(selectedDayID == day.id ? "Selected" : "\(day.scheduled.count) stops")
                }
            }
        }
    }
}

struct ItineraryDayDetail: View {
    let day: ScheduledItineraryDay
    let destination: String
    let onActivityTap: (ScheduledActivity) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(day.date ?? "Selected day")
                        .font(.subheadline.bold())
                        .foregroundStyle(SproutTheme.primaryText)
                    Text(day.scheduled.compactMap(\.scheduledStart).first ?? "Times ready")
                        .font(.caption)
                        .foregroundStyle(SproutTheme.tertiaryText)
                }
                Spacer()
                if let url = ItineraryPresentation.mapURL(for: day, destination: destination) {
                    Link(destination: url) {
                        Label("Map", systemImage: "map")
                            .labelStyle(.iconOnly)
                            .frame(width: 38, height: 38)
                    }
                    .background(SproutTheme.elevatedSurface, in: Circle())
                    .accessibilityLabel("Open selected day in Apple Maps")
                }
            }

            if let notes = day.notes, !notes.isEmpty {
                Text(notes)
                    .font(.caption)
                    .foregroundStyle(SproutTheme.secondaryText)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(SproutTheme.accentSoft, in: RoundedRectangle(cornerRadius: SproutTheme.compactRadius, style: .continuous))
            }

            LazyVStack(spacing: 10) {
                ForEach(day.scheduled) { activity in
                    ActivityTimelineRow(activity: activity) {
                        onActivityTap(activity)
                    }
                }
            }
        }
    }
}

struct ActivityTimelineRow: View {
    let activity: ScheduledActivity
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(alignment: .top, spacing: 12) {
                VStack(spacing: 4) {
                    Text(activity.scheduledStart ?? "Time")
                        .font(.caption.bold())
                    Text(activity.scheduledEnd ?? "")
                        .font(.caption2)
                }
                .foregroundStyle(activity.isMeal == true ? SproutTheme.accentWarm : SproutTheme.accent)
                .frame(width: 62, alignment: .leading)

                VStack(alignment: .leading, spacing: 5) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(activity.name)
                            .font(.subheadline.bold())
                            .foregroundStyle(SproutTheme.primaryText)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(SproutTheme.tertiaryText)
                    }
                    if let category = activity.category {
                        Text(category.replacingOccurrences(of: "_", with: " ").capitalized)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(SproutTheme.accent)
                    }
                    if let description = activity.description, !description.isEmpty {
                        Text(description)
                            .font(.caption)
                            .foregroundStyle(SproutTheme.secondaryText)
                            .lineLimit(2)
                    }
                    HStack(spacing: 8) {
                        if let rating = activity.enriched?.rating {
                            Label(String(format: "%.1f", rating), systemImage: "star.fill")
                        }
                        if let address = activity.enriched?.address {
                            Label(address, systemImage: "mappin.and.ellipse")
                                .lineLimit(1)
                        } else {
                            Label("Open in Maps", systemImage: "map")
                        }
                    }
                    .font(.caption2)
                    .foregroundStyle(SproutTheme.tertiaryText)
                }
            }
            .padding(12)
            .background(SproutTheme.surface, in: RoundedRectangle(cornerRadius: SproutTheme.compactRadius, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(activity.name)
        .accessibilityHint("Opens activity details and map actions.")
    }
}

struct PlaceEnrichmentDetail: Hashable {
    var address: String?
    var ratingLabel: String?
    var websiteURL: URL?
    var phoneURL: URL?
    var photoURL: URL?
    var hoursSummary: String?
    var openingHours: [String]
}

enum PlaceEnrichmentPresentation {
    static func detail(from response: PlaceEnrichmentResponse) -> PlaceEnrichmentDetail {
        PlaceEnrichmentDetail(
            address: response.address,
            ratingLabel: ratingLabel(rating: response.rating, total: response.userRatingsTotal),
            websiteURL: response.website.flatMap(URL.init(string:)),
            phoneURL: phoneURL(from: response.phone),
            photoURL: response.photoUrl.flatMap(URL.init(string:)),
            hoursSummary: response.openingHours?.first,
            openingHours: response.openingHours ?? []
        )
    }

    private static func ratingLabel(rating: Double?, total: Int?) -> String? {
        guard let rating else { return nil }
        if let total {
            return "\(String(format: "%.1f", rating)) (\(Self.integerFormatter.string(from: NSNumber(value: total)) ?? "\(total)"))"
        }
        return String(format: "%.1f", rating)
    }

    private static func phoneURL(from phone: String?) -> URL? {
        guard let phone else { return nil }
        let allowed = CharacterSet(charactersIn: "+0123456789")
        let normalized = phone.unicodeScalars.filter { allowed.contains($0) }.map(String.init).joined()
        guard !normalized.isEmpty else { return nil }
        return URL(string: "tel:\(normalized)")
    }

    private static let integerFormatter: NumberFormatter = {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter
    }()
}

struct ActivityDetailSheet: View {
    let activity: ScheduledActivity
    let destination: String
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var enrichment: PlaceEnrichmentResponse?
    @State private var isLoadingEnrichment = false
    @State private var enrichmentError: String?
    private let apiClient = SproutAPIClient()

    var body: some View {
        let liveDetail = enrichment.map(PlaceEnrichmentPresentation.detail)
        let cachedRating = activity.enriched?.rating.map { String(format: "%.1f", $0) }
        let ratingLabel = liveDetail?.ratingLabel ?? cachedRating
        let address = liveDetail?.address ?? activity.enriched?.address
        let hoursSummary = liveDetail?.hoursSummary ?? activity.openingHours

        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let photoURL = liveDetail?.photoURL {
                        AsyncImage(url: photoURL) { phase in
                            switch phase {
                            case .success(let image):
                                image
                                    .resizable()
                                    .scaledToFill()
                            case .failure:
                                SproutTheme.elevatedSurface
                            case .empty:
                                ZStack {
                                    SproutTheme.elevatedSurface
                                    ProgressView()
                                }
                            @unknown default:
                                SproutTheme.elevatedSurface
                            }
                        }
                        .frame(height: 190)
                        .frame(maxWidth: .infinity)
                        .clipShape(RoundedRectangle(cornerRadius: SproutTheme.cardRadius, style: .continuous))
                    }

                    Text(activity.name)
                        .font(.title2.bold())
                        .foregroundStyle(SproutTheme.primaryText)

                    if let ratingLabel {
                        Label(ratingLabel, systemImage: "star.fill")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(SproutTheme.accentWarm)
                    }

                    if let description = activity.description {
                        Text(description)
                            .foregroundStyle(SproutTheme.secondaryText)
                    }

                    if let address {
                        Label(address, systemImage: "mappin.and.ellipse")
                            .foregroundStyle(SproutTheme.secondaryText)
                    }

                    if let hours = hoursSummary {
                        Label("Open \(hours)", systemImage: "clock")
                            .foregroundStyle(SproutTheme.secondaryText)
                    }

                    if let openingHours = liveDetail?.openingHours, openingHours.count > 1 {
                        VStack(alignment: .leading, spacing: 4) {
                            ForEach(openingHours, id: \.self) { hours in
                                Text(hours)
                                    .font(.caption)
                                    .foregroundStyle(SproutTheme.secondaryText)
                            }
                        }
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(SproutTheme.elevatedSurface, in: RoundedRectangle(cornerRadius: SproutTheme.compactRadius, style: .continuous))
                    }

                    if let note = activity.note {
                        Text(note)
                            .font(.subheadline)
                            .foregroundStyle(SproutTheme.secondaryText)
                    }
                    if let warning = activity.warning {
                        Label(warning, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(SproutTheme.warning)
                    }

                    if isLoadingEnrichment {
                        Label("Refreshing place details", systemImage: "arrow.clockwise")
                            .font(.caption)
                            .foregroundStyle(SproutTheme.tertiaryText)
                    }

                    if let enrichmentError {
                        Text(enrichmentError)
                            .font(.caption)
                            .foregroundStyle(SproutTheme.tertiaryText)
                    }

                    HStack(spacing: 10) {
                        if let websiteURL = liveDetail?.websiteURL {
                            Link(destination: websiteURL) {
                                Label("Website", systemImage: "safari")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.bordered)
                        }

                        if let phoneURL = liveDetail?.phoneURL {
                            Link(destination: phoneURL) {
                                Label("Call", systemImage: "phone")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.bordered)
                        }
                    }

                    Button {
                        openMaps()
                    } label: {
                        Label("Open in Apple Maps", systemImage: "map")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(SproutTheme.accent)
                }
                .padding()
            }
            .background(SproutTheme.canvas.ignoresSafeArea())
            .navigationTitle("Activity")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
        .task(id: activity.id) {
            await loadEnrichment()
        }
    }

    private func openMaps() {
        guard let url = ItineraryPresentation.mapURL(for: activity, destination: destination) else { return }
        openURL(url)
    }

    private func loadEnrichment() async {
        guard !isLoadingEnrichment else { return }
        isLoadingEnrichment = true
        enrichmentError = nil
        defer { isLoadingEnrichment = false }

        do {
            enrichment = try await apiClient.enrichPlace(
                activityName: activity.name,
                destination: destination,
                category: activity.category
            )
        } catch {
            enrichmentError = "Place details could not be refreshed right now."
        }
    }
}

struct PackingSection: View {
    @Environment(\.modelContext) private var modelContext
    let packing: PackingList
    let tripId: String
    @State private var packedItemIds: Set<String> = []

    var body: some View {
        NativeCard {
            VStack(alignment: .leading, spacing: 12) {
                Label("Packing", systemImage: "backpack")
                    .font(.headline)
                    .foregroundStyle(SproutTheme.primaryText)
                ForEach(packing.categories) { category in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(category.name)
                            .font(.subheadline.bold())
                            .foregroundStyle(SproutTheme.primaryText)
                        ForEach(category.items.prefix(8)) { item in
                            let isPacked = packedItemIds.contains(item.id)
                            Button {
                                toggle(item)
                            } label: {
                                HStack(alignment: .top, spacing: 10) {
                                    Image(systemName: isPacked ? "checkmark.circle.fill" : "circle")
                                        .foregroundStyle(isPacked ? SproutTheme.accent : SproutTheme.secondaryText)
                                        .imageScale(.large)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(item.name)
                                            .strikethrough(isPacked)
                                            .foregroundStyle(isPacked ? SproutTheme.tertiaryText : SproutTheme.primaryText)
                                        if let reason = item.reason {
                                            Text(reason)
                                                .font(.caption)
                                                .foregroundStyle(SproutTheme.secondaryText)
                                        }
                                    }
                                    Spacer(minLength: 0)
                                }
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(item.name)
                            .accessibilityValue(isPacked ? "Packed" : "Not packed")
                            .accessibilityHint("Toggles whether this packing item is packed.")
                            .accessibilityIdentifier("packing-item-\(item.id)")
                        }
                    }
                    Divider()
                }
            }
        }
        .task(id: tripId) {
            packedItemIds = (try? TripRepository(modelContext: modelContext).packedItemIds(forTripId: tripId)) ?? []
        }
    }

    private func toggle(_ item: PackingItem) {
        let nextValue = !packedItemIds.contains(item.id)
        do {
            try TripRepository(modelContext: modelContext).setPackingItem(item.id, packed: nextValue, forTripId: tripId)
            if nextValue {
                packedItemIds.insert(item.id)
            } else {
                packedItemIds.remove(item.id)
            }
        } catch {
            // Local packing state should not block reading the generated checklist.
        }
    }
}

struct SafetySection: View {
    let travelSafety: TravelSafetyResponse?
    let carSeat: CarSeatGuidance?
    let petSafety: PetTravelResponse?

    var body: some View {
        NativeCard {
            VStack(alignment: .leading, spacing: 12) {
                Label("Safety", systemImage: "shield.checkered")
                    .font(.headline)
                    .foregroundStyle(SproutTheme.primaryText)
                Text("Guidance is informational and should be reviewed against official sources before travel.")
                    .font(.caption)
                    .foregroundStyle(SproutTheme.warning)
                if let travelSafety {
                    Text(travelSafety.familyTips?.first ?? travelSafety.waterSafety ?? "Travel safety guidance is available.")
                        .font(.subheadline)
                        .foregroundStyle(SproutTheme.primaryText)
                }
                if let carSeat {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(carSeat.jurisdictionName ?? "Car seat guidance")
                            .font(.subheadline.bold())
                            .foregroundStyle(SproutTheme.primaryText)
                        Text(carSeat.message ?? carSeat.results.first?.rationale ?? "Review child passenger guidance.")
                            .font(.caption)
                            .foregroundStyle(SproutTheme.secondaryText)
                    }
                }
                if let petSafety {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Pet travel")
                            .font(.subheadline.bold())
                            .foregroundStyle(SproutTheme.primaryText)
                        Text(petSafety.recommendation ?? petSafety.driveTips?.first ?? "Pet travel guidance is available.")
                            .font(.caption)
                            .foregroundStyle(SproutTheme.secondaryText)
                    }
                }
            }
        }
    }
}
