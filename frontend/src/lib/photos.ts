// Real photos from Wikimedia Commons, used under their licences (resized for the web). Credit is shown wherever a photo appears.
export interface Photo {
  src: string
  alt: string
  caption: string
  author: string
  license: string
  licenseUrl: string
  page: string
}

export const PHOTOS = {
  aerial: {
    src: '/images/aerial-flood-assam-2012.jpg',
    alt: 'Aerial view of villages and fields under flood water in Assam',
    caption: 'Flood-affected areas of Assam from the air, 2 July 2012',
    author: 'Ministry of Home Affairs, Government of India',
    license: 'GODL-India',
    licenseUrl: 'https://www.data.gov.in/Godl',
    page: 'https://commons.wikimedia.org/wiki/File:An_aerial_view_of_flood-affected_areas_of_Assam_on_July_02,_2012.jpg',
  },
  road: {
    src: '/images/flooded-road-assam.jpg',
    alt: 'A village road in Assam with flood water across it',
    caption: 'A road affected by flood in Assam',
    author: 'KEmel49',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    page: 'https://commons.wikimedia.org/wiki/File:Flood_affected_road.jpg',
  },
  boat: {
    src: '/images/boat-assam-floods-2012.jpg',
    alt: 'People travelling by country boat across flooded land in Assam',
    caption: 'Assam floods, August 2012',
    author: 'EU Civil Protection and Humanitarian Aid',
    license: 'CC BY-SA 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/',
    page: 'https://commons.wikimedia.org/wiki/File:EU_Civil_Protection_and_Humanitarian_Aid,_India_-_Assam_floods,_aug_2012.jpg',
  },
  ferry: {
    src: '/images/majuli-ferry.jpg',
    alt: 'A crowded ferry on the Brahmaputra near Majuli island',
    caption: 'Ferry service connecting Majuli island',
    author: 'Benjakaman',
    license: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    page: 'https://commons.wikimedia.org/wiki/File:Ferry_service_connecting_Majuli_island.jpg',
  },
} satisfies Record<string, Photo>
