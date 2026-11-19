// Every fact on the intro page is quoted from the cited source (checked 19 Nov 2026). Never add a number without a source.
export interface Fact {
  stat: string
  text: string
  source: string
  url: string
}

export const FACTS: Fact[] = [
  {
    stat: '39.58%',
    text: "of Assam's land area (31,500 sq km) is flood-prone, per the Rashtriya Barh Ayog assessment.",
    source: 'The Assam Tribune, 15 Sep 2010, citing the NRSC/ASDMA Flood Hazard Atlas for Assam',
    url: 'https://assamtribune.com/3958-pc-of-state-land-area-flood-prone',
  },
  {
    stat: '217,413',
    text: 'people were living in 564 flood relief camps on 26 June 2022, with 2.2 million people affected across 28 districts.',
    source: 'UNICEF India, Assam Floods Situation Report, 27 June 2022',
    url: 'https://www.unicef.org/media/123376/file/India-Assam-Foods-SitRep-27-June-2022.pdf',
  },
  {
    stat: '~70%',
    text: 'of Kaziranga was under water in August 2021, and heavy vehicles were diverted off NH-715 through the North Bank.',
    source: 'The Assam Tribune, 30 Aug 2021',
    url: 'https://assamtribune.com/assam/70-percent-knp-flooded-heavy-vehicles-to-upper-assam-to-be-diverted-through-north-bank-1200771',
  },
]
