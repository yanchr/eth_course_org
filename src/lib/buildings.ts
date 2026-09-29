import type { Campus } from '../types'

export interface BuildingInfo {
  campus: Campus
  /** percent from the left edge of the campus map */
  x: number
  /** percent from the top edge of the campus map */
  y: number
}

/** Positions measured on a 1024px-square reference of the square map images. */
const REF = 1024

type Entry = [code: string, x: number, y: number]

const ZENTRUM: Entry[] = [
  ['HG', 487, 683],
  ['ML', 487, 567],
  ['NO', 441, 489],
  ['NW', 395, 490],
  ['CAB', 539, 506],
  ['CHN', 534, 434],
  ['CNB', 622, 522],
  ['LEE', 381, 524],
  ['LEO', 407, 581],
  ['LEH', 354, 651],
  ['CLA', 441, 597],
  ['CLD', 352, 471],
  ['CLE', 420, 461],
  ['CLF', 417, 448],
  ['CLG', 408, 435],
  ['CLI', 288, 184],
  ['CLT', 392, 471],
  ['CLX', 381, 437],
  ['FHK', 459, 549],
  ['IFW', 278, 309],
  ['RZ', 328, 311],
  ['MM', 409, 744],
  ['GEP', 403, 676],
  ['TAN', 420, 622],
  ['AMA', 322, 507],
  ['HRG', 385, 826],
  ['ETA', 849, 539],
  ['ETF', 776, 577],
  ['ETL', 792, 465],
  ['ETZ', 826, 581],
  ['GLC', 873, 570],
  ['LFG', 538, 554],
  ['LFH', 580, 554],
  ['LFO', 663, 561],
  ['LFV', 627, 570],
  ['LFW', 572, 594],
  ['STW', 690, 516],
  ['STS', 718, 535],
  ['UNH', 497, 404],
  ['UNG', 497, 443],
  ['UNO', 497, 291],
  ['SOH', 446, 419],
  ['SOI', 416, 352],
  ['SOK', 437, 403],
  ['SOL', 393, 338],
  ['SON', 420, 373],
  ['SOP', 428, 388],
  ['SOQ', 460, 443],
  ['SOR', 455, 432],
  ['SOX', 276, 105],
  ['SEC', 311, 72],
  ['NEL', 418, 144],
  ['VOG', 657, 148],
  ['HAD', 693, 226],
  ['HAW', 277, 269],
  ['HAA', 946, 626],
  ['HAC', 961, 600],
  ['HCA', 961, 458],
  ['HCB', 991, 478],
  ['WEV', 240, 174],
  ['WES', 213, 333],
  ['WEH', 241, 382],
  ['WEC', 247, 523],
  ['WPW', 179, 487],
  ['WWA', 38, 83],
  ['STB', 85, 180],
  ['STC', 107, 231],
  ['STD', 183, 298],
  ['STE', 168, 268],
  ['PLB', 858, 941],
  ['ZUE', 850, 988],
]

const HOENGGERBERG: Entry[] = [
  ['HIL', 450, 527],
  ['HIT', 437, 271],
  ['HIF', 320, 419],
  ['HIB', 337, 581],
  ['HIA', 227, 347],
  ['HIN', 280, 570],
  ['HCI', 577, 645],
  ['HCP', 659, 864],
  ['HPH', 697, 592],
  ['HPT', 606, 449],
  ['HPZ', 755, 450],
  ['HPF', 621, 285],
  ['HPM', 691, 259],
  ['HPK', 764, 295],
  ['HPL', 837, 323],
  ['HPP', 864, 481],
  ['HPV', 812, 587],
  ['HPQ', 455, 365],
  ['HPI', 556, 527],
  ['HPR', 737, 534],
  ['HPS', 945, 643],
  ['HPW', 829, 361],
  ['HPY', 837, 402],
  ['HGP', 566, 190],
  ['HKK', 488, 143],
  ['HDB', 481, 170],
  ['HRZ', 633, 98],
  ['HEZ', 725, 29],
  ['HZA', 43, 170],
  ['HZB', 85, 133],
  ['HZC', 77, 104],
  ['HZD', 116, 189],
  ['HXE', 458, 737],
  ['HWA', 392, 855],
  ['HWB', 470, 855],
  ['HWC', 421, 792],
  ['HWW', 290, 798],
]

const round1 = (n: number) => Math.round((n / REF) * 1000) / 10

function build(entries: Entry[], campus: Campus): Record<string, BuildingInfo> {
  return Object.fromEntries(
    entries.map(([code, x, y]) => [code, { campus, x: round1(x), y: round1(y) }]),
  )
}

export const BUILDINGS: Record<string, BuildingInfo> = {
  ...build(ZENTRUM, 'zentrum'),
  ...build(HOENGGERBERG, 'hoenggerberg'),
}

export const CAMPUS_META: Record<Campus, { name: string; short: string; map: string }> = {
  zentrum: { name: 'Campus Zentrum (Poly)', short: 'Zentrum', map: '/maps/poly.png' },
  hoenggerberg: { name: 'Campus Hönggerberg', short: 'Hönggerberg', map: '/maps/hoengg.png' },
}
