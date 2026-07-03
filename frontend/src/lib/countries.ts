// Canonical country list for profile/job forms — replaces free-text country
// inputs so downstream matching (eligibleCountries, targetCountries) stays
// clean. African countries listed first for quicker selection.

export const AFRICAN_COUNTRY_NAMES = [
  "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi",
  "Cabo Verde", "Cameroon", "Central African Republic", "Chad", "Comoros",
  "Congo (Brazzaville)", "Congo (DRC)", "Côte d'Ivoire", "Djibouti", "Egypt",
  "Equatorial Guinea", "Eritrea", "Eswatini", "Ethiopia", "Gabon", "Gambia",
  "Ghana", "Guinea", "Guinea-Bissau", "Kenya", "Lesotho", "Liberia", "Libya",
  "Madagascar", "Malawi", "Mali", "Mauritania", "Mauritius", "Morocco",
  "Mozambique", "Namibia", "Niger", "Nigeria", "Rwanda",
  "São Tomé and Príncipe", "Senegal", "Seychelles", "Sierra Leone", "Somalia",
  "South Africa", "South Sudan", "Sudan", "Tanzania", "Togo", "Tunisia",
  "Uganda", "Zambia", "Zimbabwe",
];

export const OTHER_COUNTRY_NAMES = [
  "Argentina", "Australia", "Austria", "Bangladesh", "Belgium", "Brazil",
  "Bulgaria", "Canada", "Chile", "China", "Colombia", "Croatia", "Cyprus",
  "Czechia", "Denmark", "Estonia", "Finland", "France", "Georgia", "Germany",
  "Greece", "Hungary", "Iceland", "India", "Indonesia", "Ireland", "Israel",
  "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kuwait", "Latvia",
  "Lebanon", "Lithuania", "Luxembourg", "Malaysia", "Malta", "Mexico",
  "Netherlands", "New Zealand", "Norway", "Oman", "Pakistan", "Panama",
  "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania",
  "Saudi Arabia", "Serbia", "Singapore", "Slovakia", "Slovenia",
  "South Korea", "Spain", "Sri Lanka", "Sweden", "Switzerland", "Thailand",
  "Turkey", "Ukraine", "United Arab Emirates", "United Kingdom",
  "United States", "Uruguay", "Vietnam",
];

export const ALL_COUNTRY_NAMES = [...AFRICAN_COUNTRY_NAMES, ...OTHER_COUNTRY_NAMES];

/** "Remote worldwide" pseudo-option used by target-country pickers. */
export const WORLDWIDE_OPTION = "Worldwide (remote)";
