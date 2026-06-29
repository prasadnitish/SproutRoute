import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sharedTypesRoot = new URL("../../src/shared/types/", import.meta.url);

async function readSharedTypeFile(fileName) {
  return readFile(new URL(fileName, sharedTypesRoot), "utf8");
}

test("shared contracts export the Trip Hub API surface", async () => {
  const apiSource = await readSharedTypeFile("api.ts");
  const groupTripSource = await readSharedTypeFile("groupTrip.ts");
  const indexSource = await readSharedTypeFile("index.ts");

  const requiredTypes = [
    "GroupTripCreateRequest",
    "GroupTripJoinRequest",
    "GroupTripItemCreateRequest",
    "GroupTripItemUpdateRequest",
    "GroupTripItemsImportTextRequest",
    "GroupTripDecisionCreateRequest",
    "GroupTripDecisionVoteRequest",
    "GroupTripExpenseCreateRequest",
    "GroupTripLocationSharingRequest",
    "GroupTripWorkspaceResponse",
    "GroupTripSnapshotResponse",
    "GroupTripItemResponse",
    "GroupTripItemsImportTextResponse",
    "GroupTripDecisionResponse",
    "GroupTripExpenseResponse",
    "GroupTripLocationSharingResponse",
  ];

  for (const typeName of requiredTypes) {
    assert.match(
      groupTripSource,
      new RegExp(`export interface ${typeName}\\b`),
      `${typeName} must be declared in src/shared/types/groupTrip.ts`,
    );
    assert.match(
      indexSource,
      new RegExp(`\\b${typeName}\\b`),
      `${typeName} must be exported from src/shared/types/index.ts`,
    );
  }

  assert.match(
    groupTripSource,
    /actorParticipantAccessToken/,
    "mutating Trip Hub request contracts must include the participant access token",
  );
  assert.match(
    groupTripSource,
    /locationSharingEnabled/,
    "participant contracts must expose the opt-in location sharing state",
  );
  assert.match(
    groupTripSource,
    /assignedParticipantIds/,
    "Trip Hub item contracts must expose participant tags",
  );
  assert.match(
    apiSource,
    /"dependency"/,
    "ApiError category union must include dependency failures returned by Trip Hub storage",
  );
  assert.match(
    apiSource,
    /"authentication"/,
    "ApiError category union must include auth failures returned by Trip Hub participant tokens",
  );
  assert.match(
    apiSource,
    /"not_found"/,
    "ApiError category union must include not-found failures returned by Trip Hub invite and trip lookups",
  );
});

test("shared capabilities contract matches the advertised feature flags and safety modes", async () => {
  const apiSource = await readSharedTypeFile("api.ts");

  assert.match(
    apiSource,
    /"eu_baseline"/,
    "GuidanceMode must include the EU baseline safety mode advertised by /api/v1/meta/capabilities",
  );
  assert.match(
    apiSource,
    /internationalSupport\??:\s*boolean/,
    "FeatureFlags must include the internationalSupport flag advertised by /api/v1/meta/capabilities",
  );
});
