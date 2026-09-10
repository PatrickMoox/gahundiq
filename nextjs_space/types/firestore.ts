export type EventType = 'wedding' | 'birthday' | 'corporate' | 'memorial' | 'baby_shower' | 'potluck' | 'webinar' | 'other';
export type Tier = 'free' | 'premium';
export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';
export type Milestone = '12_months' | '6_months' | '3_months' | '1_month' | 'week_of' | 'day_of' | 'post_event';
export type TableType = 'round' | 'rectangular' | 'head' | 'cocktail';
export type DietaryPref = 'vegetarian' | 'vegan' | 'gluten-free' | 'halal' | 'kosher' | 'none';
export type GiftType = 'cash' | 'honeymoon_fund' | 'charity' | 'experience';
export type GiftStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type VendorCategory = 'Photographer' | 'Videographer' | 'DJ' | 'Caterer' | 'Florist' | 'Officiant' | 'Venue' | 'Hair & Makeup' | 'Transportation' | 'Other';
export type TimelineStatus = 'upcoming' | 'active' | 'completed';
export type BroadcastMethod = 'email' | 'sms' | 'link';

export interface EventData {
  id: string;
  hostId: string;
  title: string;
  eventType: EventType;
  date: any; // Firestore Timestamp or Date
  venue: string;
  coverImageUrl?: string;
  invitationUrl?: string;
  invitationName?: string;
  invitationUploadedAt?: any;
  invitationBroadcasts?: InviteBroadcast[];
  collaboratorIds?: string[];
  tier: Tier;
  guestCount: number;
  createdAt: any;
  updatedAt: any;
}

export interface InviteBroadcast {
  sentAt: any;
  sentBy: string;
  guestCount: number;
  method: BroadcastMethod;
  reference: string;
}

export interface TimelineItem {
  id: string;
  eventId: string;
  track: string;
  startTime: string;
  endTime: string;
  title: string;
  description?: string;
  assignedTo?: string;
  color: string;
  status: TimelineStatus;
  order: number;
}

export interface Vendor {
  id: string;
  eventId: string;
  category: VendorCategory;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  website?: string;
  arrivalTime?: string;
  contractUrl?: string;
  totalAmount: number;
  depositPaid: number;
  balanceDueDate?: any;
  notes?: string;
  accessPassToken?: string;
  createdAt: any;
}

export interface SeatingChart {
  id: string;
  eventId: string;
  name: string;
  tables: TableData[];
  unassignedGuests: GuestData[];
  createdAt: any;
  updatedAt: any;
}

export interface TableData {
  id: string;
  name: string;
  type: TableType;
  capacity: number;
  x: number;
  y: number;
  seats: Seat[];
}

export interface Seat {
  id: string;
  tableId: string;
  position: number;
  guestId?: string;
  guestName?: string;
  dietary?: DietaryPref;
  isVIP?: boolean;
}

export type RsvpStatus = 'pending' | 'confirmed' | 'declined';

export interface GuestData {
  id: string;
  name: string;
  email?: string;
  dietary?: DietaryPref;
  isVIP?: boolean;
  rsvp?: RsvpStatus;
  inviteSentAt?: any;
  inviteToken?: string;
}

export interface InviteData {
  id: string;
  token: string;
  guestId: string;
  guestName: string;
  eventTitle?: string;
  eventDate?: any;
  eventVenue?: string;
  rsvp: RsvpStatus;
  respondedAt?: any;
  createdAt?: any;
}

export interface Task {
  id: string;
  eventId: string;
  title: string;
  description?: string;
  milestone: Milestone;
  status: TaskStatus;
  assignedTo?: string;
  dueDate?: any;
  priority: TaskPriority;
  category: string;
  createdAt: any;
  updatedAt: any;
}

export interface BudgetItem {
  id: string;
  eventId: string;
  category: string;
  name: string;
  estimatedCost: number;
  actualCost: number;
  depositPaid: number;
  balanceDue: number;
  dueDate?: any;
  vendorId?: string;
  notes?: string;
  isPaid: boolean;
  createdAt: any;
}

export interface CashGift {
  id: string;
  eventId: string;
  guestName: string;
  guestEmail?: string;
  amount: number;
  currency: string;
  message?: string;
  giftType: GiftType;
  platformFee: number;
  stripePaymentIntentId?: string;
  status: GiftStatus;
  createdAt: any;
}

/**
 * Device session governed by the session policy (see lib/session-policy.ts).
 * One record per device at `sessions/{uid}/{deviceId}`. The doc id IS the
 * stable device id; a record exists while that device holds a session. Writers
 * are restricted to the owner; the client only ever writes the heartbeat /
 * revocation fields (see firestore.rules).
 */
export interface SessionRecord {
  uid: string;
  deviceId: string;
  deviceLabel: string;
  createdAt: any;
  lastActiveAt: any;
  expiresAt: any;
  /** Set when the user signs out / the session is ended on this device. */
  signedOutAt?: any;
  /** Set when the session is revoked from elsewhere (other device / admin / eviction). */
  revokedAt?: any;
  updatedAt?: any;
}

export interface PublicReview {
  rating: number; // 0.5–5
  author?: string;
  quote?: string;
  eventType?: EventType;
  createdAt?: any;
  approvedAt?: any;
}

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled';

export interface AddonPurchase {
  type: 'ceremonies' | 'guests' | 'invites' | 'storage';
  quantity: number;
  amount: number;
  currency: string;
  reference?: string;
  at: any;
}

export interface Subscription {
  userId: string;
  tier: Tier;
  status?: SubscriptionStatus;
  billingCycle?: 'monthly' | 'per_event';
  price?: number;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  currentPeriodEnd?: any;
  activeEventCount?: number;
  maxEvents?: number;
  extraCeremonies?: number;
  maxGuests?: number;
  extraGuests?: number;
  maxInvites?: number;
  extraInvites?: number;
  storageGb?: number;
  extraStorageGb?: number;
  addonHistory?: AddonPurchase[];
  notes?: string;
  updatedAt?: any;
  updatedBy?: string;
  createdAt?: any;
}
