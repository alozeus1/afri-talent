export const MARKET_SALARY_BENCHMARKS = [
  {
    role: "Software Engineer / Developer",
    levels: [
      { level: "Junior", min: 77000, max: 101000, avg: 89000 },
      { level: "Mid-level", min: 101000, max: 132000, avg: 116000 },
      { level: "Senior", min: 132000, max: 168000, avg: 150000 },
      { level: "Lead / Staff", min: 168000, max: 209000, avg: 188000 },
    ],
    note: "Anchored to U.S. BLS software developer percentile wages, then presented as planning bands for global comparison.",
    sourceLabel: "U.S. Bureau of Labor Statistics, OEWS Software Developers",
    sourceUrl: "https://www.bls.gov/oes/2023/May/oes151252.htm",
  },
  {
    role: "Computer Programmer",
    levels: [
      { level: "Junior", min: 52000, max: 76000, avg: 64000 },
      { level: "Mid-level", min: 76000, max: 99000, avg: 88000 },
      { level: "Senior", min: 99000, max: 132000, avg: 116000 },
      { level: "Lead / Staff", min: 132000, max: 162000, avg: 147000 },
    ],
    note: "Based on BLS May 2024 programmer wage distribution and useful for roles closer to implementation and maintenance.",
    sourceLabel: "U.S. Bureau of Labor Statistics, Computer Programmers",
    sourceUrl: "https://www.bls.gov/ooh/computer-and-information-technology/computer-programmers.htm",
  },
  {
    role: "Germany EU Blue Card Tech Roles",
    levels: [
      { level: "Shortage / New entrant", min: 45934, max: 50700, avg: 48300 },
      { level: "General Blue Card floor", min: 50700, max: 65000, avg: 57850 },
      { level: "Senior market check", min: 65000, max: 90000, avg: 77500 },
      { level: "Lead market check", min: 90000, max: 120000, avg: 105000 },
    ],
    note: "Germany's official 2026 Blue Card thresholds are minimum immigration salary floors, not market guarantees.",
    sourceLabel: "Make it in Germany, EU Blue Card 2026 thresholds",
    sourceUrl: "https://www.make-it-in-germany.com/en/visa-residence/skilled-immigration-act",
  },
  {
    role: "Netherlands Highly Skilled Migrant",
    levels: [
      { level: "Reduced criterion", min: 37464, max: 52284, avg: 44874 },
      { level: "Under 30", min: 52284, max: 71304, avg: 61794 },
      { level: "30+ / Blue Card floor", min: 71304, max: 95000, avg: 83152 },
      { level: "Senior market check", min: 95000, max: 130000, avg: 112500 },
    ],
    note: "Annualized from official 2026 monthly gross salary criteria before holiday allowance.",
    sourceLabel: "IND Netherlands, 2026 income requirements",
    sourceUrl: "https://ind.nl/en/required-amounts-income-requirements",
  },
];

export const OFFICIAL_IMMIGRATION_GUIDES = [
  {
    country: "Canada",
    pathway: "Express Entry - Federal Skilled Worker",
    summary: "For skilled workers with foreign work experience who want permanent residence outside Quebec.",
    requirements: [
      "Skilled work experience in TEER 0, 1, 2, or 3 within the last 10 years.",
      "Language test results, education evidence or ECA, proof of funds unless exempt, and admissibility.",
      "Selection factors include age, education, experience, language, arranged employment, and adaptability.",
    ],
    sourceLabel: "Government of Canada",
    sourceUrl: "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/eligibility/federal-skilled-workers.html",
  },
  {
    country: "United Kingdom",
    pathway: "Skilled Worker visa",
    summary: "For workers with an eligible job offer from a Home Office-approved sponsor.",
    requirements: [
      "Confirmed job offer and certificate of sponsorship from an approved UK employer.",
      "Eligible occupation code and salary at least the applicable threshold or going rate.",
      "English language proof, application fee, healthcare surcharge, and required savings unless exempt.",
    ],
    sourceLabel: "GOV.UK",
    sourceUrl: "https://www.gov.uk/skilled-worker-visa",
  },
  {
    country: "Germany",
    pathway: "EU Blue Card / skilled worker routes",
    summary: "For qualified professionals with a German job offer matching their qualification.",
    requirements: [
      "Recognised or comparable qualification, or qualifying IT experience for certain Blue Card routes.",
      "Specific job offer, usually at least six months, matching the qualification.",
      "2026 Blue Card salary floors include EUR 50,700 general and EUR 45,934.20 shortage/new entrant thresholds.",
    ],
    sourceLabel: "Make it in Germany",
    sourceUrl: "https://www.make-it-in-germany.com/en/visa-residence/types/eu-blue-card",
  },
  {
    country: "Netherlands",
    pathway: "Highly skilled migrant",
    summary: "Employer-sponsored residence permit for highly skilled work with a recognised IND sponsor.",
    requirements: [
      "Employment contract with a recognised sponsor in the Netherlands.",
      "Salary must meet IND income criteria and be in line with market rate.",
      "2026 gross monthly criteria include EUR 5,942 for 30+ and EUR 4,357 for under 30.",
    ],
    sourceLabel: "IND Netherlands",
    sourceUrl: "https://ind.nl/en/residence-permits/work/highly-skilled-migrant",
  },
  {
    country: "Australia",
    pathway: "Skilled migration program",
    summary: "Australia uses several skilled visa classes for temporary, provisional, and permanent skilled migration.",
    requirements: [
      "Occupation must appear on an eligible skilled occupation list for the visa subclass.",
      "Some pathways require SkillSelect expression of interest and invitation.",
      "Employer-sponsored and regional pathways have different sponsorship and location rules.",
    ],
    sourceLabel: "Australian Department of Home Affairs",
    sourceUrl: "https://immi.homeaffairs.gov.au/what-we-do/skilled-migration-program",
  },
  {
    country: "New Zealand",
    pathway: "Skilled Migrant Category Resident Visa",
    summary: "Residence pathway for people with skilled work or a skilled job offer from an accredited employer.",
    requirements: [
      "Age 55 or younger, English ability, health, character, and a skilled job/job offer.",
      "Requires 6 skilled resident points from registration, qualification, income, and New Zealand skilled work.",
      "Successful applicants can live, work, and study in New Zealand indefinitely.",
    ],
    sourceLabel: "Immigration New Zealand",
    sourceUrl: "https://www.immigration.govt.nz/new-zealand-visas/visas/visa/skilled-migrant-category-resident-visa",
  },
  {
    country: "United States",
    pathway: "H-1B specialty occupation / O-1 extraordinary ability",
    summary: "Employer-sponsored and high-skill routes used by technology companies for specialty roles.",
    requirements: [
      "H-1B requires a specialty occupation, qualifying degree or equivalent experience, and an employer petition.",
      "O-1 requires evidence of extraordinary ability and a U.S. petitioner or agent.",
      "Candidates should verify employer filings, job duties, wage level, and official USCIS notices.",
    ],
    sourceLabel: "USCIS",
    sourceUrl: "https://www.uscis.gov/working-in-the-united-states",
  },
  {
    country: "Ireland",
    pathway: "Critical Skills Employment Permit",
    summary: "For highly skilled occupations where Ireland has a labor-market shortage, including many technology roles.",
    requirements: [
      "Eligible occupation, qualifying salary, and a job offer normally lasting at least two years.",
      "Employer must be trading in Ireland and satisfy employment-permit rules.",
      "Permit holders may apply for immigration permission and family reunification under Irish rules.",
    ],
    sourceLabel: "Department of Enterprise, Trade and Employment",
    sourceUrl: "https://enterprise.gov.ie/en/what-we-do/workplace-and-skills/employment-permits/permit-types/critical-skills-employment-permit/",
  },
  {
    country: "Portugal",
    pathway: "Job seeker / highly qualified activity routes",
    summary: "Portugal provides routes for job seeking and highly qualified work, with consular and residence-stage requirements.",
    requirements: [
      "Applicants must use the route that matches their work purpose, qualifications, and stay length.",
      "Documentation can include proof of means, accommodation, criminal record checks, and employment evidence.",
      "Candidates should confirm current appointment and residence-card steps with official Portuguese authorities.",
    ],
    sourceLabel: "AIMA Portugal",
    sourceUrl: "https://aima.gov.pt/",
  },
  {
    country: "Spain",
    pathway: "Highly qualified professional / digital nomad routes",
    summary: "Spain supports employer-backed highly qualified roles and remote-work pathways for eligible workers.",
    requirements: [
      "Highly qualified routes generally require a qualifying job and employer documentation.",
      "Remote-work routes require proof of remote activity, professional qualification or experience, and income evidence.",
      "Applicants should verify social security, tax, and consular requirements for their nationality.",
    ],
    sourceLabel: "Spanish Ministry of Inclusion, Social Security and Migration",
    sourceUrl: "https://www.inclusion.gob.es/web/migraciones",
  },
  {
    country: "France",
    pathway: "Talent Passport",
    summary: "Residence permit family for qualified employment, innovative companies, researchers, and other talent categories.",
    requirements: [
      "Applicant must fit one of the Talent Passport categories and provide the matching contract or project evidence.",
      "Salary, qualification, and employer requirements vary by category.",
      "Official visa instructions should be checked before paying agents or third parties.",
    ],
    sourceLabel: "France-Visas",
    sourceUrl: "https://france-visas.gouv.fr/en/web/france-visas/talent-passport",
  },
  {
    country: "Singapore",
    pathway: "Employment Pass / Tech.Pass",
    summary: "Employment Pass supports foreign professionals, while Tech.Pass targets established tech leaders and experts.",
    requirements: [
      "Employment Pass candidates are assessed using salary, qualifications, role, and employer factors.",
      "Tech.Pass has separate criteria for senior tech entrepreneurs, leaders, and experts.",
      "Employers and candidates should use official MOM tools and avoid unofficial guarantee claims.",
    ],
    sourceLabel: "Singapore Ministry of Manpower",
    sourceUrl: "https://www.mom.gov.sg/passes-and-permits",
  },
  {
    country: "United Arab Emirates",
    pathway: "Green Visa / Golden Visa work categories",
    summary: "UAE routes include skilled employee, freelancer, investor, and long-term talent categories.",
    requirements: [
      "Green Visa skilled employee routes require qualifying employment, occupational level, education, and salary evidence.",
      "Freelance routes require permits and professional evidence.",
      "Golden Visa categories have separate nomination and eligibility criteria.",
    ],
    sourceLabel: "The United Arab Emirates Government Portal",
    sourceUrl: "https://u.ae/en/information-and-services/visa-and-emirates-id",
  },
  {
    country: "Rwanda",
    pathway: "Work permit / investor and entrepreneur routes",
    summary: "Rwanda provides permit categories for employment, business, investment, and regional mobility.",
    requirements: [
      "Work permit applicants need the correct permit class and supporting employer or business documents.",
      "Requirements vary by employment, investor, and entrepreneur category.",
      "Applicants should verify the latest requirements with Rwanda Directorate General of Immigration and Emigration.",
    ],
    sourceLabel: "Rwanda Directorate General of Immigration and Emigration",
    sourceUrl: "https://www.migration.gov.rw/",
  },
  {
    country: "South Africa",
    pathway: "Critical Skills Work Visa",
    summary: "For applicants whose skills appear on South Africa's critical skills list and who meet professional requirements.",
    requirements: [
      "Relevant qualifications and professional registration may be required depending on the occupation.",
      "Applicants must follow Department of Home Affairs visa requirements and supporting-document rules.",
      "Candidates should verify whether the role and occupation remain eligible before applying.",
    ],
    sourceLabel: "South African Department of Home Affairs",
    sourceUrl: "https://www.dha.gov.za/index.php/immigration-services/types-of-visas",
  },
];

export const HIRING_RESOURCE_GUIDES = [
  {
    title: "Hiring African Tech Talent: Trust Checklist",
    summary: "A practical checklist for validating role fit without relying on vague profile claims.",
    points: [
      "Ask for work samples tied to the exact role responsibilities.",
      "Use structured scorecards before interviews begin.",
      "Separate identity, skill, and reference checks so one weak signal does not distort the whole decision.",
    ],
  },
  {
    title: "Remote Interview Scorecard",
    summary: "A repeatable structure for comparing candidates across countries and time zones.",
    points: [
      "Score technical depth, communication, async reliability, and problem-solving separately.",
      "Use the same scenario question for every candidate in the same hiring round.",
      "Record evidence, not impressions, after each interview.",
    ],
  },
  {
    title: "Cross-border Offer Readiness",
    summary: "Key checks before making offers to international candidates.",
    points: [
      "Confirm employment model: local entity, EOR, contractor, or relocation sponsorship.",
      "State salary currency, payment cadence, benefits, leave, equipment, and working hours in writing.",
      "Avoid asking candidates to pay recruitment, application, or processing fees.",
    ],
  },
  {
    title: "ATS Workflow For Small Teams",
    summary: "A lightweight operating model for companies without a dedicated recruiting operations team.",
    points: [
      "Define stages: sourced, reviewed, screened, interviewed, offer, rejected.",
      "Keep rejection reasons structured so future search quality improves.",
      "Review stalled candidates weekly and close loops quickly.",
    ],
  },
];
