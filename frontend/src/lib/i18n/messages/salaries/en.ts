// Source of truth for the "salaries" namespace. Add keys here first; every
// other locale file must then define the same keys (enforced by tsc and
// src/lib/i18n/__tests__/namespaces.test.ts).
export default {
  "salaries.title": "Know Your Worth",
  "salaries.subtitle": "Explore anonymous salary data from African professionals working globally.",
  "salaries.practicalSubtitle": "Explore anonymous salary data where available, plus clearly labeled market guidance for global roles.",
  "salaries.searchSalaries": "Search Salaries",
  "salaries.compareCountries": "Compare Across Countries",
  "salaries.compareDesc": "Select a job title to see average salaries across different countries",
  "salaries.distributionByLevel": "Salary Distribution by Level",
  "salaries.distributionDesc": "Sample compensation bands for education only. Not verified AfriTalent salary reports.",
  "salaries.topPayingRoles": "Top Paying Roles",
  "salaries.topPayingDesc": "Live community salary reports when available.",
  "salaries.submitSalary": "Submit Your Salary",
  "salaries.submitButton": "Submit Salary",
  "salaries.searchButton": "Search",
  "salaries.compareButton": "Compare",
  "salaries.allCountries": "All Countries",
  "salaries.noReportsFound": "No salary reports found for this search. Be the first to contribute!",
  "salaries.noCompareData": "No comparison data available for this job title.",
  "salaries.noVerifiedReports": "No verified community salary reports yet",
  "salaries.noVerifiedDesc": "AfriTalent will show live top-paying roles after enough real salary submissions exist.",
  "salaries.jobTitlePlaceholder": "Job title (e.g. Software Engineer)",
  "salaries.compareJobTitle": "Job title (e.g. Data Scientist)",
} satisfies Record<string, string>;
