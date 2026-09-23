export type Dept = string

export interface DeptStyle {
  label: string
  color: string
  soft: string
}

// Jewel-tone palette assigned to departments in first-seen order. A CSV
// import can bring in any number of GOV.UK owning organisations, not just
// the original 5, so colour is assigned dynamically rather than looked up
// in a fixed table — see buildDeptStyles below.
const PALETTE: Array<{ color: string; soft: string }> = [
  { color: '#3b82f6', soft: '#dbeafe' },
  { color: '#14b8a6', soft: '#ccfbf1' },
  { color: '#8b5cf6', soft: '#ede9fe' },
  { color: '#f59e0b', soft: '#fef3c7' },
  { color: '#f43f5e', soft: '#ffe4e6' },
  { color: '#0ea5e9', soft: '#e0f2fe' },
  { color: '#22c55e', soft: '#dcfce7' },
  { color: '#a855f7', soft: '#f3e8ff' },
  { color: '#eab308', soft: '#fef9c3' },
  { color: '#ec4899', soft: '#fce7f3' },
  { color: '#06b6d4', soft: '#cffafe' },
  { color: '#84cc16', soft: '#ecfccb' },
]

export const FALLBACK_DEPT_STYLE: DeptStyle = {
  label: 'Unknown',
  color: '#64748b',
  soft: '#e2e8f0',
}

// Assigns each distinct department a stable colour from PALETTE, in the
// order departments first appear in `depts` — so the same data always
// colours the same way, and the demo set below keeps its original colours.
// Cycles the palette if there are more departments than colours.
export function buildDeptStyles(depts: Iterable<string>): Record<string, DeptStyle> {
  const styles: Record<string, DeptStyle> = {}
  let i = 0
  for (const dept of depts) {
    if (!dept || styles[dept]) continue
    const { color, soft } = PALETTE[i % PALETTE.length]
    styles[dept] = { label: dept, color, soft }
    i++
  }
  return styles
}

export const ORGANISATIONS = ['GDS', 'HMCTS'] as const
export type Organisation = (typeof ORGANISATIONS)[number]

export const PARTIES = ['Claimant', 'Defendant'] as const
export type Party = (typeof PARTIES)[number]

export interface Service {
  id: string
  name: string
  dept: Dept
  url: string
  summary: string
  position: { x: number; y: number }
  organisation?: Organisation
  party?: Party
}

// World layout composed at 16:9 aspect (x span ~1600, y span ~900) so it feels right
// both on desktop and inside a 16:9 Miro embed. Spread lengthways, tighter vertically.
export const SERVICES: Service[] = [
  { id: 'uc',            name: 'Universal Credit',         dept: 'DWP',             url: 'https://www.gov.uk/universal-credit',                    summary: 'Monthly support for living costs if you’re on a low income or out of work.', position: { x: 250,  y: 230 } },
  { id: 'state-pension', name: 'Check your State Pension', dept: 'DWP',             url: 'https://www.gov.uk/check-state-pension',                summary: 'See how much State Pension you could get, when, and how to increase it.',    position: { x: 120,  y: 505 } },
  { id: 'find-a-job',    name: 'Find a job',               dept: 'DWP',             url: 'https://www.gov.uk/find-a-job',                          summary: 'Search and apply for jobs across the UK.',                                    position: { x: 300,  y: 800 } },

  { id: 'ptax',          name: 'Personal tax account',     dept: 'HMRC',            url: 'https://www.gov.uk/personal-tax-account',               summary: 'Manage your tax records, check your Income Tax, and update HMRC.',            position: { x: 780,  y: 195 } },
  { id: 'marriage',      name: 'Marriage Allowance',       dept: 'HMRC',            url: 'https://www.gov.uk/marriage-allowance',                 summary: 'Transfer part of your Personal Allowance to your spouse or civil partner.',   position: { x: 1020, y: 490 } },
  { id: 'childcare',     name: 'Childcare account',        dept: 'HMRC',            url: 'https://www.gov.uk/sign-in-childcare-account',          summary: 'Manage Tax-Free Childcare and 30 hours free childcare.',                      position: { x: 760,  y: 785 } },

  { id: 'passport',      name: 'Renew adult passport',     dept: 'Passport Office', url: 'https://www.gov.uk/renew-adult-passport',               summary: 'Renew a UK adult passport online or by post.',                                position: { x: 1440, y: 160 } },
  { id: 'lost-passport', name: 'Report a lost passport',   dept: 'Passport Office', url: 'https://www.gov.uk/report-a-lost-or-stolen-passport',   summary: 'Cancel a lost or stolen passport so it can’t be used.',                       position: { x: 1690, y: 435 } },

  { id: 'driving-test',  name: 'Book a driving test',      dept: 'DVLA / DVSA',     url: 'https://www.gov.uk/book-driving-test',                  summary: 'Book a practical driving test for a car.',                                    position: { x: 1480, y: 645 } },
  { id: 'mot',           name: 'Check MOT status',         dept: 'DVLA / DVSA',     url: 'https://www.gov.uk/check-mot-status',                   summary: 'Check the MOT status and history of a vehicle.',                              position: { x: 1720, y: 940 } },

  { id: 'vote',          name: 'Register to vote',         dept: 'Civic',           url: 'https://www.gov.uk/register-to-vote',                   summary: 'Register to vote in UK elections and referendums.',                           position: { x: 1140, y: 905 } },
  { id: 'council-tax',   name: 'Council tax',              dept: 'Civic',           url: 'https://www.gov.uk/council-tax',                        summary: 'Find your local council and pay your Council Tax.',                           position: { x: 640,  y: 1060 } },
]

// WordPress mShots screenshot proxy — free, cached server-side, no key required.
// Returns a placeholder for a few seconds on first hit for an unseen URL, then the real capture.
export function previewSrc(url: string, width = 480): string {
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=${width}`
}

export interface Relationship {
  source: string
  target: string
  label?: string
}

export const RELATIONSHIPS: Relationship[] = [
  { source: 'uc',            target: 'find-a-job',    label: 'work coach' },
  { source: 'uc',            target: 'council-tax',   label: 'support scheme' },
  { source: 'state-pension', target: 'uc',            label: 'income' },
  { source: 'ptax',          target: 'state-pension', label: 'NI record' },
  { source: 'ptax',          target: 'marriage',      label: 'tax code' },
  { source: 'ptax',          target: 'childcare',     label: 'HMRC sign-in' },
  { source: 'passport',      target: 'lost-passport' },
  { source: 'passport',      target: 'vote',          label: 'proof of ID' },
  { source: 'driving-test',  target: 'mot' },
  { source: 'vote',          target: 'council-tax',   label: 'address' },
  { source: 'ptax',          target: 'passport',      label: 'ID checks' },
]
