/* =========================================================================
   Mock data for the e-wallet replica.
   Everything here is fake. Change BRAND.name to rename the app everywhere.
   ========================================================================= */

const BRAND = {
  name: 'PeraPay',
};

const USER = {
  firstName: 'Corazon',
  fullName: 'Corazon Tiu',
  mobile: '09171234567',
  mpin: '1234',
};

const CONTACTS = [
  { name: 'Maria Santos', mobile: '09181112233' },
  { name: 'Jose Tiu', mobile: '09175556677' },
  { name: 'Ana Reyes', mobile: '09209998877' },
  { name: 'Ben Cruz', mobile: '09950001234' },
];

/* Used to fake a "registered name" for numbers not in contacts. */
const RANDOM_NAMES = ['Juan Dela Cruz', 'Rosa Mendoza', 'Pedro Bautista', 'Liza Garcia', 'Ramon Villanueva'];

/* ---------- Load ---------- */
const NETWORK_PREFIXES = {
  Globe: ['0817', '0905', '0906', '0915', '0916', '0917', '0926', '0927', '0935', '0936', '0937', '0945',
    '0953', '0954', '0955', '0956', '0965', '0966', '0967', '0975', '0976', '0977', '0978', '0979', '0995', '0996', '0997'],
  Smart: ['0813', '0907', '0908', '0909', '0910', '0911', '0912', '0913', '0914', '0918', '0919', '0920', '0921',
    '0928', '0929', '0930', '0938', '0939', '0940', '0946', '0947', '0948', '0949', '0950', '0951', '0961',
    '0963', '0968', '0969', '0970', '0981', '0989', '0998', '0999'],
  DITO: ['0895', '0896', '0897', '0898', '0991', '0992', '0993', '0994'],
};
const NETWORKS = ['Globe', 'Smart', 'TNT', 'TM', 'DITO'];

const REGULAR_LOAD_AMOUNTS = [10, 15, 20, 30, 50, 100, 150, 300, 500, 1000];

const LOAD_PROMOS = {
  data: [
    { id: 'd30', name: 'DATA 30', desc: '1GB data for all sites, valid for 3 days', price: 30 },
    { id: 'd50', name: 'DATA 50', desc: '2GB + 1GB for video apps, valid for 3 days', price: 50 },
    { id: 'd99', name: 'DATA 99', desc: '8GB for all sites, valid for 7 days', price: 99 },
    { id: 'd299', name: 'DATA 299', desc: '24GB + unli texts to all networks, valid for 30 days', price: 299 },
    { id: 'd599', name: 'DATA 599', desc: '48GB + unli calls & texts, valid for 30 days', price: 599 },
  ],
  call: [
    { id: 'c20', name: 'UNLI TEXT 20', desc: 'Unlimited texts to all networks, valid for 1 day', price: 20 },
    { id: 'c30', name: 'CALL & TEXT 30', desc: 'Unli calls & texts to same network, valid for 2 days', price: 30 },
    { id: 'c50', name: 'ALL-NET 50', desc: '60 mins calls + unli texts to all networks, valid for 3 days', price: 50 },
    { id: 'c100', name: 'ALL-NET 100', desc: '150 mins calls + unli texts to all networks, valid for 7 days', price: 100 },
  ],
};

/* ---------- Bills ----------
   len = exact number of digits required for the account number (prototype rule). */
const BILL_CATEGORIES = [
  {
    id: 'electric', name: 'Electricity', icon: 'zap', billers: [
      { id: 'meralco', name: 'Meralco', field: 'Customer Account Number (CAN)', short: 'CAN', len: 10, fee: 0, hint: 'The 10-digit CAN is printed on the upper left of your Meralco bill.' },
      { id: 'dlpc', name: 'Davao Light & Power', field: 'Account Number', len: 10, fee: 0, hint: 'Found on the upper part of your bill.' },
      { id: 'veco', name: 'Visayan Electric (VECO)', field: 'Account Number', len: 10, fee: 0, hint: 'Found on the upper part of your bill.' },
    ],
  },
  {
    id: 'water', name: 'Water', icon: 'droplet', billers: [
      { id: 'maynilad', name: 'Maynilad', field: 'Contract Account Number', len: 8, fee: 0, hint: 'Found on your Maynilad Statement of Account.' },
      { id: 'manilawater', name: 'Manila Water', field: 'Contract Account Number', len: 9, fee: 0, hint: 'Found on your Manila Water bill.' },
    ],
  },
  {
    id: 'internet', name: 'Cable & Internet', icon: 'wifi', billers: [
      { id: 'pldt', name: 'PLDT Home', field: 'Account Number', len: 10, fee: 0, hint: 'Found on the upper right of your bill.' },
      { id: 'converge', name: 'Converge ICT', field: 'Account Number', len: 13, fee: 0, hint: 'Found on your Statement of Account.' },
      { id: 'skycable', name: 'Sky Cable', field: 'Account Number', len: 9, fee: 0, hint: 'Found on your Sky Cable bill.' },
    ],
  },
  {
    id: 'telecom', name: 'Telecoms', icon: 'smartphone', billers: [
      { id: 'globepost', name: 'Globe Postpaid', field: 'Account Number', len: 9, fee: 0, hint: 'Found on your Globe Postpaid bill.' },
      { id: 'smartpost', name: 'Smart Postpaid', field: 'Account Number', len: 10, fee: 0, hint: 'Found on your Smart Postpaid bill.' },
    ],
  },
  {
    id: 'gov', name: 'Government', icon: 'building', billers: [
      { id: 'sss', name: 'SSS Contributions', field: 'Payment Reference Number (PRN)', short: 'PRN', len: 13, fee: 0, hint: 'Generate your PRN from the My.SSS portal before paying.' },
      { id: 'pagibig', name: 'Pag-IBIG Fund', field: 'Membership ID (MID) Number', short: 'MID', len: 12, fee: 10, hint: 'Your 12-digit Pag-IBIG MID number.' },
      { id: 'philhealth', name: 'PhilHealth', field: 'PhilHealth Identification Number (PIN)', short: 'PIN', len: 12, fee: 0, hint: 'Your 12-digit PhilHealth PIN.' },
    ],
  },
  {
    id: 'insurance', name: 'Insurance', icon: 'shield', billers: [
      { id: 'prulife', name: 'Pru Life UK', field: 'Policy Number', len: 8, fee: 0, hint: 'Found on your policy contract.' },
      { id: 'sunlife', name: 'Sun Life', field: 'Policy Number', len: 10, fee: 0, hint: 'Found on your policy contract.' },
    ],
  },
  {
    id: 'cards', name: 'Credit Cards', icon: 'credit-card', billers: [
      { id: 'bdocc', name: 'BDO Credit Card', field: 'Credit Card Number', len: 16, fee: 0, hint: 'The 16-digit number on the front of your card.' },
      { id: 'bpicc', name: 'BPI Credit Card', field: 'Credit Card Number', len: 16, fee: 0, hint: 'The 16-digit number on the front of your card.' },
    ],
  },
  {
    id: 'schools', name: 'Schools', icon: 'graduation', billers: [
      { id: 'admu', name: 'Ateneo de Manila University', field: 'Student ID Number', len: 6, fee: 15, hint: 'Your 6-digit student ID number.' },
    ],
  },
];

const ALL_BILLERS = BILL_CATEGORIES.flatMap(c => c.billers.map(b => ({ ...b, category: c.id })));
const BILLER_BY_ID = Object.fromEntries(ALL_BILLERS.map(b => [b.id, b]));

/* ---------- Banks ----------
   lens = allowed account number lengths. */
const BANKS = [
  { id: 'bdo', name: 'BDO Unibank', lens: [10, 12], popular: true },
  { id: 'bpi', name: 'BPI', lens: [10], popular: true },
  { id: 'metrobank', name: 'Metrobank', lens: [13], popular: true },
  { id: 'landbank', name: 'Land Bank of the Philippines', lens: [10], popular: true },
  { id: 'pnb', name: 'Philippine National Bank (PNB)', lens: [12], popular: true },
  { id: 'unionbank', name: 'UnionBank', lens: [12], popular: true },
  { id: 'chinabank', name: 'China Bank', lens: [10, 12] },
  { id: 'cimb', name: 'CIMB Bank', lens: [14] },
  { id: 'eastwest', name: 'EastWest Bank', lens: [12] },
  { id: 'gotyme', name: 'GoTyme Bank', lens: [12] },
  { id: 'maya', name: 'Maya Bank', lens: [12] },
  { id: 'psbank', name: 'PSBank', lens: [12] },
  { id: 'rcbc', name: 'RCBC', lens: [10] },
  { id: 'seabank', name: 'SeaBank', lens: [12] },
  { id: 'securitybank', name: 'Security Bank', lens: [13] },
];
const BANK_BY_ID = Object.fromEntries(BANKS.map(b => [b.id, b]));
const BANK_FEE = 15;
const BANK_LIMIT = 50000;

/* ---------- Home screen ----------
   Deliberately crowded, like the real app the elderly user struggles with. */
const HOME_SERVICES = [
  { id: 'send', label: 'Send', icon: 'send', to: 'send' },
  { id: 'load', label: 'Load', icon: 'smartphone', to: 'load' },
  { id: 'transfer', label: 'Transfer', icon: 'landmark', to: 'bank' },
  { id: 'bills', label: 'Bills', icon: 'receipt', to: 'bills' },
  { id: 'borrow', label: 'Borrow', icon: 'coins' },
  { id: 'save', label: 'Save', icon: 'wallet' },
  { id: 'invest', label: 'Invest', icon: 'trending-up' },
  { id: 'insure', label: 'Insure', icon: 'shield' },
  { id: 'cards', label: 'Cards', icon: 'credit-card' },
  { id: 'shop', label: 'Shop', icon: 'shopping-bag', badge: 'SALE' },
  { id: 'rewards', label: 'Rewards', icon: 'star', badge: 'NEW' },
  { id: 'movies', label: 'Movies', icon: 'film' },
  { id: 'travel', label: 'Travel', icon: 'plane' },
  { id: 'gifts', label: 'Gift Cards', icon: 'gift' },
  { id: 'donate', label: 'Donate', icon: 'heart' },
  { id: 'all', label: 'View All', icon: 'grid', to: 'services' },
];

const ALL_SERVICES = [
  { title: 'Send & Receive', items: [
    { label: 'Express Send', icon: 'send', to: 'send/form' },
    { label: 'Bank Transfer', icon: 'landmark', to: 'bank' },
    { label: 'Request Money', icon: 'mail' },
    { label: 'Send via QR', icon: 'qr' },
  ] },
  { title: 'Pay', items: [
    { label: 'Pay Bills', icon: 'receipt', to: 'bills' },
    { label: 'Buy Load', icon: 'smartphone', to: 'load' },
    { label: 'Pay QR', icon: 'qr' },
    { label: 'Online Payment', icon: 'shopping-bag' },
  ] },
  { title: 'Borrow', items: [
    { label: 'Credit Line', icon: 'credit-card' },
    { label: 'Cash Loan', icon: 'coins' },
    { label: 'Pay Later', icon: 'history' },
  ] },
  { title: 'Grow', items: [
    { label: 'Savings', icon: 'wallet' },
    { label: 'Funds', icon: 'trending-up' },
    { label: 'Stocks', icon: 'trending-up' },
    { label: 'Crypto', icon: 'coins' },
  ] },
  { title: 'Protect', items: [
    { label: 'Insurance', icon: 'shield' },
    { label: 'Health', icon: 'heart' },
  ] },
  { title: 'More', items: [
    { label: 'Movies', icon: 'film' },
    { label: 'Travel', icon: 'plane' },
    { label: 'Gift Cards', icon: 'gift' },
    { label: 'Donate', icon: 'heart' },
    { label: 'Rewards', icon: 'star' },
    { label: 'Settings', icon: 'sliders' },
  ] },
];

const BANNERS = [
  { title: 'Get 20% cashback', text: 'on your first bills payment this month!', bg: 'linear-gradient(135deg,#ff7a18,#ff3d71)' },
  { title: 'Earn up to 4% p.a.', text: 'Open a savings account in 2 minutes.', bg: 'linear-gradient(135deg,#00b894,#0984e3)' },
  { title: 'Buy now, pay later', text: 'Shop now and pay in 4 easy installments.', bg: 'linear-gradient(135deg,#6c5ce7,#a66efa)' },
];

const INBOX = [
  { id: 'm1', title: 'Security reminder', body: `Never share your MPIN or One-Time PIN (OTP) with anyone. ${BRAND.name} will never call or message you to ask for them.`, time: 'Today', unread: true },
  { id: 'm2', title: 'New device login detected', body: 'Your account was accessed from a new device (Android 14, Chrome). If this was not you, please change your MPIN immediately and contact support.', time: 'Yesterday', unread: true },
  { id: 'm3', title: 'Get 20% cashback on bills!', body: 'Pay any bill worth ₱500 or more this November and get 20% cashback, up to ₱100. Promo runs until Nov 30. DTI Fair Trade Permit No. FTEB-000000 Series of 2026.', time: 'Nov 3', unread: true },
  { id: 'm4', title: 'Payment successful', body: 'You paid ₱1,845.60 to Meralco. Ref. No. 4012 883 192 004.', time: 'Nov 1', unread: false },
];
