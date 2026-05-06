import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const publicPage = (fileName) => readFileSync(
  path.resolve("src/frontend/public", fileName),
  "utf8",
);

test("App Store privacy policy states collection, third parties, retention, and deletion", () => {
  const html = publicPage("privacy.html");

  assert.ok(!html.includes("does not currently use cookies or analytics tracking"));
  assert.ok(!html.includes("We do not store your trip data on our servers."));
  assert.match(html, /parents and guardians/i);
  assert.match(html, /not directed to children/i);
  assert.match(html, /Trip planning content/i);
  assert.match(html, /Third-party services/i);
  assert.match(html, /Data retention/i);
  assert.match(html, /request deletion/i);
  assert.match(html, /privacy-choices\.html/i);
  assert.match(html, /Apple Weather/i);
  assert.match(html, /native iOS app does not include the PostHog SDK/i);
  assert.match(html, /does not send iOS app events to PostHog/i);
});

test("privacy choices page gives App Store user privacy controls and deletion instructions", () => {
  const html = publicPage("privacy-choices.html");

  assert.match(html, /User Privacy Choices/i);
  assert.match(html, /Delete local data on iPhone/i);
  assert.match(html, /Request server-side deletion/i);
  assert.match(html, /California privacy rights/i);
  assert.match(html, /we do not sell/i);
  assert.match(html, /native iOS app currently does not send events to PostHog/i);
});

test("terms and safety disclosures position guidance as informational, not legal advice", () => {
  const terms = publicPage("terms.html");
  const safety = publicPage("safety-disclosures.html");

  assert.match(terms, /parents and guardians/i);
  assert.match(terms, /not legal advice/i);
  assert.match(terms, /local authorities/i);
  assert.match(safety, /human review/i);
  assert.match(safety, /car-seat/i);
  assert.match(safety, /pet travel/i);
  assert.match(safety, /WeatherKit/i);
});

test("support page provides reviewer-visible contact and required public policy links", () => {
  const html = publicPage("support.html");

  assert.match(html, /Support/i);
  assert.match(html, /nitish\.prasad@gmail\.com/i);
  assert.match(html, /privacy\.html/i);
  assert.match(html, /terms\.html/i);
  assert.match(html, /privacy-choices\.html/i);
});

test("iOS settings use public SproutRoute app submission URLs", () => {
  const swift = readFileSync(
    path.resolve("ios/SproutRoute/Features/Settings/SettingsView.swift"),
    "utf8",
  );

  assert.match(swift, /https:\/\/www\.sproutroute\.app\/privacy\.html/);
  assert.match(swift, /https:\/\/www\.sproutroute\.app\/terms\.html/);
  assert.match(swift, /https:\/\/www\.sproutroute\.app\/privacy-choices\.html/);
  assert.match(swift, /https:\/\/www\.sproutroute\.app\/support\.html/);
  assert.ok(!swift.includes("sproutroute-production.up.railway.app/privacy.html"));
});
