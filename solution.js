/**
 * Healthcare API Assessment - Patient Risk Scoring System
 * Author: Gali Anugna
 *
 * Fetches all patients from the DemoMed Healthcare API,
 * calculates risk scores, and submits results.
 */

const API_KEY = "YOUR_API_KEY_HERE"; // Replace with your API key
const BASE_URL = "https://assessment.ksensetech.com/api";

// ─── Utility ────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Fetch All Patients (with retry + pagination) ───────────────────────────

async function getAllPatients() {
  const headers = { "x-api-key": API_KEY };
  let allPatients = [];

  for (let page = 1; page <= 10; page++) {
    console.log(`Fetching page ${page}...`);
    let data = null;

    // Retry up to 20 times per page to handle 429/500/502/503 errors
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        const res = await fetch(
          `${BASE_URL}/patients?page=${page}&limit=5`,
          { headers }
        );
        const json = await res.json();
        if (json && json.data && Array.isArray(json.data) && json.data.length > 0) {
          data = json;
          break;
        }
      } catch (e) {
        // Network error - will retry
      }
      console.log(`  Page ${page} attempt ${attempt + 1} failed, waiting 10s...`);
      await sleep(10000);
    }

    if (!data) {
      console.warn(`  Gave up on page ${page} after 20 attempts`);
      continue;
    }

    allPatients = allPatients.concat(data.data);
    console.log(`  Page ${page} done. Total so far: ${allPatients.length}`);

    if (!data.pagination || !data.pagination.hasNext) break;

    // Wait between pages to avoid rate limiting
    await sleep(6000);
  }

  // Remove duplicates by patient_id
  const seen = new Set();
  const unique = allPatients.filter((p) => {
    if (seen.has(p.patient_id)) return false;
    seen.add(p.patient_id);
    return true;
  });

  console.log(`\nTotal unique patients fetched: ${unique.length}`);
  return unique;
}

// ─── Risk Scoring ────────────────────────────────────────────────────────────

/**
 * Blood Pressure Score
 * Stage 2 (>=140 systolic OR >=90 diastolic): 4 pts
 * Stage 1 (130-139 systolic OR 80-89 diastolic): 3 pts
 * Elevated (120-129 systolic AND <80 diastolic): 2 pts
 * Normal (<120 systolic AND <80 diastolic): 1 pt
 * Invalid/Missing: 0 pts
 */
function scoreBP(bp) {
  if (!bp || typeof bp !== "string" || bp === "undefined") {
    return { score: 0, invalid: true };
  }

  const parts = bp.split("/");
  if (parts.length !== 2) return { score: 0, invalid: true };

  const sys = parseFloat(parts[0]);
  const dia = parseFloat(parts[1]);

  if (
    isNaN(sys) ||
    isNaN(dia) ||
    parts[0].trim() === "" ||
    parts[1].trim() === ""
  ) {
    return { score: 0, invalid: true };
  }

  if (sys >= 140 || dia >= 90) return { score: 4, invalid: false };
  if ((sys >= 130 && sys <= 139) || (dia >= 80 && dia <= 89))
    return { score: 3, invalid: false };
  if (sys >= 120 && sys <= 129 && dia < 80) return { score: 2, invalid: false };
  return { score: 1, invalid: false }; // Normal
}

/**
 * Temperature Score
 * High Fever (>=101.0°F): 2 pts
 * Low Fever (99.6-100.9°F): 1 pt
 * Normal (<=99.5°F): 0 pts
 * Invalid/Missing: 0 pts
 */
function scoreTemp(temp) {
  if (temp === null || temp === undefined || temp === "") {
    return { score: 0, invalid: true };
  }
  const t = parseFloat(temp);
  if (isNaN(t)) return { score: 0, invalid: true };

  if (t >= 101.0) return { score: 2, invalid: false };
  if (t >= 99.6) return { score: 1, invalid: false };
  return { score: 0, invalid: false };
}

/**
 * Age Score
 * Over 65: 2 pts
 * Under 40 OR 40-65: 1 pt
 * Invalid/Missing: 0 pts
 */
function scoreAge(age) {
  if (age === null || age === undefined || age === "") {
    return { score: 0, invalid: true };
  }
  const a = parseFloat(age);
  if (isNaN(a)) return { score: 0, invalid: true };

  if (a > 65) return { score: 2, invalid: false };
  return { score: 1, invalid: false };
}

// ─── Analyze Patients ────────────────────────────────────────────────────────

function analyzePatients(patients) {
  const high_risk_patients = [];
  const fever_patients = [];
  const data_quality_issues = [];

  for (const p of patients) {
    const bp = scoreBP(p.blood_pressure);
    const temp = scoreTemp(p.temperature);
    const age = scoreAge(p.age);
    const totalScore = bp.score + temp.score + age.score;
    const hasIssue = bp.invalid || temp.invalid || age.invalid;

    console.log(
      `${p.patient_id} | BP:${p.blood_pressure} T:${p.temperature} A:${p.age}` +
      ` | Scores: BP=${bp.score} T=${temp.score} A=${age.score} Total=${totalScore}` +
      (hasIssue ? " [DATA ISSUE]" : "")
    );

    // High risk: total score >= 5 (conservative threshold based on testing)
    if (totalScore >= 5) high_risk_patients.push(p.patient_id);

    // Fever: temperature >= 99.6°F and not invalid
    if (!temp.invalid && parseFloat(p.temperature) >= 99.6) {
      fever_patients.push(p.patient_id);
    }

    // Data quality issues: any invalid/missing field
    if (hasIssue) data_quality_issues.push(p.patient_id);
  }

  return { high_risk_patients, fever_patients, data_quality_issues };
}

// ─── Submit Results ──────────────────────────────────────────────────────────

async function submitResults(payload) {
  console.log("\nSubmitting results...");
  console.log("High Risk:", payload.high_risk_patients);
  console.log("Fever:", payload.fever_patients);
  console.log("Data Issues:", payload.data_quality_issues);

  const res = await fetch(`${BASE_URL}/submit-assessment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify(payload),
  });

  const result = await res.json();
  console.log("\n=== SUBMISSION RESULT ===");
  console.log(JSON.stringify(result, null, 2));
  return result;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Starting Healthcare API Assessment...\n");

  const patients = await getAllPatients();
  const results = analyzePatients(patients);

  console.log(`\n=== ANALYSIS COMPLETE ===`);
  console.log(`High Risk Patients (${results.high_risk_patients.length}):`, results.high_risk_patients);
  console.log(`Fever Patients (${results.fever_patients.length}):`, results.fever_patients);
  console.log(`Data Quality Issues (${results.data_quality_issues.length}):`, results.data_quality_issues);

  await submitResults(results);
}

main().catch(console.error);
