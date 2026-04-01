# Healthcare API Assessment — Patient Risk Scoring

A solution for the DemoMed Healthcare API assessment that fetches patient data, calculates risk scores, and identifies high-risk patients, fever cases, and data quality issues.

## How It Works

### 1. Data Fetching
- Fetches all ~50 patients across 10 paginated pages
- Handles real-world API issues:
  - Rate limiting (429): Retries with 10s delay
  - Server errors (500/502/503): Up to 20 retries per page
  - Duplicate records: Deduplicates by patient_id
- Waits 6 seconds between pages to avoid rate limits

### 2. Risk Scoring

| Field | Scoring |
|---|---|
| BP Stage 2 (>=140 or >=90) | 4 pts |
| BP Stage 1 (130-139 or 80-89) | 3 pts |
| BP Elevated (120-129 and <80) | 2 pts |
| BP Normal (<120 and <80) | 1 pt |
| High Fever (>=101°F) | 2 pts |
| Low Fever (99.6-100.9°F) | 1 pt |
| Age >65 | 2 pts |
| Age <=65 | 1 pt |

### 3. Output Categories
- High Risk Patients: Total score >= 5
- Fever Patients: Temperature >= 99.6°F
- Data Quality Issues: Any invalid or missing BP, temperature, or age

## Results
- Fever Patients: Perfect score (9/9)
- Data Quality Issues: Perfect score (8/8)
- High Risk Patients: 20/20 correct
