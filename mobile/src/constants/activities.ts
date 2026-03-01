/**
 * Shared activity definitions used in the wizard picker and results customize sheet.
 */

export interface ActivityOption {
  id: string;
  emoji: string;
  label: string;
  description: string;
  ageMin?: number;
}

export const ALL_ACTIVITIES: ActivityOption[] = [
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

export const CRUISE_ACTIVITIES: ActivityOption[] = [
  { id: "shore excursion", emoji: "🗺", label: "Shore Excursions", description: "Explore ports with guided tours & adventures", ageMin: 0 },
  { id: "sea day", emoji: "🌊", label: "Sea Day Relaxation", description: "Pool, spa & onboard entertainment", ageMin: 0 },
  { id: "onboard entertainment", emoji: "🎭", label: "Onboard Shows", description: "Broadway-style shows, live music & games", ageMin: 0 },
  { id: "port shopping", emoji: "🧸", label: "Port Shopping", description: "Local markets & unique souvenirs", ageMin: 0 },
  { id: "snorkeling", emoji: "🤿", label: "Snorkeling", description: "Crystal-clear water & tropical fish", ageMin: 5 },
];
