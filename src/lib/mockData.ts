import { BookingStatus, BookingType, PaymentMethod, PaymentStatus } from '@/components/ui/StatusBadge';

export interface WooProduct {
  id: number;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  image?: string;
  category: string;
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  vehicle: string;
  plate: string;
  status: 'Available' | 'On Route' | 'Off Duty';
  avatar: string;
  currentOrderId?: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
}

export interface DeliveryAddress {
  line1: string;
  line2?: string;
  city: string;
  county: string;
  postcode: string;
  notes?: string;
}

export interface Payment {
  status: PaymentStatus;
  method: PaymentMethod;
  amount: number;
  recordedAt?: string;
  recordedBy?: string;
  notes?: string;
}

export interface PODImage {
  id: string;
  url: string;
  caption: string;
  uploadedAt: string;
}

export interface ProofOfDelivery {
  images: PODImage[];
  signatureDataUrl?: string;
  signedBy: string;
  signedAt?: string;
  termsAccepted: boolean;
  termsAcceptedAt?: string;
  notes?: string;
  completedAt?: string;
}

export interface Order {
  id: string;
  wooOrderId: string;
  customer: Customer;
  type: BookingType;
  status: BookingStatus;
  deliveryAddress?: DeliveryAddress;
  collectionAddress?: DeliveryAddress;
  products: WooProduct[];
  driver?: Driver;
  bookingDate: string;
  deliveryWindow: string;
  collectionWindow?: string;
  payment: Payment;
  pod?: ProofOfDelivery;
  createdAt: string;
  updatedAt: string;
  notes?: string;
  customFields?: Record<string, string>;
}

export const DRIVERS: Driver[] = [
  {
    id: 'd1',
    name: 'Marcus Webb',
    phone: '07712 345678',
    vehicle: 'Ford Transit',
    plate: 'LN23 RKT',
    status: 'On Route',
    avatar: 'MW',
    currentOrderId: 'CA-1042',
  },
  {
    id: 'd2',
    name: 'Priya Nair',
    phone: '07845 678901',
    vehicle: 'Mercedes Sprinter',
    plate: 'BX21 VHJ',
    status: 'Available',
    avatar: 'PN',
  },
  {
    id: 'd3',
    name: 'Tom Bridges',
    phone: '07923 112233',
    vehicle: 'Ford Transit',
    plate: 'YD22 MKL',
    status: 'On Route',
    avatar: 'TB',
    currentOrderId: 'CA-1039',
  },
  {
    id: 'd4',
    name: 'Leanne Carter',
    phone: '07600 998877',
    vehicle: 'Vauxhall Movano',
    plate: 'GX20 PPT',
    status: 'Available',
    avatar: 'LC',
  },
  {
    id: 'd5',
    name: 'Darren Hollis',
    phone: '07711 556677',
    vehicle: 'Mercedes Sprinter',
    plate: 'KE19 ZXA',
    status: 'Off Duty',
    avatar: 'DH',
  },
];

export const MOCK_ORDERS: Order[] = [
  {
    id: 'CA-1042',
    wooOrderId: '#8841',
    customer: {
      id: 'c1',
      name: 'Rachel Thornton',
      email: 'r.thornton@outlook.com',
      phone: '07831 224455',
    },
    type: 'Delivery',
    status: 'Booking Out For Delivery',
    deliveryAddress: {
      line1: '14 Meadow Close',
      city: 'Leicester',
      county: 'Leicestershire',
      postcode: 'LE4 7RN',
      notes: 'Side gate is unlocked. Please set up in back garden.',
    },
    products: [
      {
        id: 101,
        name: 'Frozen Elsa Castle — Large',
        sku: 'BC-ELSA-LG',
        quantity: 1,
        unitPrice: 145.00,
        totalPrice: 145.00,
        category: 'Bouncy Castle',
      },
      {
        id: 102,
        name: 'Blower Unit 1.5kW',
        sku: 'BLW-1500',
        quantity: 1,
        unitPrice: 0,
        totalPrice: 0,
        category: 'Accessory',
      },
    ],
    driver: DRIVERS[0],
    bookingDate: '2026-03-15',
    deliveryWindow: '08:00 – 10:00',
    collectionWindow: '18:00 – 20:00',
    payment: {
      status: 'Paid',
      method: 'Card',
      amount: 145.00,
      recordedAt: '2026-03-10T14:22:00Z',
      recordedBy: 'Sarah Atkinson',
    },
    createdAt: '2026-03-10T14:20:00Z',
    updatedAt: '2026-03-15T08:47:00Z',
    customFields: {
      'Event Type': 'Birthday Party',
      'Child Age': '7',
      'Power Source': 'Mains',
    },
  },
  {
    id: 'CA-1041',
    wooOrderId: '#8839',
    customer: {
      id: 'c2',
      name: 'James Okafor',
      email: 'j.okafor@gmail.com',
      phone: '07900 334455',
    },
    type: 'Delivery',
    status: 'Booking Assigned',
    deliveryAddress: {
      line1: '7 Birchwood Avenue',
      line2: 'Oadby',
      city: 'Leicester',
      county: 'Leicestershire',
      postcode: 'LE2 5GH',
    },
    products: [
      {
        id: 103,
        name: 'Superhero Combo Castle',
        sku: 'BC-SUPER-CMB',
        quantity: 1,
        unitPrice: 175.00,
        totalPrice: 175.00,
        category: 'Combo Castle',
      },
    ],
    driver: DRIVERS[2],
    bookingDate: '2026-03-15',
    deliveryWindow: '10:00 – 12:00',
    collectionWindow: '19:00 – 21:00',
    payment: {
      status: 'Unpaid',
      method: 'Cash',
      amount: 175.00,
    },
    createdAt: '2026-03-11T09:10:00Z',
    updatedAt: '2026-03-14T16:05:00Z',
    customFields: {
      'Event Type': 'Garden Party',
      'Power Source': 'Generator',
    },
  },
  {
    id: 'CA-1040',
    wooOrderId: '#8836',
    customer: {
      id: 'c3',
      name: 'Sonia Patel',
      email: 'sonia.patel@hotmail.co.uk',
      phone: '07724 889900',
    },
    type: 'Delivery',
    status: 'Booking Accepted',
    deliveryAddress: {
      line1: '3 Rosewood Drive',
      city: 'Loughborough',
      county: 'Leicestershire',
      postcode: 'LE11 3PQ',
    },
    products: [
      {
        id: 104,
        name: 'Princess Palace Castle — Medium',
        sku: 'BC-PRIN-MD',
        quantity: 1,
        unitPrice: 130.00,
        totalPrice: 130.00,
        category: 'Bouncy Castle',
      },
    ],
    bookingDate: '2026-03-15',
    deliveryWindow: '12:00 – 14:00',
    collectionWindow: '20:00 – 22:00',
    payment: {
      status: 'Unpaid',
      method: 'Unrecorded',
      amount: 130.00,
    },
    createdAt: '2026-03-12T11:30:00Z',
    updatedAt: '2026-03-12T11:30:00Z',
  },
  {
    id: 'CA-1039',
    wooOrderId: '#8830',
    customer: {
      id: 'c4',
      name: 'Daniel Hughes',
      email: 'd.hughes@company.co.uk',
      phone: '07811 667788',
    },
    type: 'Delivery',
    status: 'Booking Out For Delivery',
    deliveryAddress: {
      line1: '22 Oak Lane',
      city: 'Hinckley',
      county: 'Leicestershire',
      postcode: 'LE10 0AB',
    },
    products: [
      {
        id: 105,
        name: 'Jungle Safari Castle',
        sku: 'BC-JUNG-LG',
        quantity: 1,
        unitPrice: 155.00,
        totalPrice: 155.00,
        category: 'Bouncy Castle',
      },
      {
        id: 106,
        name: 'Safety Crash Mat Set',
        sku: 'ACC-MAT-SET',
        quantity: 2,
        unitPrice: 15.00,
        totalPrice: 30.00,
        category: 'Accessory',
      },
    ],
    driver: DRIVERS[2],
    bookingDate: '2026-03-15',
    deliveryWindow: '09:00 – 11:00',
    collectionWindow: '18:30 – 20:30',
    payment: {
      status: 'Paid',
      method: 'Card',
      amount: 185.00,
      recordedAt: '2026-03-09T10:00:00Z',
      recordedBy: 'Sarah Atkinson',
    },
    createdAt: '2026-03-09T09:55:00Z',
    updatedAt: '2026-03-15T09:15:00Z',
  },
  {
    id: 'CA-1038',
    wooOrderId: '#8825',
    customer: {
      id: 'c5',
      name: 'Natalie Frost',
      email: 'nat.frost@gmail.com',
      phone: '07955 443322',
    },
    type: 'Collection',
    status: 'Booking Complete',
    collectionAddress: {
      line1: 'Unit 4, Castle Depot',
      line2: 'Meridian Business Park',
      city: 'Leicester',
      county: 'Leicestershire',
      postcode: 'LE19 1WW',
    },
    products: [
      {
        id: 107,
        name: 'Classic Red & Blue Castle — Small',
        sku: 'BC-CLASS-SM',
        quantity: 1,
        unitPrice: 95.00,
        totalPrice: 95.00,
        category: 'Bouncy Castle',
      },
    ],
    bookingDate: '2026-03-14',
    deliveryWindow: '10:00 – 11:00',
    payment: {
      status: 'Paid',
      method: 'Cash',
      amount: 95.00,
      recordedAt: '2026-03-14T10:45:00Z',
      recordedBy: 'Sarah Atkinson',
    },
    pod: {
      images: [
        {
          id: 'pod1',
          url: 'https://placehold.co/400x300/e2e8f0/64748b?text=Castle+Setup',
          caption: 'Castle fully inflated and in position',
          uploadedAt: '2026-03-14T10:40:00Z',
        },
        {
          id: 'pod2',
          url: 'https://placehold.co/400x300/e2e8f0/64748b?text=Safety+Check',
          caption: 'Safety mat and pegging confirmed',
          uploadedAt: '2026-03-14T10:41:00Z',
        },
      ],
      signedBy: 'Natalie Frost',
      signedAt: '2026-03-14T10:44:00Z',
      termsAccepted: true,
      termsAcceptedAt: '2026-03-14T10:44:00Z',
      completedAt: '2026-03-14T10:44:00Z',
      notes: 'Customer very happy. Garden had clear access.',
    },
    createdAt: '2026-03-08T15:00:00Z',
    updatedAt: '2026-03-14T10:44:00Z',
  },
  {
    id: 'CA-1037',
    wooOrderId: '#8820',
    customer: {
      id: 'c6',
      name: 'Connor Gallagher',
      email: 'cgallagher@live.co.uk',
      phone: '07700 112233',
    },
    type: 'Delivery',
    status: 'Booking Complete',
    deliveryAddress: {
      line1: '9 Willow Street',
      city: 'Coalville',
      county: 'Leicestershire',
      postcode: 'LE67 3BT',
    },
    products: [
      {
        id: 108,
        name: 'Dinosaur Dino World Castle',
        sku: 'BC-DINO-LG',
        quantity: 1,
        unitPrice: 165.00,
        totalPrice: 165.00,
        category: 'Bouncy Castle',
      },
    ],
    bookingDate: '2026-03-14',
    deliveryWindow: '08:30 – 10:30',
    collectionWindow: '19:00 – 21:00',
    payment: {
      status: 'Paid',
      method: 'Card',
      amount: 165.00,
      recordedAt: '2026-03-13T17:00:00Z',
      recordedBy: 'Sarah Atkinson',
    },
    pod: {
      images: [
        {
          id: 'pod3',
          url: 'https://placehold.co/400x300/e2e8f0/64748b?text=POD+Image',
          caption: 'Castle installed and inflated',
          uploadedAt: '2026-03-14T09:05:00Z',
        },
      ],
      signedBy: 'Connor Gallagher',
      signedAt: '2026-03-14T09:06:00Z',
      termsAccepted: true,
      termsAcceptedAt: '2026-03-14T09:06:00Z',
      completedAt: '2026-03-14T09:06:00Z',
    },
    createdAt: '2026-03-07T10:00:00Z',
    updatedAt: '2026-03-14T09:06:00Z',
  },
  {
    id: 'CA-1036',
    wooOrderId: '#8815',
    customer: {
      id: 'c7',
      name: 'Amelia Rhodes',
      email: 'amelia.rhodes@yahoo.co.uk',
      phone: '07888 776655',
    },
    type: 'Delivery',
    status: 'Booking Accepted',
    deliveryAddress: {
      line1: '51 Granby Street',
      city: 'Melton Mowbray',
      county: 'Leicestershire',
      postcode: 'LE13 1JZ',
    },
    products: [
      {
        id: 109,
        name: 'Unicorn Rainbow Castle — Large',
        sku: 'BC-UNI-LG',
        quantity: 1,
        unitPrice: 155.00,
        totalPrice: 155.00,
        category: 'Bouncy Castle',
      },
    ],
    bookingDate: '2026-03-16',
    deliveryWindow: '09:00 – 11:00',
    collectionWindow: '19:00 – 21:00',
    payment: {
      status: 'Unpaid',
      method: 'Cash',
      amount: 155.00,
    },
    createdAt: '2026-03-13T14:00:00Z',
    updatedAt: '2026-03-13T14:00:00Z',
  },
  {
    id: 'CA-1035',
    wooOrderId: '#8810',
    customer: {
      id: 'c8',
      name: 'Ben Whitfield',
      email: 'benw@btinternet.com',
      phone: '07744 998877',
    },
    type: 'Collection',
    status: 'Booking Assigned',
    collectionAddress: {
      line1: 'Unit 4, Castle Depot',
      line2: 'Meridian Business Park',
      city: 'Leicester',
      county: 'Leicestershire',
      postcode: 'LE19 1WW',
    },
    products: [
      {
        id: 110,
        name: 'Football Pitch Inflatable',
        sku: 'BC-FOOT-LG',
        quantity: 1,
        unitPrice: 195.00,
        totalPrice: 195.00,
        category: 'Inflatable',
      },
    ],
    driver: DRIVERS[1],
    bookingDate: '2026-03-16',
    deliveryWindow: '11:00 – 12:00',
    payment: {
      status: 'Unpaid',
      method: 'Card',
      amount: 195.00,
    },
    createdAt: '2026-03-14T08:30:00Z',
    updatedAt: '2026-03-14T08:30:00Z',
  },
];

// 7-day booking volume chart data
export const BOOKING_VOLUME_DATA = [
  { date: '09 Mar', accepted: 2, assigned: 1, outForDelivery: 3, complete: 4 },
  { date: '10 Mar', accepted: 3, assigned: 2, outForDelivery: 2, complete: 5 },
  { date: '11 Mar', accepted: 1, assigned: 3, outForDelivery: 4, complete: 3 },
  { date: '12 Mar', accepted: 4, assigned: 2, outForDelivery: 1, complete: 6 },
  { date: '13 Mar', accepted: 2, assigned: 4, outForDelivery: 3, complete: 4 },
  { date: '14 Mar', accepted: 3, assigned: 1, outForDelivery: 5, complete: 7 },
  { date: '15 Mar', accepted: 2, assigned: 1, outForDelivery: 2, complete: 1 },
];