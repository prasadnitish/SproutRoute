// Run with an existing AI provider configuration. This synthetic fixture creates no library records.
import { extractCandidates } from "../src/backend/services/socialSave.js";
import { writeFile } from "node:fs/promises";
const expected = [
  "Oceanário de Lisboa",
  "Pavilhão do Conhecimento",
  "Jardim da Estrela",
  "Castelo de São Jorge",
  "Museu Nacional do Azulejo",
  "MAAT",
  "Jardim Botânico da Ajuda",
  "Torre de Belém",
  "Mosteiro dos Jerónimos",
  "Padrão dos Descobrimentos",
  "Pastéis de Belém",
  "Lisbon Zoo",
];
const text =
  "Our family list for Lisbon. Oceanário de Lisboa was our indoor stop. Pavilhão do Conhecimento was the children's favorite. Jardim da Estrela had shade. Castelo de São Jorge was our next stop. We also saved Museu Nacional do Azulejo and MAAT. Jardim Botânico da Ajuda is on our list. We saw Torre de Belém, Mosteiro dos Jerónimos and Padrão dos Descobrimentos.\n[Frame 12s] Pastéis de Belém\n[Audio] My last pick is Lisbon Zoo. The market looked nice too.";
const candidates = await extractCandidates(text);
const found = new Set(candidates.map((row) => row.name));
const correct = expected.filter((name) => found.has(name));
const score = {
  expected: expected.length,
  extracted: candidates.length,
  correct: correct.length,
  missing: expected.filter((name) => !found.has(name)),
  unexpected: [...found].filter((name) => !expected.includes(name)),
};
console.log(JSON.stringify(score));
if (process.argv[2])
  await writeFile(
    process.argv[2],
    JSON.stringify(
      {
        id: "social-family-lisbon",
        synthetic: true,
        text,
        expected,
        candidates,
        score,
        humanReview: {
          attribution: null,
          accessibilityNegation: null,
          correctMapIdentity: null,
        },
      },
      null,
      2,
    ),
  );
if (correct.length !== expected.length || score.unexpected.length)
  process.exitCode = 1;
