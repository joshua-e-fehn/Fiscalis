// ═══════════════════════════════════════════════════════════════
// ISO Country Code Mapping (ISO3 → ISO2)
// World Bank uses ISO3, GeoJSON uses ISO2
// ═══════════════════════════════════════════════════════════════

export const ISO3_TO_ISO2: Record<string, string> = {
  AFG: "AF", // Afghanistan
  ALB: "AL", // Albania
  DZA: "DZ", // Algeria
  ASM: "AS", // American Samoa
  AND: "AD", // Andorra
  AGO: "AO", // Angola
  ATG: "AG", // Antigua and Barbuda
  ARG: "AR", // Argentina
  ARM: "AM", // Armenia
  ABW: "AW", // Aruba
  AUS: "AU", // Australia
  AUT: "AT", // Austria
  AZE: "AZ", // Azerbaijan
  BHS: "BS", // Bahamas
  BHR: "BH", // Bahrain
  BGD: "BD", // Bangladesh
  BRB: "BB", // Barbados
  BLR: "BY", // Belarus
  BEL: "BE", // Belgium
  BLZ: "BZ", // Belize
  BEN: "BJ", // Benin
  BMU: "BM", // Bermuda
  BTN: "BT", // Bhutan
  BOL: "BO", // Bolivia
  BIH: "BA", // Bosnia and Herzegovina
  BWA: "BW", // Botswana
  BRA: "BR", // Brazil
  BRN: "BN", // Brunei
  BGR: "BG", // Bulgaria
  BFA: "BF", // Burkina Faso
  BDI: "BI", // Burundi
  CPV: "CV", // Cabo Verde
  KHM: "KH", // Cambodia
  CMR: "CM", // Cameroon
  CAN: "CA", // Canada
  CYM: "KY", // Cayman Islands
  CAF: "CF", // Central African Republic
  TCD: "TD", // Chad
  CHL: "CL", // Chile
  CHN: "CN", // China
  COL: "CO", // Colombia
  COM: "KM", // Comoros
  COG: "CG", // Congo
  COD: "CD", // Democratic Republic of Congo
  CRI: "CR", // Costa Rica
  CIV: "CI", // Côte d'Ivoire
  HRV: "HR", // Croatia
  CUB: "CU", // Cuba
  CUW: "CW", // Curaçao
  CYP: "CY", // Cyprus
  CZE: "CZ", // Czech Republic
  DNK: "DK", // Denmark
  DJI: "DJ", // Djibouti
  DMA: "DM", // Dominica
  DOM: "DO", // Dominican Republic
  ECU: "EC", // Ecuador
  EGY: "EG", // Egypt
  SLV: "SV", // El Salvador
  GNQ: "GQ", // Equatorial Guinea
  ERI: "ER", // Eritrea
  EST: "EE", // Estonia
  SWZ: "SZ", // Eswatini
  ETH: "ET", // Ethiopia
  FRO: "FO", // Faroe Islands
  FJI: "FJ", // Fiji
  FIN: "FI", // Finland
  FRA: "FR", // France
  PYF: "PF", // French Polynesia
  GAB: "GA", // Gabon
  GMB: "GM", // Gambia
  GEO: "GE", // Georgia
  DEU: "DE", // Germany
  GHA: "GH", // Ghana
  GIB: "GI", // Gibraltar
  GRC: "GR", // Greece
  GRL: "GL", // Greenland
  GRD: "GD", // Grenada
  GUM: "GU", // Guam
  GTM: "GT", // Guatemala
  GIN: "GN", // Guinea
  GNB: "GW", // Guinea-Bissau
  GUY: "GY", // Guyana
  HTI: "HT", // Haiti
  HND: "HN", // Honduras
  HKG: "HK", // Hong Kong
  HUN: "HU", // Hungary
  ISL: "IS", // Iceland
  IND: "IN", // India
  IDN: "ID", // Indonesia
  IRN: "IR", // Iran
  IRQ: "IQ", // Iraq
  IRL: "IE", // Ireland
  IMN: "IM", // Isle of Man
  ISR: "IL", // Israel
  ITA: "IT", // Italy
  JAM: "JM", // Jamaica
  JPN: "JP", // Japan
  JOR: "JO", // Jordan
  KAZ: "KZ", // Kazakhstan
  KEN: "KE", // Kenya
  KIR: "KI", // Kiribati
  PRK: "KP", // North Korea
  KOR: "KR", // South Korea
  XKX: "XK", // Kosovo
  KWT: "KW", // Kuwait
  KGZ: "KG", // Kyrgyzstan
  LAO: "LA", // Laos
  LVA: "LV", // Latvia
  LBN: "LB", // Lebanon
  LSO: "LS", // Lesotho
  LBR: "LR", // Liberia
  LBY: "LY", // Libya
  LIE: "LI", // Liechtenstein
  LTU: "LT", // Lithuania
  LUX: "LU", // Luxembourg
  MAC: "MO", // Macao
  MDG: "MG", // Madagascar
  MWI: "MW", // Malawi
  MYS: "MY", // Malaysia
  MDV: "MV", // Maldives
  MLI: "ML", // Mali
  MLT: "MT", // Malta
  MHL: "MH", // Marshall Islands
  MRT: "MR", // Mauritania
  MUS: "MU", // Mauritius
  MEX: "MX", // Mexico
  FSM: "FM", // Micronesia
  MDA: "MD", // Moldova
  MCO: "MC", // Monaco
  MNG: "MN", // Mongolia
  MNE: "ME", // Montenegro
  MAR: "MA", // Morocco
  MOZ: "MZ", // Mozambique
  MMR: "MM", // Myanmar
  NAM: "NA", // Namibia
  NRU: "NR", // Nauru
  NPL: "NP", // Nepal
  NLD: "NL", // Netherlands
  NCL: "NC", // New Caledonia
  NZL: "NZ", // New Zealand
  NIC: "NI", // Nicaragua
  NER: "NE", // Niger
  NGA: "NG", // Nigeria
  MKD: "MK", // North Macedonia
  MNP: "MP", // Northern Mariana Islands
  NOR: "NO", // Norway
  OMN: "OM", // Oman
  PAK: "PK", // Pakistan
  PLW: "PW", // Palau
  PSE: "PS", // Palestine
  PAN: "PA", // Panama
  PNG: "PG", // Papua New Guinea
  PRY: "PY", // Paraguay
  PER: "PE", // Peru
  PHL: "PH", // Philippines
  POL: "PL", // Poland
  PRT: "PT", // Portugal
  PRI: "PR", // Puerto Rico
  QAT: "QA", // Qatar
  ROU: "RO", // Romania
  RUS: "RU", // Russia
  RWA: "RW", // Rwanda
  KNA: "KN", // Saint Kitts and Nevis
  LCA: "LC", // Saint Lucia
  MAF: "MF", // Saint Martin
  VCT: "VC", // Saint Vincent and the Grenadines
  WSM: "WS", // Samoa
  SMR: "SM", // San Marino
  STP: "ST", // São Tomé and Príncipe
  SAU: "SA", // Saudi Arabia
  SEN: "SN", // Senegal
  SRB: "RS", // Serbia
  SYC: "SC", // Seychelles
  SLE: "SL", // Sierra Leone
  SGP: "SG", // Singapore
  SXM: "SX", // Sint Maarten
  SVK: "SK", // Slovakia
  SVN: "SI", // Slovenia
  SLB: "SB", // Solomon Islands
  SOM: "SO", // Somalia
  ZAF: "ZA", // South Africa
  SSD: "SS", // South Sudan
  ESP: "ES", // Spain
  LKA: "LK", // Sri Lanka
  SDN: "SD", // Sudan
  SUR: "SR", // Suriname
  SWE: "SE", // Sweden
  CHE: "CH", // Switzerland
  SYR: "SY", // Syria
  TWN: "TW", // Taiwan
  TJK: "TJ", // Tajikistan
  TZA: "TZ", // Tanzania
  THA: "TH", // Thailand
  TLS: "TL", // Timor-Leste
  TGO: "TG", // Togo
  TON: "TO", // Tonga
  TTO: "TT", // Trinidad and Tobago
  TUN: "TN", // Tunisia
  TUR: "TR", // Turkey
  TKM: "TM", // Turkmenistan
  TCA: "TC", // Turks and Caicos Islands
  TUV: "TV", // Tuvalu
  UGA: "UG", // Uganda
  UKR: "UA", // Ukraine
  ARE: "AE", // United Arab Emirates
  GBR: "GB", // United Kingdom
  USA: "US", // United States
  URY: "UY", // Uruguay
  UZB: "UZ", // Uzbekistan
  VUT: "VU", // Vanuatu
  VEN: "VE", // Venezuela
  VNM: "VN", // Vietnam
  VGB: "VG", // British Virgin Islands
  VIR: "VI", // U.S. Virgin Islands
  YEM: "YE", // Yemen
  ZMB: "ZM", // Zambia
  ZWE: "ZW", // Zimbabwe
};
