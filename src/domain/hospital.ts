import { CORRIDOR_NODES, SLOTS, type SlotName } from './floorPlate';
import type { FloorId, Localized, Place } from './types';
import { FLOORS } from './types';

/**
 * The demo hospital. Every name, hour and room here is fictional: replace this
 * file with a real hospital's data (see docs/ARCHITECTURE.md, "Adding a hospital").
 */
export const HOSPITAL_NAME: Localized = { ar: 'مستشفى الواحة', en: 'Al Waha Hospital' };

export const DEFAULT_START_ID = '0-entrance';

const H24: Localized = { ar: '24 ساعة', en: 'Open 24 hours' };
const CLINIC_HOURS: Localized = { ar: '8 الصبح – 4 العصر', en: '8 am – 4 pm' };
const LAB_HOURS: Localized = { ar: '7 الصبح – 9 الليل', en: '7 am – 9 pm' };
const VISIT_HOURS: Localized = { ar: 'الزيارة 4 العصر – 9 الليل', en: 'Visiting 4 pm – 9 pm' };

type RoomSpec = Omit<Place, 'id' | 'floor' | 'rect' | 'node'>;

function room(floor: FloorId, slot: SlotName, key: string, spec: RoomSpec): Place {
  const { rect, node } = SLOTS[slot];
  return { id: `${floor}-${key}`, floor, rect, node, ...spec };
}

const RESTROOM_WORDS = ['حمام', 'حمامات', 'دورة مياه', 'تواليت', 'wc', 'toilet', 'bathroom'];
const PRAYER_WORDS = ['مسجد', 'صلاة', 'مصلى', 'mosque', 'pray'];

/** Rooms that repeat on every floor: stairs, lifts and the corridor exits. */
function core(floor: FloorId): Place[] {
  return [
    room(floor, 'W2', 'stairs', {
      name: { ar: 'الدرج', en: 'Stairs' },
      category: 'core',
      icon: 'stairs',
    }),
    room(floor, 'E2', 'lifts', {
      name: { ar: 'المصاعد', en: 'Lifts' },
      category: 'core',
      icon: 'lift',
      keywords: ['اصنصير', 'مصعد', 'elevator'],
    }),
    {
      id: `${floor}-exit-west`,
      floor,
      name: { ar: 'مخرج طوارئ غربي', en: 'West emergency exit' },
      category: 'exit',
      icon: 'exit',
      node: 'exitWest',
      point: CORRIDOR_NODES.exitWest,
      amenities: ['exit'],
    },
    {
      id: `${floor}-exit-east`,
      floor,
      name: { ar: 'مخرج طوارئ شرقي', en: 'East emergency exit' },
      category: 'exit',
      icon: 'exit',
      node: 'exitEast',
      point: CORRIDOR_NODES.exitEast,
      amenities: ['exit'],
    },
  ];
}

/** The same restroom, prayer room and nurses' station sit in one place on floors 1–4. */
function upperCommon(floor: FloorId): Place[] {
  return [
    room(floor, 'E3', 'restrooms', {
      name: { ar: 'دورات المياه', en: 'Restrooms' },
      category: 'facility',
      icon: 'restroom',
      amenities: ['restroom'],
      keywords: RESTROOM_WORDS,
    }),
    room(floor, 'W4', 'prayer', {
      name: { ar: 'المصلى', en: 'Prayer room' },
      category: 'facility',
      icon: 'prayer',
      amenities: ['prayer'],
      keywords: PRAYER_WORDS,
    }),
    room(floor, 'E4', 'nurses', {
      name: { ar: 'محطة التمريض', en: 'Nurses station' },
      short: { ar: 'التمريض', en: 'Nurses' },
      category: 'service',
      icon: 'nurse',
      keywords: ['ممرضة', 'ممرض', 'nurse'],
    }),
  ];
}

const ground: Place[] = [
  {
    id: DEFAULT_START_ID,
    floor: 0,
    name: { ar: 'البوابة الرئيسية', en: 'Main entrance' },
    category: 'entrance',
    icon: 'door',
    node: 'entrance',
    point: CORRIDOR_NODES.entrance,
    amenities: ['exit'],
    keywords: ['مدخل', 'باب', 'بوابة', 'entrance', 'door'],
  },
  room(0, 'NW1', 'cafeteria', {
    name: { ar: 'المقهى', en: 'Cafeteria' },
    category: 'facility',
    icon: 'cafe',
    hours: { ar: '6 الصبح – 11 الليل', en: '6 am – 11 pm' },
    amenities: ['water', 'seating'],
    keywords: ['قهوة', 'كوفي', 'اكل', 'مطعم', 'كافتيريا', 'coffee', 'food'],
  }),
  room(0, 'NW2', 'prayer', {
    name: { ar: 'المصلى', en: 'Prayer room' },
    category: 'facility',
    icon: 'prayer',
    amenities: ['prayer'],
    keywords: PRAYER_WORDS,
  }),
  room(0, 'NE', 'pharmacy', {
    name: { ar: 'الصيدلية', en: 'Pharmacy' },
    category: 'service',
    icon: 'pill',
    hours: H24,
    keywords: ['دواء', 'ادويه', 'علاج', 'وصفة', 'medicine', 'drugs'],
  }),
  room(0, 'W1', 'waiting', {
    name: { ar: 'منطقة الانتظار', en: 'Waiting area' },
    short: { ar: 'الانتظار', en: 'Waiting' },
    category: 'facility',
    icon: 'seat',
    amenities: ['seating', 'water'],
    keywords: ['انتظار', 'كراسي', 'جلوس', 'wait', 'seats'],
  }),
  room(0, 'E1', 'restrooms', {
    name: { ar: 'دورات المياه', en: 'Restrooms' },
    category: 'facility',
    icon: 'restroom',
    amenities: ['restroom'],
    keywords: RESTROOM_WORDS,
  }),
  room(0, 'W3', 'registration', {
    name: { ar: 'التسجيل والمواعيد', en: 'Registration & appointments' },
    short: { ar: 'التسجيل', en: 'Registration' },
    category: 'service',
    icon: 'clipboard',
    hours: { ar: '7:30 الصبح – 4 العصر', en: '7:30 am – 4 pm' },
    keywords: ['موعد', 'مواعيد', 'ملف', 'فتح ملف', 'appointment', 'file'],
  }),
  room(0, 'E3', 'emergency', {
    name: { ar: 'الطوارئ', en: 'Emergency' },
    category: 'emergency',
    icon: 'emergency',
    hours: H24,
    keywords: ['اسعاف', 'طوارى', 'er', 'urgent', 'ambulance'],
  }),
  room(0, 'W4', 'reception', {
    name: { ar: 'الاستقبال والاستعلامات', en: 'Reception & information' },
    short: { ar: 'الاستقبال', en: 'Reception' },
    category: 'service',
    icon: 'reception',
    hours: H24,
    keywords: ['استعلامات', 'سؤال', 'مساعدة', 'help', 'info'],
  }),
  room(0, 'E4', 'wheelchairs', {
    name: { ar: 'استلام الكراسي المتحركة', en: 'Wheelchair pick-up' },
    short: { ar: 'الكراسي', en: 'Wheelchairs' },
    category: 'service',
    icon: 'wheelchair',
    amenities: ['wheelchair'],
    keywords: ['كرسي', 'كراسي', 'wheelchair'],
  }),
];

const first: Place[] = [
  room(1, 'NW1', 'radiology', {
    name: { ar: 'الأشعة', en: 'Radiology' },
    category: 'diagnostic',
    icon: 'xray',
    hours: H24,
    keywords: ['اشعه', 'اكس', 'رنين', 'مقطعية', 'x-ray', 'mri', 'ct'],
  }),
  room(1, 'NW2', 'waiting', {
    name: { ar: 'منطقة الانتظار', en: 'Waiting area' },
    short: { ar: 'الانتظار', en: 'Waiting' },
    category: 'facility',
    icon: 'seat',
    amenities: ['seating', 'water'],
  }),
  room(1, 'NE', 'ultrasound', {
    name: { ar: 'الموجات الصوتية', en: 'Ultrasound' },
    short: { ar: 'السونار', en: 'Ultrasound' },
    category: 'diagnostic',
    icon: 'ultrasound',
    hours: CLINIC_HOURS,
    keywords: ['سونار', 'تلفزيون', 'echo'],
  }),
  room(1, 'W1', 'laboratory', {
    name: { ar: 'المختبر', en: 'Laboratory' },
    category: 'diagnostic',
    icon: 'flask',
    hours: LAB_HOURS,
    keywords: ['تحليل', 'تحاليل', 'مختبر', 'lab', 'test'],
  }),
  room(1, 'E1', 'samples', {
    name: { ar: 'سحب العينات', en: 'Sample collection' },
    short: { ar: 'العينات', en: 'Samples' },
    category: 'diagnostic',
    icon: 'syringe',
    hours: LAB_HOURS,
    keywords: ['سحب دم', 'عينة', 'دم', 'blood test'],
  }),
  room(1, 'W3', 'blood-bank', {
    name: { ar: 'بنك الدم', en: 'Blood bank' },
    category: 'diagnostic',
    icon: 'blood',
    hours: LAB_HOURS,
    keywords: ['تبرع', 'تبرع بالدم', 'donate'],
  }),
  ...upperCommon(1),
];

const second: Place[] = [
  room(2, 'NW1', 'internal', {
    name: { ar: 'عيادات الباطنية', en: 'Internal medicine' },
    short: { ar: 'الباطنية', en: 'Internal med.' },
    category: 'clinic',
    icon: 'stethoscope',
    hours: CLINIC_HOURS,
    keywords: ['باطنيه', 'عيادة', 'دكتور', 'clinic', 'doctor'],
  }),
  room(2, 'NW2', 'waiting', {
    name: { ar: 'منطقة الانتظار', en: 'Waiting area' },
    short: { ar: 'الانتظار', en: 'Waiting' },
    category: 'facility',
    icon: 'seat',
    amenities: ['seating', 'water'],
  }),
  room(2, 'NE', 'eye', {
    name: { ar: 'عيادة العيون', en: 'Eye clinic' },
    short: { ar: 'العيون', en: 'Eye clinic' },
    category: 'clinic',
    icon: 'eye',
    hours: CLINIC_HOURS,
    keywords: ['عيون', 'نظر', 'نظارة', 'eyes', 'vision'],
  }),
  room(2, 'W1', 'dental', {
    name: { ar: 'عيادة الأسنان', en: 'Dental clinic' },
    short: { ar: 'الأسنان', en: 'Dental' },
    category: 'clinic',
    icon: 'tooth',
    hours: CLINIC_HOURS,
    keywords: ['اسنان', 'سنون', 'ضرس', 'teeth', 'dentist'],
  }),
  room(2, 'E1', 'orthopedics', {
    name: { ar: 'عيادة العظام', en: 'Orthopaedics' },
    short: { ar: 'العظام', en: 'Orthopaedics' },
    category: 'clinic',
    icon: 'bone',
    hours: CLINIC_HOURS,
    keywords: ['عظام', 'مفاصل', 'ركبة', 'bones', 'joints'],
  }),
  room(2, 'W3', 'physio', {
    name: { ar: 'العلاج الطبيعي', en: 'Physiotherapy' },
    short: { ar: 'العلاج الطبيعي', en: 'Physio' },
    category: 'clinic',
    icon: 'physio',
    hours: CLINIC_HOURS,
    keywords: ['علاج طبيعي', 'تأهيل', 'physio', 'rehab'],
  }),
  ...upperCommon(2),
];

const third: Place[] = [
  room(3, 'NW1', 'womens', {
    name: { ar: 'عيادة النساء والولادة', en: "Women's clinic" },
    short: { ar: 'النساء', en: "Women's" },
    category: 'clinic',
    icon: 'female',
    hours: CLINIC_HOURS,
    keywords: ['نساء', 'ولادة', 'حمل', 'pregnancy', 'obgyn'],
  }),
  room(3, 'NW2', 'family', {
    name: { ar: 'استراحة العائلات', en: 'Family lounge' },
    short: { ar: 'العائلات', en: 'Family lounge' },
    category: 'facility',
    icon: 'seat',
    amenities: ['seating', 'water'],
    keywords: ['عائلة', 'استراحة', 'family'],
  }),
  room(3, 'NE', 'pediatrics', {
    name: { ar: 'عيادة الأطفال', en: 'Paediatrics' },
    short: { ar: 'الأطفال', en: 'Paediatrics' },
    category: 'clinic',
    icon: 'baby',
    hours: CLINIC_HOURS,
    keywords: ['اطفال', 'طفل', 'children', 'kids'],
  }),
  room(3, 'W1', 'maternity', {
    name: { ar: 'جناح الولادة', en: 'Maternity ward' },
    short: { ar: 'الولادة', en: 'Maternity' },
    category: 'ward',
    icon: 'bed',
    hours: VISIT_HOURS,
    keywords: ['ولاده', 'نفاس', 'maternity'],
  }),
  room(3, 'E1', 'nursery', {
    name: { ar: 'الحضانة', en: 'Nursery' },
    category: 'ward',
    icon: 'baby',
    keywords: ['حضانه', 'مواليد', 'newborn'],
  }),
  room(3, 'W3', 'breastfeeding', {
    name: { ar: 'غرفة الرضاعة', en: 'Breastfeeding room' },
    short: { ar: 'الرضاعة', en: 'Feeding room' },
    category: 'facility',
    icon: 'nursing',
    keywords: ['رضاعه', 'ام', 'nursing', 'feeding'],
  }),
  ...upperCommon(3),
];

const fourth: Place[] = [
  room(4, 'NW1', 'ward-a', {
    name: { ar: 'جناح التنويم أ', en: 'Ward A' },
    short: { ar: 'جناح أ', en: 'Ward A' },
    category: 'ward',
    icon: 'bed',
    hours: VISIT_HOURS,
    keywords: ['تنويم', 'مريض', 'زيارة', 'inpatient', 'visit'],
  }),
  room(4, 'NW2', 'visitors', {
    name: { ar: 'استراحة الزوار', en: 'Visitors lounge' },
    short: { ar: 'الزوار', en: 'Visitors' },
    category: 'facility',
    icon: 'seat',
    amenities: ['seating', 'water'],
  }),
  room(4, 'NE', 'ward-b', {
    name: { ar: 'جناح التنويم ب', en: 'Ward B' },
    short: { ar: 'جناح ب', en: 'Ward B' },
    category: 'ward',
    icon: 'bed',
    hours: VISIT_HOURS,
    keywords: ['تنويم', 'inpatient'],
  }),
  room(4, 'W1', 'icu', {
    name: { ar: 'العناية المركزة', en: 'Intensive care (ICU)' },
    short: { ar: 'العناية', en: 'ICU' },
    category: 'ward',
    icon: 'heartbeat',
    hours: { ar: 'الزيارة 5 – 7 المغرب', en: 'Visiting 5 pm – 7 pm' },
    keywords: ['عناية', 'مركزه', 'icu'],
  }),
  room(4, 'E1', 'ward-c', {
    name: { ar: 'جناح التنويم ج', en: 'Ward C' },
    short: { ar: 'جناح ج', en: 'Ward C' },
    category: 'ward',
    icon: 'bed',
    hours: VISIT_HOURS,
  }),
  room(4, 'W3', 'ward-d', {
    name: { ar: 'جناح التنويم د', en: 'Ward D' },
    short: { ar: 'جناح د', en: 'Ward D' },
    category: 'ward',
    icon: 'bed',
    hours: VISIT_HOURS,
  }),
  ...upperCommon(4),
];

export const PLACES: readonly Place[] = [
  ...ground,
  ...first,
  ...second,
  ...third,
  ...fourth,
  ...FLOORS.flatMap(core),
];

const BY_ID = new Map(PLACES.map((place) => [place.id, place]));

export function findPlace(id: string | null | undefined): Place | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export function getPlace(id: string): Place {
  const place = BY_ID.get(id);
  if (!place) throw new Error(`Unknown place: ${id}`);
  return place;
}

/** Places a visitor would choose as a destination (not stairs, lifts or exits). */
export const DESTINATIONS: readonly Place[] = PLACES.filter(
  (place) =>
    place.category !== 'core' && place.category !== 'exit' && place.category !== 'entrance',
);

export function placesOnFloor(floor: FloorId): Place[] {
  return PLACES.filter((place) => place.floor === floor);
}

/** What each floor is for, shown on the home page directory and floor switcher. */
export const FLOOR_THEMES: Readonly<Record<FloorId, Localized>> = {
  0: { ar: 'الطوارئ والصيدلية والخدمات', en: 'Emergency, pharmacy and services' },
  1: { ar: 'الأشعة والمختبر', en: 'Radiology and laboratory' },
  2: { ar: 'العيادات الخارجية', en: 'Outpatient clinics' },
  3: { ar: 'النساء والأطفال', en: 'Women and children' },
  4: { ar: 'أجنحة التنويم والعناية', en: 'Inpatient wards and ICU' },
};
